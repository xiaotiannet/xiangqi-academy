import type { Color } from './types';

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const QUALITY_META: Record<MoveQuality, { label: string; color: string; short: string }> = {
  best: { label: '好棋', color: '#58cc02', short: '好' },
  good: { label: '正着', color: '#1cb0f6', short: '正' },
  inaccuracy: { label: '稍亏', color: '#ffc800', short: '稍' },
  mistake: { label: '失误', color: '#ff9600', short: '误' },
  blunder: { label: '漏着', color: '#ff4b4b', short: '漏' },
};

export interface ReviewItem {
  ply: number;
  from: number;
  to: number;
  notation: string;
  color: Color;
  /** 相对最佳着法丢掉的分值（子力分制：车 900、马 400） */
  loss: number;
  bestFrom: number;
  bestTo: number;
  quality: MoveQuality;
}

export interface ReviewSummary {
  best: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  /** 玩家自己的着法数 */
  total: number;
  accuracy: number;
  worst: ReviewItem | null;
}

/**
 * 用「最佳着法评分 - 实际着法评分」判断好坏。
 * 分值单位与子力价值一致（车 900 / 炮 450 / 马 400 / 兵 100）。
 */
export function classify(loss: number, isBest: boolean, isMate: boolean): MoveQuality {
  if (isMate) return 'best';
  if (isBest && loss <= 25) return 'best';
  if (loss <= 45) return 'good';
  if (loss <= 130) return 'inaccuracy';
  if (loss <= 350) return 'mistake';
  return 'blunder';
}

export function summarize(items: ReviewItem[], side: Color): ReviewSummary {
  const mine = items.filter((it) => it.color === side);
  const count = (q: MoveQuality) => mine.filter((it) => it.quality === q).length;
  const penalty = mine.reduce((s, it) => s + Math.min(3, it.quality === 'blunder' ? 3 : it.quality === 'mistake' ? 2 : it.quality === 'inaccuracy' ? 1 : 0), 0);
  const accuracy = mine.length === 0 ? 0 : Math.max(0, Math.round(100 - (penalty / (mine.length * 3)) * 100));
  const worst = mine.slice().sort((a, b) => b.loss - a.loss)[0] ?? null;
  return {
    best: count('best'),
    good: count('good'),
    inaccuracy: count('inaccuracy'),
    mistake: count('mistake'),
    blunder: count('blunder'),
    total: mine.length,
    accuracy,
    worst,
  };
}

export function reviewComment(s: ReviewSummary): string {
  if (s.total === 0) return '这局你一步没走。复盘结束，我先复盘一下你。';
  if (s.blunder === 0 && s.mistake === 0)
    return '全盘没有大漏。你今天的木头运不错，我甚至想给你刻个记号。';
  if (s.blunder === 0) return '没有送大子，只有几处小磕碰。这种棋输赢都能睡着。';
  if (s.blunder <= 2) return '有两手挺可惜。别急，高手也送子，只是他们送得比较隐蔽。';
  return '复盘完了。你的车好像很喜欢出门，只是不太爱回家。';
}
