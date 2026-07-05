import { afterEach, describe, expect, test } from "bun:test";
import { fetchOwnedGamesForPlayer, fetchPlayerSummary } from "./steam-multi-library-client";

describe("fetchPlayerSummary", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchPlayerSummary] profil public (communityvisibilitystate=3) retourne isPublic=true", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              players: [
                { steamid: "1", personaname: "Alice", communityvisibilitystate: 3 },
              ],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const summary = await fetchPlayerSummary("1");

    expect(summary).toEqual({ steamId64: "1", personaName: "Alice", isPublic: true });
  });

  test("[fetchPlayerSummary] profil privé (communityvisibilitystate=1) retourne isPublic=false", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              players: [{ steamid: "2", personaname: "Bob", communityvisibilitystate: 1 }],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const summary = await fetchPlayerSummary("2");

    expect(summary).toEqual({ steamId64: "2", personaName: "Bob", isPublic: false });
  });

  test("[fetchPlayerSummary] steamid inconnu (players absent) retourne null", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ response: {} }), { status: 200 }))) as unknown as typeof fetch;

    const summary = await fetchPlayerSummary("999");

    expect(summary).toBeNull();
  });

  test("[fetchPlayerSummary] HTTP 4xx (hors 429) lève sans retry", async () => {
    let calls = 0;
    global.fetch = (() => {
      calls++;
      return Promise.resolve(new Response("Bad Request", { status: 400 }));
    }) as unknown as typeof fetch;

    await expect(fetchPlayerSummary("1")).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("fetchOwnedGamesForPlayer", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchOwnedGamesForPlayer] réponse conforme mappée en SteamOwnedGame[]", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              games: [
                { appid: 70, name: "Half-Life" },
                { appid: 220, name: "Half-Life 2" },
              ],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const games = await fetchOwnedGamesForPlayer("1");

    expect(games).toEqual([
      { appId: 70, name: "Half-Life" },
      { appId: 220, name: "Half-Life 2" },
    ]);
  });

  test("[fetchOwnedGamesForPlayer] bibliothèque vide (games absent) retourne []", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ response: {} }), { status: 200 }))) as unknown as typeof fetch;

    const games = await fetchOwnedGamesForPlayer("1");

    expect(games).toEqual([]);
  });

  test("[fetchOwnedGamesForPlayer] retente sur 500 puis réussit", async () => {
    let calls = 0;
    global.fetch = (() => {
      calls++;
      if (calls === 1) return Promise.resolve(new Response("Server Error", { status: 500 }));
      return Promise.resolve(
        new Response(JSON.stringify({ response: { games: [{ appid: 1, name: "Jeu" }] } }), {
          status: 200,
        })
      );
    }) as unknown as typeof fetch;

    const games = await fetchOwnedGamesForPlayer("1");

    expect(games).toEqual([{ appId: 1, name: "Jeu" }]);
    expect(calls).toBe(2);
  });
});
