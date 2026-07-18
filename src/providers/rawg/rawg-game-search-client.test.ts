import { afterEach, describe, expect, test } from "bun:test";
import { searchRawgGameByTitle } from "./rawg-game-search-client";
import { ProviderQuotaError } from "../provider";

describe("searchRawgGameByTitle", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[searchRawgGameByTitle] sélectionne le titre exact de la bonne année", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              { id: 39, slug: "prey", name: "Prey", released: "2006-07-11" },
              { id: 3070, slug: "prey-2017", name: "Prey", released: "2017-05-05" },
            ],
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const result = await searchRawgGameByTitle("Prey", 2017);

    expect(result?.sourceId).toBe("3070");
  });

  test("[searchRawgGameByTitle] refuse un homonyme ambigu sans année", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              { id: 39, slug: "prey", name: "Prey", released: "2006-07-11" },
              { id: 3070, slug: "prey-2017", name: "Prey", released: "2017-05-05" },
            ],
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    expect(await searchRawgGameByTitle("Prey", null)).toBeNull();
  });

  test("[searchRawgGameByTitle] retente une erreur 5xx transitoire", async () => {
    let attempt = 0;
    global.fetch = (() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.resolve(new Response("Unavailable", { status: 503 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              { id: 3498, slug: "hades", name: "Hades", released: "2020-09-17" },
            ],
          }),
          { status: 200 }
        )
      );
    }) as unknown as typeof fetch;

    const result = await searchRawgGameByTitle("Hades", 2020);

    expect(attempt).toBe(2);
    expect(result?.sourceId).toBe("3498");
  });

  test("[searchRawgGameByTitle] 401 signale une authentification ou un quota et permet l'arrêt propre", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))) as unknown as typeof fetch;

    await expect(searchRawgGameByTitle("Hades", 2020)).rejects.toBeInstanceOf(ProviderQuotaError);
    await expect(searchRawgGameByTitle("Hades", 2020)).rejects.toThrow(
      'recherche "Hades" : authentification ou quota (HTTP 401)'
    );
  });
});
