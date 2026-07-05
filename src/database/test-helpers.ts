import { db } from "./db";

/** Vide toutes les tables entre les tests, sur la base de test isolée (TEST_DATABASE_URL). */
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "resetDatabase : refus de TRUNCATE hors NODE_ENV=test (protection contre un TRUNCATE de la base de production)."
    );
  }

  await db`
    TRUNCATE
      game_platforms, games, platforms, import_state,
      steam_library_games, rawg_game_credits,
      game_companies, companies, game_relationships,
      canonical_game_genres, genres, canonical_games
    CASCADE
  `;
}
