import { ALL_LESSONS, LESSON_ORDER } from '../content/curriculum';

const KEY = 'xiangqi-academy:v1';
export const DAILY_GOAL = 50;

/* ---------- 经济参数 ---------- */

export const ENERGY_MAX = 5;
/** 每 18 分钟恢复 1 点体力 */
export const ENERGY_REGEN_MS = 18 * 60 * 1000;
export const ENERGY_COST = 60;
export const REVIVE_COST = 50;
export const HINT_COST = 15;

export const GEM = {
  lesson: 10,
  perfect: 10,
  first: 15,
  review: 4,
  win: 25,
  draw: 12,
  lose: 5,
  chest: 35,
};

/* ---------- 类型 ---------- */

export interface LessonRecord {
  done: boolean;
  stars: number;
  accuracy: number;
  at: number;
}

/** 一局棋里的一手（只存复盘需要的最小信息） */
export interface MatchPly {
  from: number;
  to: number;
  notation: string;
  color: 'r' | 'b';
}

/** 对战记录：时间 / 输赢 / 执子 / 整局着法（用于复盘） */
export interface MatchRecord {
  id: string;
  at: number;
  result: 'win' | 'lose' | 'draw';
  level: string;
  side: 'r' | 'b';
  /** 超时按残局子力判定的那局 */
  timeout: boolean;
  plies: MatchPly[];
}

/** 最多留这么多局，超过丢最老的（每局要存完整着法） */
export const MATCH_KEEP = 12;

export interface Settings {
  sound: boolean;
  voice: boolean;
  showLegalMoves: boolean;
  showNotation: boolean;
  /** 对局页是否显示「悔棋」按钮（每次悔棋消耗 1 点体力） */
  undo: boolean;
  reminder: boolean;
  reminderHour: number;
}

export interface DailyState {
  day: string;
  lessons: number;
  correct: number;
  wins: number;
  claimed: string[];
}

export interface ProgressState {
  version: number;
  lessons: Record<string, LessonRecord>;
  xp: number;
  gems: number;
  energy: number;
  energyAt: number;
  perfect: number;
  totalCorrect: number;
  streak: number;
  lastDay: string;
  days: Record<string, number>;
  vsAi: { win: number; lose: number; draw: number };
  /** 最近的对战记录（新的在前），供复盘 */
  matches: MatchRecord[];
  quests: DailyState;
  claimedAch: Record<string, number>;
  chestDay: string;
  settings: Settings;
}

export interface Reward {
  xp: number;
  gems: number;
  stars?: number;
  levelUp?: { level: number; title: string };
  energy?: number;
}

/* ---------- 日期工具 ---------- */

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

function daySeed(key = todayKey()): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* ---------- 等级 ---------- */

const TITLES: Array<[number, string]> = [
  [1, '棋童'],
  [3, '小棋手'],
  [5, '棋士'],
  [7, '橘中密友'],
  [9, '象棋高手'],
  [12, '棋坛名手'],
  [15, '布局大师'],
  [19, '象棋大师'],
  [25, '棋圣'],
];

export function titleOf(level: number): string {
  let t = TITLES[0][1];
  for (const [lv, name] of TITLES) if (level >= lv) t = name;
  return t;
}

/** 从 level 升到 level+1 所需经验 */
export function xpForLevel(level: number): number {
  return 80 + (level - 1) * 45;
}

export interface LevelInfo {
  level: number;
  title: string;
  into: number;
  need: number;
  pct: number;
  nextTitle: string;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let acc = 0;
  let need = xpForLevel(1);
  while (level < 60) {
    need = xpForLevel(level);
    if (xp - acc < need) break;
    acc += need;
    level += 1;
  }
  const into = Math.max(0, xp - acc);
  return {
    level,
    title: titleOf(level),
    into,
    need,
    pct: Math.min(100, Math.round((into / need) * 100)),
    nextTitle: titleOf(level + 1),
  };
}

/* ---------- 每日任务 ---------- */

export interface QuestDef {
  id: string;
  label: string;
  hint: string;
  goal: number;
  reward: number;
  counter: 'lessons' | 'correct' | 'wins';
  emoji: string;
}

export function dailyQuests(day = todayKey()): QuestDef[] {
  const seed = daySeed(day);
  const lessonGoal = 1 + (seed % 2);
  const correctGoal = 8 + (seed % 5);
  return [
    {
      id: `${day}-lessons`,
      label: `完成 ${lessonGoal} 节课`,
      hint: '完整的课程才算数，半途退出奥斯卡会记账',
      goal: lessonGoal,
      reward: 15,
      counter: 'lessons',
      emoji: '📚',
    },
    {
      id: `${day}-correct`,
      label: `答对 ${correctGoal} 道题`,
      hint: '一次答对与反复试错，都算答对',
      goal: correctGoal,
      reward: 20,
      counter: 'correct',
      emoji: '🎯',
    },
    {
      id: `${day}-wins`,
      label: '赢下 1 局人机对战',
      hint: '认输不算，奥斯卡会记住的',
      goal: 1,
      reward: 30,
      counter: 'wins',
      emoji: '⚔️',
    },
  ];
}

export function questProgress(p: ProgressState, q: QuestDef): number {
  return p.quests.day === todayKey() ? Math.min(q.goal, p.quests[q.counter]) : 0;
}

export function questClaimed(p: ProgressState, q: QuestDef): boolean {
  return p.quests.day === todayKey() && p.quests.claimed.includes(q.id);
}

/* ---------- 成就 ---------- */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  goal: number;
  gems: number;
  value: (p: ProgressState) => number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_lesson',
    name: '初次落子',
    desc: '完成第一节课',
    emoji: '🎓',
    goal: 1,
    gems: 20,
    value: (p) => completedCount(p),
  },
  {
    id: 'stars_20',
    name: '三星收藏家',
    desc: '累计获得 20 颗星',
    emoji: '⭐',
    goal: 20,
    gems: 40,
    value: (p) => starCount(p),
  },
  {
    id: 'perfect_5',
    name: '零失误俱乐部',
    desc: '5 节课全程无失误',
    emoji: '🧊',
    goal: 5,
    gems: 50,
    value: (p) => p.perfect,
  },
  {
    id: 'streak_3',
    name: '三日不断',
    desc: '连续学习 3 天',
    emoji: '🔥',
    goal: 3,
    gems: 30,
    value: (p) => p.streak,
  },
  {
    id: 'streak_7',
    name: '一周火苗',
    desc: '连续学习 7 天',
    emoji: '☄️',
    goal: 7,
    gems: 60,
    value: (p) => p.streak,
  },
  {
    id: 'first_win',
    name: '第一滴血',
    desc: '击败奥斯卡一局',
    emoji: '🗡️',
    goal: 1,
    gems: 30,
    value: (p) => p.vsAi.win,
  },
  {
    id: 'win_5',
    name: '斩将五局',
    desc: '累计战胜奥斯卡 5 局',
    emoji: '🏆',
    goal: 5,
    gems: 60,
    value: (p) => p.vsAi.win,
  },
  {
    id: 'level_5',
    name: '五级棋士',
    desc: '达到 Lv.5',
    emoji: '🥋',
    goal: 5,
    gems: 50,
    value: (p) => levelInfo(p.xp).level,
  },
  {
    id: 'all_lessons',
    name: '通晓全书',
    desc: '通关全部 20 节课',
    emoji: '📜',
    goal: 20,
    gems: 120,
    value: (p) => completedCount(p),
  },
];

export function achievementDone(p: ProgressState, a: AchievementDef): boolean {
  return a.value(p) >= a.goal;
}

export function achievementClaimed(p: ProgressState, a: AchievementDef): boolean {
  return Boolean(p.claimedAch[a.id]);
}

/* ---------- 初始状态与持久化 ---------- */

function emptyQuests(): DailyState {
  return { day: todayKey(), lessons: 0, correct: 0, wins: 0, claimed: [] };
}

export function defaultProgress(): ProgressState {
  return {
    version: 2,
    lessons: {},
    xp: 0,
    gems: 50,
    energy: ENERGY_MAX,
    energyAt: Date.now(),
    perfect: 0,
    totalCorrect: 0,
    streak: 0,
    lastDay: '',
    days: {},
    vsAi: { win: 0, lose: 0, draw: 0 },
    matches: [],
    quests: emptyQuests(),
    claimedAch: {},
    chestDay: '',
    settings: {
      sound: true,
      voice: true,
      showLegalMoves: true,
      showNotation: true,
      undo: false,
      reminder: false,
      reminderHour: 20,
    },
  };
}

export function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    const base = defaultProgress();
    const merged: ProgressState = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      vsAi: { ...base.vsAi, ...(parsed.vsAi ?? {}) },
      lessons: parsed.lessons ?? {},
      days: parsed.days ?? {},
      claimedAch: parsed.claimedAch ?? {},
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      quests: { ...emptyQuests(), ...(parsed.quests ?? {}) },
    };
    return syncEnergy(merged).state;
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: ProgressState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 存储不可用时静默失败 */
  }
}

/* ---------- 体力 ---------- */

export function energyCountdown(p: ProgressState, now = Date.now()): number {
  if (p.energy >= ENERGY_MAX) return 0;
  const elapsed = now - p.energyAt;
  return Math.max(0, ENERGY_REGEN_MS - (elapsed % ENERGY_REGEN_MS));
}

export function syncEnergy(p: ProgressState, now = Date.now()): { state: ProgressState; gained: number } {
  if (p.energy >= ENERGY_MAX) {
    return { state: p.energyAt === now ? p : { ...p, energyAt: now }, gained: 0 };
  }
  const elapsed = Math.max(0, now - p.energyAt);
  const steps = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (steps <= 0) return { state: p, gained: 0 };
  const energy = Math.min(ENERGY_MAX, p.energy + steps);
  const energyAt = energy >= ENERGY_MAX ? now : p.energyAt + steps * ENERGY_REGEN_MS;
  return { state: { ...p, energy, energyAt }, gained: energy - p.energy };
}

export function loseHeart(p: ProgressState): { state: ProgressState; energy: number; empty: boolean } {
  const energy = Math.max(0, p.energy - 1);
  const energyAt = p.energy >= ENERGY_MAX ? Date.now() : p.energyAt;
  return { state: { ...p, energy, energyAt }, energy, empty: energy <= 0 };
}

export function buyEnergy(p: ProgressState): { state: ProgressState; ok: boolean; gems: number } {
  if (p.gems < ENERGY_COST) return { state: p, ok: false, gems: p.gems };
  return {
    state: { ...p, gems: p.gems - ENERGY_COST, energy: ENERGY_MAX, energyAt: Date.now() },
    ok: true,
    gems: p.gems - ENERGY_COST,
  };
}

/* ---------- 奖励结算 ---------- */

function makeReward(p: ProgressState, xp: number, gems: number, extra: Partial<Reward> = {}): Reward {
  const before = levelInfo(p.xp).level;
  const after = levelInfo(p.xp + xp);
  const reward: Reward = { xp, gems, ...extra };
  if (after.level > before) reward.levelUp = { level: after.level, title: after.title };
  return reward;
}

function rollDay(p: ProgressState): DailyState {
  if (p.quests.day === todayKey()) return p.quests;
  return emptyQuests();
}

function withDay(p: ProgressState): ProgressState {
  const quests = rollDay(p);
  return quests === p.quests ? p : { ...p, quests };
}

export function awardLesson(
  p: ProgressState,
  lessonId: string,
  opts: { xp: number; stars: number; mistakes: number; accuracy: number },
): { state: ProgressState; reward: Reward; first: boolean } {
  const src = withDay(p);
  const day = todayKey();
  const prev = src.lessons[lessonId];
  const first = !prev?.done;
  const perfect = opts.mistakes === 0;
  const gems =
    GEM.lesson + (perfect ? GEM.perfect : 0) + (first ? GEM.first : GEM.review);

  const best: LessonRecord = {
    done: true,
    stars: Math.max(prev?.stars ?? 0, opts.stars),
    accuracy: Math.max(prev?.accuracy ?? 0, opts.accuracy),
    at: Date.now(),
  };

  let streak = src.streak;
  if (src.lastDay !== day) {
    if (src.lastDay && daysBetween(src.lastDay, day) === 1) streak += 1;
    else streak = 1;
  } else if (streak === 0) {
    streak = 1;
  }

  const gained = Math.max(0, opts.xp);
  const next: ProgressState = {
    ...src,
    lessons: { ...src.lessons, [lessonId]: best },
    xp: src.xp + gained,
    gems: src.gems + gems,
    perfect: src.perfect + (perfect && first ? 1 : 0),
    streak,
    lastDay: day,
    days: { ...src.days, [day]: (src.days[day] ?? 0) + gained },
    quests: { ...src.quests, lessons: src.quests.lessons + 1 },
  };
  return { state: next, reward: makeReward(src, gained, gems, { stars: opts.stars }), first };
}

/** 记一局对战（新的排在最前，超出 MATCH_KEEP 的丢掉） */
export function addMatch(p: ProgressState, rec: Omit<MatchRecord, 'id'>): ProgressState {
  const item: MatchRecord = { ...rec, id: `${rec.at}-${Math.random().toString(36).slice(2, 7)}` };
  return { ...p, matches: [item, ...(p.matches ?? [])].slice(0, MATCH_KEEP) };
}

export function awardGame(
  p: ProgressState,
  result: 'win' | 'lose' | 'draw',
): { state: ProgressState; reward: Reward; heartLost: boolean } {
  const src = withDay(p);
  const day = todayKey();
  const xp = result === 'win' ? 30 : result === 'draw' ? 15 : 8;
  const gems = result === 'win' ? GEM.win : result === 'draw' ? GEM.draw : GEM.lose;

  let energy = src.energy;
  let energyAt = src.energyAt;
  if (result === 'lose') {
    energy = Math.max(0, energy - 1);
    if (energy === ENERGY_MAX) energyAt = Date.now();
  }

  const next: ProgressState = {
    ...src,
    xp: src.xp + xp,
    gems: src.gems + gems,
    energy,
    energyAt,
    vsAi: { ...src.vsAi, [result]: src.vsAi[result] + 1 },
    days: { ...src.days, [day]: (src.days[day] ?? 0) + xp },
    lastDay: src.lastDay || day,
    quests: { ...src.quests, wins: src.quests.wins + (result === 'win' ? 1 : 0) },
  };
  return {
    state: next,
    reward: makeReward(src, xp, gems),
    heartLost: result === 'lose',
  };
}

export function bumpCorrect(p: ProgressState): ProgressState {
  const src = withDay(p);
  return {
    ...src,
    totalCorrect: src.totalCorrect + 1,
    quests: { ...src.quests, correct: src.quests.correct + 1 },
  };
}

export function claimQuest(
  p: ProgressState,
  q: QuestDef,
): { state: ProgressState; ok: boolean; gems: number } {
  if (questClaimed(p, q) || questProgress(p, q) < q.goal) return { state: p, ok: false, gems: 0 };
  return {
    state: {
      ...p,
      gems: p.gems + q.reward,
      quests: { ...p.quests, claimed: [...p.quests.claimed, q.id] },
    },
    ok: true,
    gems: q.reward,
  };
}

export function claimAchievement(
  p: ProgressState,
  a: AchievementDef,
): { state: ProgressState; ok: boolean; gems: number } {
  if (!achievementDone(p, a) || achievementClaimed(p, a)) return { state: p, ok: false, gems: 0 };
  return {
    state: { ...p, gems: p.gems + a.gems, claimedAch: { ...p.claimedAch, [a.id]: Date.now() } },
    ok: true,
    gems: a.gems,
  };
}

export function chestReady(p: ProgressState): boolean {
  return p.chestDay !== todayKey();
}

export function claimChest(p: ProgressState): { state: ProgressState; ok: boolean; gems: number } {
  if (!chestReady(p)) return { state: p, ok: false, gems: 0 };
  const bonus = GEM.chest + (p.energy <= 1 ? 15 : 0);
  return {
    state: { ...p, gems: p.gems + bonus, chestDay: todayKey(), energy: p.energy },
    ok: true,
    gems: bonus,
  };
}

/* ---------- 课程解锁 ---------- */

/** 顺序解锁：第一节永远可玩，之后需要上一节完成 */
export function isUnlocked(p: ProgressState, lessonId: string): boolean {
  const i = LESSON_ORDER.indexOf(lessonId);
  if (i <= 0) return true;
  return Boolean(p.lessons[LESSON_ORDER[i - 1]]?.done);
}

export function nextLessonId(p: ProgressState): string {
  const found = ALL_LESSONS.find((l) => !p.lessons[l.id]?.done);
  return found?.id ?? LESSON_ORDER[LESSON_ORDER.length - 1];
}

export function completedCount(p: ProgressState): number {
  return ALL_LESSONS.filter((l) => p.lessons[l.id]?.done).length;
}

export function starCount(p: ProgressState): number {
  return Object.values(p.lessons).reduce((s, r) => s + r.stars, 0);
}

export function todayXp(p: ProgressState): number {
  return p.days[todayKey()] ?? 0;
}

/** 连续学习天数（今天没学则显示 0 进度但不打断火苗） */
export function streakAlive(p: ProgressState): boolean {
  if (!p.lastDay) return false;
  return daysBetween(p.lastDay, todayKey()) <= 1;
}

export function resetProgress(): ProgressState {
  const p = defaultProgress();
  saveProgress(p);
  return p;
}
