import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { Oscar } from '../components/Oscar';
import { findKing, initialPosition } from '../game/board';
import { applyMove, getStatus, isInCheck } from '../game/rules';
import { moveToChinese } from '../game/notation';
import type { Color, Position } from '../game/types';
import {
  QUALITY_META,
  STOP_META,
  advantageText,
  buildGuide,
  classify,
  reviewComment,
  summarize,
  type ReviewItem,
} from '../game/review';
import type { EvalResult } from '../state/engine';
import { identifyOpening } from '../content/openings';
import { voice } from '../state/native';
import { sfx } from '../state/sound';

interface Ply {
  from: number;
  to: number;
}

interface Props {
  history: Ply[];
  side: Color;
  /** 这局的胜负（对战页点进来时带上；从结算页进来也带） */
  result?: 'win' | 'lose' | 'draw';
  evaluate: (pos: Position, depth?: number) => Promise<EvalResult | null>;
  onExit: () => void;
}

/** 优势曲线/进度条的满格刻度（cp）：±10 子 */
const CP_FULL = 1000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ReviewView({ history, side, result, evaluate, onExit }: Props) {
  /** 每个局面的引擎评分（视角 = 该局面的行棋方）；null 表示算不出来 */
  const [raw, setRaw] = useState<Array<EvalResult | null> | null>(null);
  const [prog, setProg] = useState(0);
  /** 从开局开始看，不再一进来就跳到终局 */
  const [cursor, setCursor] = useState(0);
  const [stopIdx, setStopIdx] = useState(0);
  const cancelRef = useRef(false);
  const spokenRef = useRef(false);

  const positions = useMemo<Position[]>(() => {
    const list: Position[] = [initialPosition()];
    let pos = list[0];
    for (const h of history) {
      pos = applyMove(pos, h.from, h.to);
      list.push(pos);
    }
    return list;
  }, [history]);

  const notations = useMemo(() => {
    const out: string[] = [];
    let pos = initialPosition();
    for (const h of history) {
      out.push(moveToChinese(pos.squares, h.from, h.to));
      pos = applyMove(pos, h.from, h.to);
    }
    return out;
  }, [history]);

  const opening = useMemo(() => identifyOpening(history), [history]);

  useEffect(() => {
    cancelRef.current = false;
    const scores: Array<EvalResult | null> = [];
    (async () => {
      for (let i = 0; i < positions.length; i++) {
        if (cancelRef.current) return;
        const r = await evaluate(positions[i], 2);
        scores.push(r);
        setProg((i + 1) / positions.length);
      }
      if (cancelRef.current) return;
      setRaw(scores);
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [positions, evaluate]);

  /** 逐手评级 */
  const items = useMemo<ReviewItem[] | null>(() => {
    if (!raw) return null;
    const list: ReviewItem[] = [];
    for (let i = 0; i < history.length; i++) {
      const before = raw[i];
      const after = raw[i + 1];
      const isMate = after === null;
      const beforeScore = before?.score ?? 0;
      const moverValue = after ? -after.score : 99999;
      const loss = Math.max(0, Math.round(beforeScore - moverValue));
      const isBest = Boolean(
        before && before.bestFrom === history[i].from && before.bestTo === history[i].to,
      );
      list.push({
        ply: i,
        from: history[i].from,
        to: history[i].to,
        notation: notations[i],
        color: positions[i].turn,
        loss: isMate ? 0 : loss,
        bestFrom: before?.bestFrom ?? -1,
        bestTo: before?.bestTo ?? -1,
        quality: classify(loss, isBest, isMate),
      });
    }
    return list;
  }, [raw, history, notations, positions]);

  /**
   * 「你」视角的分差曲线：正数 = 你占优。
   * 引擎评分是「行棋方视角」，所以要按局面行棋方翻一次符号，再按你执红/执黑翻第二次。
   */
  const mine = useMemo<number[] | null>(() => {
    if (!raw) return null;
    const sign = side === 'r' ? 1 : -1;
    let last = 0;
    return raw.map((r, i) => {
      if (!r) return last;
      const redCp = positions[i].turn === 'r' ? r.score : -r.score;
      last = redCp * sign;
      return last;
    });
  }, [raw, side, positions]);

  const summary = useMemo(() => (items ? summarize(items, side) : null), [items, side]);

  const verdict = useMemo(() => {
    if (result) return result === 'win' ? '你赢了' : result === 'lose' ? '你输了' : '和棋';
    const st = getStatus(positions[positions.length - 1]);
    if (st.status === 'playing') return '这盘没下完';
    if (st.winner === null) return '和棋';
    return st.winner === side ? '你赢了' : '你输了';
  }, [positions, side, result]);

  const guide = useMemo(() => {
    if (!items || !mine) return null;
    return buildGuide({
      items,
      side,
      mine,
      historyLength: history.length,
      bestNotation: (ply) => {
        const it = items[ply];
        if (!it || it.bestFrom < 0 || it.bestTo < 0) return null;
        return moveToChinese(positions[ply].squares, it.bestFrom, it.bestTo);
      },
      verdict,
    });
  }, [items, mine, side, history.length, positions, verdict]);

  /** 优势/劣势的极值点：结论卡里点一下就跳过去 */
  const extremes = useMemo(() => {
    if (!mine || mine.length === 0) return null;
    let hi = { i: 0, cp: mine[0] };
    let lo = { i: 0, cp: mine[0] };
    mine.forEach((cp, i) => {
      if (cp > hi.cp) hi = { i, cp };
      if (cp < lo.cp) lo = { i, cp };
    });
    return { hi, lo };
  }, [mine]);

  useEffect(() => {
    if (!guide || spokenRef.current) return;
    spokenRef.current = true;
    const t = window.setTimeout(
      () => voice.say('复盘好了，跟我一站一站看。', { force: true }),
      320,
    );
    return () => window.clearTimeout(t);
  }, [guide]);

  const pos = positions[Math.min(cursor, positions.length - 1)];
  const lastMove = cursor > 0 ? history[cursor - 1] : null;
  const checkSquare = useMemo(() => {
    if (!isInCheck(pos.squares, pos.turn)) return null;
    return findKing(pos.squares, pos.turn);
  }, [pos]);

  const last = positions.length - 1;

  /** 手动单步时，把站点序号对齐到「最近的一个已经在脚下的站」 */
  const syncStop = (c: number) => {
    if (!guide) return;
    let best = 0;
    guide.forEach((s, i) => {
      if (s.cursor <= c) best = i;
    });
    setStopIdx(best);
  };

  const goCursor = (n: number) => {
    const next = clamp(n, 0, last);
    setCursor(next);
    syncStop(next);
    sfx.tap();
  };

  const goStop = (i: number) => {
    if (!guide || i < 0 || i >= guide.length) return;
    setStopIdx(i);
    setCursor(clamp(guide[i].cursor, 0, last));
    sfx.tap();
  };

  const busy = !items || !mine || !guide;
  const stop = guide ? guide[Math.min(stopIdx, guide.length - 1)] : null;
  const adv = mine ? mine[Math.min(cursor, mine.length - 1)] ?? 0 : 0;
  const stopMeta = stop ? STOP_META[stop.kind] : null;

  /** 优势条：从正中往两边长 */
  const fillPct = clamp(Math.abs(adv) / CP_FULL, 0, 1) * 50;

  /** 优势曲线 */
  const spark = useMemo(() => {
    if (!mine || mine.length < 2) return null;
    const n = mine.length - 1;
    const x = (i: number) => (i / n) * 300;
    const y = (v: number) => 28 - clamp(v / CP_FULL, -1, 1) * 24;
    const pts = mine.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    return {
      line: pts.join(' '),
      area: `${pts.join(' ')} L300,28 L0,28 Z`,
      cx: x(clamp(cursor, 0, n)),
      cy: y(mine[clamp(cursor, 0, n)] ?? 0),
    };
  }, [mine, cursor]);

  return (
    <div className="app app-lesson">
      <div className="screen review">
        <header className="review-head">
          <button className="icon-btn" onClick={onExit} aria-label="返回">
            ✕
          </button>
          <div className="review-title">
            <h1>对局复盘</h1>
            <p>{opening ? `开局：${opening.name}` : '全程自由发挥，没有按谱走'}</p>
          </div>
          <div className="review-badge">{history.length} 手</div>
        </header>

        {busy && (
          <div className="card analyze-card">
            <Oscar mood="think" size={56} />
            <div className="analyze-main">
              <b>奥斯卡正在翻你的旧账…</b>
              <div className="goal-bar">
                <div className="goal-bar-fill" style={{ width: `${Math.round(prog * 100)}%` }} />
              </div>
              <small>逐手比对「最佳着法」，一共 {positions.length} 个局面</small>
            </div>
          </div>
        )}

        {!busy && (
          <div className="card adv-card">
            <div className="adv-head">
              <span className="adv-side">奥斯卡</span>
              <b className={adv > 120 ? 'mine' : adv < -120 ? 'his' : 'even'}>{advantageText(adv)}</b>
              <span className="adv-side">你</span>
            </div>
            <div className="adv-bar">
              <span className="adv-mid" />
              <i
                className={adv >= 0 ? 'adv-fill mine' : 'adv-fill his'}
                style={
                  adv >= 0
                    ? { left: '50%', width: `${fillPct}%` }
                    : { right: '50%', width: `${fillPct}%` }
                }
              />
            </div>
            {spark && (
              <svg className="adv-spark" viewBox="0 0 300 56" preserveAspectRatio="none">
                <line x1="0" y1="28" x2="300" y2="28" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
                <path d={spark.area} fill="currentColor" opacity="0.1" />
                <path d={spark.line} fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75" />
                <circle cx={spark.cx} cy={spark.cy} r="3.4" fill={adv >= 0 ? '#58cc02' : '#ff4b4b'} />
              </svg>
            )}
          </div>
        )}

        <div className="review-board">
          <Board
            squares={pos.squares}
            orientation={side}
            lastMove={lastMove}
            checkSquare={checkSquare}
            disabled
          />
        </div>

        {stop && stopMeta && (
          <div className="card guide-card">
            <div className="guide-top">
              <span className="guide-tag" style={{ background: stopMeta.color }}>
                {stopMeta.label}
              </span>
              <b>{stop.title}</b>
              <span className="guide-idx">
                {stopIdx + 1}/{guide!.length}
              </span>
            </div>
            <p className="guide-text">{stop.text}</p>
            <div className="guide-nav">
              <button className="ctl sm" onClick={() => goStop(stopIdx - 1)} disabled={stopIdx === 0}>
                ‹<span>上一站</span>
              </button>
              <button className="ctl sm" onClick={() => goCursor(cursor - 1)} disabled={cursor === 0}>
                ◀<span>单步</span>
              </button>
              <button className="ctl sm" onClick={() => goCursor(cursor + 1)} disabled={cursor >= last}>
                ▶<span>单步</span>
              </button>
              <button
                className="ctl sm"
                onClick={() => goStop(stopIdx + 1)}
                disabled={stopIdx >= guide!.length - 1}
              >
                ›<span>下一站</span>
              </button>
            </div>
          </div>
        )}

        <div className="move-strip review-strip">
          {notations.map((n, i) => {
            const it = items?.[i];
            const meta = it ? QUALITY_META[it.quality] : null;
            return (
              <button
                key={i}
                className={`move-chip ${positions[i].turn} ${cursor === i + 1 ? 'is-current' : ''}`}
                style={meta ? { borderColor: meta.color, color: '#3c3c3c' } : undefined}
                onClick={() => goCursor(i + 1)}
                title={it ? `${it.notation} · ${meta?.label}（损失 ${it.loss}）` : n}
              >
                {n}
                {meta && (
                  <i className="q-dot" style={{ background: meta.color }}>
                    {meta.short}
                  </i>
                )}
              </button>
            );
          })}
        </div>

        {summary && extremes && (
          <div className="card review-summary">
            <div className="card-eyebrow">复盘结论</div>
            <div className="review-glance">
              <button className="glance best" onClick={() => goCursor(extremes.hi.i)}>
                <b>{summary.best}</b>
                <span>亮点</span>
              </button>
              <button className="glance bad" onClick={() => goCursor(extremes.lo.i)}>
                <b>{summary.blunder + summary.mistake}</b>
                <span>失误</span>
              </button>
              <button className="glance up" onClick={() => goCursor(extremes.hi.i)}>
                <b>+{(Math.max(0, extremes.hi.cp) / 100).toFixed(1)}</b>
                <span>最大领先</span>
              </button>
              <button className="glance down" onClick={() => goCursor(extremes.lo.i)}>
                <b>{(Math.min(0, extremes.lo.cp) / 100).toFixed(1)}</b>
                <span>最大落后</span>
              </button>
            </div>
            <div className="review-score">
              <div className="review-acc">
                <b>{summary.accuracy}</b>
                <span>着法准确度</span>
              </div>
              <div className="review-counts">
                <span className="rc best">好棋 {summary.best}</span>
                <span className="rc inacc">稍亏 {summary.inaccuracy}</span>
                <span className="rc miss">失误 {summary.mistake}</span>
                <span className="rc blunt">漏着 {summary.blunder}</span>
              </div>
            </div>
            <div className="result-oscar">
              <Oscar mood={summary.blunder >= 3 ? 'sad' : 'smug'} size={52} />
              <p>{reviewComment(summary)}</p>
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={onExit}>
          回到对战
        </button>
      </div>
    </div>
  );
}
