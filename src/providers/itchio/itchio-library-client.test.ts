import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fetchItchioLibrary } from "./itchio-library-client";

describe("fetchItchioLibrary", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ITCHIO_API_KEY;

  beforeEach(() => {
    process.env.ITCHIO_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ITCHIO_API_KEY = originalKey;
  });

  test("[fetchItchioLibrary] réponse conforme mappée en ItchioLibraryGame[], une seule page", async () => {
    global.fetch = ((url: string) => {
      const page = new URL(url).searchParams.get("page");
      if (page === "1") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              per_page: 50,
              owned_keys: [
                { game: { id: 232066, title: "Pixel art tutorial package" } },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ page: 2, per_page: 50, owned_keys: {} }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const games = await fetchItchioLibrary();

    expect(games).toEqual([{ gameId: 232066, title: "Pixel art tutorial package" }]);
  });

  test("[fetchItchioLibrary] pagine jusqu'à la page vide (owned_keys: {})", async () => {
    let call = 0;
    global.fetch = ((url: string) => {
      call += 1;
      const page = new URL(url).searchParams.get("page");
      if (page === "1") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              page: 1,
              per_page: 1,
              owned_keys: [{ game: { id: 1, title: "Jeu A" } }],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ page: 2, per_page: 1, owned_keys: {} }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const games = await fetchItchioLibrary();

    expect(games).toEqual([{ gameId: 1, title: "Jeu A" }]);
    expect(call).toBe(2);
  });

  test("[fetchItchioLibrary] bibliothèque vide (owned_keys: {} dès la page 1) retourne []", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ page: 1, per_page: 50, owned_keys: {} }), { status: 200 })
      )) as unknown as typeof fetch;

    const games = await fetchItchioLibrary();

    expect(games).toEqual([]);
  });

  test("[fetchItchioLibrary] HTTP en erreur lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))) as unknown as typeof fetch;

    await expect(fetchItchioLibrary()).rejects.toThrow();
  });

  test("[fetchItchioLibrary] réponse hors schéma lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ owned_keys: [{ game: { id: "pas-un-nombre" } }] }), {
          status: 200,
        })
      )) as unknown as typeof fetch;

    await expect(fetchItchioLibrary()).rejects.toThrow();
  });
});
