const EDITION_SUFFIXES = [
  "game of the year edition",
  "definitive edition",
  "director's cut",
  "complete edition",
  "remastered",
  "goty",
];

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const TRADEMARK_SYMBOLS = /[™®]/g;

/**
 * Normalisation de titre pour le matching multi-sources (distincte de
 * `normalizeTitle`, utilisée pour la déduplication intra-source). Contrairement
 * à `normalizeTitle`, ne supprime PAS toute la ponctuation — seulement les
 * diacritiques, ™/®, et les suffixes d'édition connus. Le sous-titre après
 * `:` est toujours préservé (`Final Fantasy VII` ≠ `Final Fantasy VII: Remake`).
 */
export function normalizeMatchingTitle(title: string): string {
  let result = title
    .toLowerCase()
    .replace(TRADEMARK_SYMBOLS, "")
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .trim();

  for (const suffix of EDITION_SUFFIXES) {
    const pattern = new RegExp(`[:\\-\\s]*${suffix}\\s*$`, "i");
    result = result.replace(pattern, "");
  }

  return result.replace(/\s+/g, " ").trim();
}
