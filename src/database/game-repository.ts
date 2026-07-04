import { db } from "./db";
import type { Game, SourceGameMetadata } from "../types/game";

/** Upsert un jeu et retourne son id, qu'il soit inséré ou mis à jour. */
export async function saveGame(game: Game): Promise<bigint> {
  const rawMetadata = game.rawMetadata ? JSON.stringify(game.rawMetadata) : null;

  const [row] = await db<{ id: string }[]>`
    INSERT INTO games (source, source_id, title, release_year, slug, raw_metadata)
    VALUES (${game.source}, ${game.sourceId}, ${game.title}, ${game.releaseYear ?? null}, ${game.slug ?? null}, ${rawMetadata}::jsonb)
    ON CONFLICT (source, source_id) DO UPDATE SET title = EXCLUDED.title, raw_metadata = EXCLUDED.raw_metadata
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
  const rows = await db<(Omit<Game, "rawMetadata"> & { rawMetadata: string | null })[]>`
    SELECT
      g.source,
      g.source_id AS "sourceId",
      g.title,
      g.release_year AS "releaseYear",
      g.slug,
      g.raw_metadata AS "rawMetadata",
      COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS platforms
    FROM games g
    LEFT JOIN game_platforms gp ON gp.game_id = g.id
    LEFT JOIN platforms p ON p.id = gp.platform_id
    WHERE g.source = ${source}
    GROUP BY g.id
    ORDER BY g.title
  `;

  return rows.map((row) => ({
    ...row,
    rawMetadata: row.rawMetadata
      ? (JSON.parse(row.rawMetadata) as SourceGameMetadata)
      : undefined,
  }));
}

export async function countGames(): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM games
  `;
  return Number(row?.count ?? 0);
}

export interface GameIdentity {
  id: bigint;
  sourceId: string;
  title: string;
}

/** Identités internes (id, sourceId, title) d'une source — pour lier des données annexes (ex: crédits). */
export async function getGameIdentitiesBySource(source: string): Promise<GameIdentity[]> {
  const rows = await db<{ id: string; sourceId: string; title: string }[]>`
    SELECT id, source_id AS "sourceId", title
    FROM games
    WHERE source = ${source}
  `;
  return rows.map((row) => ({ id: BigInt(row.id), sourceId: row.sourceId, title: row.title }));
}

export interface MatchingGame {
  id: bigint;
  source: string;
  sourceId: string;
  title: string;
  releaseYear: number | null;
  platforms: string[];
  rawMetadata?: SourceGameMetadata;
}

/** Toutes les sources, avec plateformes et métadonnées — entrée du matching multi-sources. */
export async function getAllGamesForMatching(): Promise<MatchingGame[]> {
  const rows = await db<
    {
      id: string;
      source: string;
      sourceId: string;
      title: string;
      releaseYear: number | null;
      rawMetadata: string | null;
      platforms: string[];
    }[]
  >`
    SELECT
      g.id,
      g.source,
      g.source_id AS "sourceId",
      g.title,
      g.release_year AS "releaseYear",
      g.raw_metadata AS "rawMetadata",
      COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS platforms
    FROM games g
    LEFT JOIN game_platforms gp ON gp.game_id = g.id
    LEFT JOIN platforms p ON p.id = gp.platform_id
    GROUP BY g.id
  `;

  return rows.map((row) => ({
    ...row,
    id: BigInt(row.id),
    rawMetadata: row.rawMetadata ? (JSON.parse(row.rawMetadata) as SourceGameMetadata) : undefined,
  }));
}
