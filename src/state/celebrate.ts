/** 全局庆祝事件：升级、成就、奖励、体力耗尽都走这里，避免逐层传 props */

export type Celebration =
  | { kind: 'levelup'; level: number; title: string }
  | { kind: 'achievement'; name: string; desc: string; gems: number; emoji: string }
  | { kind: 'reward'; title: string; text: string; emoji: string; gems?: number; xp?: number };

type Listener = (c: Celebration) => void;
const listeners = new Set<Listener>();

export const celebrate = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  push(c: Celebration) {
    listeners.forEach((fn) => fn(c));
  },
  levelUp(level: number, title: string) {
    celebrate.push({ kind: 'levelup', level, title });
  },
  achievement(name: string, desc: string, gems: number, emoji: string) {
    celebrate.push({ kind: 'achievement', name, desc, gems, emoji });
  },
  reward(title: string, text: string, emoji: string, gems?: number, xp?: number) {
    celebrate.push({ kind: 'reward', title, text, emoji, gems, xp });
  },
};
