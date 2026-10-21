import { useEffect, useState } from 'react';
import {
  ENERGY_MAX,
  energyCountdown,
  levelInfo,
  type ProgressState,
} from '../state/progress';

interface Props {
  progress: ProgressState;
  onOpenWallet: () => void;
  onOpenLevel: () => void;
}

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TopBar({ progress, onOpenWallet, onOpenLevel }: Props) {
  const [, tick] = useState(0);
  const lv = levelInfo(progress.xp);

  useEffect(() => {
    if (progress.energy >= ENERGY_MAX) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [progress.energy]);

  const left = energyCountdown(progress);

  return (
    <div className="statbar">
      <div className="stat stat-fire" title={`连续学习 ${progress.streak} 天`}>
        <span className="stat-ico">🔥</span>
        <b>{progress.streak}</b>
      </div>
      <button className="stat stat-gem" onClick={onOpenWallet} title="宝石">
        <span className="stat-ico">💎</span>
        <b>{progress.gems}</b>
      </button>
      <button
        className={`stat stat-energy ${progress.energy <= 1 ? 'is-low' : ''}`}
        onClick={onOpenWallet}
        title="体力"
      >
        <span className="stat-ico">❤️</span>
        <b>{progress.energy}</b>
        {progress.energy < ENERGY_MAX && <small className="stat-sub">{mmss(left)}</small>}
      </button>
      <button className="stat stat-level" onClick={onOpenLevel} title="等级">
        <span className="lv-badge">Lv.{lv.level}</span>
        <small>{lv.title}</small>
      </button>
    </div>
  );
}
