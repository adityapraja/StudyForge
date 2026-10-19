import { config } from '../../config.js';

/**
 * Calculates level and progress breakdown for a given total XP.
 * Level 1 requires 200 XP.
 * Each subsequent level requires 50 more XP than the previous level:
 * Level 1 -> 2: 200 XP
 * Level 2 -> 3: 250 XP
 * Level 3 -> 4: 300 XP
 * Level 4 -> 5: 350 XP
 * Level 5 -> 6: 400 XP
 * (Example: at 1240 XP, level is 5, xp_in_level is 140, xp_for_next_level is 400)
 */
export const getXpBreakdown = (totalXp) => {
  const xp = Math.max(0, totalXp || 0);

  let currentLevel = 1;
  let accumulatedXp = 0;
  let neededForNext = 200;

  while (xp >= accumulatedXp + neededForNext) {
    accumulatedXp += neededForNext;
    currentLevel += 1;
    neededForNext = 200 + (currentLevel - 1) * 50;
  }

  const xpInLevel = xp - accumulatedXp;

  return {
    xp,
    level: currentLevel,
    xp_in_level: xpInLevel,
    xp_for_next_level: neededForNext,
  };
};

/**
 * Calculates XP earned from a study session.
 * 1 XP per focused minute.
 * Manual or unverified sessions earn 0 XP.
 * Capped at 4 hours (240 XP).
 */
export const calculateSessionXp = (studySeconds, isVerified = true) => {
  if (!isVerified || studySeconds <= 0) {
    return 0;
  }

  const focusedMinutes = Math.floor(studySeconds / 60);
  const maxXp = config.sessionXpCapHours * 60; // 240 XP

  return Math.min(maxXp, focusedMinutes);
};

