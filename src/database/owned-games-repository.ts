import { db } from "./db";

export async function saveOwnedGame(platform: string, externalId: string, rawTitle: string): Promise<void> {
  await db`
    INSERT INTO owned_games (platform, external_id, raw_title, fetched_at)
    VALUES (${platform}, ${externalId}, ${rawTitle}, NOW())
    ON CONFLICT (platform, external_id) DO UPDATE SET raw_title = EXCLUDED.raw_title, fetched_at = NOW()
  `;
}

export interface OwnedGameSnapshotItem {
  externalId: string;
  rawTitle: string;
}

/** Remplace atomiquement le snapshot d'une plateforme sans toucher aux autres bibliothèques. */
export async function replaceOwnedGamesForPlatform(
  platform: string,
  games: OwnedGameSnapshotItem[]
): Promise<void> {
  await db.begin(async (transaction) => {
    if (games.length === 0) {
      await transaction`DELETE FROM owned_games WHERE platform = ${platform}`;
      return;
    }

    const fetchedAt = new Date();
    const values = games.map((game) => ({
      platform,
      external_id: game.externalId,
      raw_title: game.rawTitle,
      fetched_at: fetchedAt,
    }));

    await transaction`
      INSERT INTO owned_games ${transaction(values)}
      ON CONFLICT (platform, external_id) DO UPDATE SET
        raw_title = EXCLUDED.raw_title,
        fetched_at = EXCLUDED.fetched_at
    `;

    const externalIds = transaction.array(
      games.map((game) => game.externalId),
      "TEXT"
    );
    await transaction`
      DELETE FROM owned_games
      WHERE platform = ${platform} AND external_id <> ALL(${externalIds})
    `;
  });
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

export interface OwnedGameAcrossPlatforms extends OwnedGameForExport {
  platform: string;
}

/** Bibliothèque possédée toutes plateformes confondues — pour les exports qui regroupent par canonical_id (ex: import MyVault). */
export async function getAllOwnedGames(): Promise<OwnedGameAcrossPlatforms[]> {
  const rows = await db<{ platform: string; externalId: string; rawTitle: string; canonicalId: string | null }[]>`
    SELECT platform, external_id AS "externalId", raw_title AS "rawTitle", canonical_id AS "canonicalId"
    FROM owned_games
    ORDER BY platform, raw_title
  `;
  return rows.map((row) => ({
    platform: row.platform,
    externalId: row.externalId,
    rawTitle: row.rawTitle,
    canonicalId: row.canonicalId ? BigInt(row.canonicalId) : null,
  }));
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
