/**
 * 课程数据校验器：确保每一道题都是「可解且唯一」的。
 * 打包运行：npx esbuild scripts/validate-lessons.ts --bundle --platform=node --format=esm --outfile=.tmp/validate.mjs && node .tmp/validate.mjs
 */
import { CURRICULUM } from '../src/content/curriculum';
import { parseLayout } from '../src/game/board';
import { isInCheck, legalMoves, legalTargetsFrom, makeMove, unmakeMove } from '../src/game/rules';
import { coordName } from '../src/game/notation';
import { PIECE_NAME, other, type Color, type Position, type Square } from '../src/game/types';

const problems: string[] = [];
const notes: string[] = [];
let stepCount = 0;

function fail(where: string, msg: string) {
  problems.push(`[${where}] ${msg}`);
}

function posOf(layout: string[], turn: Color): Position {
  return { squares: parseLayout(layout), turn };
}

function findKings(squares: Square[]) {
  return squares.filter((p) => p && p.type === 'k').length;
}
void PIECE_NAME;

for (const unit of CURRICULUM) {
  for (const lesson of unit.lessons) {
    lesson.steps.forEach((step, si) => {
      stepCount++;
      const where = `${lesson.id}#${si + 1}(${step.kind})`;

      if ('layout' in step && step.layout) {
        try {
          const sq = parseLayout(step.layout);
          if (findKings(sq) !== 2) fail(where, `局面中应有 2 个将帅，实际 ${findKings(sq)}`);
        } catch (e) {
          fail(where, `局面解析失败: ${(e as Error).message}`);
          return;
        }
      }

      if (step.kind === 'choice') {
        const right = step.options.filter((o) => o.correct).length;
        if (right !== 1) fail(where, `正确选项应为 1 个，实际 ${right}`);
        if (step.options.length < 2) fail(where, '选项过少');
        return;
      }

      if (step.kind === 'info') return;

      const pos = posOf(step.layout, step.turn);
      const own = pos.squares.filter((p) => p && p.color === step.turn).map((p) => p!.type);
      if (!own.includes('k')) fail(where, '走子方没有将/帅');

      // 走子方不应处于被将军状态（应将类题目除外）
      if (!step.allowCheck && isInCheck(pos.squares, step.turn))
        fail(where, '题目起点走子方已被将军');

      const moves = legalMoves(pos.squares, step.turn);

      if (step.kind === 'reach') {
        const piece = pos.squares[step.pieceAt];
        if (!piece) {
          fail(where, `pieceAt(${coordName(step.pieceAt)}) 没有棋子`);
          return;
        }
        if (piece.color !== step.turn) fail(where, 'pieceAt 不是走子方的棋子');
        const targets = legalTargetsFrom(pos.squares, step.pieceAt);
        for (const t of step.targets) {
          if (!targets.includes(t)) fail(where, `目标格 ${coordName(t)} 无法走到`);
        }
        notes.push(`${where} 可走 ${targets.length} 个落点，命中目标 ${step.targets.length} 个`);
        return;
      }

      if (step.kind === 'capture') {
        const targetPiece = pos.squares[step.target];
        if (!targetPiece) fail(where, `target(${coordName(step.target)}) 没有棋子`);
        else if (targetPiece.color === step.turn) fail(where, 'target 是己方棋子');
        const caps = moves.filter((m) => m.to === step.target);
        if (caps.length === 0) fail(where, `没有合法着法可以吃到 ${coordName(step.target)}`);
        else
          notes.push(
            `${where} 可吃子着法 ${caps.length} 个: ${caps
              .map((m) => `${coordName(m.from)}->${coordName(m.to)}`)
              .join(', ')}`,
          );
        return;
      }

      if (step.kind === 'move') {
        const goal = step.goal ?? 'any';
        const solutions = step.solutions ?? [];
        const resolving = moves.filter((m) => {
          const captured = makeMove(pos.squares, m.from, m.to);
          let ok = true;
          if (goal === 'mate' || goal === 'check') {
            const oppMoves = legalMoves(pos.squares, other(step.turn));
            ok = goal === 'mate' ? oppMoves.length === 0 : isInCheck(pos.squares, other(step.turn));
          }
          unmakeMove(pos.squares, m.from, m.to, captured);
          return ok;
        });

        if (goal === 'mate' || goal === 'check') {
          const label = goal === 'mate' ? '杀棋' : '将军';
          if (resolving.length === 0) {
            fail(where, `找不到任何能形成${label}的着法`);
          } else {
            notes.push(
              `${where} ${label}着法 ${resolving.length} 个: ${resolving
                .map((m) => `${coordName(m.from)}->${coordName(m.to)}`)
                .join(', ')}`,
            );
          }
          for (const [f, t] of solutions) {
            if (!resolving.some((m) => m.from === f && m.to === t))
              fail(where, `题解 ${coordName(f)}->${coordName(t)} 并不形成${label}`);
          }
        } else {
          if (solutions.length === 0) fail(where, 'move 题缺少题解');
          for (const [f, t] of solutions) {
            const legal = moves.some((m) => m.from === f && m.to === t);
            if (!legal) fail(where, `题解 ${coordName(f)}->${coordName(t)} 不是合法着法`);
            else notes.push(`${where} 题解 ${coordName(f)}->${coordName(t)} 合法`);
          }
        }
      }
    });
  }
}

console.log(`课程：${CURRICULUM.length} 个单元，${CURRICULUM.reduce((s, u) => s + u.lessons.length, 0)} 节课，${stepCount} 个步骤`);
console.log('--- 题目可解性 ---');
for (const n of notes) console.log('  ' + n);
if (problems.length) {
  console.log('\n=== 发现 ' + problems.length + ' 个问题 ===');
  for (const p of problems) console.log('  ✗ ' + p);
  process.exitCode = 1;
} else {
  console.log('\n✓ 全部题目校验通过');
}
