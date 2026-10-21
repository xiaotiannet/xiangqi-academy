import { useCallback, useEffect, useRef, useState } from 'react';
import { toFen } from '../game/board';
import { findBestMove } from '../game/ai';
import AiWorkerCtor from '../game/ai.worker?worker&inline';
import type { Position } from '../game/types';
import { bookLookup } from '../content/openings';

export type LevelId = 'easy' | 'normal' | 'hard';

export interface Level {
  id: LevelId;
  name: string;
  desc: string;
  emoji: string;
  depth: number;
  timeMs: number;
  noise: number;
}

export const LEVELS: Level[] = [
  { id: 'easy', name: '入门', desc: '只算两步，常有破绽', emoji: '🌱', depth: 2, timeMs: 350, noise: 130 },
  { id: 'normal', name: '进阶', desc: '算三步，攻守有序', emoji: '⚔️', depth: 3, timeMs: 800, noise: 40 },
  { id: 'hard', name: '高手', desc: '算四五步，抓住每个漏洞', emoji: '🔥', depth: 4, timeMs: 1500, noise: 0 },
];

export interface ThinkResult {
  from: number;
  to: number;
  score: number;
  depth: number;
}

export interface EvalResult {
  /** 以「轮到走子的一方」为视角的评分 */
  score: number;
  bestFrom: number;
  bestTo: number;
}

interface Waiter {
  resolve: (r: ThinkResult | null) => void;
}

export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const waiters = useRef<Map<number, Waiter>>(new Map());
  const seq = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      // 内联 Worker：打包成单文件后仍可在 file:// 下运行（安卓 WebView 壳需要）
      worker = new AiWorkerCtor();
      worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; from?: number; to?: number; score?: number; depth?: number }>) => {
        const { id, ok, from, to, score, depth } = ev.data;
        const waiter = waiters.current.get(id);
        if (!waiter) return;
        waiters.current.delete(id);
        if (ok && from !== undefined && to !== undefined && from >= 0) {
          waiter.resolve({ from, to, score: score ?? 0, depth: depth ?? 0 });
        } else {
          waiter.resolve(null);
        }
      };
      worker.onerror = () => {
        setReady(false);
      };
      workerRef.current = worker;
      setReady(true);
    } catch {
      setReady(false);
    }
    return () => {
      waiters.current.forEach((w) => w.resolve(null));
      waiters.current.clear();
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const think = useCallback((pos: Position, level: Level): Promise<ThinkResult | null> => {
    // 开局库：前几手优先按谱走，免得每局都像同一个机器人
    const book = bookLookup(pos);
    if (book && Math.random() < 0.8) {
      return new Promise((resolve) => {
        window.setTimeout(
          () => resolve({ from: book.from, to: book.to, score: 0, depth: 0 }),
          240 + Math.random() * 320,
        );
      });
    }

    const worker = workerRef.current;
    if (worker) {
      const id = ++seq.current;
      return new Promise<ThinkResult | null>((resolve) => {
        waiters.current.set(id, { resolve });
        worker.postMessage({
          id,
          fen: toFen(pos),
          depth: level.depth,
          timeMs: level.timeMs,
          noise: level.noise,
        });
        // 兜底超时
        window.setTimeout(() => {
          if (waiters.current.has(id)) {
            waiters.current.delete(id);
            resolve(null);
          }
        }, level.timeMs + 4000);
      });
    }
    // Worker 不可用时退化为主线程低深度搜索
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          const res = findBestMove(pos, { depth: Math.min(2, level.depth), timeMs: 400, noise: level.noise });
          resolve(res.move ? { from: res.move.from, to: res.move.to, score: res.score, depth: res.depth } : null);
        } catch {
          resolve(null);
        }
      }, 60);
    });
  }, []);

  /** 只求局面评分（复盘用），不做开局库干预 */
  const evaluate = useCallback((pos: Position, depth = 2): Promise<EvalResult | null> => {
    const worker = workerRef.current;
    if (worker) {
      const id = ++seq.current;
      return new Promise<EvalResult | null>((resolve) => {
        waiters.current.set(id, {
          resolve: (r) => resolve(r ? { score: r.score, bestFrom: r.from, bestTo: r.to } : null),
        });
        worker.postMessage({ id, op: 'eval', fen: toFen(pos), depth, timeMs: 500, noise: 0 });
        window.setTimeout(() => {
          if (waiters.current.has(id)) {
            waiters.current.delete(id);
            resolve(null);
          }
        }, 3000);
      });
    }
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          const res = findBestMove(pos, { depth, timeMs: 500, noise: 0 });
          resolve(
            res.move
              ? { score: res.score, bestFrom: res.move.from, bestTo: res.move.to }
              : null,
          );
        } catch {
          resolve(null);
        }
      }, 10);
    });
  }, []);

  return { think, evaluate, ready };
}
