import type { CanonicalGameExport } from "../database/canonical-repository";
import { normalizeMatchingTitle } from "../normalizers/matching-title-normalizer";
import { normalizePlatformName } from "../normalizers/platform-normalizer";

export type CanonicalTitleIndex = Map<string, CanonicalGameExport[]>;

/** Index les canonical games par titre normalisé, pour un lookup O(1) répété (bibliothèque possédée, wishlist, croisement). */
export function buildCanonicalTitleIndex(canonicalGames: CanonicalGameExport[]): CanonicalTitleIndex {
  const index: CanonicalTitleIndex = new Map();
  for (const game of canonicalGames) {
    const key = normalizeMatchingTitle(game.title);
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(game);
  }
  return index;
}

function isPcCandidate(game: CanonicalGameExport): boolean {
  return game.platforms.some((p) => normalizePlatformName(p) === "PC");
}

export interface TitleMatchResult {
  matched: boolean;
  canonicalGame: CanonicalGameExport | null;
  ambiguousCandidates: number;
}

/**
 * Cherche un canonical game par titre normalisé. Les jeux externes (Steam,
 * wishlist...) sont toujours PC — utilisé pour désambiguïser quand plusieurs
 * canonical games partagent le même titre normalisé (ex. plusieurs jeux
 * nommés "Chess").
 */
export function matchTitleToCanonical(index: CanonicalTitleIndex, rawTitle: string): TitleMatchResult {
  const key = normalizeMatchingTitle(rawTitle);
  const candidates = index.get(key) ?? [];

  if (candidates.length === 0) {
    return { matched: false, canonicalGame: null, ambiguousCandidates: 0 };
  }

  const pcCandidates = candidates.filter(isPcCandidate);
  const chosen = pcCandidates[0] ?? candidates[0]!;

  return { matched: true, canonicalGame: chosen, ambiguousCandidates: candidates.length - 1 };
}
