import {
  BOARD_SIZE,
  PIECE_VALUE,
  type Color,
  type Move,
  type Position,
  type Square,
  colOf,
  idx,
  other,
  rowOf,
} from './types';
import { crossedRiver, findKing, inPalace, kingsFacing } from './board';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const HORSE: ReadonlyArray<readonly [number, number]> = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const inBoard = (r: number, c: number): boolean => r >= 0 && r < 10 && c >= 0 && c < 9;

/** 某一方的棋子在该位置能走到的目标格（伪合法，不含将军过滤） */
export function pseudoTargets(squares: Square[], from: number): number[] {
  const p = squares[from];
  if (!p) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const out: number[] = [];
  const push = (rr: number, cc: number) => {
    if (!inBoard(rr, cc)) return false;
    const sq = squares[idx(rr, cc)];
    if (sq && sq.color === p.color) return false;
    out.push(idx(rr, cc));
    return !sq; // 返回是否为空位（可继续滑动）
  };

  switch (p.type) {
    case 'r':
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        while (inBoard(rr, cc)) {
          const sq = squares[idx(rr, cc)];
          if (sq) {
            if (sq.color !== p.color) out.push(idx(rr, cc));
            break;
          }
          out.push(idx(rr, cc));
          rr += dr;
          cc += dc;
        }
      }
      break;

    case 'c':
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        // 第一阶段：空位可走，遇到第一个子停止
        while (inBoard(rr, cc) && !squares[idx(rr, cc)]) {
          out.push(idx(rr, cc));
          rr += dr;
          cc += dc;
        }
        // 第二阶段：越过炮架，寻找第一个可吃子
        if (!inBoard(rr, cc)) continue;
        rr += dr;
        cc += dc;
        while (inBoard(rr, cc)) {
          const sq = squares[idx(rr, cc)];
          if (sq) {
            if (sq.color !== p.color) out.push(idx(rr, cc));
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
      break;

    case 'n':
      for (const [dr, dc] of HORSE) {
        const rr = r + dr;
        const cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        const legR = r + (Math.abs(dr) === 2 ? Math.sign(dr) : 0);
        const legC = c + (Math.abs(dc) === 2 ? Math.sign(dc) : 0);
        if (squares[idx(legR, legC)]) continue; // 蹩马腿
        const sq = squares[idx(rr, cc)];
        if (sq && sq.color === p.color) continue;
        out.push(idx(rr, cc));
      }
      break;

    case 'b':
      for (const [dr, dc] of DIAG) {
        const rr = r + dr * 2;
        const cc = c + dc * 2;
        if (!inBoard(rr, cc)) continue;
        if (crossedRiver(p.color, rr)) continue; // 象不过河
        if (squares[idx(r + dr, c + dc)]) continue; // 塞象眼
        const sq = squares[idx(rr, cc)];
        if (sq && sq.color === p.color) continue;
        out.push(idx(rr, cc));
      }
      break;

    case 'a':
      for (const [dr, dc] of DIAG) {
        const rr = r + dr;
        const cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        if (!inPalace(p.color, rr, cc)) continue;
        const sq = squares[idx(rr, cc)];
        if (sq && sq.color === p.color) continue;
        out.push(idx(rr, cc));
      }
      break;

    case 'k':
      for (const [dr, dc] of ORTHO) {
        const rr = r + dr;
        const cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        if (!inPalace(p.color, rr, cc)) continue;
        const sq = squares[idx(rr, cc)];
        if (sq && sq.color === p.color) continue;
        out.push(idx(rr, cc));
      }
      break;

    case 'p': {
      const fwd = p.color === 'r' ? -1 : 1;
      push(r + fwd, c);
      if (crossedRiver(p.color, r)) {
        push(r, c - 1);
        push(r, c + 1);
      }
      break;
    }
  }
  return out;
}

/** 目标格是否被 by 方攻击（用于将军判定） */
export function isAttacked(squares: Square[], target: number, by: Color): boolean {
  const tr = rowOf(target);
  const tc = colOf(target);

  // 车 / 炮 / 将 沿直线扫描
  for (const [dr, dc] of ORTHO) {
    let rr = tr + dr;
    let cc = tc + dc;
    let first: { type: string; color: Color } | null = null;
    let firstDist = 0;
    while (inBoard(rr, cc)) {
      const sq = squares[idx(rr, cc)];
      if (sq) {
        if (!first) {
          first = sq;
          firstDist = Math.abs(rr - tr) + Math.abs(cc - tc);
          if (sq.color === by) {
            if (sq.type === 'r') return true;
            if (sq.type === 'k' && firstDist === 1) return true;
          }
        } else {
          if (sq.color === by && sq.type === 'c') return true;
          break;
        }
      }
      rr += dr;
      cc += dc;
    }
  }
  // 马
  for (const [dr, dc] of HORSE) {
    const hr = tr + dr;
    const hc = tc + dc;
    if (!inBoard(hr, hc)) continue;
    const p = squares[idx(hr, hc)];
    if (!p || p.color !== by || p.type !== 'n') continue;
    // 马腿：从马向目标方向的第一步
    const legR = hr + (Math.abs(dr) === 2 ? -Math.sign(dr) : 0);
    const legC = hc + (Math.abs(dc) === 2 ? -Math.sign(dc) : 0);
    if (!squares[idx(legR, legC)]) return true;
  }

  // 兵/卒
  if (by === 'r') {
    // 红兵向上走，攻击 target 的红兵可能在 target 下方一格
    if (inBoard(tr + 1, tc)) {
      const p = squares[idx(tr + 1, tc)];
      if (p && p.color === 'r' && p.type === 'p') return true;
    }
    if (tr <= 4) {
      for (const dc of [-1, 1]) {
        if (!inBoard(tr, tc + dc)) continue;
        const p = squares[idx(tr, tc + dc)];
        if (p && p.color === 'r' && p.type === 'p') return true;
      }
    }
  } else {
    if (inBoard(tr - 1, tc)) {
      const p = squares[idx(tr - 1, tc)];
      if (p && p.color === 'b' && p.type === 'p') return true;
    }
    if (tr >= 5) {
      for (const dc of [-1, 1]) {
        if (!inBoard(tr, tc + dc)) continue;
        const p = squares[idx(tr, tc + dc)];
        if (p && p.color === 'b' && p.type === 'p') return true;
      }
    }
  }

  return false;
}

export function isInCheck(squares: Square[], color: Color): boolean {
  const king = findKing(squares, color);
  if (king < 0) return true; // 将已被吃，视为被将死
  if (kingsFacing(squares)) return true;
  return isAttacked(squares, king, other(color));
}

/** 就地落子，返回被吃子（用于搜索的 make/unmake） */
export function makeMove(squares: Square[], from: number, to: number): Square {
  const captured = squares[to];
  squares[to] = squares[from];
  squares[from] = null;
  return captured;
}

export function unmakeMove(squares: Square[], from: number, to: number, captured: Square): void {
  squares[from] = squares[to];
  squares[to] = captured;
}

/** 该着法是否让走子方自陷被将（送将 / 将帅照面） */
export function isLegalMove(squares: Square[], from: number, to: number): boolean {
  const p = squares[from];
  if (!p) return false;
  const captured = makeMove(squares, from, to);
  const ok = !isInCheck(squares, p.color);
  unmakeMove(squares, from, to, captured);
  return ok;
}

/** 伪合法着法（可能送将） */
export function pseudoMoves(squares: Square[], turn: Color): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = squares[i];
    if (!p || p.color !== turn) continue;
    for (const to of pseudoTargets(squares, i)) {
      out.push({ from: i, to, piece: p, captured: squares[to] });
    }
  }
  return out;
}

/** 全部合法着法 */
export function legalMoves(squares: Square[], turn: Color): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = squares[i];
    if (!p || p.color !== turn) continue;
    for (const to of pseudoTargets(squares, i)) {
      const captured = makeMove(squares, i, to);
      if (!isInCheck(squares, turn)) out.push({ from: i, to, piece: p, captured });
      unmakeMove(squares, i, to, captured);
    }
  }
  return out;
}

export function legalTargetsFrom(squares: Square[], from: number): number[] {
  const p = squares[from];
  if (!p) return [];
  return pseudoTargets(squares, from).filter((to) => isLegalMove(squares, from, to));
}

export type GameStatus = 'playing' | 'checkmate' | 'stalemate';

export interface StatusInfo {
  status: GameStatus;
  /** 走子方是否被将军 */
  check: boolean;
  winner: Color | null;
}

export function getStatus(pos: Position): StatusInfo {
  const moves = legalMoves(pos.squares, pos.turn);
  const check = isInCheck(pos.squares, pos.turn);
  if (moves.length === 0) {
    return {
      status: check ? 'checkmate' : 'stalemate',
      check,
      winner: other(pos.turn),
    };
  }
  return { status: 'playing', check, winner: null };
}

/** 是否有任意着法可以直接吃掉对方将/帅（理论上不该出现） */
export function hasKingCapture(pos: Position): boolean {
  const target = findKing(pos.squares, other(pos.turn));
  if (target < 0) return true;
  return legalMoves(pos.squares, pos.turn).some((m) => m.to === target);
}

export function findMoveByFromTo(
  squares: Square[],
  turn: Color,
  from: number,
  to: number,
): Move | null {
  const p = squares[from];
  if (!p || p.color !== turn) return null;
  const targets = legalTargetsFrom(squares, from);
  if (!targets.includes(to)) return null;
  return { from, to, piece: p, captured: squares[to] };
}

export function moveValueScore(m: Move): number {
  if (!m.captured) return 0;
  return PIECE_VALUE[m.captured.type] * 10 - PIECE_VALUE[m.piece.type];
}

export function applyMove(pos: Position, from: number, to: number): Position {
  const squares = pos.squares.slice();
  makeMove(squares, from, to);
  return { squares, turn: other(pos.turn) };
}

/** 把着法序列应用到局面上（用于题目回放） */
export function applyMoveSequence(pos: Position, moves: Array<[number, number]>): Position {
  let cur = pos;
  for (const [from, to] of moves) cur = applyMove(cur, from, to);
  return cur;
}
