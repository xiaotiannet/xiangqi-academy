import {
  BOARD_SIZE,
  PIECE_VALUE,
  type Color,
  type Move,
  type Position,
  type Square,
  colOf,
  other,
  rowOf,
} from './types';
import { kingsFacing } from './board';
import { isInCheck, legalMoves, makeMove, pseudoMoves, unmakeMove } from './rules';

const MATE = 1_000_000;

/** 位置价值表（红方视角，row 0 为黑方底线） */
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [90, 90, 110, 120, 120, 120, 110, 90, 90],
  [70, 80, 90, 100, 110, 100, 90, 80, 70],
  [40, 60, 80, 90, 100, 90, 80, 60, 40],
  [20, 30, 50, 60, 70, 60, 50, 30, 20],
  [0, 0, 10, 20, 30, 20, 10, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const HORSE_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 4, 4, 4, 4, 4, 2, 0],
  [2, 4, 8, 10, 10, 10, 8, 4, 2],
  [4, 8, 12, 14, 14, 14, 12, 8, 4],
  [4, 10, 14, 16, 18, 16, 14, 10, 4],
  [4, 10, 14, 16, 18, 16, 14, 10, 4],
  [2, 8, 12, 14, 16, 14, 12, 8, 2],
  [0, 4, 8, 10, 10, 10, 8, 4, 0],
  [0, 2, 4, 6, 6, 6, 4, 2, 0],
  [0, 0, 2, 4, 4, 4, 2, 0, 0],
];

const CANNON_PST = [
  [0, 0, 2, 2, 2, 2, 2, 0, 0],
  [0, 0, 2, 4, 4, 4, 2, 0, 0],
  [0, 2, 4, 6, 6, 6, 4, 2, 0],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
  [2, 4, 6, 8, 10, 8, 6, 4, 2],
  [0, 2, 4, 6, 8, 6, 4, 2, 0],
  [0, 2, 4, 6, 6, 6, 4, 2, 0],
  [0, 2, 4, 4, 6, 4, 4, 2, 0],
  [0, 0, 2, 2, 4, 2, 2, 0, 0],
  [0, 0, 2, 2, 2, 2, 2, 0, 0],
];

const ROOK_PST = [
  [8, 10, 10, 12, 12, 12, 10, 10, 8],
  [8, 10, 10, 12, 12, 12, 10, 10, 8],
  [6, 8, 8, 10, 10, 10, 8, 8, 6],
  [6, 8, 8, 10, 10, 10, 8, 8, 6],
  [4, 6, 6, 8, 8, 8, 6, 6, 4],
  [4, 6, 6, 8, 8, 8, 6, 6, 4],
  [2, 4, 4, 6, 6, 6, 4, 4, 2],
  [2, 4, 4, 6, 6, 6, 4, 4, 2],
  [0, 2, 2, 4, 4, 4, 2, 2, 0],
  [0, 2, 2, 4, 4, 4, 2, 2, 0],
];

const PST: Record<string, number[][]> = {
  p: PAWN_PST,
  n: HORSE_PST,
  c: CANNON_PST,
  r: ROOK_PST,
};

/** 红方视角的静态评估 */
export function evaluateForRed(squares: Square[]): number {
  let score = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = squares[i];
    if (!p) continue;
    const sign = p.color === 'r' ? 1 : -1;
    let value = PIECE_VALUE[p.type];
    const table = PST[p.type];
    if (table) {
      const r = rowOf(i);
      const c = colOf(i);
      value += table[p.color === 'r' ? r : 9 - r][c];
    }
    score += sign * value;
  }
  return score;
}

interface Ctx {
  squares: Square[];
  nodes: number;
  deadline: number;
  aborted: boolean;
}

function timeUp(ctx: Ctx): boolean {
  if ((ctx.nodes & 1023) !== 0) return false;
  return Date.now() > ctx.deadline;
}

function quiescence(ctx: Ctx, turn: Color, alpha: number, beta: number, depth: number): number {
  ctx.nodes++;
  const stand = turn === 'r' ? evaluateForRed(ctx.squares) : -evaluateForRed(ctx.squares);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;

  const moves = pseudoMoves(ctx.squares, turn).filter((m) => m.captured);
  moves.sort((a, b) => scoreCapture(b) - scoreCapture(a));

  for (const m of moves) {
    if (m.captured && m.captured.type === 'k') return MATE - 1;
    const captured = makeMove(ctx.squares, m.from, m.to);
    if (!kingsFacing(ctx.squares)) {
      const score = -quiescence(ctx, other(turn), -beta, -alpha, depth - 1);
      unmakeMove(ctx.squares, m.from, m.to, captured);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    } else {
      unmakeMove(ctx.squares, m.from, m.to, captured);
    }
  }
  return alpha;
}

function scoreCapture(m: Move): number {
  if (!m.captured) return 0;
  return PIECE_VALUE[m.captured.type] * 16 - PIECE_VALUE[m.piece.type];
}

function negamax(ctx: Ctx, turn: Color, depth: number, alpha: number, beta: number, ply: number): number {
  ctx.nodes++;
  if (ctx.aborted) return alpha;
  if (timeUp(ctx)) {
    ctx.aborted = true;
    return alpha;
  }

  if (depth <= 0) return quiescence(ctx, turn, alpha, beta, 4);

  const moves = pseudoMoves(ctx.squares, turn);
  // 王的捕获 = 上一层走了非法着法
  if (moves.some((m) => m.captured && m.captured.type === 'k')) return MATE - ply;

  // 着法排序：吃子优先
  moves.sort((a, b) => scoreCapture(b) - scoreCapture(a));

  let best = -MATE;
  let hasLegal = false;
  for (const m of moves) {
    const captured = makeMove(ctx.squares, m.from, m.to);
    if (kingsFacing(ctx.squares)) {
      unmakeMove(ctx.squares, m.from, m.to, captured);
      continue;
    }
    hasLegal = true;
    const score = -negamax(ctx, other(turn), depth - 1, -beta, -alpha, ply + 1);
    unmakeMove(ctx.squares, m.from, m.to, captured);
    if (ctx.aborted) return alpha;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) return alpha;
  }

  if (!hasLegal) {
    // 无着可走：被将死或困毙，均判负
    return -MATE + ply;
  }
  return best;
}

export interface AiOptions {
  depth: number;
  timeMs?: number;
  /** 根节点随机扰动，用于降低难度 */
  noise?: number;
  seed?: number;
}

export interface AiResult {
  move: Move | null;
  score: number;
  nodes: number;
  depth: number;
}

/** 搜索最佳着法 */
export function findBestMove(pos: Position, opts: AiOptions): AiResult {
  const rootMoves = legalMoves(pos.squares, pos.turn);
  if (rootMoves.length === 0) return { move: null, score: -MATE, nodes: 0, depth: 0 };

  const ctx: Ctx = {
    squares: pos.squares.slice(),
    nodes: 0,
    deadline: Date.now() + (opts.timeMs ?? 1200),
    aborted: false,
  };

  let bestMove: Move = rootMoves[0];
  let bestScore = -MATE;
  let completedDepth = 0;
  let rng = opts.seed ?? Date.now();

  for (let d = 1; d <= opts.depth; d++) {
    ctx.aborted = false;
    let localBest: Move | null = null;
    let localScore = -MATE;
    const scored: Array<{ m: Move; s: number }> = [];

    const ordered = [...rootMoves].sort((a, b) => {
      if (a.from === bestMove.from && a.to === bestMove.to) return -1;
      if (b.from === bestMove.from && b.to === bestMove.to) return 1;
      return scoreCapture(b) - scoreCapture(a);
    });

    for (const m of ordered) {
      const captured = makeMove(ctx.squares, m.from, m.to);
      let score = -negamax(ctx, other(pos.turn), d - 1, -MATE, MATE, 1);
      unmakeMove(ctx.squares, m.from, m.to, captured);
      if (ctx.aborted) break;

      if (opts.noise) {
        rng = (rng * 16807) % 2147483647;
        score += (rng / 2147483647 - 0.5) * 2 * opts.noise;
      }
      scored.push({ m, s: score });
      if (score > localScore) {
        localScore = score;
        localBest = m;
      }
    }

    if (!ctx.aborted && localBest) {
      bestMove = localBest;
      bestScore = localScore;
      completedDepth = d;
      // 找到必胜杀棋可提前结束
      if (localScore > MATE - 100) break;
    } else {
      break;
    }
  }

  return { move: bestMove, score: bestScore, nodes: ctx.nodes, depth: completedDepth };
}

/** 从某局面出发，走一步后是否构成杀（用于题目校验、提示） */
export function isMateAfter(pos: Position, from: number, to: number): boolean {
  const squares = pos.squares.slice();
  const captured = makeMove(squares, from, to);
  const selfCheck = kingsFacing(squares) || isInCheck(squares, pos.turn);
  const mate = !selfCheck && legalMoves(squares, other(pos.turn)).length === 0;
  unmakeMove(squares, from, to, captured);
  return mate;
}
