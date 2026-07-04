import { db } from "./db";
import type { Game } from "../types/game";

export async function savePlatforms(game: Game, gameId: bigint): Promise<void> {
  for (const platformName of game.platforms) {
    const [platform] = await db<{ id: bigint }[]>`
      INSERT INTO platforms (name)
      VALUES (${platformName})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    await db`
      INSERT INTO game_platforms (game_id, platform_id)
      VALUES (${gameId}, ${platform!.id})
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function countPlatforms(): Promise<number> {
  const [row] = await db<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM platforms
  `;
  return Number(row?.count ?? 0);
}
