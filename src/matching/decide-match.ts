import { computePlatformOverlap } from "../normalizers/platform-normalizer";

export interface MatchableGame {
  title: string;
  releaseYear: number | null;
  platforms: string[];
}

export type MatchDecision = "merge" | "pending_review";

export interface MatchResult {
  decision: MatchDecision;
  yearDiff: number | null;
  platformOverlap: number;
  reason: string;
}

/**
 * Décide si deux jeux déjà groupés par la même clé de blocking (titre exact
 * normalisé) doivent être fusionnés automatiquement ou mis en revue.
 * Seuils calibrés le 2026-07-04 sur les vraies collisions RAWG×IGDB — voir
 * docs/specs/multi-source-matching.md §5 étape 4.
 */
export function decideMatch(gameA: MatchableGame, gameB: MatchableGame): MatchResult {
  const yearDiff =
    gameA.releaseYear !== null && gameB.releaseYear !== null
      ? Math.abs(gameA.releaseYear - gameB.releaseYear)
      : null;

  const platformOverlap = computePlatformOverlap(gameA.platforms, gameB.platforms);

  if (yearDiff !== null && yearDiff <= 1 && platformOverlap > 0) {
    return {
      decision: "merge",
      yearDiff,
      platformOverlap,
      reason: "titre exact + année exacte ou ±1 + recouvrement de plateformes",
    };
  }

  if (yearDiff === null) {
    return {
      decision: "pending_review",
      yearDiff,
      platformOverlap,
      reason: "titre exact mais année absente d'un côté",
    };
  }

  if (platformOverlap === 0) {
    return {
      decision: "pending_review",
      yearDiff,
      platformOverlap,
      reason: "titre exact mais aucun recouvrement de plateformes",
    };
  }

  return {
    decision: "pending_review",
    yearDiff,
    platformOverlap,
    reason: "titre exact mais écart d'année > 1 an (remake potentiel ou titre générique)",
  };
}
