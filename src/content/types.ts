import type { Color } from '../game/types';

export type MarkKind = 'cross' | 'ring' | 'dot' | 'star';

export interface Mark {
  at: number;
  kind: MarkKind;
}

export interface ArrowMark {
  from: number;
  to: number;
  kind?: 'good' | 'bad' | 'info';
}

interface BoardVisual {
  /** 10 行 × 9 列的可视化局面 */
  layout?: string[];
  turn?: Color;
  /** 高亮格（淡黄光晕） */
  highlight?: number[];
  marks?: Mark[];
  arrows?: ArrowMark[];
}

export interface InfoStep extends BoardVisual {
  kind: 'info';
  title: string;
  body: string;
  /** 底部浅色小贴士 */
  tip?: string;
}

export interface ChoiceStep extends BoardVisual {
  kind: 'choice';
  question: string;
  options: Array<{ text: string; correct?: boolean }>;
  explain: string;
}

interface BoardTask extends BoardVisual {
  layout: string[];
  turn: Color;
  prompt: string;
  hint?: string;
  hintSquares?: number[];
  explain?: string;
  /** 允许题目起点就处于被将军状态（应将类题目） */
  allowCheck?: boolean;
}

/** 走出指定着法（solutions 为空且 goal 为 mate/check 时按目标判定） */
export interface MoveStep extends BoardTask {
  kind: 'move';
  goal?: 'mate' | 'check' | 'any';
  solutions?: Array<[number, number]>;
}

/** 把某个棋子走到目标格（任一目标格均可） */
export interface ReachStep extends BoardTask {
  kind: 'reach';
  pieceAt: number;
  targets: number[];
}

/** 吃掉目标格上的棋子 */
export interface CaptureStep extends BoardTask {
  kind: 'capture';
  target: number;
}

export type Step = InfoStep | ChoiceStep | MoveStep | ReachStep | CaptureStep;

export type UnitColor = 'green' | 'blue' | 'purple' | 'orange' | 'teal' | 'pink';

/** 普通课程 / 单元末尾的限时吃子冲刺 */
export type LessonKind = 'lesson' | 'drill';

export interface DrillBoard {
  /** 10 行 × 9 列的可视化局面，双方都将帅在场（引擎要求） */
  layout: string[];
}

export interface DrillConfig {
  /** 限时秒数 */
  seconds: number;
  /** 过关所需吃子数 */
  goal: number;
  /** 场上可吃的敌子总数（全吃完 = 三星） */
  total: number;
  /** 多个局面随机开一局，重玩不腻 */
  boards: DrillBoard[];
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  icon: string;
  xp: number;
  steps: Step[];
  kind?: LessonKind;
  drill?: DrillConfig;
}

export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  color: UnitColor;
  lessons: Lesson[];
}

export const UNIT_COLORS: Record<UnitColor, { main: string; dark: string; soft: string }> = {
  green: { main: '#58CC02', dark: '#46A302', soft: '#E8F8D8' },
  blue: { main: '#1CB0F6', dark: '#1587BE', soft: '#DDF4FF' },
  purple: { main: '#CE82FF', dark: '#A56CD1', soft: '#F7EBFF' },
  orange: { main: '#FF9600', dark: '#CC7800', soft: '#FFF0D9' },
  teal: { main: '#00C2A8', dark: '#009B86', soft: '#D9FAF4' },
  pink: { main: '#FF6FAE', dark: '#CC598B', soft: '#FFE7F2' },
};
