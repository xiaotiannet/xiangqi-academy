let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOptions {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
}

function tone({ freq, duration = 0.12, type = 'sine', gain = 0.08, delay = 0, slideTo }: ToneOptions) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  enabled: true,
  tap() {
    if (!this.enabled) return;
    tone({ freq: 620, duration: 0.06, type: 'triangle', gain: 0.05 });
  },
  move() {
    if (!this.enabled) return;
    // 木质落子：短促高频「啪」+ 低频「咚」
    tone({ freq: 760, duration: 0.045, type: 'triangle', gain: 0.1 });
    tone({ freq: 320, duration: 0.1, type: 'sine', gain: 0.1, delay: 0.008 });
    tone({ freq: 150, duration: 0.16, type: 'sine', gain: 0.09, delay: 0.012 });
  },
  capture() {
    if (!this.enabled) return;
    // 吃子：下滑的「啪嗒」+ 闷响
    tone({ freq: 520, duration: 0.09, type: 'square', gain: 0.06, slideTo: 180 });
    tone({ freq: 190, duration: 0.2, type: 'triangle', gain: 0.11, delay: 0.02 });
    tone({ freq: 95, duration: 0.24, type: 'sine', gain: 0.09, delay: 0.03 });
  },
  check() {
    if (!this.enabled) return;
    // 将军：三连上行提示，比落子更「亮」
    tone({ freq: 880, duration: 0.08, type: 'square', gain: 0.05 });
    tone({ freq: 1174, duration: 0.09, type: 'square', gain: 0.05, delay: 0.09 });
    tone({ freq: 1568, duration: 0.16, type: 'triangle', gain: 0.06, delay: 0.18 });
  },
  select() {
    if (!this.enabled) return;
    tone({ freq: 520, duration: 0.05, type: 'triangle', gain: 0.05 });
  },
  correct() {
    if (!this.enabled) return;
    tone({ freq: 660, duration: 0.1, type: 'sine', gain: 0.08 });
    tone({ freq: 880, duration: 0.14, type: 'sine', gain: 0.08, delay: 0.09 });
    tone({ freq: 1180, duration: 0.16, type: 'sine', gain: 0.06, delay: 0.18 });
  },
  wrong() {
    if (!this.enabled) return;
    tone({ freq: 220, duration: 0.16, type: 'sawtooth', gain: 0.05, slideTo: 150 });
  },
  win() {
    if (!this.enabled) return;
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, duration: 0.16, type: 'sine', gain: 0.07, delay: i * 0.1 }),
    );
  },
  lose() {
    if (!this.enabled) return;
    [392, 330, 262].forEach((f, i) =>
      tone({ freq: f, duration: 0.2, type: 'sine', gain: 0.06, delay: i * 0.12 }),
    );
  },
};
