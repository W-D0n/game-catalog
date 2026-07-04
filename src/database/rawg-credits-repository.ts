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
