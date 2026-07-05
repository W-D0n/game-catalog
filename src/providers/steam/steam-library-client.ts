import { z } from "zod";
import { requireEnv } from "../../config";

const SteamOwnedGameSchema = z.object({
  appid: z.number(),
  name: z.string(),
});

const SteamOwnedGamesResponseSchema = z.object({
  response: z.object({
    game_count: z.number(),
    games: z.array(SteamOwnedGameSchema).optional(),
  }),
});

export interface SteamLibraryGame {
  appId: number;
  name: string;
}

/** Récupère la bibliothèque Steam de l'utilisateur (STEAM_API_KEY/STEAM_ID64). */
export async function fetchSteamLibrary(): Promise<SteamLibraryGame[]> {
  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/"
  );
  url.searchParams.set("key", requireEnv("STEAM_API_KEY"));
  url.searchParams.set("steamid", requireEnv("STEAM_ID64"));
  url.searchParams.set("format", "json");
  url.searchParams.set("include_appinfo", "true");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Steam GetOwnedGames a échoué (HTTP ${response.status})`
    );
  }

  const body: unknown = await response.json();
  const parsed = SteamOwnedGamesResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(
      `Steam GetOwnedGames : réponse invalide (${parsed.error.message})`
    );
  }

  return (parsed.data.response.games ?? []).map((game) => ({
    appId: game.appid,
    name: game.name,
  }));
}
