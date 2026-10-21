import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACHIEVEMENTS,
  achievementClaimed,
  achievementDone,
  awardGame,
  awardLesson,
  buyEnergy,
  bumpCorrect,
  claimAchievement,
  claimChest,
  claimQuest,
  dailyQuests,
  ENERGY_MAX,
  levelInfo,
  loadProgress,
  loseHeart,
  resetProgress,
  saveProgress,
  syncEnergy,
  type ProgressState,
  type Reward,
  type Settings,
} from './progress';
import { celebrate } from './celebrate';
import { applyReminder, voice } from './native';
import { pick, REMIND } from '../content/oscar';
import { sfx } from './sound';

export interface LessonInput {
  xp: number;
  stars: number;
  mistakes: number;
  accuracy: number;
}

export const LEVEL_UP_GEMS = 30;

export function useGame() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const ref = useRef(progress);

  const apply = useCallback((next: ProgressState) => {
    ref.current = next;
    setProgress(next);
  }, []);

  /** 结算后统一检查成就：解锁即自动发放，省得玩家点来点去 */
  const commit = useCallback(
    (next: ProgressState) => {
      let state = next;
      const unlocked = [];
      for (const a of ACHIEVEMENTS) {
        if (achievementDone(state, a) && !achievementClaimed(state, a)) {
          const r = claimAchievement(state, a);
          state = r.state;
          unlocked.push(a);
        }
      }
      apply(state);
      unlocked.forEach((a) => celebrate.achievement(a.name, a.desc, a.gems, a.emoji));
      return state;
    },
    [apply],
  );

  /* 体力自动恢复 */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { state, gained } = syncEnergy(ref.current);
      if (gained > 0) apply(state);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [apply]);

  /* 持久化 + 偏好同步 */
  useEffect(() => {
    saveProgress(progress);
    sfx.enabled = progress.settings.sound;
    voice.enabled = progress.settings.voice;
  }, [progress]);

  /* 每日提醒：内容每次启动重新抽一句，避免天天一样 */
  useEffect(() => {
    if (!progress.settings.reminder) {
      applyReminder(null);
      return;
    }
    const line = pick('remind', REMIND);
    applyReminder({ hour: progress.settings.reminderHour, title: '奥斯卡喊你下棋了', body: line.t });
  }, [progress.settings.reminder, progress.settings.reminderHour]);

  const finishLesson = useCallback(
    (lessonId: string, input: LessonInput): Reward => {
      const { state, reward } = awardLesson(ref.current, lessonId, input);
      let next = state;
      if (reward.levelUp) next = { ...next, gems: next.gems + LEVEL_UP_GEMS };
      commit(next);
      if (reward.levelUp) celebrate.levelUp(reward.levelUp.level, reward.levelUp.title);
      return reward;
    },
    [commit],
  );

  const finishGame = useCallback(
    (result: 'win' | 'lose' | 'draw') => {
      const { state, reward } = awardGame(ref.current, result);
      let next = state;
      if (reward.levelUp) next = { ...next, gems: next.gems + LEVEL_UP_GEMS };
      commit(next);
      if (reward.levelUp) celebrate.levelUp(reward.levelUp.level, reward.levelUp.title);
      return reward;
    },
    [commit],
  );

  const loseOneHeart = useCallback((): { energy: number; empty: boolean } => {
    const { state, energy, empty } = loseHeart(ref.current);
    apply(state);
    return { energy, empty };
  }, [apply]);

  const refill = useCallback((): boolean => {
    const { state, ok } = buyEnergy(ref.current);
    if (ok) apply(state);
    return ok;
  }, [apply]);

  const addCorrect = useCallback(() => {
    apply(bumpCorrect(ref.current));
  }, [apply]);

  const spendGems = useCallback(
    (cost: number): boolean => {
      if (ref.current.gems < cost) return false;
      apply({ ...ref.current, gems: ref.current.gems - cost });
      return true;
    },
    [apply],
  );

  const openChest = useCallback((): number => {
    const { state, ok, gems } = claimChest(ref.current);
    if (ok) {
      apply(state);
      celebrate.reward('每日宝箱', '+35 宝石，顺手也把你的棋瘾喂了一口。', '🎁', gems);
    }
    return ok ? gems : 0;
  }, [apply]);

  const takeQuest = useCallback(
    (id: string): number => {
      const quest = dailyQuests().find((q) => q.id === id);
      if (!quest) return 0;
      const { state, ok, gems } = claimQuest(ref.current, quest);
      if (ok) {
        apply(state);
        celebrate.reward('任务完成', quest.label, '✅', gems);
      }
      return ok ? gems : 0;
    },
    [apply],
  );

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      apply({ ...ref.current, settings: { ...ref.current.settings, ...patch } });
    },
    [apply],
  );

  const reset = useCallback(() => {
    apply(resetProgress());
  }, [apply]);

  const lv = levelInfo(progress.xp);

  return {
    progress,
    level: lv,
    finishLesson,
    finishGame,
    loseOneHeart,
    refill,
    addCorrect,
    spendGems,
    openChest,
    takeQuest,
    patchSettings,
    reset,
    energyFull: progress.energy >= ENERGY_MAX,
  };
}

export type Game = ReturnType<typeof useGame>;
