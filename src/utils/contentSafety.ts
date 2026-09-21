// src/utils/contentSafety.ts

const BLOCKED_WORDS = [
  'porn', 'sex', 'xxx', 'x-x-x', 'brazzers', 'xart', 'x-art', 'nympho', 'adult',
  'cum', 'creampie', 'squirting', 'gangbang', 'onlyfans', 'ass', 'asses', 'boobs',
  'tits', 'pornographic', 'sexually', 'rape', 'hentai', 'naughty', 'nude',
  'naughtyamerica', 'milf', 'uncensored', 'jav', 'sukebei', 'erotica', 'incest',
  'teens', 'pussy', 'dick', 'cock', 'blowjob', 'naked', '.xxx.', 'stepsister',
  'stepmom', 'stepbrother', 'stepdaughter', 'stepdad', 'vixen', 'fetish',
  'blacked', 'bbc', 'anal', 'squirt',
];

export const containsAdultContent = (...values: unknown[]): boolean => {
  return values.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.toLowerCase();
    return BLOCKED_WORDS.some((word) => normalized.includes(word));
  });
};

export const isAdultContent = (item: any): boolean =>
  item?.adult === true || containsAdultContent(item?.title, item?.name, item?.overview);
