import { afterEach, describe, expect, test } from "bun:test";
import { IgdbProvider } from "./igdb-provider";
import { ProviderError, ProviderQuotaError } from "../provider";

function mockFetchSequence(responses: Response[]): typeof fetch {
  let call = 0;
  return (() => {
    const response = responses[call];
    call += 1;
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
}

function tokenResponse(): Response {
  return new Response(
    JSON.stringify({ access_token: "test-token", expires_in: 5000000 }),
    { status: 200 }
  );
}

describe("IgdbProvider.fetchPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchPage] réponse conforme au schéma mappée en Game[], nextCursor = max id du lot", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(
        JSON.stringify([
          {
            id: 1942,
            slug: "the-witcher-3-wild-hunt",
            name: "The Witcher 3: Wild Hunt",
            first_release_date: 1431993600,
            platforms: [{ name: "PC (Microsoft Windows)" }],
          },
        ]),
        { status: 200 }
      ),
    ]);

    const result = await new IgdbProvider().fetchPage(0);

    expect(result).toEqual({
      games: [
        {
          source: "igdb",
          sourceId: "1942",
          title: "The Witcher 3: Wild Hunt",
          releaseYear: 2015,
          platforms: ["PC (Microsoft Windows)"],
          slug: "the-witcher-3-wild-hunt",
          rawMetadata: {
            genres: undefined,
            companies: undefined,
            gameType: null,
            gameStatus: null,
            parentGame: null,
            versionParent: null,
            coverUrl: null,
            screenshotUrls: undefined,
            videoIds: undefined,
            summary: null,
            storyline: null,
          },
        },
      ],
      nextCursor: 1942,
    });
  });

  test("[fetchPage] requête utilise where id > curseur, jamais offset (pagination stable, cf. docs/inbox.md)", async () => {
    let gamesRequestBody: string | undefined;

    global.fetch = ((_url: string, init?: RequestInit) => {
      const isTokenRequest = String(init?.body ?? "").includes("grant_type");
      if (isTokenRequest) {
        return Promise.resolve(tokenResponse());
      }
      gamesRequestBody = String(init?.body);
      return Promise.resolve(new Response("[]", { status: 200 }));
    }) as unknown as typeof fetch;

    await new IgdbProvider().fetchPage(1234);

    expect(gamesRequestBody).toContain("where id > 1234");
    expect(gamesRequestBody).not.toContain("offset");
  });

  test("[fetchPage] mappe genres, studios (rôles cumulables) et relations en rawMetadata", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(
        JSON.stringify([
          {
            id: 1942,
            slug: "the-witcher-3-wild-hunt",
            name: "The Witcher 3: Wild Hunt",
            genres: [{ name: "RPG" }, { name: "Adventure" }],
            involved_companies: [
              {
                company: { name: "CD Projekt Red" },
                developer: true,
                publisher: true,
                porting: false,
                supporting: false,
              },
              {
                company: { name: "GOG" },
                developer: false,
                publisher: false,
                porting: false,
                supporting: true,
              },
            ],
            game_type: 0,
            game_status: 0,
            parent_game: 100,
            version_parent: null,
          },
        ]),
        { status: 200 }
      ),
    ]);

    const result = await new IgdbProvider().fetchPage(0);

    expect(result.games[0]?.rawMetadata).toEqual({
      genres: ["RPG", "Adventure"],
      companies: [
        {
          name: "CD Projekt Red",
          isDeveloper: true,
          isPublisher: true,
          isPorting: false,
          isSupporting: false,
        },
        {
          name: "GOG",
          isDeveloper: false,
          isPublisher: false,
          isPorting: false,
          isSupporting: true,
        },
      ],
      gameType: 0,
      gameStatus: 0,
      parentGame: 100,
      versionParent: null,
      coverUrl: null,
      screenshotUrls: undefined,
      videoIds: undefined,
      summary: null,
      storyline: null,
    });
  });

  test("[fetchPage] mappe cover/screenshots/vidéos/résumé en rawMetadata, cover et screenshots resize", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(
        JSON.stringify([
          {
            id: 1942,
            slug: "the-witcher-3-wild-hunt",
            name: "The Witcher 3: Wild Hunt",
            cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/co1wyy.jpg" },
            screenshots: [
              { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg" },
              { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc2.jpg" },
            ],
            videos: [{ video_id: "abc123" }],
            summary: "Un sorceleur traque une prophétie.",
            storyline: "Geralt de Riv cherche Ciri.",
          },
        ]),
        { status: 200 }
      ),
    ]);

    const result = await new IgdbProvider().fetchPage(0);

    expect(result.games[0]?.rawMetadata).toMatchObject({
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg",
      screenshotUrls: [
        "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg",
        "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc2.jpg",
      ],
      videoIds: ["abc123"],
      summary: "Un sorceleur traque une prophétie.",
      storyline: "Geralt de Riv cherche Ciri.",
    });
  });

  test("[fetchPage] jeu sans first_release_date retourne releaseYear null", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(
        JSON.stringify([
          { id: 1, slug: "unreleased-game", name: "Unreleased Game" },
        ]),
        { status: 200 }
      ),
    ]);

    const result = await new IgdbProvider().fetchPage(0);

    expect(result.games[0]?.releaseYear).toBeNull();
    expect(result.games[0]?.platforms).toEqual([]);
  });

  test("[fetchPage] tableau vide retourne games=[] et nextCursor inchangé", async () => {
    global.fetch = mockFetchSequence([tokenResponse(), new Response("[]", { status: 200 })]);

    const result = await new IgdbProvider().fetchPage(42);

    expect(result).toEqual({ games: [], nextCursor: 42 });
  });

  test("[fetchPage] réponse ne respectant pas le schéma rejette avec ProviderError", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(JSON.stringify([{ id: "pas-un-nombre" }]), { status: 200 }),
    ]);

    await expect(new IgdbProvider().fetchPage(0)).rejects.toThrow(ProviderError);
  });

  test("[fetchPage] token invalide (401) rejette avec ProviderQuotaError", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response("Unauthorized", { status: 401 }),
    ]);

    await expect(new IgdbProvider().fetchPage(0)).rejects.toThrow(ProviderQuotaError);
  });

  test("[fetchPage] échec d'authentification Twitch rejette avec ProviderError", async () => {
    global.fetch = mockFetchSequence([new Response("invalid client", { status: 400 })]);

    await expect(new IgdbProvider().fetchPage(0)).rejects.toThrow(ProviderError);
  });
});

describe("IgdbProvider.fetchUpdatedSince", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchUpdatedSince] requête filtre par updated_at ET id, jamais offset", async () => {
    let gamesRequestBody: string | undefined;

    global.fetch = ((_url: string, init?: RequestInit) => {
      const isTokenRequest = String(init?.body ?? "").includes("grant_type");
      if (isTokenRequest) return Promise.resolve(tokenResponse());
      gamesRequestBody = String(init?.body);
      return Promise.resolve(new Response("[]", { status: 200 }));
    }) as unknown as typeof fetch;

    await new IgdbProvider().fetchUpdatedSince(1700000000, 42);

    expect(gamesRequestBody).toContain("where updated_at > 1700000000 & id > 42");
    expect(gamesRequestBody).not.toContain("offset");
  });

  test("[fetchUpdatedSince] réponse conforme mappée en Game[], nextCursor = max id du lot", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(
        JSON.stringify([{ id: 55, slug: "updated-game", name: "Jeu Mis à Jour" }]),
        { status: 200 }
      ),
    ]);

    const result = await new IgdbProvider().fetchUpdatedSince(1700000000, 0);

    expect(result.games[0]?.title).toBe("Jeu Mis à Jour");
    expect(result.nextCursor).toBe(55);
  });

  test("[fetchUpdatedSince] tableau vide retourne games=[] et nextCursor inchangé", async () => {
    global.fetch = mockFetchSequence([tokenResponse(), new Response("[]", { status: 200 })]);

    const result = await new IgdbProvider().fetchUpdatedSince(1700000000, 42);

    expect(result).toEqual({ games: [], nextCursor: 42 });
  });
});
