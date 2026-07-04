import { db } from "./db";
import type { SteamLibraryGame } from "../providers/steam/steam-library-client";

export async function saveLibraryGame(game: SteamLibraryGame): Promise<void> {
  await db`
    INSERT INTO steam_library_games (app_id, name, fetched_at)
    VALUES (${game.appId}, ${game.name}, NOW())
    ON CONFLICT (app_id) DO UPDATE SET name = EXCLUDED.name, fetched_at = NOW()
  `;
}

export async function getLibraryGames(): Promise<SteamLibraryGame[]> {
  const rows = await db<{ app_id: string; name: string }[]>`
    SELECT app_id, name FROM steam_library_games ORDER BY name
  `;
  return rows.map((row) => ({ appId: Number(row.app_id), name: row.name }));
}
