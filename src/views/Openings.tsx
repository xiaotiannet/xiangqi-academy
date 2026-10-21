import { useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { Oscar } from '../components/Oscar';
import { OPENINGS, openingPositions, type Opening } from '../content/openings';
import { idx } from '../game/types';
import { sfx } from '../state/sound';
import { voice } from '../state/native';

interface Props {
  onPlay: () => void;
}

export function Openings({ onPlay }: Props) {
  const [active, setActive] = useState<Opening | null>(null);
  const [step, setStep] = useState(0);

  const positions = useMemo(() => (active ? openingPositions(active) : []), [active]);
  const pos = active ? positions[Math.min(step, positions.length - 1)] : null;

  const open = (op: Opening) => {
    setActive(op);
    setStep(0);
    sfx.tap();
    voice.say('开局，先把架势摆好。', { force: true });
  };

  if (active && pos) {
    const move = step > 0 ? active.line[step - 1] : null;
    const lastMove = move
      ? { from: idx(move.from[0], move.from[1]), to: idx(move.to[0], move.to[1]) }
      : null;
    return (
      <div className="screen openings">
        <header className="review-head">
          <button className="icon-btn" onClick={() => setActive(null)} aria-label="返回">
            ←
          </button>
          <div className="review-title">
            <h1>{active.name}</h1>
            <p>
              {active.category} · {active.line.length} 手
            </p>
          </div>
          <div className="review-badge">
            {step}/{active.line.length}
          </div>
        </header>

        <Board
          squares={pos.squares}
          orientation="r"
          lastMove={lastMove}
          disabled
        />

        <div className="review-nav">
          <button className="ctl" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ◀<span>上一步</span>
          </button>
          <button
            className="ctl"
            onClick={() => setStep((s) => Math.min(active.line.length, s + 1))}
            disabled={step >= active.line.length}
          >
            ▶<span>下一步</span>
          </button>
          <button className="ctl" onClick={() => setStep(0)}>
            ↺<span>重来</span>
          </button>
          <button className="ctl" onClick={onPlay}>
            ⚔️<span>去实战</span>
          </button>
        </div>

        <div className="card">
          <div className="card-eyebrow">{move ? `第 ${step} 手` : '初始局面'}</div>
          <h2 className="opening-move">{move ? move.label : '摆好棋子，准备开始'}</h2>
          <p className="opening-note">
            {move?.note ?? '红方先行。先看清楚双方子力位置，再看这条开局想做什么。'}
          </p>
        </div>

        <div className="card">
          <div className="card-eyebrow">开局思路</div>
          <p className="opening-idea">{active.idea}</p>
          <ul className="opening-points">
            {active.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="screen openings">
      <header className="screen-head">
        <h1>开局库</h1>
        <p>6 条常用开局，全部经过引擎校验</p>
      </header>

      <div className="oscar-row">
        <Oscar mood="smug" size={78} />
        <div className="bubble">
          <p>开局的用处不是背谱，是让你前六步不用自己想。省下来的脑子，后面才够用。</p>
        </div>
      </div>

      <div className="opening-list">
        {OPENINGS.map((op) => (
          <button className="opening-card" key={op.id} onClick={() => open(op)}>
            <div className="opening-head">
              <b>{op.name}</b>
              <span className="opening-tag">{op.category}</span>
            </div>
            <p>{op.idea}</p>
            <div className="opening-foot">
              <span className="opening-line">
                {op.line
                  .slice(0, 4)
                  .map((m) => m.label)
                  .join(' · ')}
                …
              </span>
              <span className="opening-go">学习 →</span>
            </div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-eyebrow">人机对战已经在用</div>
        <p className="opening-idea">
          奥斯卡开局会从这 6 条里随机选，所以你每局的对手多少有点不一样。你也可以用同样的路数回敬它。
        </p>
      </div>
    </div>
  );
}
