import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, type MoveAnim } from '../components/Board';
import { legalTargetsFrom } from '../game/rules';
import type { Piece, PieceType, Square } from '../game/types';
import type { Lesson } from '../content/types';
import { sfx } from '../state/sound';
import { buzz } from '../state/native';

const TYPE_OF: Record<string, PieceType> = { k: 'k', a: 'a', b: 'b', n: 'n', r: 'r', c: 'c', p: 'p' };

/** 布局字符串 → 90 格棋盘 */
function parseLayout(layout: string[]): Square[] {
  const out: Square[] = new Array(90).fill(null);
  layout.forEach((line, r) => {
    for (let c = 0; c < 9; c++) {
      const ch = line[c];
      if (!ch || ch === '.') continue;
      const type = TYPE_OF[ch.toLowerCase()];
      if (!type) continue;
      out[r * 9 + c] = { type, color: ch === ch.toLowerCase() ? 'b' : 'r' } as Piece;
    }
  });
  return out;
}

const mmss = (sec: number) => {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export interface DrillResultInput {
  lessonId: string;
  xp: number;
  stars: number;
  mistakes: number;
  accuracy: number;
}

interface Props {
  lesson: Lesson;
  onExit: () => void;
  onFinish: (input: DrillResultInput) => void;
}

interface RunResult {
  passed: boolean;
  cleared: boolean;
  eaten: number;
  stars: number;
}

/**
 * 单元末的限时吃子冲刺。
 * 玩家只走自己一方，敌方不还手 —— 这是「吃子手感」训练，不是对局。
 */
export function DrillView({ lesson, onExit, onFinish }: Props) {
  const cfg = lesson.drill!;
  const total = cfg.total;
  const goal = cfg.goal;

  const [boardIdx, setBoardIdx] = useState(() => Math.floor(Math.random() * cfg.boards.length));
  const [squares, setSquares] = useState<Square[]>(() => parseLayout(cfg.boards[boardIdx].layout));
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [moveAnim, setMoveAnim] = useState<MoveAnim | null>(null);
  const [eaten, setEaten] = useState(0);
  const [remaining, setRemaining] = useState(cfg.seconds);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [result, setResult] = useState<RunResult | null>(null);

  const eatenRef = useRef(0);
  const phaseRef = useRef<'ready' | 'playing' | 'result'>('ready');
  const animSeq = useRef(0);

  const setPhaseSafe = (p: 'ready' | 'playing' | 'result') => {
    phaseRef.current = p;
    setPhase(p);
  };

  const startRun = () => {
    const nextIdx = (boardIdx + 1) % cfg.boards.length;
    const idx = phase === 'ready' && result === null ? boardIdx : nextIdx;
    setBoardIdx(idx);
    setSquares(parseLayout(cfg.boards[idx].layout));
    setSelected(null);
    setLastMove(null);
    setMoveAnim(null);
    setEaten(0);
    eatenRef.current = 0;
    setRemaining(cfg.seconds);
    setResult(null);
    setPhaseSafe('playing');
    sfx.tap();
  };

  const endRun = useCallback(
    (cleared: boolean) => {
      if (phaseRef.current !== 'playing') return;
      setPhaseSafe('result');
      const got = eatenRef.current;
      const passed = cleared || got >= goal;
      const stars = cleared ? 3 : passed ? 2 : 1;
      setResult({ passed, cleared, eaten: got, stars });
      if (cleared) {
        sfx.win();
        buzz('result');
      } else {
        sfx.lose();
      }
      if (passed) {
        onFinish({
          lessonId: lesson.id,
          xp: lesson.xp + (cleared ? 5 : 0),
          stars,
          mistakes: 0,
          accuracy: Math.round((got / total) * 100),
        });
      }
    },
    [goal, lesson.id, lesson.xp, onFinish, total],
  );

  // 倒计时
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          endRun(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, endRun]);

  // 剩 10 秒提醒一声
  const warnedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'playing') return;
    if (remaining === 10 && !warnedRef.current) {
      warnedRef.current = true;
      sfx.select();
      buzz('tap');
    }
    if (remaining > 10) warnedRef.current = false;
  }, [remaining, phase]);

  const targets = useMemo(
    () => (selected !== null ? legalTargetsFrom(squares, selected) : []),
    [squares, selected],
  );

  const onSquare = (i: number) => {
    if (phase !== 'playing') return;
    const piece = squares[i];
    if (selected === null) {
      if (!piece || piece.color !== 'r') return;
      setSelected(i);
      sfx.select();
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    if (piece && piece.color === 'r') {
      setSelected(i);
      sfx.select();
      return;
    }
    if (!targets.includes(i)) {
      setSelected(null);
      sfx.wrong();
      return;
    }

    const victim = squares[i];
    const next = squares.slice();
    next[i] = next[selected];
    next[selected] = null;

    animSeq.current += 1;
    setMoveAnim({ from: selected, to: i, captured: victim ?? null, seq: animSeq.current });
    setSquares(next);
    setLastMove({ from: selected, to: i });
    setSelected(null);

    if (victim) {
      const got = eatenRef.current + 1;
      eatenRef.current = got;
      setEaten(got);
      sfx.capture();
      buzz('capture');
      if (got >= total) window.setTimeout(() => endRun(true), 260);
    } else {
      sfx.move();
    }
  };

  const checkSquare = null;

  return (
    <div className="screen drill">
      <header className="play-top">
        <button className="play-exit" onClick={onExit} aria-label="退出吃子冲刺">
          ✕
        </button>
        <div className="play-hud">
          <div className="hud-cell">
            <span className="drill-ico">🍖</span>
            <b>
              {eaten}/{total}
            </b>
            <i>个</i>
          </div>
          <span className="hud-div" />
          <div className={`hud-cell ${remaining <= 10 && phase === 'playing' ? 'urgent' : ''}`}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="#ffefc4" stroke="#e8a400" strokeWidth="2.2" />
              <path d="M12 6.4V12l3.8 2.4" fill="none" stroke="#c99000" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <b>{mmss(remaining)}</b>
          </div>
        </div>
        <span className="play-top-right" />
      </header>

      <div className="drill-head">
        <b>{lesson.title}</b>
        <span>
          目标：{cfg.seconds} 秒内吃掉 {goal} 个 · 全清 {total} 个得三星
        </span>
      </div>

      <Board
        squares={squares}
        orientation="r"
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        moveAnim={moveAnim}
        checkSquare={checkSquare}
        onSquareClick={onSquare}
        disabled={phase !== 'playing'}
      />

      <div className="drill-tip">
        {phase === 'playing'
          ? selected === null
            ? '点亮一枚红子，绿点就是它能吃/能走的位置'
            : '再点绿点落子；只有吃掉对方的子才算分'
          : '准备好了就开始'}
      </div>

      {phase === 'ready' && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="overlay-emoji">🎯</div>
            <h2>{lesson.title}</h2>
            <p className="drill-rule">
              {cfg.seconds} 秒内吃掉 {goal} 个目标子就过关，吃光全场 {total} 个得三星。
              对方不会还手，但时间也不会等你。
            </p>
            <button className="btn btn-primary" onClick={startRun}>
              开始冲刺
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              先回去
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="overlay">
          <div className={`overlay-card ${result.passed ? 'win' : 'lose'}`}>
            <div className="overlay-emoji">{result.passed ? '🏆' : '⏰'}</div>
            <h2>
              {result.cleared
                ? '全场清空！'
                : result.passed
                  ? '过关了'
                  : '差一点'}
            </h2>
            <div className="drill-stars">
              {'★'.repeat(result.stars)}
              {'☆'.repeat(3 - result.stars)}
            </div>
            <p className="drill-rule">
              吃掉 {result.eaten} / {total} 个
              {result.passed
                ? '，这颗子你以后会看得更快。'
                : `，还差 ${Math.max(0, goal - result.eaten)} 个过关。`}
            </p>
            <button className="btn btn-primary" onClick={startRun}>
              {result.passed ? '再冲一次' : '再来一次'}
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              回到课程地图
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
