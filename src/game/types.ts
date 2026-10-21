// 中国象棋核心类型定义
// 棋盘坐标：index = row * 9 + col，row 0 为黑方底线（屏幕最上），row 9 为红方底线（屏幕最下）
// 红方"向上"走 = row 递减；黑方"向下"走 = row 递增

export type Color = 'r' | 'b';

/** 棋子类型：k 将/帅 a 士/仕 b 象/相 n 马 r 车 c 炮 p 兵/卒 */
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Square = Piece | null;

export interface Position {
  /** 长度 90 的棋盘数组 */
  squares: Square[];
  turn: Color;
}

export interface Move {
  from: number;
  to: number;
  piece: Piece;
  captured: Square;
}

export const ROWS = 10;
export const COLS = 9;
export const BOARD_SIZE = ROWS * COLS;

export const idx = (r: number, c: number): number => r * 9 + c;
export const rowOf = (i: number): number => (i / 9) | 0;
export const colOf = (i: number): number => i % 9;

export const other = (c: Color): Color => (c === 'r' ? 'b' : 'r');

export const PIECE_NAME: Record<Color, Record<PieceType, string>> = {
  r: { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' },
  b: { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' },
};

export const PIECE_TYPE_NAME: Record<PieceType, string> = {
  k: '将帅',
  a: '士仕',
  b: '象相',
  n: '马',
  r: '车',
  c: '炮',
  p: '兵卒',
};

/** 子力价值（用于 AI 评估；教学展示用简化分值） */
export const PIECE_VALUE: Record<PieceType, number> = {
  k: 100000,
  r: 900,
  n: 400,
  c: 450,
  a: 200,
  b: 200,
  p: 100,
};
