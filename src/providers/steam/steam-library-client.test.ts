import { afterEach, describe, expect, test } from "bun:test";
import { fetchSteamLibrary } from "./steam-library-client";

describe("fetchSteamLibrary", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchSteamLibrary] réponse conforme mappée en SteamLibraryGame[]", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              game_count: 2,
              games: [
                { appid: 70, name: "Half-Life", playtime_forever: 1 },
                { appid: 220, name: "Half-Life 2", playtime_forever: 0 },
              ],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const games = await fetchSteamLibrary();

    expect(games).toEqual([
      { appId: 70, name: "Half-Life" },
      { appId: 220, name: "Half-Life 2" },
    ]);
  });

  test("[fetchSteamLibrary] bibliothèque vide (games absent) retourne []", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ response: { game_count: 0 } }), {
          status: 200,
        })
      )) as unknown as typeof fetch;

    const games = await fetchSteamLibrary();

    expect(games).toEqual([]);
  });

  test("[fetchSteamLibrary] HTTP en erreur lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))) as unknown as typeof fetch;

    await expect(fetchSteamLibrary()).rejects.toThrow();
  });

  test("[fetchSteamLibrary] réponse hors schéma lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ response: { games: [{ appid: "pas-un-nombre" }] } }), {
          status: 200,
        })
      )) as unknown as typeof fetch;

    await expect(fetchSteamLibrary()).rejects.toThrow();
  });
});
