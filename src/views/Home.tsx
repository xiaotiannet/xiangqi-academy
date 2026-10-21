import { useEffect, useMemo, useState } from 'react';
import { CURRICULUM } from '../content/curriculum';
import { UNIT_COLORS } from '../content/types';
import {
  DAILY_GOAL,
  ENERGY_COST,
  ENERGY_MAX,
  completedCount,
  chestReady,
  dailyQuests,
  energyCountdown,
  isUnlocked,
  nextLessonId,
  questClaimed,
  questProgress,
  todayXp,
} from '../state/progress';
import type { Game } from '../state/game';
import { Oscar } from '../components/Oscar';
import { Sheet } from '../components/Sheet';
import { TopBar } from '../components/TopBar';
import { GREET, OUT_OF_ENERGY, greetPool, pick } from '../content/oscar';
import { voice } from '../state/native';
import { sfx } from '../state/sound';

interface Props {
  game: Game;
  onStartLesson: (id: string) => void;
}

let greetedThisSession = false;

export function Home({ game, onStartLesson }: Props) {
  const { progress } = game;
  const [toast, setToast] = useState<string | null>(null);
  const [quip, setQuip] = useState(() => pick('greet', greetPool()));
  const [wallet, setWallet] = useState(false);
  const [levelSheet, setLevelSheet] = useState(false);

  const current = nextLessonId(progress);
  const done = completedCount(progress);
  const today = todayXp(progress);
  const totalLessons = CURRICULUM.reduce((s, u) => s + u.lessons.length, 0);
  const goalPct = Math.min(100, Math.round((today / DAILY_GOAL) * 100));
  const quests = dailyQuests();
  const canChest = chestReady(progress);

  const currentLesson = useMemo(() => {
    for (const u of CURRICULUM) {
      const l = u.lessons.find((x) => x.id === current);
      if (l) return l;
    }
    return null;
  }, [current]);

  /* 进应用打一次招呼，一个会话只念一次 */
  useEffect(() => {
    if (greetedThisSession) return;
    greetedThisSession = true;
    const t = window.setTimeout(() => voice.say(quip.v ?? quip.t), 600);
    return () => window.clearTimeout(t);
  }, [quip]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const speakQuip = () => {
    const pool = progress.streak >= 3 && Math.random() < 0.5
      ? GREET.streakHot.map((l) => ({ t: l.t.replace('{n}', String(progress.streak)), v: (l.v ?? l.t).replace('{n}', String(progress.streak)) }))
      : progress.energy <= 0
        ? OUT_OF_ENERGY
        : greetPool();
    const next = pick('quip', pool);
    setQuip(next);
    voice.say(next.v ?? next.t, { force: true });
    sfx.tap();
  };

  const startLesson = (id: string) => {
    if (progress.energy <= 0) {
      setWallet(true);
      const line = pick('empty', OUT_OF_ENERGY);
      setQuip(line);
      voice.say(line.v ?? line.t, { force: true });
      return;
    }
    onStartLesson(id);
  };

  return (
    <div className="screen home">
      <TopBar
        progress={progress}
        onOpenWallet={() => setWallet(true)}
        onOpenLevel={() => setLevelSheet(true)}
      />

      <section className="oscar-row">
        <div className="oscar-avatar" onClick={speakQuip}>
          <Oscar mood={progress.energy <= 1 ? 'sad' : progress.streak >= 3 ? 'happy' : 'idle'} size={86} />
        </div>
        <div className="bubble">
          <p>{quip.t}</p>
          <button className="bubble-say" onClick={speakQuip} aria-label="让奥斯卡再说一句">
            🔊 再来一句
          </button>
        </div>
      </section>

      <section className="goal-card">
        <div className="goal-head">
          <span className="goal-title">今日目标</span>
          <span className="goal-num">
            {today}/{DAILY_GOAL} XP
          </span>
        </div>
        <div className="goal-bar">
          <div className="goal-bar-fill" style={{ width: `${goalPct}%` }} />
        </div>
        <button
          className={`chest ${canChest ? 'is-ready' : ''}`}
          onClick={() => {
            if (!canChest) {
              showToast('今天已经领过了，明天请早');
              return;
            }
            const gems = game.openChest();
            if (gems) showToast(`宝箱 +${gems} 宝石`);
          }}
        >
          <span className="chest-ico">{canChest ? '🎁' : '📦'}</span>
          <span className="chest-text">
            <b>{canChest ? '每日宝箱待领取' : '宝箱已开'}</b>
            <small>{canChest ? '白给的宝石，不拿白不拿' : '明天再来，我记性好'}</small>
          </span>
        </button>
      </section>

      <button className="cta-continue" onClick={() => startLesson(current)}>
        <span>
          {done === 0 ? '开始第一课' : done >= totalLessons ? '复习最后一课' : '继续学习'}
        </span>
        <small>
          {currentLesson?.title} · ❤️ {progress.energy}/{ENERGY_MAX}
        </small>
      </button>

      <section className="quest-card">
        <div className="card-eyebrow">每日任务 · 明天刷新</div>
        {quests.map((q) => {
          const got = questProgress(progress, q);
          const claimed = questClaimed(progress, q);
          const pct = Math.round((got / q.goal) * 100);
          return (
            <div className="quest" key={q.id}>
              <div className="quest-emoji">{q.emoji}</div>
              <div className="quest-main">
                <div className="quest-label">{q.label}</div>
                <div className="quest-bar">
                  <div className="quest-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="quest-right">
                <span className="quest-count">
                  {got}/{q.goal}
                </span>
                <button
                  className={`quest-claim ${claimed ? 'is-done' : got >= q.goal ? 'is-ready' : ''}`}
                  disabled={claimed || got < q.goal}
                  onClick={() => {
                    const gems = game.takeQuest(q.id);
                    if (gems) showToast(`+${gems} 💎`);
                  }}
                >
                  {claimed ? '✓' : `+${q.reward}💎`}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <div className="path">
        {CURRICULUM.map((unit) => {
          const colors = UNIT_COLORS[unit.color];
          return (
            <section className="unit" key={unit.id}>
              <div
                className="unit-banner"
                style={{ background: colors.main, boxShadow: `0 4px 0 ${colors.dark}` }}
              >
                <div className="unit-banner-title">{unit.title}</div>
                <div className="unit-banner-sub">{unit.subtitle}</div>
              </div>

              <div className="unit-nodes">
                {unit.lessons.map((lesson, i) => {
                  const rec = progress.lessons[lesson.id];
                  const unlocked = isUnlocked(progress, lesson.id);
                  const isCurrent = lesson.id === current && !rec?.done;
                  const isDrill = lesson.kind === 'drill';
                  const offset = Math.round(Math.sin(i * 0.95) * 58);
                  return (
                    <div
                      className={`node-row ${isDrill ? 'is-drill' : ''}`}
                      key={lesson.id}
                      style={{ transform: `translateX(${offset}px)` }}
                    >
                      {isCurrent && <div className="node-bubble">{isDrill ? '冲刺' : '开始'}</div>}
                      <button
                        className={[
                          'node',
                          rec?.done ? 'is-done' : '',
                          !unlocked ? 'is-locked' : '',
                          isCurrent ? 'is-current' : '',
                          isDrill ? 'node-drill' : '',
                        ].join(' ')}
                        style={
                          rec?.done || unlocked
                            ? {
                                background: rec?.done ? colors.main : colors.soft,
                                color: rec?.done ? '#fff' : colors.dark,
                                boxShadow: `0 5px 0 ${rec?.done ? colors.dark : '#D6D6D6'}`,
                                borderColor: rec?.done ? colors.dark : colors.main,
                              }
                            : undefined
                        }
                        onClick={() => {
                          if (!unlocked) {
                            showToast('先完成前面的课程，才能解锁这里');
                            return;
                          }
                          startLesson(lesson.id);
                        }}
                      >
                        <span className="node-icon">{unlocked ? lesson.icon : '🔒'}</span>
                        {isDrill && unlocked && <span className="node-timer">⏱</span>}
                        {rec?.done && (
                          <span className="node-stars">
                            {'★'.repeat(rec.stars)}
                            {'☆'.repeat(Math.max(0, 3 - rec.stars))}
                          </span>
                        )}
                      </button>
                      <div className="node-label">
                        {lesson.title}
                        {isDrill && <em className="node-sub">限时 {lesson.drill?.seconds}s</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="home-footer">
        所有课程题目均由内置象棋引擎校验，保证「可解且合法」。奥斯卡负责点评，引擎负责兜底。
      </footer>

      <Sheet open={wallet} title="背包" onClose={() => setWallet(false)}>
        <div className="wallet-grid">
          <div className="wallet-cell">
            <b>💎 {progress.gems}</b>
            <span>宝石</span>
          </div>
          <div className="wallet-cell">
            <b>❤️ {progress.energy}/{ENERGY_MAX}</b>
            <span>体力</span>
          </div>
        </div>
        <p className="wallet-note">
          每错一题消耗 1 点体力；每 18 分钟自然恢复 1 点。
          {progress.energy < ENERGY_MAX && ` 距下一点恢复还有 ${Math.ceil(energyCountdown(progress) / 60000)} 分钟。`}
        </p>
        <button
          className="btn btn-primary"
          disabled={progress.gems < ENERGY_COST || progress.energy >= ENERGY_MAX}
          onClick={() => {
            if (game.refill()) {
              voice.say('体力满格。去把电脑下哭吧。', { force: true });
              setWallet(false);
            } else {
              voice.say('宝石不够，先去上课挣点。', { force: true });
            }
          }}
        >
          补满体力 · 💎 {ENERGY_COST}
        </button>
        <p className="wallet-tip">宝石来源：课程结算、每日任务、宝箱、成就、战胜奥斯卡。</p>
      </Sheet>

      <Sheet open={levelSheet} title="等级" onClose={() => setLevelSheet(false)}>
        <div className="level-hero">
          <div className="level-ring">Lv.{game.level.level}</div>
          <div>
            <b>{game.level.title}</b>
            <p>
              {game.level.into} / {game.level.need} XP · 距「{game.level.nextTitle}」还差{' '}
              {Math.max(0, game.level.need - game.level.into)} XP
            </p>
          </div>
        </div>
        <div className="goal-bar">
          <div className="goal-bar-fill" style={{ width: `${game.level.pct}%` }} />
        </div>
        <p className="wallet-note">
          累计经验 {progress.xp}。每升一级奖励 30 宝石，顺带让奥斯卡对你的称呼客气一点。
        </p>
      </Sheet>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
