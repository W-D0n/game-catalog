import { afterEach, describe, expect, test } from "bun:test";
import { fetchSteamWishlist } from "./steam-wishlist-client";

describe("fetchSteamWishlist", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(
    wishlistItems: { appid: number }[],
    appListPages: { appid: number; name: string }[][]
  ): typeof fetch {
    let appListCall = 0;
    return ((url: string | URL) => {
      const href = url.toString();
      if (href.includes("GetWishlist")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ response: { items: wishlistItems } }),
            { status: 200 }
          )
        );
      }
      const page = appListPages[appListCall] ?? [];
      const hasMore = appListCall < appListPages.length - 1;
      appListCall++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              apps: page,
              have_more_results: hasMore,
              last_appid: page.at(-1)?.appid,
            },
          }),
          { status: 200 }
        )
      );
    }) as unknown as typeof fetch;
  }

  test("[fetchSteamWishlist] résout les noms via GetAppList sur une seule page", async () => {
    global.fetch = mockFetch(
      [{ appid: 70 }, { appid: 220 }],
      [
        [
          { appid: 70, name: "Half-Life" },
          { appid: 220, name: "Half-Life 2" },
        ],
      ]
    );

    const games = await fetchSteamWishlist();

    expect(games).toEqual([
      { appId: 70, name: "Half-Life" },
      { appId: 220, name: "Half-Life 2" },
    ]);
  });

  test("[fetchSteamWishlist] pagine GetAppList sur plusieurs pages", async () => {
    global.fetch = mockFetch(
      [{ appid: 70 }, { appid: 999 }],
      [[{ appid: 70, name: "Half-Life" }], [{ appid: 999, name: "Portal" }]]
    );

    const games = await fetchSteamWishlist();

    expect(games).toEqual([
      { appId: 70, name: "Half-Life" },
      { appId: 999, name: "Portal" },
    ]);
  });

  test("[fetchSteamWishlist] appid non résolu retombe sur un nom générique", async () => {
    global.fetch = mockFetch([{ appid: 12345 }], [[]]);

    const games = await fetchSteamWishlist();

    expect(games).toEqual([{ appId: 12345, name: "Steam appid 12345" }]);
  });

  test("[fetchSteamWishlist] wishlist vide retourne [] sans appeler GetAppList", async () => {
    global.fetch = mockFetch([], []);

    const games = await fetchSteamWishlist();

    expect(games).toEqual([]);
  });

  test("[fetchSteamWishlist] HTTP en erreur sur GetWishlist lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))) as unknown as typeof fetch;

    await expect(fetchSteamWishlist()).rejects.toThrow();
  });

  test("[fetchSteamWishlist] réponse GetWishlist hors schéma lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ response: { items: [{ appid: "pas-un-nombre" }] } }), {
          status: 200,
        })
      )) as unknown as typeof fetch;

    await expect(fetchSteamWishlist()).rejects.toThrow();
  });
});
