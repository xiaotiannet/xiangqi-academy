import { useEffect, useMemo, useState } from 'react';
import { Oscar } from './Oscar';
import { celebrate, type Celebration } from '../state/celebrate';
import { ACHIEVEMENT, LEVEL_UP, template } from '../content/oscar';
import { voice } from '../state/native';
import { sfx } from '../state/sound';

const COLORS = ['#58cc02', '#ffc800', '#1cb0f6', '#ce82ff', '#ff4b4b', '#ff9600'];

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        left: (i * 97) % 100,
        delay: ((i * 37) % 100) / 100,
        dur: 1.6 + ((i * 13) % 90) / 100,
        color: COLORS[i % COLORS.length],
        size: 6 + ((i * 7) % 7),
        rot: (i * 53) % 360,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            background: b.color,
            width: b.size,
            height: b.size * 1.6,
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function CelebrationHost() {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const current = queue[0];

  useEffect(() => {
    return celebrate.subscribe((c) => setQueue((q) => [...q, c]));
  }, []);

  useEffect(() => {
    if (!current) return;
    sfx.win();
    if (current.kind === 'levelup') {
      const line = template(LEVEL_UP, { n: current.level, title: current.title });
      voice.say(line.v ?? line.t);
    } else if (current.kind === 'achievement') {
      const line = template(ACHIEVEMENT, { name: current.name });
      voice.say(line.v ?? line.t);
    } else {
      voice.say('奖励到手，收下吧。');
    }
  }, [current]);

  if (!current) return null;

  const close = () => {
    voice.stop();
    setQueue((q) => q.slice(1));
  };

  const head =
    current.kind === 'levelup' ? '升级！' : current.kind === 'achievement' ? '成就解锁' : current.title;

  const big =
    current.kind === 'levelup' ? `Lv.${current.level}` : current.kind === 'achievement' ? current.emoji : current.emoji;

  const sub =
    current.kind === 'levelup'
      ? current.title
      : current.kind === 'achievement'
        ? current.name
        : current.text;

  const gainGems = current.kind === 'achievement' ? current.gems : current.kind === 'reward' ? current.gems : 30;
  const gainXp = current.kind === 'reward' ? current.xp : undefined;

  return (
    <div className="celebration" onClick={close} role="dialog" aria-modal="true">
      <Confetti />
      <div className={`celebration-card ${current.kind}`} onClick={(e) => e.stopPropagation()}>
        <div className="celebration-oscar">
          <Oscar mood="happy" size={104} />
        </div>
        <div className="celebration-eyebrow">{head}</div>
        <div className={`celebration-big ${current.kind === 'achievement' ? 'is-emoji' : ''}`}>{big}</div>
        <div className="celebration-sub">{sub}</div>
        <div className="celebration-gains">
          {typeof gainGems === 'number' && <span>💎 +{gainGems}</span>}
          {typeof gainXp === 'number' && gainXp > 0 && <span>⚡ +{gainXp}</span>}
        </div>
        <button className="btn btn-primary" onClick={close}>
          收下
        </button>
      </div>
    </div>
  );
}
