import { z } from "zod";
import { requireEnv } from "../../config";
import type { OwnedGamesClient } from "../owned-games-client";

const ItchioGameSchema = z.object({
  id: z.number(),
  title: z.string(),
});

const ItchioOwnedKeySchema = z.object({
  game: ItchioGameSchema,
});

/** `owned_keys` est un tableau tant qu'il reste des jeux, un objet vide `{}` une fois la dernière page dépassée. */
const ItchioOwnedKeysResponseSchema = z.object({
  owned_keys: z.union([z.array(ItchioOwnedKeySchema), z.record(z.string(), z.never())]),
});

export interface ItchioLibraryGame {
  gameId: number;
  title: string;
}

async function fetchOwnedKeysPage(page: number): Promise<ItchioLibraryGame[]> {
  const url = new URL("https://api.itch.io/profile/owned-keys");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requireEnv("ITCHIO_API_KEY")}` },
  });

  if (!response.ok) {
    throw new Error(`itch.io profile/owned-keys a échoué (HTTP ${response.status})`);
  }

  const body: unknown = await response.json();
  const parsed = ItchioOwnedKeysResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(`itch.io profile/owned-keys : réponse invalide (${parsed.error.message})`);
  }

  const ownedKeys = Array.isArray(parsed.data.owned_keys) ? parsed.data.owned_keys : [];
  return ownedKeys.map((key) => ({ gameId: key.game.id, title: key.game.title }));
}

/** Récupère la bibliothèque itch.io de l'utilisateur (ITCHIO_API_KEY), paginée jusqu'à page vide. */
export async function fetchItchioLibrary(): Promise<ItchioLibraryGame[]> {
  const games: ItchioLibraryGame[] = [];
  let page = 1;

  while (true) {
    const pageGames = await fetchOwnedKeysPage(page);
    if (pageGames.length === 0) break;
    games.push(...pageGames);
    page += 1;
  }

  return games;
}

export const itchioOwnedGamesClient: OwnedGamesClient = {
  platform: "itchio",
  async fetchLibrary() {
    const games = await fetchItchioLibrary();
    return games.map((game) => ({
      externalId: String(game.gameId),
      rawTitle: game.title,
    }));
  },
};
