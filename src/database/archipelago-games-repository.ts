import { db } from "./db";

export type ArchipelagoSource = "official" | "wiki";

export async function saveArchipelagoGame(source: ArchipelagoSource, rawTitle: string): Promise<void> {
  await db`
    INSERT INTO archipelago_games (source, raw_title, fetched_at)
    VALUES (${source}, ${rawTitle}, NOW())
    ON CONFLICT (source, raw_title) DO UPDATE SET fetched_at = NOW()
  `;
}

export interface UnmatchedArchipelagoGame {
  id: bigint;
  rawTitle: string;
}

/** Jeux Archipelago pas encore liés à un canonical game — entrée de matchArchipelagoGames(), incrémental. */
export async function getUnmatchedArchipelagoGames(): Promise<UnmatchedArchipelagoGame[]> {
  const rows = await db<{ id: string; rawTitle: string }[]>`
    SELECT id, raw_title AS "rawTitle" FROM archipelago_games WHERE canonical_id IS NULL
  `;
  return rows.map((row) => ({ id: BigInt(row.id), rawTitle: row.rawTitle }));
}

export interface ArchipelagoGameCanonicalLink {
  archipelagoGameId: bigint;
  canonicalId: bigint;
}

export async function linkArchipelagoGamesToCanonicalBulk(links: ArchipelagoGameCanonicalLink[]): Promise<void> {
  if (links.length === 0) return;

  const archipelagoGameIds = db.array(links.map((l) => l.archipelagoGameId.toString()), "BIGINT");
  const canonicalIds = db.array(links.map((l) => l.canonicalId.toString()), "BIGINT");

  await db`
    UPDATE archipelago_games AS a
    SET canonical_id = v.canonical_id
    FROM (SELECT unnest(${archipelagoGameIds}) AS archipelago_game_id, unnest(${canonicalIds}) AS canonical_id) AS v
    WHERE a.id = v.archipelago_game_id
  `;
}

/** Ensemble des canonical_id ready Archipelago (au moins une source, matching résolu) — pour le champ dérivé d'export. */
export async function getReadyCanonicalIds(): Promise<Set<string>> {
  const rows = await db<{ canonicalId: string }[]>`
    SELECT DISTINCT canonical_id AS "canonicalId" FROM archipelago_games WHERE canonical_id IS NOT NULL
  `;
  return new Set(rows.map((row) => row.canonicalId));
}
