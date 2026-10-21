import {
  BOARD_SIZE,
  type Color,
  type PieceType,
  type Position,
  type Square,
  idx,
  rowOf,
  colOf,
} from './types';

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const FEN_TO_TYPE: Record<string, PieceType> = {
  k: 'k',
  a: 'a',
  b: 'b',
  n: 'n',
  r: 'r',
  c: 'c',
  p: 'p',
  h: 'n', // 兼容 h 表示马的 FEN 变体
  e: 'b', // 兼容 e 表示象
};

/** 解析标准中国象棋 FEN（从黑方底线开始描述） */
export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  if (rows.length !== 10) throw new Error(`FEN 行数错误: ${rows.length}`);
  const squares: Square[] = new Array(BOARD_SIZE).fill(null);
  rows.forEach((rowStr, r) => {
    let c = 0;
    for (const ch of rowStr) {
      if (/\d/.test(ch)) {
        c += Number(ch);
      } else {
        const type = FEN_TO_TYPE[ch.toLowerCase()];
        if (!type) throw new Error(`FEN 未知字符: ${ch}`);
        const color: Color = ch === ch.toLowerCase() ? 'b' : 'r';
        if (c > 8) throw new Error(`FEN 列越界: ${rowStr}`);
        squares[idx(r, c)] = { type, color };
        c += 1;
      }
    }
    if (c !== 9) throw new Error(`FEN 行宽错误(${c}): ${rowStr}`);
  });
  const turn: Color = parts[1] === 'b' ? 'b' : 'r';
  return { squares, turn };
}

/** 序列化为 FEN（用于跨 Worker 传递） */
export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < 10; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 9; c++) {
      const p = pos.squares[idx(r, c)];
      if (!p) {
        empty++;
      } else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        const ch = p.type;
        row += p.color === 'r' ? ch.toUpperCase() : ch;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${pos.turn} - - 0 1`;
}

/**
 * 用可视化的字符矩阵描述局面（10 行 × 9 列）
 * 大写为红方：K 帅 A 仕 B 相 N 马 R 车 C 炮 P 兵
 * 小写为黑方：k 将 a 士 b 象 n 马 r 车 c 炮 p 卒
 * '.' 或空格表示空位
 */
export function parseLayout(lines: string[]): Square[] {
  if (lines.length !== 10) throw new Error(`局面需要 10 行，实际 ${lines.length}`);
  const squares: Square[] = new Array(BOARD_SIZE).fill(null);
  lines.forEach((line, r) => {
    const cells = line.replace(/\s+/g, '').split('');
    if (cells.length !== 9) throw new Error(`第 ${r} 行宽度应为 9，实际 ${cells.length}: "${line}"`);
    cells.forEach((ch, c) => {
      if (ch === '.') return;
      const type = FEN_TO_TYPE[ch.toLowerCase()];
      if (!type) throw new Error(`未知棋子字符 ${ch}`);
      squares[idx(r, c)] = { type, color: ch === ch.toUpperCase() ? 'r' : 'b' };
    });
  });
  return squares;
}

export function initialPosition(): Position {
  return parseFen(START_FEN);
}

export function cloneSquares(squares: Square[]): Square[] {
  return squares.slice();
}

export function clonePosition(pos: Position): Position {
  return { squares: pos.squares.slice(), turn: pos.turn };
}

/** 九宫判定 */
export function inPalace(color: Color, r: number, c: number): boolean {
  if (c < 3 || c > 5) return false;
  return color === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

/** 是否在本方半场（未过河） */
export function onOwnSide(color: Color, r: number): boolean {
  return color === 'r' ? r >= 5 : r <= 4;
}

/** 是否已过河 */
export function crossedRiver(color: Color, r: number): boolean {
  return !onOwnSide(color, r);
}

export function findKing(squares: Square[], color: Color): number {
  for (let i = 0; i < BOARD_SIZE; i++) {
    const p = squares[i];
    if (p && p.type === 'k' && p.color === color) return i;
  }
  return -1;
}

export function kingsFacing(squares: Square[]): boolean {
  const rk = findKing(squares, 'r');
  const bk = findKing(squares, 'b');
  if (rk < 0 || bk < 0) return false;
  if (colOf(rk) !== colOf(bk)) return false;
  const c = colOf(rk);
  const from = Math.min(rowOf(rk), rowOf(bk));
  const to = Math.max(rowOf(rk), rowOf(bk));
  for (let r = from + 1; r < to; r++) {
    if (squares[idx(r, c)]) return false;
  }
  return true;
}

export function squaresToBoardString(squares: Square[]): string {
  const lines: string[] = [];
  for (let r = 0; r < 10; r++) {
    let line = '';
    for (let c = 0; c < 9; c++) {
      const p = squares[idx(r, c)];
      if (!p) {
        line += '.';
      } else {
        line += p.color === 'r' ? p.type.toUpperCase() : p.type;
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function samePiece(a: Square, b: Square): boolean {
  if (!a || !b) return a === b;
  return a.type === b.type && a.color === b.color;
}
