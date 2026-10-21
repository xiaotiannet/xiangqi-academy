import { useMemo, type CSSProperties } from 'react';
import { PIECE_NAME, type Color, type Piece, type Square, colOf, rowOf } from '../game/types';
import type { ArrowMark, Mark } from '../content/types';

const PAD = 30;
const CELL = 60;
const W = 540;
const H = 600;

/** 走子动画：seq 变化即重放（同一格重复走子也能触发） */
export interface MoveAnim {
  from: number;
  to: number;
  captured?: Piece | null;
  seq: number;
}

export interface BoardProps {
  squares: Square[];
  orientation?: Color;
  selected?: number | null;
  targets?: number[];
  highlight?: number[];
  marks?: Mark[];
  arrows?: ArrowMark[];
  lastMove?: { from: number; to: number } | null;
  /** 走子滑动动画与吃子爆点 */
  moveAnim?: MoveAnim | null;
  checkSquare?: number | null;
  onSquareClick?: (index: number) => void;
  disabled?: boolean;
  /** 显示列号/行号提示（教学用） */
  showCoords?: boolean;
  animate?: boolean;
}

export function Board({
  squares,
  orientation = 'r',
  selected = null,
  targets = [],
  highlight = [],
  marks = [],
  arrows = [],
  lastMove = null,
  moveAnim = null,
  checkSquare = null,
  onSquareClick,
  disabled = false,
  showCoords = false,
  animate = true,
}: BoardProps) {
  const view = useMemo(() => {
    const flip = orientation === 'b';
    const toXY = (index: number) => {
      const r = rowOf(index);
      const c = colOf(index);
      const vr = flip ? 9 - r : r;
      const vc = flip ? 8 - c : c;
      return { x: PAD + vc * CELL, y: PAD + vr * CELL };
    };
    return { flip, toXY };
  }, [orientation]);

  const { toXY } = view;

  const pieces = squares
    .map((p, i) => ({ p, i }))
    .filter((it): it is { p: NonNullable<Square>; i: number } => Boolean(it.p));

  return (
    <div className="board-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="board-svg" role="img" aria-label="象棋棋盘">
        <defs>
          <linearGradient id="boardBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FDF3DD" />
            <stop offset="100%" stopColor="#F8E6C4" />
          </linearGradient>
          <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#8A5A22" floodOpacity="0.28" />
          </filter>
          {/* 棋子面：左上高光、右下暗一点的木色，配合底部厚度圆做出立体感 */}
          <radialGradient id="pieceFace" cx="0.4" cy="0.26" r="0.82">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="48%" stopColor="#FFFCF3" />
            <stop offset="86%" stopColor="#F6E7C6" />
            <stop offset="100%" stopColor="#E7D2A8" />
          </radialGradient>
          <marker id="arrow-good" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#58CC02" />
          </marker>
          <marker id="arrow-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#FF4B4B" />
          </marker>
          <marker id="arrow-info" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1CB0F6" />
          </marker>
        </defs>

        <rect x="0" y="0" width={W} height={H} rx="18" fill="url(#boardBg)" />

        {/* 棋盘线 */}
        <g stroke="#C08A46" strokeWidth="2" strokeLinecap="round" opacity="0.85">
          {Array.from({ length: 9 }, (_, c) => {
            const x = PAD + c * CELL;
            // 楚河汉界里不画竖线；只保留最外侧两条边线连通上下
            if (c === 0 || c === 8) {
              return <line key={`v${c}`} x1={x} y1={PAD} x2={x} y2={PAD + 9 * CELL} />;
            }
            return (
              <g key={`v${c}`}>
                <line x1={x} y1={PAD} x2={x} y2={PAD + 4 * CELL} />
                <line x1={x} y1={PAD + 5 * CELL} x2={x} y2={PAD + 9 * CELL} />
              </g>
            );
          })}
          {Array.from({ length: 10 }, (_, r) => (
            <line key={`h${r}`} x1={PAD} y1={PAD + r * CELL} x2={PAD + 8 * CELL} y2={PAD + r * CELL} />
          ))}
          {/* 外框加粗 */}
          <rect
            x={PAD - 4}
            y={PAD - 4}
            width={8 * CELL + 8}
            height={9 * CELL + 8}
            fill="none"
            strokeWidth="3.4"
            rx="4"
          />
          {/* 九宫斜线 */}
          <line x1={PAD + 3 * CELL} y1={PAD} x2={PAD + 5 * CELL} y2={PAD + 2 * CELL} />
          <line x1={PAD + 5 * CELL} y1={PAD} x2={PAD + 3 * CELL} y2={PAD + 2 * CELL} />
          <line x1={PAD + 3 * CELL} y1={PAD + 7 * CELL} x2={PAD + 5 * CELL} y2={PAD + 9 * CELL} />
          <line x1={PAD + 5 * CELL} y1={PAD + 7 * CELL} x2={PAD + 3 * CELL} y2={PAD + 9 * CELL} />
        </g>

        {/* 楚河汉界 */}
        <g fill="#B4803C" fontSize="26" fontWeight="700" opacity="0.55" letterSpacing="10">
          <text x={PAD + 1.4 * CELL} y={PAD + 4.5 * CELL + 9} textAnchor="middle">
            楚 河
          </text>
          <text x={PAD + 6.6 * CELL} y={PAD + 4.5 * CELL + 9} textAnchor="middle">
            漢 界
          </text>
        </g>

        {showCoords && (
          <g fill="#B4803C" fontSize="13" opacity="0.65">
            {Array.from({ length: 9 }, (_, c) => {
              const x = PAD + (view.flip ? 8 - c : c) * CELL;
              return (
                <text key={`cn${c}`} x={x} y={H - 8} textAnchor="middle">
                  {view.flip ? c + 1 : 9 - c}
                </text>
              );
            })}
          </g>
        )}

        {/* 上一步高亮 */}
        {lastMove && (
          <g>
            {[lastMove.from, lastMove.to].map((i, k) => {
              const { x, y } = toXY(i);
              return (
                <rect
                  key={k}
                  x={x - 28}
                  y={y - 28}
                  width={56}
                  height={56}
                  rx="12"
                  fill="#FFC800"
                  opacity={k === 0 ? 0.22 : 0.34}
                />
              );
            })}
          </g>
        )}

        {/* 讲解高亮 */}
        {highlight.length > 0 && (
          <g>
            {highlight.map((i) => {
              const { x, y } = toXY(i);
              return (
                <rect
                  key={i}
                  x={x - 27}
                  y={y - 27}
                  width={54}
                  height={54}
                  rx="14"
                  fill="#FFD84D"
                  opacity="0.42"
                  stroke="#FFB300"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                />
              );
            })}
          </g>
        )}

        {/* 标记 */}
        {marks.map((m, k) => {
          const { x, y } = toXY(m.at);
          if (m.kind === 'cross') {
            return (
              <g key={`m${k}`} stroke="#FF4B4B" strokeWidth="5" strokeLinecap="round">
                <line x1={x - 15} y1={y - 15} x2={x + 15} y2={y + 15} />
                <line x1={x + 15} y1={y - 15} x2={x - 15} y2={y + 15} />
              </g>
            );
          }
          if (m.kind === 'ring') {
            return (
              <circle
                key={`m${k}`}
                cx={x}
                cy={y}
                r="25"
                fill="none"
                stroke="#FF9600"
                strokeWidth="3"
                strokeDasharray="6 5"
              />
            );
          }
          if (m.kind === 'star') {
            return (
              <text key={`m${k}`} x={x} y={y + 10} textAnchor="middle" fontSize="30" fill="#FFC800">
                ★
              </text>
            );
          }
          return <circle key={`m${k}`} cx={x} cy={y} r="7" fill="#1CB0F6" opacity="0.75" />;
        })}

        {/* 箭头 */}
        {arrows.map((a, k) => {
          const p1 = toXY(a.from);
          const p2 = toXY(a.to);
          const kind = a.kind ?? 'info';
          const color = kind === 'good' ? '#58CC02' : kind === 'bad' ? '#FF4B4B' : '#1CB0F6';
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const shrink = 26;
          return (
            <line
              key={`a${k}`}
              x1={p1.x + (dx / len) * shrink}
              y1={p1.y + (dy / len) * shrink}
              x2={p2.x - (dx / len) * shrink}
              y2={p2.y - (dy / len) * shrink}
              stroke={color}
              strokeWidth="4.5"
              strokeLinecap="round"
              opacity="0.75"
              markerEnd={`url(#arrow-${kind})`}
            />
          );
        })}

        {/* 可落子点 */}
        {targets.map((t) => {
          const { x, y } = toXY(t);
          const occupied = Boolean(squares[t]);
          return occupied ? (
            <circle
              key={`t${t}`}
              cx={x}
              cy={y}
              r="26"
              fill="none"
              stroke="#58CC02"
              strokeWidth="4"
              opacity="0.9"
            />
          ) : (
            <circle key={`t${t}`} cx={x} cy={y} r="9" fill="#58CC02" opacity="0.55" />
          );
        })}

        {/* 吃子爆点 */}
        {animate &&
          moveAnim?.captured &&
          (() => {
            const { x, y } = toXY(moveAnim.to);
            const red = moveAnim.captured.color === 'r';
            const c = red ? '#D6342C' : '#2F3B44';
            return (
              <g
                key={`burst-${moveAnim.seq}`}
                className="capture-burst"
                style={{ transformOrigin: `${x}px ${y}px` }}
              >
                <circle cx={x} cy={y} r="30" fill="none" stroke={c} strokeWidth="4" opacity="0.5" />
                <circle cx={x} cy={y} r="26" fill="#FFC800" opacity="0.35" />
              </g>
            );
          })()}

        {/* 棋子 */}
        {pieces.map(({ p, i }) => {
          const { x, y } = toXY(i);
          const isRed = p.color === 'r';
          const color = isRed ? '#D6342C' : '#2F3B44';
          const isSelected = selected === i;
          const sliding = animate && moveAnim !== null && moveAnim.to === i;
          const delta = sliding
            ? (() => {
                const f = toXY(moveAnim!.from);
                return { dx: f.x - x, dy: f.y - y };
              })()
            : null;
          return (
            <g
              key={sliding ? `p${i}-s${moveAnim!.seq}` : `p${i}`}
              filter="url(#pieceShadow)"
              className={sliding ? 'piece piece-slide' : animate ? 'piece' : undefined}
              style={{
                transformOrigin: `${x}px ${y}px`,
                ...(delta
                  ? ({ '--dx': `${delta.dx}px`, '--dy': `${delta.dy}px` } as CSSProperties)
                  : null),
              }}
            >
              {isSelected && (
                <circle cx={x} cy={y} r="31" fill="#1CB0F6" opacity="0.28" />
              )}
              {/* 厚度：往下沉的一圈暗沿，让棋子像立起来的木片 */}
              <circle cx={x} cy={y + 2.6} r="26" fill="#C89B5C" opacity="0.5" />
              {/* 棋面：径向渐变（左上亮、右下暗） */}
              <circle cx={x} cy={y} r="26" fill="url(#pieceFace)" stroke={color} strokeWidth="2.6" />
              {/* 内圈刻线 */}
              <circle cx={x} cy={y} r="21" fill="none" stroke={color} strokeWidth="1" opacity="0.4" />
              {/* 内沿底部暗弧，做出微微凹陷 */}
              <path
                d={`M${x - 19.7} ${y + 7.2} A 21 21 0 0 0 ${x + 19.7} ${y + 7.2}`}
                stroke="#C9A469"
                strokeWidth="2.4"
                fill="none"
                opacity="0.45"
                strokeLinecap="round"
              />
              {/* 左上高光 */}
              <path
                d={`M${x - 17.9} ${y - 6.5} A 19 19 0 0 1 ${x + 9.5} ${y - 16.5}`}
                stroke="#FFFFFF"
                strokeWidth="2.8"
                fill="none"
                opacity="0.85"
                strokeLinecap="round"
              />
              <text
                x={x}
                y={y + 10.5}
                textAnchor="middle"
                fontSize="30"
                fontWeight="700"
                fill={color}
                style={{ fontFamily: '"KaiTi", "STKaiti", "Songti SC", serif', userSelect: 'none' }}
              >
                {PIECE_NAME[p.color][p.type]}
              </text>
            </g>
          );
        })}

        {/* 被将军提示 */}
        {checkSquare !== null && checkSquare >= 0 && (() => {
          const { x, y } = toXY(checkSquare);
          return (
            <circle cx={x} cy={y} r="31" fill="none" stroke="#FF4B4B" strokeWidth="3.5" className="check-pulse" />
          );
        })()}

        {/* 命中区域 */}
        {Array.from({ length: 90 }, (_, i) => {
          const { x, y } = toXY(i);
          return (
            <rect
              key={`hit${i}`}
              x={x - CELL / 2}
              y={y - CELL / 2}
              width={CELL}
              height={CELL}
              fill="transparent"
              style={{ cursor: disabled ? 'default' : 'pointer' }}
              pointerEvents={disabled ? 'none' : 'auto'}
              onClick={() => onSquareClick?.(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}
