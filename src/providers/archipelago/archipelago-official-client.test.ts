import { afterEach, describe, expect, test } from "bun:test";
import { fetchOfficialArchipelagoGames } from "./archipelago-official-client";

describe("fetchOfficialArchipelagoGames", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchOfficialArchipelagoGames] extrait les titres depuis data-game, décode les entités HTML", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          `<html><body>
            <details data-game="Adventure"><summary class="h2">Adventure</summary></details>
            <details data-game="Kirby&#39;s Dream Land 3"><summary class="h2">Kirby's Dream Land 3</summary></details>
            <details data-game="Mario &amp; Luigi Superstar Saga"><summary class="h2">Mario &amp; Luigi Superstar Saga</summary></details>
          </body></html>`,
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const games = await fetchOfficialArchipelagoGames();

    expect(games).toEqual(["Adventure", "Kirby's Dream Land 3", "Mario & Luigi Superstar Saga"]);
  });

  test("[fetchOfficialArchipelagoGames] HTTP en erreur lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Forbidden", { status: 403 }))) as unknown as typeof fetch;

    await expect(fetchOfficialArchipelagoGames()).rejects.toThrow();
  });

  test("[fetchOfficialArchipelagoGames] structure de page changée (aucun data-game) lève une exception", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("<html><body>Rien ici</body></html>", { status: 200 }))) as unknown as typeof fetch;

    await expect(fetchOfficialArchipelagoGames()).rejects.toThrow();
  });
});
