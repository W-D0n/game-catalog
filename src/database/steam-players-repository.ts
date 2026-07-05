import { db } from "./db";
import type { SteamOwnedGame, SteamPlayerSummary } from "../providers/steam/steam-multi-library-client";

export async function savePlayer(player: SteamPlayerSummary): Promise<void> {
  await db`
    INSERT INTO steam_players (steam_id64, persona_name, is_public, fetched_at)
    VALUES (${player.steamId64}, ${player.personaName}, ${player.isPublic}, NOW())
    ON CONFLICT (steam_id64) DO UPDATE SET
      persona_name = EXCLUDED.persona_name,
      is_public = EXCLUDED.is_public,
      fetched_at = NOW()
  `;
}

/** Remplace entièrement la bibliothèque connue d'un joueur (source de vérité = dernier fetch). */
export async function saveOwnedGames(steamId64: string, games: SteamOwnedGame[]): Promise<void> {
  await db`DELETE FROM steam_player_games WHERE steam_id64 = ${steamId64}`;
  if (games.length === 0) return;

  const values = games.map((g) => ({ steam_id64: steamId64, app_id: g.appId, name: g.name }));
  await db`INSERT INTO steam_player_games ${db(values)}`;
}
