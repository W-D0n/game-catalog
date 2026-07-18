import { db } from "./db";
import type { RawgPerson } from "../providers/rawg/rawg-development-team-client";
import type { MatchingGame } from "./game-repository";

export const RAWG_ENRICHMENT_STATUSES = ["not_found", "completed"] as const;
export type RawgEnrichmentStatus = (typeof RAWG_ENRICHMENT_STATUSES)[number];

export interface RawgEnrichmentCandidate {
  id: string;
  title: string;
  releaseYear: number | null;
}

/** Titres canoniques bornés au snapshot de possession déjà persisté. */
export async function getOwnedRawgEnrichmentCandidates(): Promise<RawgEnrichmentCandidate[]> {
  return db<RawgEnrichmentCandidate[]>`
    SELECT DISTINCT
      cg.id,
      cg.title,
      cg.release_year AS "releaseYear"
    FROM canonical_games cg
    JOIN owned_games og ON og.canonical_id = cg.id
    ORDER BY cg.id
  `;
}

/** Jeux RAWG déjà liés aux seuls canonical games réellement possédés. */
export async function getOwnedLinkedRawgGames(): Promise<MatchingGame[]> {
  const rows = await db<
    {
      id: string;
      source: string;
      sourceId: string;
      title: string;
      releaseYear: number | null;
      rawMetadata: MatchingGame["rawMetadata"] | null;
      platforms: string[];
      canonicalId: string;
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
    JOIN (
      SELECT DISTINCT canonical_id
      FROM owned_games
      WHERE canonical_id IS NOT NULL
    ) owned ON owned.canonical_id = g.canonical_id
    LEFT JOIN game_platforms gp ON gp.game_id = g.id
    LEFT JOIN platforms p ON p.id = gp.platform_id
    WHERE g.source = 'rawg'
    GROUP BY g.id
    ORDER BY g.id
  `;

  return rows.map((row) => ({
    ...row,
    id: BigInt(row.id),
    canonicalId: BigInt(row.canonicalId),
    rawMetadata: row.rawMetadata ?? undefined,
  }));
}

/** Lien courant d'une identité RAWG précise, sans charger le catalogue. */
export async function getRawgCanonicalIdBySourceId(
  sourceId: string
): Promise<bigint | null | undefined> {
  const [row] = await db<{ canonicalId: string | null }[]>`
    SELECT canonical_id AS "canonicalId"
    FROM games
    WHERE source = 'rawg' AND source_id = ${sourceId}
  `;
  if (row === undefined) return undefined;
  return row.canonicalId === null ? null : BigInt(row.canonicalId);
}

/** Migration explicite et idempotente; schema.sql reste la source des bases neuves. */
export async function migrateRawgEnrichmentStateSchema(
  connection: typeof db = db
): Promise<void> {
  await connection`
    CREATE TABLE IF NOT EXISTS rawg_enrichment_state (
      canonical_id BIGINT PRIMARY KEY REFERENCES canonical_games(id) ON DELETE CASCADE,
      rawg_game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('not_found', 'completed')),
      searched_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CHECK (
        (status = 'completed' AND rawg_game_id IS NOT NULL)
        OR (status = 'not_found' AND rawg_game_id IS NULL)
      )
    )
  `;
  await connection`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rawg_enrichment_state_game_id
    ON rawg_enrichment_state (rawg_game_id)
    WHERE rawg_game_id IS NOT NULL
  `;
}

export async function getRawgEnrichmentStates(): Promise<Map<string, RawgEnrichmentStatus>> {
  const rows = await db<{ canonicalId: string; status: RawgEnrichmentStatus }[]>`
    SELECT canonical_id AS "canonicalId", status
    FROM rawg_enrichment_state
  `;
  return new Map(rows.map((row) => [row.canonicalId, row.status]));
}

export async function markRawgGameNotFound(canonicalId: bigint): Promise<void> {
  await db`
    INSERT INTO rawg_enrichment_state (canonical_id, rawg_game_id, status, searched_at)
    VALUES (${canonicalId}, NULL, 'not_found', NOW())
    ON CONFLICT (canonical_id) DO UPDATE SET
      rawg_game_id = NULL,
      status = 'not_found',
      searched_at = NOW()
  `;
}

/** Persiste toute l'équipe et l'état completed dans une même transaction. */
export async function saveRawgCreditsAndMarkCompleted(
  canonicalId: bigint,
  gameId: bigint,
  people: RawgPerson[]
): Promise<void> {
  await db.begin(async (transaction) => {
    if (people.length > 0) {
      const values = people.map((person) => ({
        game_id: gameId,
        rawg_person_id: person.id,
        name: person.name,
        slug: person.slug,
        fetched_at: new Date(),
      }));
      await transaction`
        INSERT INTO rawg_game_credits ${transaction(values)}
        ON CONFLICT (game_id, rawg_person_id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          fetched_at = EXCLUDED.fetched_at
      `;
    }

    await transaction`
      INSERT INTO rawg_enrichment_state (canonical_id, rawg_game_id, status, searched_at)
      VALUES (${canonicalId}, ${gameId}, 'completed', NOW())
      ON CONFLICT (canonical_id) DO UPDATE SET
        rawg_game_id = EXCLUDED.rawg_game_id,
        status = 'completed',
        searched_at = NOW()
    `;
  });
}
