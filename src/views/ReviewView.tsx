import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../components/Board';
import { Oscar } from '../components/Oscar';
import { findKing, initialPosition } from '../game/board';
import { applyMove, isInCheck } from '../game/rules';
import { moveToChinese } from '../game/notation';
import type { Color, Position } from '../game/types';
import { QUALITY_META, classify, reviewComment, summarize, type ReviewItem } from '../game/review';
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
  evaluate: (pos: Position, depth?: number) => Promise<EvalResult | null>;
  onExit: () => void;
}

export function ReviewView({ history, side, evaluate, onExit }: Props) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [prog, setProg] = useState(0);
  const [cursor, setCursor] = useState(history.length);
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
    let scores: Array<EvalResult | null> = [];
    (async () => {
      for (let i = 0; i < positions.length; i++) {
        if (cancelRef.current) return;
        const r = await evaluate(positions[i], 2);
        scores.push(r);
        setProg((i + 1) / positions.length);
      }
      if (cancelRef.current) return;

      const list: ReviewItem[] = [];
      for (let i = 0; i < history.length; i++) {
        const before = scores[i];
        const after = scores[i + 1];
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
      setItems(list);
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [positions, history, notations, evaluate]);

  const summary = useMemo(() => (items ? summarize(items, side) : null), [items, side]);

  useEffect(() => {
    if (!summary || spokenRef.current) return;
    spokenRef.current = true;
    const t = window.setTimeout(() => voice.say('复盘完毕，自己看看哪一步最亏。', { force: true }), 320);
    return () => window.clearTimeout(t);
  }, [summary]);

  const pos = positions[Math.min(cursor, positions.length - 1)];
  const lastMove = cursor > 0 ? history[cursor - 1] : null;
  const checkSquare = useMemo(() => {
    if (!isInCheck(pos.squares, pos.turn)) return null;
    return findKing(pos.squares, pos.turn);
  }, [pos]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(positions.length - 1, n));
    setCursor(next);
    sfx.tap();
  };

  const jumpWorst = () => {
    if (!summary?.worst) return;
    go(summary.worst.ply + 1);
  };

  const busy = !items;

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
            <Oscar mood="think" size={64} />
            <div className="analyze-main">
              <b>奥斯卡正在翻你的旧账…</b>
              <div className="goal-bar">
                <div className="goal-bar-fill" style={{ width: `${Math.round(prog * 100)}%` }} />
              </div>
              <small>逐手比对「最佳着法」，一共 {positions.length} 个局面</small>
            </div>
          </div>
        )}

        <Board
          squares={pos.squares}
          orientation={side}
          lastMove={lastMove}
          checkSquare={checkSquare}
          disabled
        />

        <div className="review-nav">
          <button className="ctl" onClick={() => go(cursor - 1)} disabled={cursor === 0}>
            ◀<span>上一步</span>
          </button>
          <button
            className="ctl"
            onClick={() => go(cursor + 1)}
            disabled={cursor >= positions.length - 1}
          >
            ▶<span>下一步</span>
          </button>
          <button className="ctl" onClick={jumpWorst} disabled={busy || !summary?.worst}>
            🔍<span>看漏着</span>
          </button>
          <button className="ctl" onClick={() => go(positions.length - 1)}>
            ⏭<span>终局</span>
          </button>
        </div>

        <div className="move-strip review-strip">
          {notations.map((n, i) => {
            const it = items?.[i];
            const meta = it ? QUALITY_META[it.quality] : null;
            return (
              <button
                key={i}
                className={`move-chip ${positions[i].turn} ${cursor === i + 1 ? 'is-current' : ''}`}
                style={meta ? { borderColor: meta.color, color: '#3c3c3c' } : undefined}
                onClick={() => go(i + 1)}
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

        {summary && (
          <div className="card review-summary">
            <div className="card-eyebrow">复盘结论</div>
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
              <Oscar mood={summary.blunder >= 3 ? 'sad' : 'smug'} size={56} />
              <p>{reviewComment(summary)}</p>
            </div>
            {summary.worst && summary.worst.loss > 130 && (
              <button className="btn btn-ghost" onClick={jumpWorst}>
                跳到最可惜的一手（第 {Math.floor(summary.worst.ply / 2) + 1} 回合，损失{' '}
                {summary.worst.loss} 分）
              </button>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={onExit}>
          回到对战
        </button>
      </div>
    </div>
  );
}
