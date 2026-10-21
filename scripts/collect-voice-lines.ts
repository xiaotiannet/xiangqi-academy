/** 收集所有会被念出来的句子，交给 make-voice.py 合成音频 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as oscar from '../src/content/oscar';

const texts = new Set<string>();

function walk(v: unknown) {
  if (Array.isArray(v)) {
    v.forEach(walk);
    return;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.t === 'string') {
      texts.add(typeof o.v === 'string' && o.v ? o.v : o.t);
      return;
    }
    Object.values(o).forEach(walk);
  }
}

walk(oscar);

// 页面里硬编码的几句
[
  '体力满格。去把电脑下哭吧。',
  '宝石不够，先去上课挣点。',
  '满血复活。这次别再绊自己的马腿了。',
  '开局，先把架势摆好。',
  '奖励到手，收下吧。',
  '复盘完毕，自己看看哪一步最亏。',
].forEach((t) => texts.add(t));

const list = [...texts].filter((t) => !t.includes('{n}') && !t.includes('{title}'));
const dir = resolve(import.meta.dirname, '..', '.tmp');
mkdirSync(dir, { recursive: true });
const out = resolve(dir, 'voice-lines.json');
writeFileSync(out, JSON.stringify(list, null, 2), 'utf8');
console.log(`collected ${list.length} lines -> ${out}`);
