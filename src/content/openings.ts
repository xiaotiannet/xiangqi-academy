import { initialPosition, toFen } from '../game/board';
import { applyMove } from '../game/rules';
import { idx, type Position } from '../game/types';
import { moveToChinese } from '../game/notation';

export interface BookMove {
  /** [row, col] 起点 */
  from: [number, number];
  /** [row, col] 终点 */
  to: [number, number];
  /** 中文记谱，如「炮二平五」 */
  label: string;
  note?: string;
}

export interface Opening {
  id: string;
  name: string;
  category: string;
  /** 1 入门 / 2 进阶 / 3 进阶偏难 */
  level: 1 | 2 | 3;
  idea: string;
  points: string[];
  line: BookMove[];
}

const M = (fr: number, fc: number, tr: number, tc: number, label: string, note?: string): BookMove => ({
  from: [fr, fc],
  to: [tr, tc],
  label,
  note,
});

/**
 * 开局库：都是真实存在的常见开局，每一手都用内置引擎校验过合法性。
 * 引擎对局时会从这里抽着，避免每局都下成一模一样的「电脑味」。
 */
export const OPENINGS: Opening[] = [
  {
    id: 'zhongpao-pingfengma',
    name: '中炮对屏风马',
    category: '中炮类',
    level: 1,
    idea:
      '最主流的开局。红方架中炮直指中路，黑方双马并起护中卒，形成「屏风」。红方抢中路，黑方抢两翼，是本谱最长寿的对抗。',
    points: [
      '红方第三步「车一平二」出直车，抢占二路要道',
      '黑方双马形成屏风，中路稳如老墙',
      '红车过河压制，黑方以卒7进1 活跃右马',
    ],
    line: [
      M(7, 7, 7, 4, '炮二平五', '架中炮，直接威胁中卒'),
      M(0, 7, 2, 6, '马8进7', '屏风马的一半，护住中卒'),
      M(9, 7, 7, 6, '马二进三', '出马，为出车让路'),
      M(0, 1, 2, 2, '马2进3', '屏风成型，中路双马守护'),
      M(9, 8, 9, 7, '车一平二', '车占二路，准备过河'),
      M(0, 8, 0, 7, '车9平8', '对称出车，挡住红车'),
      M(9, 7, 3, 7, '车二进六', '车过河压马，先手在握'),
      M(3, 6, 4, 6, '卒7进1', '挺卒活马，给红车一点颜色'),
    ],
  },
  {
    id: 'shunshoupao',
    name: '顺手炮',
    category: '中炮类',
    level: 2,
    idea:
      '红方架中炮，黑方把同一侧（黑方左翼）的炮也架到中路，针锋相对。双方中路火力对撞，局面很快进入激烈的对攻。',
    points: [
      '黑方「炮8平5」= 顺手炮，以自己的中路对轰',
      '中路兵卒成为第一战场，谁先吃谁先亏',
      '这类局面讲究算路，新手容易在兑子中吃亏',
    ],
    line: [
      M(7, 7, 7, 4, '炮二平五', '红方中炮'),
      M(2, 7, 2, 4, '炮8平5', '顺手炮，中路对轰'),
      M(9, 7, 7, 6, '马二进三', '护中兵，兼出马'),
      M(0, 7, 2, 6, '马8进7', '黑方出马，稳步推进'),
      M(9, 8, 9, 7, '车一平二', '出直车，抢二路'),
    ],
  },
  {
    id: 'lieshoupao',
    name: '列手炮',
    category: '中炮类',
    level: 2,
    idea:
      '黑方用另一侧的炮（黑方右炮）架到中路，与红方中炮错开方向，叫「列手炮」。两炮不同侧，变化更复杂，容易形成异向攻杀。',
    points: [
      '与顺手炮只差一个字，方向完全不同',
      '列手炮容易打成双方各攻一翼的乱战',
      '记住：黑炮架中后，黑方左马要另想办法',
    ],
    line: [
      M(7, 7, 7, 4, '炮二平五', '红方中炮'),
      M(2, 1, 2, 4, '炮2平5', '列手炮，另一侧的炮架中'),
      M(9, 7, 7, 6, '马二进三', '红方正常出子'),
      M(0, 7, 2, 6, '马8进7', '黑方出马'),
      M(9, 8, 9, 7, '车一平二', '红方出车'),
    ],
  },
  {
    id: 'xianrenzhilu',
    name: '仙人指路',
    category: '兵类',
    level: 1,
    idea:
      '红方第一步走「兵七进一」，先探一步路，像伸手试探对面。看似不起眼，实则非常灵活：黑方怎么应，红方就换什么阵型。',
    points: [
      '先动一个兵，几乎不暴露意图',
      '如果黑方走卒底炮，红方常转为中炮或飞相',
      '这是业余棋手最容易上手、也最不容易吃亏的开局',
    ],
    line: [
      M(6, 2, 5, 2, '兵七进一', '仙人指路，先探一手'),
      M(3, 6, 4, 6, '卒7进1', '黑方对称挺卒'),
      M(7, 7, 7, 4, '炮二平五', '红方转中炮，回到熟悉的战场'),
      M(0, 7, 2, 6, '马8进7', '黑方出马应对'),
      M(9, 7, 7, 6, '马二进三', '红方出马，阵型完整'),
    ],
  },
  {
    id: 'feixiangju',
    name: '飞相局',
    category: '相类',
    level: 2,
    idea:
      '红方第一步「相三进五」，先把家门守好再图进取。这是一种「后发制人」的开局，讲究阵型完整、慢慢挤压。',
    points: [
      '相飞到中路，护住中兵，帅府更安全',
      '开局不出车、不架炮，容易被对手先手',
      '适合喜欢稳、不爱冒险的棋手',
    ],
    line: [
      M(9, 6, 7, 4, '相三进五', '飞相局，先固后攻'),
      M(2, 7, 2, 4, '炮8平5', '黑方架中炮，抢中路'),
      M(9, 7, 7, 6, '马二进三', '红方出马，护中兵'),
      M(0, 7, 2, 6, '马8进7', '黑方出马'),
      M(6, 4, 5, 4, '兵五进一', '红方顶中兵，与中炮对峙'),
    ],
  },
  {
    id: 'qimaju',
    name: '起马局',
    category: '马类',
    level: 1,
    idea:
      '第一步先出马，讲究「马先行、车后动」。马走活，整盘棋就有了弹性。黑方通常以挺卒回应，限制红马的落点。',
    points: [
      '马先出可以随时转中炮或飞相，非常灵活',
      '别让马走到边上（边马），中间才有威力',
      '马腿很脆弱，出马后要注意别被小卒顶住',
    ],
    line: [
      M(9, 7, 7, 6, '马二进三', '起马局，先出子'),
      M(3, 6, 4, 6, '卒7进1', '黑方挺卒，限制红马'),
      M(7, 1, 7, 4, '炮八平五', '红方转中炮',
      ),
      M(0, 1, 2, 2, '马2进3', '黑方出马'),
      M(9, 1, 7, 2, '马八进七', '双马并起，阵型舒展'),
    ],
  },
];

/* ---------- 索引：局面 → 下一手 ---------- */

let bookIndex: Map<string, { from: number; to: number }> | null = null;

function buildIndex(): Map<string, { from: number; to: number }> {
  const map = new Map<string, { from: number; to: number }>();
  for (const op of OPENINGS) {
    let pos = initialPosition();
    for (const m of op.line) {
      const from = idx(m.from[0], m.from[1]);
      const to = idx(m.to[0], m.to[1]);
      const key = toFen(pos);
      if (!map.has(key)) map.set(key, { from, to });
      pos = applyMove(pos, from, to);
    }
  }
  return map;
}

export function bookLookup(pos: Position): { from: number; to: number } | null {
  if (!bookIndex) bookIndex = buildIndex();
  return bookIndex.get(toFen(pos)) ?? null;
}

/** 把开局的一行棋还原成局面序列（含初始局面） */
export function openingPositions(op: Opening): Position[] {
  const list: Position[] = [initialPosition()];
  let pos = list[0];
  for (const m of op.line) {
    pos = applyMove(pos, idx(m.from[0], m.from[1]), idx(m.to[0], m.to[1]));
    list.push(pos);
  }
  return list;
}

/** 用真实走子序列反查是哪种开局（取匹配最长者） */
export function identifyOpening(moves: Array<{ from: number; to: number }>): Opening | null {
  let best: Opening | null = null;
  let bestLen = 0;
  for (const op of OPENINGS) {
    let pos = initialPosition();
    let matched = 0;
    for (let i = 0; i < op.line.length && i < moves.length; i++) {
      const from = idx(op.line[i].from[0], op.line[i].from[1]);
      const to = idx(op.line[i].to[0], op.line[i].to[1]);
      if (moves[i].from !== from || moves[i].to !== to) break;
      matched += 1;
      pos = applyMove(pos, from, to);
    }
    if (matched > bestLen) {
      bestLen = matched;
      best = op;
    }
  }
  return bestLen >= 2 ? best : null;
}

/** 把开局走法转成中文记谱，用于对局记录的一致性展示 */
export function openingNotation(op: Opening): string[] {
  const out: string[] = [];
  let pos = initialPosition();
  for (const m of op.line) {
    const from = idx(m.from[0], m.from[1]);
    const to = idx(m.to[0], m.to[1]);
    out.push(moveToChinese(pos.squares, from, to));
    pos = applyMove(pos, from, to);
  }
  return out;
}
