import { beforeEach, describe, expect, test } from "bun:test";
import { exportSteamLibrary } from "./export-steam-library";
import { saveLibraryGame } from "../database/steam-library-repository";
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

function mockSteamLibrary(games: { appid: number; name: string }[]): void {
  global.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ response: { game_count: games.length, games } }),
        { status: 200 }
      )
    )) as unknown as typeof fetch;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("exportSteamLibrary", () => {
  test("[exportSteamLibrary] jeu Steam matché avec le catalogue canonique", async () => {
    mockSteamLibrary([{ appid: 620, name: "Portal 2" }]);

    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Portal 2",
      releaseYear: 2011,
      platforms: ["PC (Microsoft Windows)"],
    };
    const gameId = await saveGameWithPlatforms(game);
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    await exportSteamLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(
      await fs.readFile("./exports/steam-library-enriched.json", "utf-8")
    );

    expect(exported).toEqual([
      {
        appId: 620,
        steamName: "Portal 2",
        matched: true,
        ambiguousCandidates: 0,
        canonicalGame: expect.objectContaining({ title: "Portal 2" }),
      },
    ]);

    global.fetch = originalFetch;
  });

  test("[exportSteamLibrary] jeu Steam absent du catalogue reste non matché", async () => {
    mockSteamLibrary([{ appid: 999, name: "Jeu Inconnu Introuvable" }]);

    await exportSteamLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(
      await fs.readFile("./exports/steam-library-enriched.json", "utf-8")
    );

    expect(exported).toEqual([
      {
        appId: 999,
        steamName: "Jeu Inconnu Introuvable",
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      },
    ]);

    global.fetch = originalFetch;
  });

  test("[exportSteamLibrary] plusieurs candidats, priorité au canonical avec plateforme PC", async () => {
    mockSteamLibrary([{ appid: 1, name: "Chess" }]);

    const consoleGame: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Chess",
      releaseYear: 1990,
      platforms: ["Nintendo Entertainment System"],
    };
    const pcGame: Game = {
      source: "igdb",
      sourceId: "2",
      title: "Chess",
      releaseYear: 2015,
      platforms: ["PC (Microsoft Windows)"],
    };
    const consoleId = await saveGameWithPlatforms(consoleGame);
    const pcId = await saveGameWithPlatforms(pcGame);

    const [canonicalConsole, canonicalPc] = await createCanonicalGamesBulk([
      { title: "Chess", releaseYear: 1990, releaseStatus: null },
      { title: "Chess", releaseYear: 2015, releaseStatus: null },
    ]);
    await linkGamesToCanonicalBulk([
      { gameId: consoleId, canonicalId: canonicalConsole! },
      { gameId: pcId, canonicalId: canonicalPc! },
    ]);

    await exportSteamLibrary();

    const fs = await import("node:fs/promises");
    const [exported] = JSON.parse(
      await fs.readFile("./exports/steam-library-enriched.json", "utf-8")
    );

    expect(exported.matched).toBe(true);
    expect(exported.ambiguousCandidates).toBe(1);
    expect(exported.canonicalGame.releaseYear).toBe(2015);

    global.fetch = originalFetch;
  });
});
