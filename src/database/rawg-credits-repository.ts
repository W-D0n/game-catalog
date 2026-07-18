import { db } from "./db";
import type { RawgPerson } from "../providers/rawg/rawg-development-team-client";

export async function saveGameCredits(
  gameId: bigint,
  people: RawgPerson[]
): Promise<void> {
  for (const person of people) {
    await db`
      INSERT INTO rawg_game_credits (game_id, rawg_person_id, name, slug, fetched_at)
      VALUES (${gameId}, ${person.id}, ${person.name}, ${person.slug}, NOW())
      ON CONFLICT (game_id, rawg_person_id)
      DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, fetched_at = NOW()
    `;
  }
}

/** Ids des jeux ayant déjà des crédits sauvegardés — pour reprendre un enrichissement interrompu sans regaspiller le quota. */
export async function getGameIdsWithCredits(): Promise<Set<bigint>> {
  const rows = await db<{ game_id: string }[]>`
    SELECT DISTINCT game_id FROM rawg_game_credits
  `;
  return new Set(rows.map((row) => BigInt(row.game_id)));
}

export async function getGameCredits(gameId: bigint): Promise<RawgPerson[]> {
  const rows = await db<{ rawg_person_id: string; name: string; slug: string | null }[]>`
    SELECT rawg_person_id, name, slug FROM rawg_game_credits WHERE game_id = ${gameId} ORDER BY name
  `;
  return rows.map((row) => ({
    id: Number(row.rawg_person_id),
    name: row.name,
    slug: row.slug,
  }));
}

/** Crédits RAWG regroupés par identité canonique, pour les exports de données. */
export async function getRawgCreditsByCanonicalGame(): Promise<Map<string, RawgPerson[]>> {
  const rows = await db<
    { canonicalId: string; rawgPersonId: string; name: string; slug: string | null }[]
  >`
    SELECT DISTINCT
      g.canonical_id AS "canonicalId",
      rc.rawg_person_id AS "rawgPersonId",
      rc.name,
      rc.slug
    FROM rawg_game_credits rc
    JOIN games g ON g.id = rc.game_id
    WHERE g.source = 'rawg' AND g.canonical_id IS NOT NULL
    ORDER BY g.canonical_id, rc.name
  `;

  const creditsByCanonicalGame = new Map<string, RawgPerson[]>();
  for (const row of rows) {
    const people = creditsByCanonicalGame.get(row.canonicalId) ?? [];
    people.push({
      id: Number(row.rawgPersonId),
      name: row.name,
      slug: row.slug,
    });
    creditsByCanonicalGame.set(row.canonicalId, people);
  }

  return creditsByCanonicalGame;
}
