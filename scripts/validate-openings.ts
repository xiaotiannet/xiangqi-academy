import { initialPosition } from '../src/game/board';
import { legalMoves, makeMove, unmakeMove } from '../src/game/rules';
import { idx } from '../src/game/types';
import { OPENINGS, bookLookup, identifyOpening, openingNotation } from '../src/content/openings';
import { moveToChinese } from '../src/game/notation';

const problems: string[] = [];
let plies = 0;

for (const op of OPENINGS) {
  const squares = initialPosition().squares.slice();
  let turn = 'r' as 'r' | 'b';
  const seq: Array<{ from: number; to: number }> = [];

  op.line.forEach((m, i) => {
    const from = idx(m.from[0], m.from[1]);
    const to = idx(m.to[0], m.to[1]);
    const legal = legalMoves(squares, turn).some((x) => x.from === from && x.to === to);
    if (!legal) {
      problems.push(`[${op.name}] 第 ${i + 1} 手 ${m.label} 不合法 (${from}->${to})`);
      return;
    }
    const real = moveToChinese(squares, from, to);
    if (real !== m.label) {
      problems.push(`[${op.name}] 第 ${i + 1} 手记谱写的是「${m.label}」，引擎算出来是「${real}」`);
    }
    seq.push({ from, to });
    const cap = makeMove(squares, from, to);
    unmakeMove(squares, from, to, cap);
    makeMove(squares, from, to);
    turn = turn === 'r' ? 'b' : 'r';
    plies += 1;
  });

  // 反查开局
  const found = identifyOpening(seq);
  if (!found || found.id !== op.id) {
    problems.push(`[${op.name}] 开局识别失败：${found ? found.name : '无'}`);
  }

  // 中文记谱（用于展示）
  const notation = openingNotation(op);
  if (notation.length !== op.line.length) problems.push(`[${op.name}] 记谱长度不一致`);
}

// 开局库首着命中检查
const start = initialPosition();
const hit = bookLookup(start);
if (!hit) problems.push('开局库：初始局面没有命中任何着法');

if (problems.length) {
  console.log(`发现 ${problems.length} 个问题：`);
  problems.forEach((p) => console.log(' - ' + p));
  process.exitCode = 1;
} else {
  console.log(`开局库校验通过：${OPENINGS.length} 个开局 / ${plies} 手，全部合法且记谱一致`);
}
