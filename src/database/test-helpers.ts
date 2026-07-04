import { db } from "./db";

/** Vide les 4 tables entre les tests, sur la base de test isolée (TEST_DATABASE_URL). */
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "resetDatabase : refus de TRUNCATE hors NODE_ENV=test (protection contre un TRUNCATE de la base de production)."
    );
  }

  await db`TRUNCATE game_platforms, games, platforms, import_state, steam_library_games, rawg_game_credits RESTART IDENTITY CASCADE`;
}
