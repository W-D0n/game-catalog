import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runIgdbUpdateSweep } from "./igdb-update-sweep";
import { saveGame, getGamesBySource } from "../database/game-repository";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { getLastUpdateCheck, saveLastCursor, saveLastUpdateCheck } from "../database/import-state-repository";
import { resetDatabase } from "../database/test-helpers";
import { db } from "../database/db";

const originalFetch = global.fetch;

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
}

function mockIgdb(options: {
  newGames?: { id: number; name: string; slug: string }[];
  updatedGames?: { id: number; name: string; slug: string }[];
}): void {
  let updatedCallCount = 0;

  global.fetch = ((_url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");

    if (body.includes("grant_type")) return Promise.resolve(tokenResponse());

    if (body.includes("updated_at >")) {
      updatedCallCount++;
      const games = updatedCallCount === 1 ? (options.updatedGames ?? []) : [];
      return Promise.resolve(new Response(JSON.stringify(games), { status: 200 }));
    }

    // fetchPage (nouveaux jeux)
    return Promise.resolve(new Response(JSON.stringify(options.newGames ?? []), { status: 200 }));
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("runIgdbUpdateSweep", () => {
  test("[runIgdbUpdateSweep] jeu modifié : canonical_id remis à NULL", async () => {
    await saveGame({ source: "igdb", sourceId: "50", title: "Ancien Titre", releaseYear: null, platforms: [] });
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Ancien Titre", releaseYear: null, releaseStatus: null },
    ]);
    const [game] = await getGamesBySource("igdb");
    const [row] = await db<{ id: string }[]>`SELECT id FROM games WHERE source_id = '50'`;
    await linkGamesToCanonicalBulk([{ gameId: BigInt(row!.id), canonicalId: canonicalId! }]);
    await saveLastCursor("igdb", 100);
    await saveLastUpdateCheck("igdb", 1000);

    mockIgdb({ updatedGames: [{ id: 50, name: "Nouveau Titre", slug: "nouveau-titre" }] });

    await runIgdbUpdateSweep(1);

    const [updatedRow] = await db<{ canonical_id: string | null; title: string }[]>`
      SELECT canonical_id, title FROM games WHERE source_id = '50'
    `;
    expect(updatedRow?.canonical_id).toBeNull();
    expect(updatedRow?.title).toBe("Nouveau Titre");
    expect(game).toBeDefined();
  });

  test("[runIgdbUpdateSweep] succès : last_update_check avance", async () => {
    await saveLastCursor("igdb", 100);
    await saveLastUpdateCheck("igdb", 1000);

    mockIgdb({});

    await runIgdbUpdateSweep(1);

    const updated = await getLastUpdateCheck("igdb");
    expect(updated).toBeGreaterThan(1000);
  });

  test("[runIgdbUpdateSweep] aucun jeu modifié ne fait rien de plus, last_update_check avance quand même", async () => {
    await saveLastCursor("igdb", 100);

    mockIgdb({});

    await runIgdbUpdateSweep(1);
    expect(await getLastUpdateCheck("igdb")).not.toBeNull();
  });
});
