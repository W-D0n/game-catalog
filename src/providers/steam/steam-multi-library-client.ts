import { z } from "zod";
import { requireEnv } from "../../config";

const MAX_RETRIES = 5;

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url: URL): Promise<unknown> {
  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return await response.json();
      }

      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Steam a répondu HTTP ${response.status} (non retriable)`);
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      if (error instanceof Error && error.message.includes("non retriable")) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
    await backoffDelay(attempt);
  }

  throw new Error(`Steam : échec après ${MAX_RETRIES} tentatives (${lastError})`);
}

const PlayerSummarySchema = z.object({
  response: z.object({
    players: z
      .array(
        z.object({
          steamid: z.string(),
          personaname: z.string(),
          communityvisibilitystate: z.number(),
        })
      )
      .optional(),
  }),
});

export interface SteamPlayerSummary {
  steamId64: string;
  personaName: string;
  isPublic: boolean;
}

/** Résumé public d'un joueur — visibilité (`communityvisibilitystate`, 3 = public) avant toute tentative de lecture de sa bibliothèque. */
export async function fetchPlayerSummary(steamId64: string): Promise<SteamPlayerSummary | null> {
  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
  url.searchParams.set("key", requireEnv("STEAM_API_KEY"));
  url.searchParams.set("steamids", steamId64);

  const body = await fetchJsonWithRetry(url);
  const parsed = PlayerSummarySchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(`Steam GetPlayerSummaries : réponse invalide (${parsed.error.message})`);
  }

  const player = parsed.data.response.players?.[0];
  if (!player) return null;

  return {
    steamId64: player.steamid,
    personaName: player.personaname,
    isPublic: player.communityvisibilitystate === 3,
  };
}

const OwnedGamesSchema = z.object({
  response: z.object({
    games: z
      .array(
        z.object({
          appid: z.number(),
          name: z.string(),
        })
      )
      .optional(),
  }),
});

export interface SteamOwnedGame {
  appId: number;
  name: string;
}

/** Bibliothèque d'un joueur donné (nécessite un profil public, cf. fetchPlayerSummary). */
export async function fetchOwnedGamesForPlayer(steamId64: string): Promise<SteamOwnedGame[]> {
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
  url.searchParams.set("key", requireEnv("STEAM_API_KEY"));
  url.searchParams.set("steamid", steamId64);
  url.searchParams.set("format", "json");
  url.searchParams.set("include_appinfo", "true");

  const body = await fetchJsonWithRetry(url);
  const parsed = OwnedGamesSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(`Steam GetOwnedGames : réponse invalide (${parsed.error.message})`);
  }

  return (parsed.data.response.games ?? []).map((game) => ({
    appId: game.appid,
    name: game.name,
  }));
}
