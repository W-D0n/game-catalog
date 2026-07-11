import { beforeEach, describe, expect, test } from "bun:test";
import { exportEpicLibrary } from "./export-epic-library";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { resetDatabase } from "../database/test-helpers";
import type { Game } from "../types/game";
import type { OwnedGamesClient } from "../providers/owned-games-client";

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

function fakeEpicClient(games: { appName: string; title: string }[]): OwnedGamesClient {
  return {
    platform: "epic",
    async fetchLibrary() {
      return games.map((g) => ({ externalId: g.appName, rawTitle: g.title }));
    },
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("exportEpicLibrary", () => {
  test("[exportEpicLibrary] jeu Epic matché avec le catalogue canonique", async () => {
    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "112 Operator",
      releaseYear: 2022,
      platforms: ["PC (Microsoft Windows)"],
    };
    const gameId = await saveGameWithPlatforms(game);
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "112 Operator", releaseYear: 2022, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    await exportEpicLibrary(fakeEpicClient([{ appName: "59aaa2432a784431b0bfdbb54f3554ee", title: "112 Operator" }]));

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(await fs.readFile("./exports/epic-library-enriched.json", "utf-8"));

    expect(exported).toEqual([
      {
        appName: "59aaa2432a784431b0bfdbb54f3554ee",
        epicTitle: "112 Operator",
        matched: true,
        ambiguousCandidates: 0,
        canonicalGame: expect.objectContaining({ title: "112 Operator" }),
      },
    ]);
  });

  test("[exportEpicLibrary] jeu Epic absent du catalogue reste non matché", async () => {
    await exportEpicLibrary(fakeEpicClient([{ appName: "x", title: "Jeu Inconnu Introuvable" }]));

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(await fs.readFile("./exports/epic-library-enriched.json", "utf-8"));

    expect(exported).toEqual([
      {
        appName: "x",
        epicTitle: "Jeu Inconnu Introuvable",
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      },
    ]);
  });
});
