/**
 * 原生桥接：语音（内置语音包 + 系统 TTS 兜底）、震动、每日提醒通知。
 * 浏览器里自动退化为 Web Speech API / 应用内提示。
 */

import VOICEMAP from '../content/voicemap.json';

export interface NativeBridge {
  speak(text: string, pitch: number, rate: number): void;
  stopSpeak(): void;
  vibrate(ms: number): void;
  scheduleReminder(hour: number, minute: number, title: string, body: string): void;
  cancelReminder(): void;
  requestNotifications(): void;
  platform(): string;
}

declare global {
  interface Window {
    XQNative?: NativeBridge;
  }
}

export function isNative(): boolean {
  return typeof window !== 'undefined' && Boolean(window.XQNative);
}

/* ---------- 内置语音包 ---------- */

/**
 * 台词在打包时已合成成 mp3（public/voice/*.mp3），随安装包一起分发。
 * 优先播它：不依赖手机有没有中文 TTS 引擎，也不用联网。
 * 音频缺失 / 解码失败 / 被自动播放策略拦截时，才退回系统 TTS。
 */
const RECORDED = VOICEMAP as Record<string, string>;

let audioEl: HTMLAudioElement | null = null;

function recordedUrl(file: string): string {
  const base = typeof document !== 'undefined' ? document.baseURI : '';
  try {
    return new URL(`voice/${file}`, base).href;
  } catch {
    return `voice/${file}`;
  }
}

function playRecorded(text: string, onFail: () => void): boolean {
  const file = RECORDED[text];
  if (!file || typeof Audio === 'undefined') return false;
  try {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
    }
    const el = audioEl;
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      onFail();
    };
    el.onerror = fail;
    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      /* 尚未加载过时会抛，忽略 */
    }
    el.src = recordedUrl(file);
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(fail);
    return true;
  } catch {
    return false;
  }
}

/* ---------- 语音 ---------- */

let enabled = true;
let lastSpoken = '';
let lastAt = 0;
let zhVoice: SpeechSynthesisVoice | null = null;
let voicesBound = false;

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const zh = voices.filter((v) => /zh|cmn|Chinese/i.test(v.lang + v.name));
  const preferred =
    zh.find((v) => /Xiaoxiao|Yaoyao|Huihui|Tingting|Kangkang|Yunxi|female|女/i.test(v.name)) ?? zh[0];
  return preferred ?? null;
}

function bindVoices() {
  if (voicesBound || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesBound = true;
  zhVoice = pickZhVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    zhVoice = pickZhVoice();
  };
}

export const voice = {
  get enabled() {
    return enabled;
  },
  set enabled(v: boolean) {
    enabled = v;
    if (!v) voice.stop();
  },
  /** 念一句（会自动跳过重复与过密调用） */
  say(text: string, opts: { pitch?: number; rate?: number; force?: boolean } = {}) {
    if (!enabled || !text) return;
    const now = Date.now();
    if (!opts.force && text === lastSpoken && now - lastAt < 4000) return;
    lastSpoken = text;
    lastAt = now;

    const speakWithSystem = () => {
      const bridge = typeof window !== 'undefined' ? window.XQNative : undefined;
      if (bridge) {
        try {
          bridge.speak(text, opts.pitch ?? 1.12, opts.rate ?? 0.92);
          return;
        } catch {
          /* 落到 Web 方案 */
        }
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        bindVoices();
        if (!zhVoice) zhVoice = pickZhVoice();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        if (zhVoice) u.voice = zhVoice;
        u.pitch = opts.pitch ?? 1.12;
        u.rate = opts.rate ?? 0.92;
        u.volume = 1;
        window.speechSynthesis.speak(u);
      } catch {
        /* 无语音能力时静默 */
      }
    };

    // 1) 内置语音包（随包分发，离线可用，不依赖系统 TTS）
    if (playRecorded(text, speakWithSystem)) return;
    // 2) 没有录音的句子（含动态数字/称号）才走系统 TTS
    speakWithSystem();
  },
  stop() {
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        /* ignore */
      }
    }
    const bridge = typeof window !== 'undefined' ? window.XQNative : undefined;
    if (bridge) {
      try {
        bridge.stopSpeak();
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  },
};

/* ---------- 震动 ---------- */

export function haptic(ms = 12) {
  const bridge = typeof window !== 'undefined' ? window.XQNative : undefined;
  if (bridge) {
    try {
      bridge.vibrate(ms);
      return;
    } catch {
      /* ignore */
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }
}

export type BuzzKind = 'tap' | 'capture' | 'check' | 'result';

/**
 * 语义化震动：不同事件用不同节奏，闭着眼也能分辨发生了什么。
 * tap 轻点 / capture 吃子（一击）/ check 将军（双击）/ result 终局（双长震）。
 * 普通落子刻意不震，避免整局手麻。
 */
export function buzz(kind: BuzzKind = 'tap') {
  switch (kind) {
    case 'capture':
      haptic(30);
      return;
    case 'check': {
      haptic(18);
      window.setTimeout(() => haptic(22), 110);
      return;
    }
    case 'result':
      haptic(45);
      window.setTimeout(() => haptic(45), 150);
      return;
    default:
      haptic(8);
  }
}

/* ---------- 每日提醒 ---------- */

export interface ReminderPlan {
  hour: number;
  title: string;
  body: string;
}

export function applyReminder(plan: ReminderPlan | null) {
  const bridge = typeof window !== 'undefined' ? window.XQNative : undefined;
  if (!bridge) return;
  try {
    if (plan) bridge.scheduleReminder(plan.hour, 0, plan.title, plan.body);
    else bridge.cancelReminder();
  } catch {
    /* ignore */
  }
}

export function requestNotificationPermission() {
  const bridge = typeof window !== 'undefined' ? window.XQNative : undefined;
  if (!bridge) return;
  try {
    bridge.requestNotifications();
  } catch {
    /* ignore */
  }
}
