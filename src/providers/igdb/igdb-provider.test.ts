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

  test("[fetchPage] réponse conforme au schéma mappée en Game[]", async () => {
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

    const games = await new IgdbProvider().fetchPage(1);

    expect(games).toEqual([
      {
        source: "igdb",
        sourceId: "1942",
        title: "The Witcher 3: Wild Hunt",
        releaseYear: 2015,
        platforms: ["PC (Microsoft Windows)"],
        slug: "the-witcher-3-wild-hunt",
      },
    ]);
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

    const games = await new IgdbProvider().fetchPage(1);

    expect(games[0]?.releaseYear).toBeNull();
    expect(games[0]?.platforms).toEqual([]);
  });

  test("[fetchPage] tableau vide retourne []", async () => {
    global.fetch = mockFetchSequence([tokenResponse(), new Response("[]", { status: 200 })]);

    const games = await new IgdbProvider().fetchPage(1);

    expect(games).toEqual([]);
  });

  test("[fetchPage] réponse ne respectant pas le schéma rejette avec ProviderError", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response(JSON.stringify([{ id: "pas-un-nombre" }]), { status: 200 }),
    ]);

    await expect(new IgdbProvider().fetchPage(1)).rejects.toThrow(ProviderError);
  });

  test("[fetchPage] token invalide (401) rejette avec ProviderQuotaError", async () => {
    global.fetch = mockFetchSequence([
      tokenResponse(),
      new Response("Unauthorized", { status: 401 }),
    ]);

    await expect(new IgdbProvider().fetchPage(1)).rejects.toThrow(ProviderQuotaError);
  });

  test("[fetchPage] échec d'authentification Twitch rejette avec ProviderError", async () => {
    global.fetch = mockFetchSequence([new Response("invalid client", { status: 400 })]);

    await expect(new IgdbProvider().fetchPage(1)).rejects.toThrow(ProviderError);
  });
});
