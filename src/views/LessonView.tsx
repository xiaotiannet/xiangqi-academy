import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { UNIT_COLORS, type Lesson, type Step, type UnitColor } from '../content/types';
import { parseLayout } from '../game/board';
import { isMateAfter } from '../game/ai';
import { isInCheck } from '../game/rules';
import { findKing } from '../game/board';
import { legalMoves, legalTargetsFrom, makeMove, unmakeMove } from '../game/rules';
import type { Color, Position, Square } from '../game/types';
import { other } from '../game/types';
import { sfx } from '../state/sound';
import { CORRECT, OUT_OF_ENERGY, PERFECT, RETAIN, WRONG, pick } from '../content/oscar';
import { haptic, voice } from '../state/native';
import { ENERGY_COST, ENERGY_MAX, type Reward } from '../state/progress';
import { Oscar } from '../components/Oscar';

export interface LessonResult {
  accuracy: number;
  xp: number;
  stars: number;
  mistakes: number;
}

interface Props {
  lesson: Lesson & { unitColor: UnitColor; unitId: string };
  showLegalMoves: boolean;
  energy: number;
  gems: number;
  onExit: () => void;
  onFinish: (r: LessonResult) => Reward;
  onHeartLost: () => { energy: number; empty: boolean };
  onRefill: () => boolean;
  onCorrect: () => void;
}

type Phase = 'ask' | 'correct' | 'wrong';

function judge(
  step: Extract<Step, { kind: 'move' | 'reach' | 'capture' }>,
  pos: Position,
  from: number,
  to: number,
): boolean {
  if (step.kind === 'reach') return step.pieceAt === from && step.targets.includes(to);
  if (step.kind === 'capture') return step.target === to;
  const goal = step.goal ?? 'any';
  if (goal === 'mate') return isMateAfter(pos, from, to);
  if (goal === 'check') {
    const squares = pos.squares.slice();
    const cap = makeMove(squares, from, to);
    const ok = isInCheck(squares, other(pos.turn));
    unmakeMove(squares, from, to, cap);
    return ok;
  }
  return (step.solutions ?? []).some(([f, t]) => f === from && t === to);
}

export function LessonView({
  lesson,
  showLegalMoves,
  energy,
  gems,
  onExit,
  onFinish,
  onHeartLost,
  onRefill,
  onCorrect,
}: Props) {
  const colors = UNIT_COLORS[lesson.unitColor];
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [selected, setSelected] = useState<number | null>(null);
  const [applied, setApplied] = useState<{ from: number; to: number } | null>(null);
  const [wrongTries, setWrongTries] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [stepFailed, setStepFailed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [dead, setDead] = useState(false);
  const settledRef = useRef(false);

  const step = lesson.steps[idx];
  const isBoardTask = step?.kind === 'move' || step?.kind === 'reach' || step?.kind === 'capture';
  const interactiveTotal = useMemo(
    () => lesson.steps.filter((s) => s.kind !== 'info').length,
    [lesson.steps],
  );

  const baseSquares = useMemo<Square[]>(() => {
    if (!step || !('layout' in step) || !step.layout) return new Array(90).fill(null);
    try {
      return parseLayout(step.layout);
    } catch {
      return new Array(90).fill(null);
    }
  }, [step]);

  const turn: Color = (step && 'turn' in step && step.turn) || 'r';

  const displaySquares = useMemo(() => {
    if (!applied) return baseSquares;
    const squares = baseSquares.slice();
    makeMove(squares, applied.from, applied.to);
    return squares;
  }, [baseSquares, applied]);

  const pos = useMemo<Position>(() => ({ squares: baseSquares, turn }), [baseSquares, turn]);

  const checkSquare = useMemo(() => {
    if (phase !== 'correct' || !applied) return null;
    const king = findKing(displaySquares, other(turn));
    if (king < 0) return null;
    return isInCheck(displaySquares, other(turn)) ? king : null;
  }, [displaySquares, applied, phase, turn]);

  const targets = useMemo(() => {
    if (!isBoardTask || selected === null) return [];
    if (!showLegalMoves) return [];
    return legalTargetsFrom(displaySquares, selected);
  }, [displaySquares, selected, isBoardTask, showLegalMoves]);

  const resetStep = useCallback(() => {
    setPhase('ask');
    setSelected(null);
    setApplied(null);
    setChosen(null);
  }, []);

  useEffect(() => {
    resetStep();
    setWrongTries(0);
    setHintOpen(false);
    setStepFailed(false);
  }, [idx, resetStep]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1500);
  };

  const goNext = () => {
    if (idx + 1 < lesson.steps.length) {
      setIdx(idx + 1);
    } else {
      setFinished(true);
      sfx.win();
    }
  };

  const drainHeart = () => {
    if (stepFailed) return;
    const r = onHeartLost();
    haptic(24);
    if (r.empty) {
      const line = pick('empty', OUT_OF_ENERGY);
      voice.say(line.v ?? line.t, { force: true });
      setDead(true);
    }
  };

  const acceptCorrect = (from?: number, to?: number) => {
    if (from !== undefined && to !== undefined) setApplied({ from, to });
    setPhase('correct');
    if (!stepFailed) setFirstTry((n) => n + 1);
    sfx.correct();
    haptic(8);
    onCorrect();
    const line = pick('correct', CORRECT);
    voice.say(line.v ?? line.t, { rate: 1.06 });
  };

  const rejectAttempt = (message: string) => {
    setPhase('wrong');
    setStepFailed(true);
    setWrongTries((n) => n + 1);
    setTotalWrong((n) => n + 1);
    setSelected(null);
    sfx.wrong();
    const line = pick('wrong', WRONG);
    voice.say(line.v ?? line.t);
    showFlash(message);
    drainHeart();
  };

  const onSquare = (i: number) => {
    if (!isBoardTask) return;
    if (phase === 'wrong') setPhase('ask');
    if (phase === 'correct') return;
    const piece = displaySquares[i];

    if (selected === null) {
      if (!piece || piece.color !== turn) {
        showFlash(turn === 'r' ? '现在轮到红方走子' : '现在轮到黑方走子');
        return;
      }
      setSelected(i);
      sfx.tap();
      return;
    }

    if (i === selected) {
      setSelected(null);
      return;
    }

    if (piece && piece.color === turn) {
      setSelected(i);
      sfx.tap();
      return;
    }

    const legal = legalMoves(baseSquares, turn).some((m) => m.from === selected && m.to === i);
    if (!legal) {
      setSelected(null);
      sfx.wrong();
      showFlash('这步棋不合规则，换个落点试试');
      return;
    }

    if (judge(step as Extract<Step, { kind: 'move' | 'reach' | 'capture' }>, pos, selected, i)) {
      const from = selected;
      setSelected(null);
      acceptCorrect(from, i);
    } else {
      rejectAttempt('还不对，再想想');
    }
  };

  const chooseOption = (i: number) => {
    if (phase !== 'ask' || step.kind !== 'choice') return;
    setChosen(i);
    if (step.options[i].correct) {
      acceptCorrect();
    } else {
      setPhase('wrong');
      setStepFailed(true);
      setTotalWrong((n) => n + 1);
      sfx.wrong();
      const line = pick('wrong', WRONG);
      voice.say(line.v ?? line.t);
      drainHeart();
    }
  };

  const summary = useMemo(() => {
    const interactive = Math.max(1, interactiveTotal);
    const accuracy = Math.round((firstTry / interactive) * 100);
    const stars = totalWrong === 0 ? 3 : totalWrong <= 2 ? 2 : 1;
    const xp = lesson.xp + (totalWrong === 0 ? 5 : 0);
    return { accuracy, xp, stars, mistakes: totalWrong };
  }, [firstTry, interactiveTotal, lesson.xp, totalWrong]);

  useEffect(() => {
    if (!finished || settledRef.current) return;
    settledRef.current = true;
    setReward(onFinish(summary));
    const line = summary.mistakes === 0 ? pick('perfect', PERFECT) : pick('retain', RETAIN);
    voice.say(line.v ?? line.t, { force: true });
  }, [finished, onFinish, summary]);

  if (finished) {
    return (
      <div className="lesson lesson-done">
        <div className="result-card">
          <div className="result-stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < summary.stars ? 'star on' : 'star'}>
                ★
              </span>
            ))}
          </div>
          <h2>课程完成！</h2>
          <p className="result-sub">{lesson.title}</p>
          <div className="result-oscar">
            <Oscar mood={summary.stars === 3 ? 'happy' : 'idle'} size={62} />
            <p>{summary.mistakes === 0 ? '零失误。我把这句话记在年轮里了。' : '过关。虽然绕了点路，但到了。'}</p>
          </div>
          <div className="result-grid">
            <div>
              <b>+{summary.xp}</b>
              <span>经验值</span>
            </div>
            <div>
              <b>+{reward?.gems ?? 0}</b>
              <span>宝石</span>
            </div>
            <div>
              <b>{summary.accuracy}%</b>
              <span>一次正确率</span>
            </div>
            <div>
              <b>{summary.mistakes}</b>
              <span>失误次数</span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ background: colors.main, boxShadow: `0 4px 0 ${colors.dark}` }}
            onClick={onExit}
          >
            收下奖励
          </button>
        </div>
      </div>
    );
  }

  const progress = (idx / lesson.steps.length) * 100;

  return (
    <div className="lesson">
      <header className="lesson-top">
        <button className="icon-btn" onClick={onExit} aria-label="退出课程">
          ✕
        </button>
        <div className="lesson-progress">
          <div
            className="lesson-progress-fill"
            style={{ width: `${progress}%`, background: colors.main }}
          />
        </div>
        <div className="lesson-hearts" title={`体力 ${energy}/${ENERGY_MAX}`}>
          {'❤️'.repeat(Math.max(0, energy))}
          {'🤍'.repeat(Math.max(0, ENERGY_MAX - energy))}
        </div>
        <div className="lesson-count">
          {idx + 1}/{lesson.steps.length}
        </div>
      </header>

      <div className="lesson-body">
        {step.kind === 'info' && (
          <div className="card info-card">
            <div className="card-eyebrow" style={{ color: colors.dark }}>
              讲解
            </div>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            {step.tip && <div className="tip">💡 {step.tip}</div>}
          </div>
        )}

        {step.kind === 'choice' && (
          <div className="card">
            <div className="card-eyebrow" style={{ color: colors.dark }}>
              选择正确的答案
            </div>
            <h2 className="question">{step.question}</h2>
          </div>
        )}

        {isBoardTask && (
          <div className="card task-card">
            <div className="card-eyebrow" style={{ color: colors.dark }}>
              {step.kind === 'capture' ? '吃子练习' : step.kind === 'reach' ? '走子练习' : '实战题'}
            </div>
            <h2 className="question">{step.prompt}</h2>
          </div>
        )}

        {'layout' in step && step.layout && (
          <Board
            squares={displaySquares}
            orientation="r"
            selected={selected}
            targets={targets}
            highlight={step.highlight}
            marks={step.marks}
            arrows={step.arrows}
            lastMove={applied}
            checkSquare={checkSquare}
            onSquareClick={onSquare}
            disabled={phase !== 'ask' || !isBoardTask}
          />
        )}

        {step.kind === 'choice' && (
          <div className="options">
            {step.options.map((opt, i) => {
              const state =
                phase === 'ask'
                  ? ''
                  : opt.correct
                    ? 'is-right'
                    : chosen === i
                      ? 'is-wrong'
                      : 'is-dim';
              return (
                <button
                  key={i}
                  className={`option ${state}`}
                  onClick={() => chooseOption(i)}
                  disabled={phase !== 'ask'}
                >
                  <span className="option-key">{String.fromCharCode(65 + i)}</span>
                  <span>{opt.text}</span>
                  {phase !== 'ask' && opt.correct && <span className="option-mark">✓</span>}
                  {phase !== 'ask' && chosen === i && !opt.correct && (
                    <span className="option-mark">✕</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <footer className={`lesson-foot ${phase === 'ask' ? '' : phase}`}>
        {phase === 'ask' && (
          <div className="foot-row">
            {isBoardTask && step.hint && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setHintOpen((v) => !v);
                  sfx.tap();
                }}
              >
                💡 提示
              </button>
            )}
            {step.kind === 'info' && (
              <button
                className="btn btn-primary"
                style={{ background: colors.main, boxShadow: `0 4px 0 ${colors.dark}` }}
                onClick={goNext}
              >
                继续
              </button>
            )}
            {isBoardTask && (
              <div className="foot-hint">{hintOpen ? step.hint : '在棋盘上完成这一手'}</div>
            )}
          </div>
        )}

        {phase === 'correct' && (
          <div className="feedback feedback-ok">
            <div className="feedback-head">✓ 漂亮！</div>
            <p>{('explain' in step && step.explain) || '正是如此。'}</p>
            <button className="btn btn-success" onClick={goNext}>
              继续
            </button>
          </div>
        )}

        {phase === 'wrong' && (
          <div className="feedback feedback-bad">
            <div className="feedback-head">✕ 再试一次</div>
            <p>
              {step.kind === 'choice'
                ? step.explain
                : wrongTries >= 2 && 'hint' in step
                  ? `提示：${step.hint ?? ''}`
                  : '这一步还不能达成目标，重新选一个落点。'}
            </p>
            <button className="btn btn-danger" onClick={() => resetStep()}>
              重新作答
            </button>
          </div>
        )}
      </footer>

      {dead && (
        <div className="overlay">
          <div className="overlay-card dead">
            <Oscar mood="sad" size={96} />
            <div className="card-eyebrow">体力耗尽</div>
            <h2>奥斯卡把棋盘收了</h2>
            <p>每错一题掉 1 点体力，18 分钟自然恢复 1 点。也可以直接补满。</p>
            <button
              className="btn btn-primary"
              disabled={gems < ENERGY_COST}
              onClick={() => {
                if (onRefill()) {
                  setDead(false);
                  voice.say('满血复活。这次别再绊自己的马腿了。', { force: true });
                }
              }}
            >
              补满体力 · 💎 {ENERGY_COST}
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              先歇会儿
            </button>
            <p className="overlay-foot">当前宝石 💎 {gems}</p>
          </div>
        </div>
      )}

      {flash && <div className="flash">{flash}</div>}
    </div>
  );
}
