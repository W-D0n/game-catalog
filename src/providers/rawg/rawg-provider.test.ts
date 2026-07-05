import { afterEach, describe, expect, test } from "bun:test";
import { isRetriableStatus, RawgProvider } from "./rawg-provider";
import { ProviderError } from "../provider";

describe("isRetriableStatus", () => {
  test("[isRetriableStatus] 429 trop de requêtes est retriable", () => {
    expect(isRetriableStatus(429)).toBe(true);
  });

  test("[isRetriableStatus] 500 erreur serveur est retriable", () => {
    expect(isRetriableStatus(500)).toBe(true);
  });

  test("[isRetriableStatus] 502 et 503 sont retriables", () => {
    expect(isRetriableStatus(502)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
  });

  test("[isRetriableStatus] 401 non autorisé n'est pas retriable", () => {
    expect(isRetriableStatus(401)).toBe(false);
  });

  test("[isRetriableStatus] 403 interdit (quota) n'est pas retriable", () => {
    expect(isRetriableStatus(403)).toBe(false);
  });

  test("[isRetriableStatus] 400 et 404 ne sont pas retriables", () => {
    expect(isRetriableStatus(400)).toBe(false);
    expect(isRetriableStatus(404)).toBe(false);
  });
});

describe("RawgProvider.fetchPage — validation de la réponse", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchPage] réponse conforme au schéma mappée en Game[], nextCursor = page fetchée", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            next: null,
            results: [
              {
                id: 42,
                slug: "portal-2",
                name: "Portal 2",
                released: "2011-04-19",
                platforms: [{ platform: { name: "PC" } }],
              },
            ],
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const result = await new RawgProvider().fetchPage(0);

    expect(result).toEqual({
      games: [
        {
          source: "rawg",
          sourceId: "42",
          title: "Portal 2",
          releaseYear: 2011,
          platforms: ["PC"],
          slug: "portal-2",
        },
      ],
      nextCursor: 1,
    });
  });

  test("[fetchPage] curseur=5 fetch la page 6, nextCursor=6", async () => {
    let requestedUrl: string | undefined;
    global.fetch = ((url: URL) => {
      requestedUrl = url.toString();
      return Promise.resolve(
        new Response(JSON.stringify({ next: null, results: [] }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const result = await new RawgProvider().fetchPage(5);

    expect(requestedUrl).toContain("page=6");
    expect(result).toEqual({ games: [], nextCursor: 5 });
  });

  test("[fetchPage] réponse ne respectant pas le schéma rejette avec ProviderError", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [{ id: "pas-un-nombre" }] }), { status: 200 })
      )) as unknown as typeof fetch;

    await expect(new RawgProvider().fetchPage(0)).rejects.toThrow(ProviderError);
  });
});
