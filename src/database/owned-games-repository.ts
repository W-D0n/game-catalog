import { db } from "./db";

export async function saveOwnedGame(platform: string, externalId: string, rawTitle: string): Promise<void> {
  await db`
    INSERT INTO owned_games (platform, external_id, raw_title, fetched_at)
    VALUES (${platform}, ${externalId}, ${rawTitle}, NOW())
    ON CONFLICT (platform, external_id) DO UPDATE SET raw_title = EXCLUDED.raw_title, fetched_at = NOW()
  `;
}

export interface UnmatchedOwnedGame {
  id: bigint;
  rawTitle: string;
}

/** Jeux possédés pas encore liés à un canonical game — entrée de matchOwnedGames(), incrémental. */
export async function getUnmatchedOwnedGames(): Promise<UnmatchedOwnedGame[]> {
  const rows = await db<{ id: string; rawTitle: string }[]>`
    SELECT id, raw_title AS "rawTitle" FROM owned_games WHERE canonical_id IS NULL
  `;
  return rows.map((row) => ({ id: BigInt(row.id), rawTitle: row.rawTitle }));
}

export interface OwnedGameCanonicalLink {
  ownedGameId: bigint;
  canonicalId: bigint;
}

export async function linkOwnedGamesToCanonicalBulk(links: OwnedGameCanonicalLink[]): Promise<void> {
  if (links.length === 0) return;

  const ownedGameIds = db.array(links.map((l) => l.ownedGameId.toString()), "BIGINT");
  const canonicalIds = db.array(links.map((l) => l.canonicalId.toString()), "BIGINT");

  await db`
    UPDATE owned_games AS o
    SET canonical_id = v.canonical_id
    FROM (SELECT unnest(${ownedGameIds}) AS owned_game_id, unnest(${canonicalIds}) AS canonical_id) AS v
    WHERE o.id = v.owned_game_id
  `;
}

export interface OwnedGameForExport {
  externalId: string;
  rawTitle: string;
  canonicalId: bigint | null;
}

/** Bibliothèque possédée d'une plateforme, matching déjà résolu (canonical_id persisté) — aucun recalcul à l'export. */
export async function getOwnedGamesByPlatform(platform: string): Promise<OwnedGameForExport[]> {
  const rows = await db<{ externalId: string; rawTitle: string; canonicalId: string | null }[]>`
    SELECT external_id AS "externalId", raw_title AS "rawTitle", canonical_id AS "canonicalId"
    FROM owned_games
    WHERE platform = ${platform}
    ORDER BY raw_title
  `;
  return rows.map((row) => ({
    externalId: row.externalId,
    rawTitle: row.rawTitle,
    canonicalId: row.canonicalId ? BigInt(row.canonicalId) : null,
  }));
}
