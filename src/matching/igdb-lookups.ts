/**
 * Tables de lookup IGDB `game_types`/`game_statuses` — vérifiées en direct
 * le 2026-07-05 via `POST /v4/game_types` et `/v4/game_statuses`. Petites
 * tables de référence quasi-permanentes (15 et 8 entrées), curées en dur
 * plutôt que requêtées à chaque run.
 */
const IGDB_GAME_STATUSES: Record<number, string> = {
  0: "Released",
  2: "Alpha",
  3: "Beta",
  4: "Early Access",
  5: "Offline",
  6: "Cancelled",
  7: "Rumored",
  8: "Delisted",
};

export function resolveGameStatus(gameStatus: number | null | undefined): string | null {
  if (gameStatus === null || gameStatus === undefined) return null;
  return IGDB_GAME_STATUSES[gameStatus] ?? null;
}

export type RelationshipType = "remake_of" | "remaster_of" | "dlc_of" | "edition_of" | "parent";

/**
 * Dérive le type de relation (game_relationships) à partir du game_type
 * IGDB de l'enfant, pour une arête vers son parent_game.
 */
export function relationshipTypeFromGameType(gameType: number | null | undefined): RelationshipType {
  switch (gameType) {
    case 8:
      return "remake_of";
    case 9:
      return "remaster_of";
    case 1: // DLC
    case 2: // Expansion
    case 4: // Standalone Expansion
    case 6: // Episode
    case 7: // Season
    case 13: // Pack / Addon
      return "dlc_of";
    default:
      return "parent";
  }
}
