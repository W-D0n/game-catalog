import { db } from "./db";
import type { Game, SourceGameMetadata } from "../types/game";

/**
 * Upsert un jeu et retourne son id, qu'il soit inséré ou mis à jour.
 *
 * `raw_metadata` doit recevoir l'objet JS brut, jamais un `JSON.stringify`
 * manuel : Bun sérialise déjà la valeur pour une colonne jsonb, donc un
 * stringify manuel + `::jsonb` produit un double encodage (le contenu est
 * stocké comme une chaîne JSON scalaire au lieu d'un objet jsonb — invisible
 * en lecture via cette même API car `getGamesBySource`/`getAllGamesForMatching`
 * faisaient un second `JSON.parse` qui compensait, mais cassait tout accès
 * SQL direct comme `raw_metadata->>'champ'`, cf. incident 2026-07-06).
 */
export async function saveGame(game: Game): Promise<bigint> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO games (source, source_id, title, release_year, slug, raw_metadata)
    VALUES (${game.source}, ${game.sourceId}, ${game.title}, ${game.releaseYear ?? null}, ${game.slug ?? null}, ${game.rawMetadata ?? null})
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
  const rows = await db<(Omit<Game, "rawMetadata"> & { rawMetadata: SourceGameMetadata | null })[]>`
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
    rawMetadata: row.rawMetadata ?? undefined,
  }));
}

/**
 * Remet canonical_id à NULL pour des jeux modifiés (sweep incrémental) —
 * force leur ré-enrichissement par build-canonical-projection.ts, qui ne
 * retraite que `canonical_id IS NULL` par design. Voir
 * docs/specs/catalog-update-pipeline.md §5 : effet de bord assumé,
 * réservé au sweep, jamais un reset en masse.
 */
export async function resetCanonicalLinkBulk(gameIds: bigint[]): Promise<void> {
  if (gameIds.length === 0) return;

  const ids = db.array(gameIds.map(String), "BIGINT");
  await db`UPDATE games SET canonical_id = NULL WHERE id = ANY(${ids})`;
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
    ORDER BY id
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
  canonicalId: bigint | null;
}

/** Toutes les sources, avec plateformes, métadonnées et lien canonique existant — entrée du matching multi-sources. */
export async function getAllGamesForMatching(): Promise<MatchingGame[]> {
  const rows = await db<
    {
      id: string;
      source: string;
      sourceId: string;
      title: string;
      releaseYear: number | null;
      rawMetadata: SourceGameMetadata | null;
      platforms: string[];
      canonicalId: string | null;
    }[]
  >`
    SELECT
      g.id,
      g.source,
      g.source_id AS "sourceId",
      g.title,
      g.release_year AS "releaseYear",
      g.raw_metadata AS "rawMetadata",
      g.canonical_id AS "canonicalId",
      COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS platforms
    FROM games g
    LEFT JOIN game_platforms gp ON gp.game_id = g.id
    LEFT JOIN platforms p ON p.id = gp.platform_id
    GROUP BY g.id
  `;

  return rows.map((row) => ({
    ...row,
    id: BigInt(row.id),
    canonicalId: row.canonicalId ? BigInt(row.canonicalId) : null,
    rawMetadata: row.rawMetadata ?? undefined,
  }));
}
