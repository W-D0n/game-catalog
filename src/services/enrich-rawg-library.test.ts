import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetDatabase } from "../database/test-helpers";
import { saveOwnedGame } from "../database/owned-games-repository";
import { createCanonicalGamesBulk } from "../database/canonical-repository";
import { enrichRawgLibrary } from "./enrich-rawg-library";
import { buildMyvaultGamesImport } from "./export-myvault-games";
import { matchOwnedGames } from "./match-owned-games";

const originalFetch = global.fetch;

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("enrichRawgLibrary", () => {
  test("[enrichRawgLibrary] recherche un jeu possédé ciblé et rend ses crédits exportables", async () => {
    await saveOwnedGame("steam", "1145360", "Hades");
    await createCanonicalGamesBulk([
      { title: "Hades", releaseYear: 2020, releaseStatus: "Released" },
    ]);
    await matchOwnedGames();

    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              game_count: 1,
              games: [{ appid: 1145360, name: "Hades" }],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const rawgClient = {
      searchGameByTitle: async () => ({
        source: "rawg" as const,
        sourceId: "3498",
        title: "Hades",
        releaseYear: 2020,
        platforms: ["PC"],
        slug: "hades",
      }),
      fetchDevelopmentTeam: async () => [
        { id: 42, name: "Amir Rao", slug: "amir-rao" },
      ],
    };

    await enrichRawgLibrary(rawgClient, { delayMs: 0 });

    const [row] = await buildMyvaultGamesImport();
    expect(row?.people).toEqual([
      {
        source: "rawg",
        externalId: "42",
        name: "Amir Rao",
        slug: "amir-rao",
        role: "development_team",
      },
    ]);
  });

  test("[enrichRawgLibrary] un résultat sans crédit reste terminé au replay", async () => {
    await saveOwnedGame("steam", "620", "Portal 2");
    await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: "Released" },
    ]);
    await matchOwnedGames();

    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              game_count: 1,
              games: [{ appid: 620, name: "Portal 2" }],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const rawgClient = {
      searchGameByTitle: async () => ({
        source: "rawg" as const,
        sourceId: "4200",
        title: "Portal 2",
        releaseYear: 2011,
        platforms: ["PC"],
        slug: "portal-2",
      }),
      fetchDevelopmentTeam: async () => [],
    };

    const first = await enrichRawgLibrary(rawgClient, { delayMs: 0 });
    const replay = await enrichRawgLibrary(rawgClient, { delayMs: 0 });

    expect(first).toEqual({
      candidates: 1,
      enriched: 1,
      alreadyEnriched: 0,
      notFound: 0,
      alreadySearched: 0,
    });
    expect(replay).toEqual({
      candidates: 1,
      enriched: 0,
      alreadyEnriched: 1,
      notFound: 0,
      alreadySearched: 0,
    });
  });

  test("[enrichRawgLibrary] un titre RAWG introuvable n'est pas recherché au replay", async () => {
    await saveOwnedGame("steam", "504230", "Celeste");
    await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: "Released" },
    ]);
    await matchOwnedGames();

    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            response: {
              game_count: 1,
              games: [{ appid: 504230, name: "Celeste" }],
            },
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const rawgClient = {
      searchGameByTitle: async () => null,
      fetchDevelopmentTeam: async () => [],
    };

    const first = await enrichRawgLibrary(rawgClient, { delayMs: 0 });
    const replay = await enrichRawgLibrary(rawgClient, { delayMs: 0 });

    expect(first).toEqual({
      candidates: 1,
      enriched: 0,
      alreadyEnriched: 0,
      notFound: 1,
      alreadySearched: 0,
    });
    expect(replay).toEqual({
      candidates: 1,
      enriched: 0,
      alreadyEnriched: 0,
      notFound: 0,
      alreadySearched: 1,
    });
  });
});
