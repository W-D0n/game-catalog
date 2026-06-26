import { db } from "./db";
import type { Game } from "../types/game";

/** Upsert un jeu et retourne son id, qu'il soit inséré ou mis à jour. */
export async function saveGame(game: Game): Promise<bigint> {
  const [row] = await db<{ id: bigint }[]>`
    INSERT INTO games (source, source_id, title, release_year, slug)
    VALUES (${game.source}, ${game.sourceId}, ${game.title}, ${game.releaseYear ?? null}, ${game.slug ?? null})
    ON CONFLICT (source, source_id) DO UPDATE SET title = EXCLUDED.title
    RETURNING id
  `;

  if (row === undefined) {
    throw new Error(
      `saveGame : aucune ligne retournée pour ${game.source}:${game.sourceId}`
    );
  }

  return row.id;
}
