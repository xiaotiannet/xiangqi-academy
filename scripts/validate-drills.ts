/**
 * 校验单元末的限时吃子关卡：
 *  1. 布局 10 行 × 9 列，双方将帅在场且不照面、红方起步不被将军（否则引擎会把所有着法判非法）
 *  2. 用真实规则引擎做 BFS，确认「吃完全部目标」是可达的，并报出最少步数（据此判断限时是否合理）
 */
import { CURRICULUM } from '../src/content/curriculum';
import { findKing } from '../src/game/board';
import { isInCheck, legalTargetsFrom } from '../src/game/rules';
import type { Piece, PieceType, Square } from '../src/game/types';

const TYPE_OF: Record<string, PieceType> = {
  k: 'k',
  a: 'a',
  b: 'b',
  n: 'n',
  r: 'r',
  c: 'c',
  p: 'p',
};

function parse(layout: string[]): Square[] {
  const out: Square[] = new Array(90).fill(null);
  layout.forEach((line, r) => {
    for (let c = 0; c < 9; c++) {
      const ch = line[c];
      if (!ch || ch === '.') continue;
      const lower = ch.toLowerCase();
      const type = TYPE_OF[lower];
      if (!type) throw new Error(`未知棋子符号 "${ch}"`);
      out[r * 9 + c] = { type, color: ch === lower ? 'b' : 'r' } as Piece;
    }
  });
  return out;
}

const keyOf = (s: Square[]): string =>
  s.map((p) => (p ? (p.color === 'r' ? p.type.toUpperCase() : p.type) : '.')).join('');

/** 最少几步能吃完全部非将的黑子；返回 -1 表示不可达 */
function minStepsToClear(squares: Square[], limit: number): number {
  const isTarget = (p: Square | null) => Boolean(p && p.color === 'b' && p.type !== 'k');
  let total = squares.filter(isTarget).length;
  if (total === 0) return 0;

  type Node = { sq: Square[]; left: number; d: number };
  const start: Node = { sq: squares, left: total, d: 0 };
  let frontier: Node[] = [start];
  const seen = new Set<string>([keyOf(squares)]);

  for (let depth = 1; depth <= limit; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (let from = 0; from < 90; from++) {
        const p = node.sq[from];
        if (!p || p.color !== 'r' || p.type === 'k') continue;
        for (const to of legalTargetsFrom(node.sq, from)) {
          const victim = node.sq[to];
          if (victim && victim.color === 'b' && victim.type === 'k') continue; // 不许吃将
          const moved = node.sq.slice();
          moved[to] = moved[from];
          moved[from] = null;
          const left = node.left - (isTarget(victim) ? 1 : 0);
          if (left === 0) return depth;
          const k = keyOf(moved);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ sq: moved, left, d: depth });
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
    if (seen.size > 400000) break;
  }
  return -1;
}

let bad = 0;
for (const unit of CURRICULUM) {
  for (const lesson of unit.lessons) {
    if (lesson.kind !== 'drill' || !lesson.drill) continue;
    const { seconds, goal, total, boards } = lesson.drill;
    boards.forEach((b, i) => {
      const tag = `${lesson.id}[${i}]`;
      if (b.layout.length !== 10) {
        console.log(`✗ ${tag} 布局应为 10 行，实际 ${b.layout.length} 行`);
        bad += 1;
        return;
      }
      b.layout.forEach((line, r) => {
        if (line.length !== 9) {
          console.log(`✗ ${tag} 第 ${r} 行应为 9 列，实际 ${line.length}`);
          bad += 1;
        }
      });
      const sq = parse(b.layout);
      if (findKing(sq, 'r') < 0 || findKing(sq, 'b') < 0) {
        console.log(`✗ ${tag} 缺少将/帅（引擎会把所有着法判为非法）`);
        bad += 1;
        return;
      }
      if (isInCheck(sq, 'r')) {
        console.log(`✗ ${tag} 红方开局就被将军（将帅照面或受攻），玩家会被迫先应将`);
        bad += 1;
        return;
      }
      const onBoard = sq.filter((p) => p && p.color === 'b' && p.type !== 'k').length;
      if (onBoard !== total) {
        console.log(`✗ ${tag} total 声明 ${total}，盘面上实际 ${onBoard} 个可吃子`);
        bad += 1;
      }
      // 按每秒约 3 步的手速估一个上限
      const limit = Math.max(6, Math.floor(seconds / 3));
      const need = minStepsToClear(sq, limit);
      if (need < 0) {
        console.log(
          `✗ ${tag} ${seconds}s 内（≤${limit} 步）吃不完 ${total} 个目标，关卡不可完成`,
        );
        bad += 1;
      } else {
        const okGoal = goal <= total;
        const pace = `${need} 步 / ${seconds}s（约 ${(seconds / Math.max(1, need)).toFixed(1)} 秒一步）`;
        console.log(`${okGoal ? '✓' : '✗'} ${tag} 全清 ${need} 步，goal ${goal}/${total} · ${pace}`);
        if (!okGoal) bad += 1;
      }
    });
  }
}

if (bad) {
  console.log(`\n✗ 吃子关卡校验失败：${bad} 处问题`);
  process.exit(1);
}
console.log('\n✓ 吃子关卡校验通过：布局合法、可达、限时合理');
