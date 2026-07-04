import { db } from "./db";
import type { Game } from "../types/game";

/** Upsert un jeu et retourne son id, qu'il soit inséré ou mis à jour. */
export async function saveGame(game: Game): Promise<bigint> {
  const [row] = await db<{ id: string }[]>`
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

  return BigInt(row.id);
}

/** Tous les jeux d'une source, plateformes incluses (jointure game_platforms). */
export async function getGamesBySource(source: string): Promise<Game[]> {
  return db<Game[]>`
    SELECT
      g.source,
      g.source_id AS "sourceId",
      g.title,
      g.release_year AS "releaseYear",
      g.slug,
      COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS platforms
    FROM games g
    LEFT JOIN game_platforms gp ON gp.game_id = g.id
    LEFT JOIN platforms p ON p.id = gp.platform_id
    WHERE g.source = ${source}
    GROUP BY g.id
    ORDER BY g.title
  `;
}

export async function countGames(): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM games
  `;
  return Number(row?.count ?? 0);
}
