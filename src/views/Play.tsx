import { useCallback, useEffect, useRef, useState } from 'react';
import { Board, type MoveAnim } from '../components/Board';
import { initialPosition } from '../game/board';
import { findKing } from '../game/board';
import { applyMove, findMoveByFromTo, getStatus, isInCheck, legalTargetsFrom } from '../game/rules';
import { moveToChinese } from '../game/notation';
import { other, type Color, type PieceType, type Position, type Square } from '../game/types';
import { LEVELS, type Level, type LevelId, type ThinkResult } from '../state/engine';
import { sfx } from '../state/sound';
import { Oscar } from '../components/Oscar';
import {
  CAPTURE,
  CHECK,
  CHECK_BACK,
  DRAW,
  ILLEGAL,
  LOSE,
  LOW_TIME,
  MERCY,
  MY_PIECE,
  OPENING,
  OPENING_AI,
  OUT_OF_ENERGY,
  TAKE_YOURS,
  TIMEOUT_DRAW,
  TIMEOUT_LOSE,
  TIMEOUT_WIN,
  WIN,
  pick,
  type Line,
} from '../content/oscar';
import { buzz, voice } from '../state/native';
import { HINT_COST, type Reward } from '../state/progress';
import { Sheet } from '../components/Sheet';

declare global {
  interface Window {
    /** 原生在 Activity 前后台切换时调用：'pause' / 'resume' */
    XQAppState?: (state: 'pause' | 'resume') => void;
  }
}

export interface PlayResult {
  result: 'win' | 'lose' | 'draw';
  level: LevelId;
}

/** 每局总时长：30 分钟，从你走出第一手开始计时 */
const TIME_LIMIT = 30 * 60;

/** 奥斯卡落子前至少停顿这么久，让玩家看清自己那一步 */
const MIN_AI_DELAY = 700;

/** 吃子计分：整数、好算、一眼就能心算落后多少 */
const SCORE_VALUE: Record<PieceType, number> = { k: 0, a: 2, b: 2, n: 4, r: 9, c: 4, p: 1 };
const FULL_COUNT: Record<PieceType, number> = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 };

/** 某一方被吃掉的子力分（= 对手的吃子得分） */
function capturedScore(squares: Square[], victim: Color): number {
  const left: Record<string, number> = {};
  for (const p of squares) {
    if (p && p.color === victim) left[p.type] = (left[p.type] ?? 0) + 1;
  }
  let sum = 0;
  (Object.keys(FULL_COUNT) as PieceType[]).forEach((t) => {
    sum += (FULL_COUNT[t] - (left[t] ?? 0)) * SCORE_VALUE[t];
  });
  return sum;
}

/** 盘面剩余子力分（将帅不计，它是「命」不是「分」） */
function materialOf(squares: Square[], color: Color): number {
  let sum = 0;
  for (const p of squares) {
    if (p && p.color === color) sum += SCORE_VALUE[p.type];
  }
  return sum;
}

const clockText = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

interface Props {
  showLegalMoves: boolean;
  showNotation: boolean;
  /** 设置里是否开启「悔棋」按钮 */
  allowUndo: boolean;
  energy: number;
  onSpendEnergy: () => { energy: number; empty: boolean };
  gems: number;
  think: (pos: Position, level: Level) => Promise<ThinkResult | null>;
  onResult: (r: PlayResult) => Reward;
  onSpendGems: (n: number) => boolean;
  onReview: (history: Ply[], side: Color) => void;
  /** 外部请求离开（安卓返回手势 / 切换底部标签），值变化即触发一次 */
  backSignal?: number;
  /** 上报「对局进行中」，让外层据此拦截返回键 */
  onActiveChange?: (active: boolean) => void;
}

export interface Ply {
  from: number;
  to: number;
  notation: string;
  color: Color;
}

export function Play({
  showLegalMoves,
  showNotation,
  allowUndo,
  energy,
  onSpendEnergy,
  gems,
  think,
  onResult,
  onSpendGems,
  onReview,
  backSignal = 0,
  onActiveChange,
}: Props) {
  const [stage, setStage] = useState<'setup' | 'playing'>('setup');
  const [levelId, setLevelId] = useState<LevelId>('easy');
  const [side, setSide] = useState<Color>('r');
  const [pos, setPos] = useState<Position>(() => initialPosition());
  const [history, setHistory] = useState<Ply[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [quip, setQuip] = useState<string>('');
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveAnim, setMoveAnim] = useState<MoveAnim | null>(null);
  const [remaining, setRemaining] = useState(TIME_LIMIT);
  const [endReason, setEndReason] = useState<'normal' | 'timeout'>('normal');
  /** 计时是否已经启动：你走出第一手才开始跑表 */
  const [clockOn, setClockOn] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  /** 切后台 / 锁屏时暂停秒表 */
  const [paused, setPaused] = useState(false);

  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  const gameRef = useRef(0);
  const startedRef = useRef(false);
  const lastQuipAt = useRef(0);
  const animSeq = useRef(0);
  const deadlineRef = useRef(0);
  const lowTimeRef = useRef(false);
  const finishedRef = useRef(false);

  /** 对局中的插话：最多 4 秒一句，免得变成单口相声；同时挂在气泡上 */
  const sayBattle = useCallback((line: Line, force = false) => {
    const now = Date.now();
    if (!force && now - lastQuipAt.current < 4000) return;
    lastQuipAt.current = now;
    setQuip(line.t);
    voice.say(line.v ?? line.t, { force: true });
  }, []);

  const notify = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 1600);
  };

  /** 红黑随机：传了颜色就用传的，否则掷一次 */
  const resetTo = useCallback((color?: Color) => {
    const myColor: Color = color ?? (Math.random() < 0.5 ? 'r' : 'b');
    gameRef.current += 1;
    startedRef.current = true;
    deadlineRef.current = 0;
    lowTimeRef.current = false;
    finishedRef.current = false;
    pausedRef.current = false;
    pausedRemainRef.current = 0;
    setPaused(false);
    setRemaining(TIME_LIMIT);
    setClockOn(false);
    setEndReason('normal');
    setLeaveOpen(false);
    setPos(initialPosition());
    setHistory([]);
    setSelected(null);
    setLastMove(null);
    setResult(null);
    setReward(null);
    setQuip('');
    setHint(null);
    setMoveAnim(null);
    setThinking(false);
    setStage('playing');
    setSide(myColor);
    // 执黑时红方（奥斯卡）先走，开场白换一套
    const opening = myColor === 'r' ? OPENING : OPENING_AI;
    window.setTimeout(() => sayBattle(pick('opening', opening), true), 460);
  }, [sayBattle]);

  /* ---------- 前后台暂停 ---------- */
  const pausedRef = useRef(false);
  const pausedRemainRef = useRef(0);
  const clockStateRef = useRef({ clockOn: false, paused: false });
  clockStateRef.current = { clockOn, paused };

  /** 你走出第一手后开始跑表 */
  const startClock = useCallback(() => {
    deadlineRef.current = Date.now() + TIME_LIMIT * 1000;
    lowTimeRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setRemaining(TIME_LIMIT);
    setClockOn(true);
  }, []);

  const pauseClock = useCallback(() => {
    const s = clockStateRef.current;
    if (!s.clockOn || s.paused || pausedRef.current) return;
    pausedRemainRef.current = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
    pausedRef.current = true;
    clockStateRef.current.paused = true;
    setPaused(true);
  }, []);

  const resumeClock = useCallback(() => {
    if (!pausedRef.current) return;
    // 用暂停时存下的剩余秒数重新起算，后台待多久都不扣
    deadlineRef.current = Date.now() + pausedRemainRef.current * 1000;
    pausedRef.current = false;
    clockStateRef.current.paused = false;
    setPaused(false);
  }, []);

  useEffect(() => {
    window.XQAppState = (state) => (state === 'pause' ? pauseClock() : resumeClock());
    const onVisible = () => {
      if (document.visibilityState === 'hidden') pauseClock();
      else resumeClock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      delete window.XQAppState;
    };
  }, [pauseClock, resumeClock]);

  /** 真正「在打」的状态：计时都没启动就不算（还没走第一手），结算页也不拦返回键 */
  const active = stage === 'playing' && !result && clockOn;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);

  const leaveStateRef = useRef({ active, leaveOpen });
  leaveStateRef.current = { active, leaveOpen };

  // 安卓侧滑返回 / 点底部别的标签：先问一句再走
  useEffect(() => {
    if (!backSignal) return;
    const s = leaveStateRef.current;
    if (s.leaveOpen) {
      setLeaveOpen(false);
      return;
    }
    if (s.active) setLeaveOpen(true);
  }, [backSignal]);

  const finish = useCallback(
    (res: 'win' | 'lose' | 'draw', pool?: Line[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setLeaveOpen(false);
      setResult(res);
      const rw = onResult({ result: res, level: levelId });
      setReward(rw);
      const line = pool
        ? pick(`timeout-${res}`, pool)
        : pick('result', res === 'win' ? WIN : res === 'lose' ? LOSE : DRAW);
      setQuip(line.t);
      voice.say(line.v ?? line.t, { force: true });
      buzz('result');
      if (res === 'win') sfx.win();
      else if (res === 'lose') sfx.lose();
    },
    [levelId, onResult],
  );

  const commit = useCallback(
    (current: Position, from: number, to: number): Position | null => {
      const move = findMoveByFromTo(current.squares, current.turn, from, to);
      if (!move) return null;
      const notation = moveToChinese(current.squares, from, to);
      const captured = current.squares[to];
      const next = applyMove(current, from, to);
      const givesCheck = isInCheck(next.squares, next.turn);

      // 走子动画：位移 + 吃子爆点，seq 保证同格重复走子也能重放
      animSeq.current += 1;
      setMoveAnim({ from, to, captured: captured ?? null, seq: animSeq.current });

      // 音效：每一步都有落子声；吃子更沉，将军在棋子落定后补一记提示
      if (captured) sfx.capture();
      else sfx.move();
      if (givesCheck) window.setTimeout(() => sfx.check(), 250);

      // 震动：只在将军、吃子这类关键事件上响，普通落子不震
      if (givesCheck) buzz('check');
      else if (captured) buzz('capture');

      setPos(next);
      setLastMove({ from, to });
      setHistory((h) => [...h, { from, to, notation, color: current.turn }]);
      setHint(null);
      const st = getStatus(next);
      if (st.status !== 'playing') {
        const winner = st.winner;
        // 等棋子滑到位、终局音效落定再弹结算
        setTimeout(() => {
          if (winner === side) finish('win');
          else if (winner === null) finish('draw');
          else finish('lose');
        }, 420);
      }
      return next;
    },
    [finish, side],
  );

  // 倒计时：30:00，你走出第一手后才开始跑；切后台/锁屏自动暂停
  useEffect(() => {
    if (stage !== 'playing' || result || !clockOn || paused) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [stage, result, clockOn, paused]);

  // 最后一分钟提醒，只提醒一次
  useEffect(() => {
    if (stage !== 'playing' || result || !clockOn || paused) return;
    if (remaining > 0 && remaining <= 60 && !lowTimeRef.current) {
      lowTimeRef.current = true;
      sayBattle(pick('lowtime', LOW_TIME), true);
    }
  }, [remaining, stage, result, clockOn, paused, sayBattle]);

  useEffect(() => {
    if (stage !== 'playing' || result || !clockOn || paused || remaining > 0) return;
    const mine = materialOf(pos.squares, side);
    const his = materialOf(pos.squares, other(side));
    const res: 'win' | 'lose' | 'draw' = mine > his ? 'win' : mine < his ? 'lose' : 'draw';
    setEndReason('timeout');
    finish(res, res === 'win' ? TIMEOUT_WIN : res === 'lose' ? TIMEOUT_LOSE : TIMEOUT_DRAW);
  }, [remaining, stage, result, clockOn, paused, pos.squares, side, finish]);

  // AI 回合
  useEffect(() => {
    if (stage !== 'playing' || result) return;
    if (pos.turn === side) return;
    const st = getStatus(pos);
    if (st.status !== 'playing') return;

    const myGame = gameRef.current;
    setThinking(true);
    let cancelled = false;

    // 先落子再思考：即使引擎秒回，也留出 MIN_AI_DELAY 让玩家看清自己那步
    (async () => {
      const startedAt = Date.now();
      const mv = await think(pos, level);
      const rest = MIN_AI_DELAY - (Date.now() - startedAt);
      if (rest > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, rest));
      if (cancelled || gameRef.current !== myGame) return;
      setThinking(false);
      if (!mv) return;
      const next = commit(pos, mv.from, mv.to);
      if (!next) return;
      const move = findMoveByFromTo(pos.squares, pos.turn, mv.from, mv.to);
      if (getStatus(next).status !== 'playing') return;
      if (isInCheck(next.squares, next.turn)) {
        if (Math.random() < 0.8) {
          window.setTimeout(() => sayBattle(pick('checkback', CHECK_BACK), true), 320);
        }
      } else if (move?.captured) {
        if (Math.random() < 0.55) sayBattle(pick('takeyours', TAKE_YOURS));
      } else if (level.noise >= 40 && Math.random() < 0.2) {
        // 低难度确实会走软手，顺口自嘲一句
        sayBattle(pick('mercy', MERCY));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pos, stage, result, side, level, think, commit]);

  const onSquare = (i: number) => {
    if (stage !== 'playing' || result || thinking || pos.turn !== side) return;
    const piece = pos.squares[i];
    if (selected === null) {
      if (!piece || piece.color !== side) return;
      setSelected(i);
      sfx.select();
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    if (piece && piece.color === side) {
      setSelected(i);
      sfx.select();
      return;
    }
    const next = commit(pos, selected, i);
    if (!next) {
      setSelected(null);
      sfx.wrong();
      sayBattle(pick('illegal', ILLEGAL));
      return;
    }
    const captured = pos.squares[i];
    setSelected(null);
    if (!clockOn) startClock();
    const gaveCheck = isInCheck(next.squares, next.turn);
    const over = getStatus(next).status !== 'playing';
    if (!over) {
      if (gaveCheck && Math.random() < 0.75) {
        // 等棋子滑到位再开口，否则像在抢话
        window.setTimeout(() => sayBattle(pick('check', CHECK), true), 320);
      } else if (captured && Math.random() < 0.6) {
        const pool = MY_PIECE[captured.type] ?? CAPTURE;
        sayBattle(pool[Math.floor(Math.random() * pool.length)] ?? CAPTURE[0]);
      } else if (captured && Math.random() < 0.3) {
        sayBattle(pick('cap', CAPTURE));
      }
    }
  };

  const undo = () => {
    if (!allowUndo || history.length === 0 || thinking || result) return;
    if (!history.some((h) => h.color === side)) {
      notify('你还没走棋，没什么可悔的');
      return;
    }
    if (energy <= 0) {
      notify('体力空了，悔棋也要力气');
      sayBattle(pick('energy', OUT_OF_ENERGY), true);
      sfx.wrong();
      return;
    }
    const left = onSpendEnergy().energy;
    gameRef.current += 1;
    // 回退到玩家上一次走子之前
    const targetLen = pos.turn === side ? 2 : 1;
    const keep = Math.max(0, history.length - targetLen);
    let p = initialPosition();
    for (let k = 0; k < keep; k++) p = applyMove(p, history[k].from, history[k].to);
    setPos(p);
    setHistory(history.slice(0, keep));
    setLastMove(keep > 0 ? { from: history[keep - 1].from, to: history[keep - 1].to } : null);
    setSelected(null);
    setHint(null);
    setMoveAnim(null);
    setResult(null);
    sfx.tap();
    notify(`悔棋完成，-1 ❤️（剩 ${left} 点）`);
  };

  const askHint = async () => {
    if (stage !== 'playing' || result || thinking || pos.turn !== side) return;
    if (gems < HINT_COST) {
      notify(`提示要 ${HINT_COST} 💎，先去上课挣点`);
      return;
    }
    notify('正在计算最佳着法…');
    const mv = await think(pos, { ...level, depth: Math.max(3, level.depth), noise: 0 });
    if (mv) {
      onSpendGems(HINT_COST);
      setHint({ from: mv.from, to: mv.to });
      notify(`建议：绿色标记的这一手（-${HINT_COST}💎）`);
    } else {
      notify('暂时算不出来');
    }
  };

  const resign = () => {
    if (result) return;
    finish('lose');
  };

  const targets = selected !== null && showLegalMoves ? legalTargetsFrom(pos.squares, selected) : [];
  const myScore = capturedScore(pos.squares, other(side));
  const hisScore = capturedScore(pos.squares, side);
  const timeLeft = clockText(remaining);
  const urgent = remaining <= 60 && !result;
  const checkSquare = (() => {
    if (result) return null;
    if (!isInCheck(pos.squares, pos.turn)) return null;
    return findKing(pos.squares, pos.turn);
  })();

  if (stage === 'setup') {
    return (
      <div className="screen play-setup">
        <header className="screen-head">
          <h1>奥斯卡对战</h1>
          <p>和这块被削成「帅」的木头下一局 · 红黑随机、红方先行 · 30 分钟</p>
        </header>

        <div className="card">
          <div className="card-eyebrow">选择难度</div>
          <div className="level-list">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                className={`level-item ${l.id === levelId ? 'active' : ''}`}
                onClick={() => {
                  setLevelId(l.id);
                  sfx.tap();
                }}
              >
                <span className="level-emoji">{l.emoji}</span>
                <span className="level-text">
                  <b>{l.name}</b>
                  <small>{l.desc}</small>
                </span>
                {l.id === levelId && <span className="level-check">✓</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-tip">
          <b>🎲 执子随机</b>
          <span>开局时随机分配红黑，红方先走 —— 你有可能执黑，那奥斯卡就先动。</span>
          <span>计时 30 分钟，从你走出第一手开始；超时按残局剩余子力判定。</span>
        </div>

        <button className="btn btn-primary big" onClick={() => resetTo()}>
          开始挑战
        </button>

        {startedRef.current && (
          <button className="btn btn-ghost" onClick={() => setStage('playing')}>
            返回当前对局
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="screen play">
      <header className="play-top">
        <button
          className="play-exit"
          onClick={() => (active ? setLeaveOpen(true) : setStage('setup'))}
          aria-label="离开对局"
        >
          ✕
        </button>
        <div className="play-hud">
          <div className="hud-cell">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="#eafbd7" stroke="#7bc043" strokeWidth="2.2" />
              <path
                d="M7.2 12.4l3.2 3.2 6.2-6.4"
                fill="none"
                stroke="#58a700"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b>{myScore}</b>
            <i>分</i>
          </div>
          <span className="hud-div" />
          <div className={`hud-cell ${urgent ? 'urgent' : ''} ${clockOn ? '' : 'idle'}`}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="#ffefc4" stroke="#e8a400" strokeWidth="2.2" />
              <path d="M12 6.4V12l3.8 2.4" fill="none" stroke="#c99000" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <b>{timeLeft}</b>
          </div>
        </div>
        <span className="play-top-right" />
      </header>

      <div className={`battle-stage ${thinking ? 'thinking' : ''}`}>
        <div className="oscar-figure">
          <Oscar mood={thinking ? 'think' : 'smug'} size={72} />
        </div>
        <button
          className="oscar-bubble"
          onClick={() => quip && voice.say(quip, { force: true })}
          aria-label="奥斯卡的点评"
        >
          <span className="bubble-top">
            <b>奥斯卡</b>
            <span className="bubble-diff">{level.name}</span>
            <span className="bubble-score">吃子 {hisScore}</span>
          </span>
          <span className="bubble-text">{quip || '来吧，先走一步让我看看。'}</span>
        </button>
      </div>

      <Board
        squares={pos.squares}
        orientation={side}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        moveAnim={moveAnim}
        checkSquare={checkSquare}
        onSquareClick={onSquare}
        disabled={Boolean(result) || thinking || pos.turn !== side}
        marks={
          hint
            ? [
                { at: hint.from, kind: 'star' },
                { at: hint.to, kind: 'star' },
              ]
            : []
        }
      />

      <div className="player-bar me">
        <span className="avatar">🧑</span>
        <div className="player-meta">
          <b>你 · {side === 'r' ? '红方' : '黑方'}</b>
          <small>{pos.turn === side ? '轮到你走' : '等奥斯卡'}</small>
        </div>
        {allowUndo && <span className="play-hearts">❤️ {energy}</span>}
        <span className="turn-flag" style={{ opacity: pos.turn === side ? 1 : 0.2 }}>
          {pos.turn === side ? '你的回合' : '奥斯卡'}
        </span>
      </div>

      {showNotation && (
        <div className="move-strip">
          {history.length === 0 ? (
            <span className="move-empty">尚未走子</span>
          ) : (
            history.map((h, i) => (
              <span key={i} className={`move-chip ${h.color}`}>
                {h.notation}
              </span>
            ))
          )}
        </div>
      )}

      <div
        className={`play-controls ${allowUndo ? '' : 'solo'}`}
        style={{ gridTemplateColumns: `repeat(${allowUndo ? 2 : 1}, minmax(0, 1fr))` }}
      >
        {allowUndo && (
          <button
            className="ctl"
            onClick={undo}
            disabled={thinking || Boolean(result) || energy <= 0}
          >
            ↩️
            <span>悔棋</span>
            <em className="ctl-cost">-1 ❤️</em>
          </button>
        )}
        <button className="ctl" onClick={askHint} disabled={thinking || Boolean(result) || pos.turn !== side}>
          💡<span>提示</span>
        </button>
      </div>

      <Sheet
        open={leaveOpen}
        title="要坚持下去吗？"
        onClose={() => setLeaveOpen(false)}
        closeLabel={null}
      >
        <p className="sheet-note">
          棋局还在，随时能接着下。认输会立刻结算这一局，并扣 1 ❤️。
        </p>
        <button className="btn btn-primary" onClick={() => setLeaveOpen(false)}>
          坚持战斗
        </button>
        <button
          className="btn btn-ghost danger"
          onClick={() => {
            setLeaveOpen(false);
            resign();
          }}
        >
          认输，结束本局
        </button>
        <button
          className="sheet-link"
          onClick={() => {
            setLeaveOpen(false);
            resetTo();
          }}
        >
          重新开始（重新随机执子）
        </button>
      </Sheet>

      {result && (
        <div className="overlay">
          <div className={`overlay-card ${result}`}>
            <div className="overlay-emoji">
              {result === 'win' ? '🏆' : result === 'lose' ? '😵' : '🤝'}
            </div>
            <h2>{result === 'win' ? '漂亮，你赢了！' : result === 'lose' ? '这局输了' : '和棋'}</h2>
            {endReason === 'timeout' && (
              <div className="overlay-tag">⏰ 时间到 · 按残局剩余子力判定</div>
            )}
            <div className="result-oscar">
              <Oscar mood={result === 'win' ? 'happy' : result === 'lose' ? 'sad' : 'idle'} size={58} />
              <p>{quip}</p>
            </div>
            {reward && (
              <div className="play-gains">
                <span>⚡ +{reward.xp}</span>
                <span>💎 +{reward.gems}</span>
                {result === 'lose' && <span className="lost-heart">❤️ -1</span>}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => resetTo()}>
              再来一局
            </button>
            <button className="btn btn-ghost" onClick={() => onReview(history, side)}>
              🔍 复盘本局
            </button>
            <button className="btn btn-ghost" onClick={() => setStage('setup')}>
              调整难度
            </button>
          </div>
        </div>
      )}

      {notice && <div className="flash">{notice}</div>}
    </div>
  );
}
