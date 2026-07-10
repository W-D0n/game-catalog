import { afterEach, describe, expect, test } from "bun:test";
import { fetchWikiArchipelagoGames } from "./archipelago-wiki-client";

describe("fetchWikiArchipelagoGames", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchWikiArchipelagoGames] réponse conforme, une seule page", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            batchcomplete: "",
            query: { categorymembers: [{ title: "Adventure" }, { title: "Celeste" }] },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const games = await fetchWikiArchipelagoGames();

    expect(games).toEqual(["Adventure", "Celeste"]);
  });

  test("[fetchWikiArchipelagoGames] pagine jusqu'à épuisement de cmcontinue", async () => {
    let call = 0;
    global.fetch = (() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              query: { categorymembers: [{ title: "Adventure" }] },
              continue: { cmcontinue: "page|2" },
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ query: { categorymembers: [{ title: "Celeste" }] } }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const games = await fetchWikiArchipelagoGames();

    expect(games).toEqual(["Adventure", "Celeste"]);
    expect(call).toBe(2);
  });

  test("[fetchWikiArchipelagoGames] HTTP en erreur lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))) as unknown as typeof fetch;

    await expect(fetchWikiArchipelagoGames()).rejects.toThrow();
  });

  test("[fetchWikiArchipelagoGames] réponse hors schéma lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ query: {} }), { status: 200 }))) as unknown as typeof fetch;

    await expect(fetchWikiArchipelagoGames()).rejects.toThrow();
  });
});
