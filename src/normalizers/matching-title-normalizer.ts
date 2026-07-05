/**
 * Liste élargie le 2026-07-05 par comptage empirique des suffixes réellement
 * présents dans le catalogue (799 819 RAWG + 322 337 IGDB) — pas une supposition.
 * "remake" est délibérément exclu : un remake est une œuvre distincte
 * (relation `remake_of`), pas une édition à collapser avec le jeu de base.
 */
const EDITION_SUFFIXES = [
  "game of the year edition",
  "game of the year",
  "definitive edition",
  "director's cut",
  "complete edition",
  "deluxe edition",
  "digital deluxe",
  "collector's edition",
  "ultimate edition",
  "special edition",
  "gold edition",
  "anniversary edition",
  "extended edition",
  "enhanced edition",
  "legendary edition",
  "standard edition",
  "hd edition",
  "remastered",
  "redux",
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

  // Boucle jusqu'à point fixe : des suffixes empilés ("Director's Cut Redux")
  // ne sont retirés en une seule passe que si l'ordre du tableau tombe juste —
  // ré-essayer tant qu'une passe complète a encore retiré quelque chose.
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of EDITION_SUFFIXES) {
      const pattern = new RegExp(`[:\\-\\s]*${suffix}\\s*$`, "i");
      const stripped = result.replace(pattern, "");
      if (stripped !== result) {
        result = stripped;
        changed = true;
      }
    }
  }

  return result.replace(/\s+/g, " ").trim();
}
