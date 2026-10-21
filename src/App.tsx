import { useCallback, useEffect, useState } from 'react';
import { Home } from './views/Home';
import { LessonView, type LessonResult } from './views/LessonView';
import { DrillView } from './views/DrillView';
import { Play, type PlayResult, type Ply } from './views/Play';
import { Profile } from './views/Profile';
import { Openings } from './views/Openings';
import { ReviewView } from './views/ReviewView';
import type { Color } from './game/types';
import { getLesson } from './content/curriculum';
import { useEngine } from './state/engine';
import { useGame } from './state/game';
import { sfx } from './state/sound';
import { CelebrationHost } from './components/CelebrationHost';
import { voice } from './state/native';

type Tab = 'learn' | 'openings' | 'play' | 'profile';

declare global {
  interface Window {
    XQBack?: () => string;
  }
}

export default function App() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>('learn');
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [review, setReview] = useState<{ history: Ply[]; side: Color } | null>(null);
  const { think, evaluate } = useEngine();

  /** 对局是否正在进行（由 Play 上报），用于拦截返回键 / 切页，避免静默丢棋局 */
  const [playActive, setPlayActive] = useState(false);
  const [leaveSignal, setLeaveSignal] = useState(0);
  const askLeave = useCallback(() => setLeaveSignal((n) => n + 1), []);

  useEffect(() => {
    document.documentElement.dataset.tab = tab;
  }, [tab]);

  const openLesson = useCallback((id: string) => {
    try {
      window.history.pushState({ lesson: id }, '');
    } catch {
      /* 某些 WebView 不允许改历史，忽略 */
    }
    setLessonId(id);
  }, []);

  const closeLesson = useCallback(() => {
    voice.stop();
    if (window.history.state?.lesson) {
      window.history.back();
    } else {
      setLessonId(null);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setLessonId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* 安卓物理返回键：交给原生调用，返回 "exit" 时原生结束应用 */
  useEffect(() => {
    window.XQBack = () => {
      if (review) {
        setReview(null);
        return 'handled';
      }
      if (lessonId) {
        closeLesson();
        return 'handled';
      }
      // 对局进行中：先让 Play 弹「坚持战斗 / 认输」，别静默丢局
      if (tab === 'play' && playActive) {
        askLeave();
        return 'handled';
      }
      if (tab !== 'learn') {
        setTab('learn');
        return 'handled';
      }
      return 'exit';
    };
  }, [lessonId, tab, closeLesson, review, playActive, askLeave]);

  const onFinish = useCallback(
    (r: LessonResult) => {
      if (!lessonId) return { xp: 0, gems: 0 };
      return game.finishLesson(lessonId, r);
    },
    [game, lessonId],
  );

  const lesson = lessonId ? getLesson(lessonId) : undefined;

  if (review) {
    return (
      <>
        <ReviewView
          history={review.history}
          side={review.side}
          evaluate={evaluate}
          onExit={() => setReview(null)}
        />
        <CelebrationHost />
      </>
    );
  }

  if (lesson && lessonId) {
    if (lesson.kind === 'drill') {
      return (
        <div className="app app-lesson">
          <DrillView
            lesson={lesson}
            onExit={closeLesson}
            onFinish={(input) =>
              game.finishLesson(input.lessonId, {
                xp: input.xp,
                stars: input.stars,
                mistakes: input.mistakes,
                accuracy: input.accuracy,
              })
            }
          />
          <CelebrationHost />
        </div>
      );
    }
    return (
      <div className="app app-lesson">
        <LessonView
          lesson={lesson}
          showLegalMoves={game.progress.settings.showLegalMoves}
          energy={game.progress.energy}
          gems={game.progress.gems}
          onExit={closeLesson}
          onFinish={onFinish}
          onHeartLost={game.loseOneHeart}
          onRefill={game.refill}
          onCorrect={game.addCorrect}
        />
        <CelebrationHost />
      </div>
    );
  }

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'learn' && <Home game={game} onStartLesson={openLesson} />}
        {tab === 'openings' && <Openings onPlay={() => setTab('play')} />}
        {tab === 'play' && (
          <Play
            showLegalMoves={game.progress.settings.showLegalMoves}
            showNotation={game.progress.settings.showNotation}
            allowUndo={game.progress.settings.undo}
            energy={game.progress.energy}
            onSpendEnergy={game.loseOneHeart}
            gems={game.progress.gems}
            think={think}
            onResult={(r: PlayResult) => game.finishGame(r.result)}
            onSpendGems={game.spendGems}
            onReview={(history, side) => setReview({ history, side })}
            backSignal={leaveSignal}
            onActiveChange={setPlayActive}
          />
        )}
        {tab === 'profile' && <Profile game={game} />}
      </main>

      <nav className="tabbar">
        {(
          [
            { id: 'learn', icon: '📚', label: '学习' },
            { id: 'openings', icon: '📖', label: '开局' },
            { id: 'play', icon: '⚔️', label: '对战' },
            { id: 'profile', icon: '👤', label: '我的' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              // 对局进行中想切走：先问一句，避免点错直接把棋局丢了
              if (tab === 'play' && playActive && t.id !== 'play') {
                askLeave();
                sfx.tap();
                return;
              }
              setTab(t.id);
              sfx.tap();
            }}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <CelebrationHost />
    </div>
  );
}
