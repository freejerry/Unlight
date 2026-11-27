// Flash Const.QUEST_MAP_NUM orders the six normal pages independently of the CSV `region` field.
const ORDINARY_PAGE_SIZES = [3, 8, 8, 8, 8, 1];
const ORDINARY_CAP = 35;
const TUTORIAL_START = 2008;
const TUTORIAL_CAP = 2012;

// The original preview uses GetSendPanel's nominal labels and Ruby QFT_SET seconds.
export const QUEST_SEARCH_TIMES = Object.freeze([
  ['0分', 0], ['3分', 180], ['10分', 600], ['30分', 1800], ['1小時', 3600],
  ['2小時', 7200], ['4小時', 14400], ['8小時', 28800], ['16小時', 57600],
  ['1天', 86400], ['3天', 259200],
].map(([label, seconds], index) => Object.freeze({ index, label, seconds })));
export const DEFAULT_QUEST_SEARCH_TIME = 0;

export function ordinaryQuestRegions(questFlag) {
  if (!Number.isInteger(questFlag) || questFlag < 0) return [];
  const newestMap = Math.min(questFlag, ORDINARY_CAP) + 1;
  const regions = [];
  let first = 1;
  for (const [index, size] of ORDINARY_PAGE_SIZES.entries()) {
    if (first > newestMap) break;
    const count = Math.min(size, newestMap - first + 1);
    regions.push({ index, mapIds: Array.from({ length: count }, (_, offset) => first + offset) });
    first += size;
  }
  return regions;
}

export function ordinaryQuestProgressMap(questFlag) {
  return Number.isInteger(questFlag) && questFlag >= 0 && questFlag < ORDINARY_CAP ? questFlag + 1 : null;
}

export function tutorialQuestRegion(questFlag) {
  if (!Number.isInteger(questFlag) || questFlag < TUTORIAL_START) return null;
  const count = Math.min(questFlag, TUTORIAL_CAP) - TUTORIAL_START + 1;
  return { index: 0, mapIds: Array.from({ length: count }, (_, offset) => TUTORIAL_START + 1 + offset) };
}

export function tutorialQuestProgressMap(questFlag) {
  return Number.isInteger(questFlag) && questFlag >= TUTORIAL_START && questFlag < TUTORIAL_CAP ? questFlag + 1 : null;
}
