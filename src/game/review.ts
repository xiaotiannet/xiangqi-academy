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

/* ──────────────────────────────
 * 逐站引导：把「亮点 / 失误 / 优势 / 劣势」拆成一步步可点的站点
 * ────────────────────────────── */

export type StopKind = 'start' | 'best' | 'bad' | 'end';

export interface GuideStop {
  /** 局面下标（0 = 开局，history.length = 终局），直接当 cursor 用 */
  cursor: number;
  /** 0 表示开局，等于 history.length 表示终局 */
  ply: number;
  kind: StopKind;
  title: string;
  text: string;
  /** 该局面在「你」视角的分差（正 = 你领先，单位与子力分一致） */
  cp: number;
}

export const STOP_META: Record<StopKind, { label: string; color: string }> = {
  start: { label: '开局', color: '#1cb0f6' },
  best: { label: '亮点', color: '#58cc02' },
  bad: { label: '失误', color: '#ff4b4b' },
  end: { label: '终局', color: '#7a5cff' },
};

/** 一子力分 = 100cp */
export const CP_UNIT = 100;

/** 把 cp 说成人话 */
export function advantageText(cp: number): string {
  const v = cp / CP_UNIT;
  if (Math.abs(v) < 0.5) return '基本均势';
  return v > 0 ? `你领先约 ${v.toFixed(1)} 子` : `奥斯卡领先约 ${(-v).toFixed(1)} 子`;
}

/** 第几回合（红先，所以 2 手一回合） */
export const roundOf = (ply: number): number => Math.floor(ply / 2) + 1;

const scoreText = (cp: number): string => `${(Math.abs(cp) / CP_UNIT).toFixed(1)} 子`;

export interface GuideInput {
  items: ReviewItem[];
  side: Color;
  /** 每个局面在「你」视角的分差 */
  mine: number[];
  historyLength: number;
  /** 第 ply 手在「该局面」下的中文记谱（用于给出更好的那一手） */
  bestNotation: (ply: number) => string | null;
  /** 终局结论 */
  verdict: string;
}

/**
 * 站点挑选策略（宁少勿多，逐站讲解）：
 *  - 开局一站、终局一站
 *  - 「你自己的着法」里：质量最差的至多 4 手（失误/漏着优先）、涨分最多的至多 3 手（亮点）
 *  - 按手数排序，避免来回跳
 */
export function buildGuide(input: GuideInput): GuideStop[] {
  const { items, side, mine, historyLength, bestNotation, verdict } = input;
  const n = historyLength;
  const stops: GuideStop[] = [];

  const cpAt = (i: number) => mine[Math.max(0, Math.min(mine.length - 1, i))] ?? 0;

  stops.push({
    cursor: 0,
    ply: 0,
    kind: 'start',
    title: '开局站位',
    text: '一切从这里开始。往下走，奥斯卡一站一站告诉你哪一步好、哪一步亏、什么时候占了上风。',
    cp: cpAt(0),
  });

  const mineMoves = items.filter((it) => it.color === side);

  const bads = mineMoves
    .filter((it) => it.quality === 'blunder' || it.quality === 'mistake')
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 4);

  const goods = mineMoves
    .filter((it) => it.quality === 'best' || it.quality === 'good')
    .map((it) => ({ it, gain: cpAt(it.ply + 1) - cpAt(it.ply) }))
    .filter((x) => x.gain >= 80 && x.it.loss <= 45)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  for (const it of bads) {
    const r = roundOf(it.ply);
    const better = bestNotation(it.ply);
    stops.push({
      cursor: it.ply + 1,
      ply: it.ply,
      kind: 'bad',
      title: `第 ${r} 回合 · ${it.notation}`,
      text: better
        ? `这一手亏了约 ${scoreText(it.loss)}，更稳的是「${better}」。`
        : `这一手亏了约 ${scoreText(it.loss)}，这之后局面就很难收拾了。`,
      cp: cpAt(it.ply + 1),
    });
  }

  for (const { it, gain } of goods) {
    const r = roundOf(it.ply);
    stops.push({
      cursor: it.ply + 1,
      ply: it.ply,
      kind: 'best',
      title: `第 ${r} 回合 · ${it.notation}`,
      text: `漂亮的一手，白赚了约 ${scoreText(gain)}。这一步是这盘棋里最亮的几下之一。`,
      cp: cpAt(it.ply + 1),
    });
  }

  stops.push({
    cursor: n,
    ply: n,
    kind: 'end',
    title: '终局',
    text: `${verdict}。${advantageText(cpAt(n))}，整盘一共 ${n} 手。`,
    cp: cpAt(n),
  });

  const rank: Record<StopKind, number> = { start: 0, best: 1, bad: 1, end: 2 };
  return stops.sort((a, b) => a.ply - b.ply || rank[a.kind] - rank[b.kind]);
}

export function reviewComment(s: ReviewSummary): string {
  if (s.total === 0) return '这局你一步没走。复盘结束，我先复盘一下你。';
  if (s.blunder === 0 && s.mistake === 0)
    return '全盘没有大漏。你今天的木头运不错，我甚至想给你刻个记号。';
  if (s.blunder === 0) return '没有送大子，只有几处小磕碰。这种棋输赢都能睡着。';
  if (s.blunder <= 2) return '有两手挺可惜。别急，高手也送子，只是他们送得比较隐蔽。';
  return '复盘完了。你的车好像很喜欢出门，只是不太爱回家。';
}
