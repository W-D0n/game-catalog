import { z } from "zod";
import { requireEnv } from "../../config";

const WishlistResponseSchema = z.object({
  response: z.object({
    items: z
      .array(
        z.object({
          appid: z.number(),
        })
      )
      .optional(),
  }),
});

const AppListResponseSchema = z.object({
  response: z.object({
    apps: z.array(
      z.object({
        appid: z.number(),
        name: z.string(),
      })
    ),
    have_more_results: z.boolean().optional(),
    last_appid: z.number().optional(),
  }),
});

const APP_LIST_PAGE_SIZE = 50_000;

export interface SteamWishlistGame {
  appId: number;
  name: string;
}

async function fetchWishlistAppIds(): Promise<number[]> {
  const url = new URL(
    "https://api.steampowered.com/IWishlistService/GetWishlist/v1/"
  );
  url.searchParams.set("key", requireEnv("STEAM_API_KEY"));
  url.searchParams.set("steamid", requireEnv("STEAM_ID64"));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Steam GetWishlist a échoué (HTTP ${response.status})`
    );
  }

  const body: unknown = await response.json();
  const parsed = WishlistResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(
      `Steam GetWishlist : réponse invalide (${parsed.error.message})`
    );
  }

  return (parsed.data.response.items ?? []).map((item) => item.appid);
}

/**
 * L'API GetWishlist ne renvoie que des appid (pas de nom) — on résout les
 * noms via IStoreService/GetAppList, paginé par lots de 50 000 (catalogue
 * Steam complet, ~250k+ apps) jusqu'à épuisement.
 */
async function fetchAppNames(appIds: Set<number>): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  let lastAppId: number | undefined;

  while (names.size < appIds.size) {
    const url = new URL("https://api.steampowered.com/IStoreService/GetAppList/v1/");
    url.searchParams.set("key", requireEnv("STEAM_API_KEY"));
    url.searchParams.set("max_results", String(APP_LIST_PAGE_SIZE));
    if (lastAppId !== undefined) {
      url.searchParams.set("last_appid", String(lastAppId));
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Steam GetAppList a échoué (HTTP ${response.status})`
      );
    }

    const body: unknown = await response.json();
    const parsed = AppListResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error(
        `Steam GetAppList : réponse invalide (${parsed.error.message})`
      );
    }

    for (const app of parsed.data.response.apps) {
      if (appIds.has(app.appid)) names.set(app.appid, app.name);
    }

    if (!parsed.data.response.have_more_results) break;
    lastAppId = parsed.data.response.last_appid;
  }

  return names;
}

/** Récupère la wishlist Steam de l'utilisateur (STEAM_API_KEY/STEAM_ID64), noms résolus via GetAppList. */
export async function fetchSteamWishlist(): Promise<SteamWishlistGame[]> {
  const appIds = await fetchWishlistAppIds();
  if (appIds.length === 0) return [];

  const names = await fetchAppNames(new Set(appIds));

  return appIds.map((appId) => ({
    appId,
    name: names.get(appId) ?? `Steam appid ${appId}`,
  }));
}
