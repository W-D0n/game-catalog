import { db } from "./db";
import type { Game } from "../types/game";

export async function saveGame(game: Game): Promise<void> {
  await db`
    INSERT INTO games (source, source_id, title, release_year, slug)
    VALUES (${game.source}, ${game.sourceId}, ${game.title}, ${game.releaseYear ?? null}, ${game.slug ?? null})
    ON CONFLICT (source, source_id) DO NOTHING
  `;
}
