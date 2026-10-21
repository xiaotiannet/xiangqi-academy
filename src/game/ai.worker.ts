import { parseFen } from './board';
import { findBestMove } from './ai';
import type { Position } from './types';

interface AiRequest {
  id: number;
  fen: string;
  depth: number;
  timeMs: number;
  noise: number;
  /** move = 找最佳着法；eval = 只求局面评分（复盘用） */
  op?: 'move' | 'eval';
}

interface AiResponse {
  id: number;
  ok: boolean;
  from?: number;
  to?: number;
  score?: number;
  depth?: number;
  nodes?: number;
  error?: string;
}

self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const { id, fen, depth, timeMs, noise, op } = ev.data;
  try {
    const pos: Position = parseFen(fen);
    const res = findBestMove(pos, {
      depth,
      timeMs,
      noise: op === 'eval' ? 0 : noise,
      seed: id * 7919 + 31,
    });
    const payload: AiResponse = {
      id,
      ok: true,
      from: res.move?.from ?? -1,
      to: res.move?.to ?? -1,
      score: res.score,
      depth: res.depth,
      nodes: res.nodes,
    };
    (self as unknown as Worker).postMessage(payload);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(e) } satisfies AiResponse);
  }
};
