import { beforeEach, describe, expect, test } from "bun:test";
import { exportItchioLibrary } from "./export-itchio-library";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { resetDatabase } from "../database/test-helpers";
import type { Game } from "../types/game";

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

const originalFetch = global.fetch;
const originalKey = process.env.ITCHIO_API_KEY;

function mockItchioLibrary(games: { id: number; title: string }[]): void {
  global.fetch = ((url: string) => {
    const page = new URL(url).searchParams.get("page");
    if (page === "1") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ page: 1, per_page: 50, owned_keys: games.map((g) => ({ game: g })) }),
          { status: 200 }
        )
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ page: 2, per_page: 50, owned_keys: {} }), { status: 200 })
    );
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  process.env.ITCHIO_API_KEY = "test-key";
  await resetDatabase();
});

describe("exportItchioLibrary", () => {
  test("[exportItchioLibrary] jeu itch.io matché avec le catalogue canonique", async () => {
    mockItchioLibrary([{ id: 232066, title: "Celeste" }]);

    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Celeste",
      releaseYear: 2018,
      platforms: ["PC (Microsoft Windows)"],
    };
    const gameId = await saveGameWithPlatforms(game);
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    await exportItchioLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(
      await fs.readFile("./exports/itchio-library-enriched.json", "utf-8")
    );

    expect(exported).toEqual([
      {
        gameId: 232066,
        itchioTitle: "Celeste",
        matched: true,
        ambiguousCandidates: 0,
        canonicalGame: expect.objectContaining({ title: "Celeste" }),
      },
    ]);

    global.fetch = originalFetch;
    process.env.ITCHIO_API_KEY = originalKey;
  });

  test("[exportItchioLibrary] jeu itch.io absent du catalogue reste non matché", async () => {
    mockItchioLibrary([{ id: 999, title: "Jeu Inconnu Introuvable" }]);

    await exportItchioLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(
      await fs.readFile("./exports/itchio-library-enriched.json", "utf-8")
    );

    expect(exported).toEqual([
      {
        gameId: 999,
        itchioTitle: "Jeu Inconnu Introuvable",
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      },
    ]);

    global.fetch = originalFetch;
    process.env.ITCHIO_API_KEY = originalKey;
  });
});
