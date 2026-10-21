import { PIECE_NAME, type Color, type Piece, type Square, colOf, idx, rowOf } from './types';

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function fileNumber(color: Color, col: number): number {
  // 红方从右往左数一到九；黑方从其右侧（屏幕左侧）数 1 到 9
  return color === 'r' ? 9 - col : col + 1;
}

function num(color: Color, n: number): string {
  return color === 'r' ? CN_NUM[n] : String(n);
}

/** 同一路上同色同类型棋子的排序（前者靠近对方） */
function sameFilePieces(squares: Square[], piece: Piece, from: number): number[] {
  const col = colOf(from);
  const list: number[] = [];
  for (let r = 0; r < 10; r++) {
    const p = squares[idx(r, col)];
    if (p && p.color === piece.color && p.type === piece.type) list.push(idx(r, col));
  }
  // 前者 = 靠近对方底线
  list.sort((a, b) => (piece.color === 'r' ? rowOf(a) - rowOf(b) : rowOf(b) - rowOf(a)));
  return list;
}

/**
 * 生成中文记谱，如「炮二平五」「马8进7」「前车退一」
 */
export function moveToChinese(squares: Square[], from: number, to: number): string {
  const piece = squares[from];
  if (!piece) return '';
  const color = piece.color;
  const name = PIECE_NAME[color][piece.type];
  const list = sameFilePieces(squares, piece, from);

  let prefix: string;
  if (list.length >= 2 && list.length <= 3) {
    const pos = list.indexOf(from);
    const tags = list.length === 2 ? ['前', '后'] : ['前', '中', '后'];
    prefix = list.length === 2 ? tags[pos] : tags[pos];
  } else {
    prefix = name + num(color, fileNumber(color, colOf(from)));
  }

  const dr = rowOf(to) - rowOf(from);
  const dc = colOf(to) - colOf(from);
  let action: string;
  let target: string;

  if (piece.type === 'n' || piece.type === 'b' || piece.type === 'a') {
    const forward = color === 'r' ? dr < 0 : dr > 0;
    action = forward ? '进' : '退';
    target = num(color, fileNumber(color, colOf(to)));
  } else if (dr === 0) {
    action = '平';
    target = num(color, fileNumber(color, colOf(to)));
  } else {
    const forward = color === 'r' ? dr < 0 : dr > 0;
    action = forward ? '进' : '退';
    target = num(color, Math.abs(dr));
  }
  void dc;
  return `${prefix}${action}${target}`;
}

/** 用于调试 / 题解的简短坐标，如 "b3"（列 a-i 从左到右，行 1-10 从下到上） */
export function coordName(index: number): string {
  const r = rowOf(index);
  const c = colOf(index);
  return `${String.fromCharCode(97 + c)}${10 - r}`;
}

/** 教学用的口语化描述：如「第 5 路（中路）」 */
export function describeFile(index: number): string {
  const c = colOf(index);
  const fileRed = 9 - c;
  return `红方第 ${fileRed} 路`;
}

export function squareLabel(index: number): string {
  const r = rowOf(index);
  const c = colOf(index);
  if (r === 4 || r === 5) return `河界附近（第 ${c + 1} 列）`;
  return `第 ${r + 1} 行第 ${c + 1} 列`;
}
