import { beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { crossSteamLibraries } from "./cross-steam-libraries";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { resetDatabase } from "../database/test-helpers";
import type { Game } from "../types/game";

const originalFetch = global.fetch;

interface PlayerFixture {
  steamId: string;
  personaName: string;
  isPublic: boolean;
  games: { appid: number; name: string }[];
}

function mockSteamApi(players: PlayerFixture[]): void {
  global.fetch = ((url: URL) => {
    const href = url.toString();

    if (href.includes("GetPlayerSummaries")) {
      const steamId = new URL(href).searchParams.get("steamids")!;
      const player = players.find((p) => p.steamId === steamId);
      const responsePlayers = player
        ? [
            {
              steamid: player.steamId,
              personaname: player.personaName,
              communityvisibilitystate: player.isPublic ? 3 : 1,
            },
          ]
        : [];
      return Promise.resolve(
        new Response(JSON.stringify({ response: { players: responsePlayers } }), { status: 200 })
      );
    }

    if (href.includes("GetOwnedGames")) {
      const steamId = new URL(href).searchParams.get("steamid")!;
      const player = players.find((p) => p.steamId === steamId);
      return Promise.resolve(
        new Response(JSON.stringify({ response: { games: player?.games ?? [] } }), { status: 200 })
      );
    }

    throw new Error(`URL non mockée : ${href}`);
  }) as unknown as typeof fetch;
}

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

async function readExport(): Promise<unknown> {
  return JSON.parse(await readFile("./exports/steam-crossing.json", "utf-8"));
}

beforeEach(async () => {
  await resetDatabase();
});

describe("crossSteamLibraries", () => {
  test("[crossSteamLibraries] croisement strict : ne garde que les jeux possédés par tous", async () => {
    mockSteamApi([
      {
        steamId: "1",
        personaName: "Alice",
        isPublic: true,
        games: [
          { appid: 70, name: "Half-Life" },
          { appid: 220, name: "Half-Life 2" },
        ],
      },
      {
        steamId: "2",
        personaName: "Bob",
        isPublic: true,
        games: [{ appid: 70, name: "Half-Life" }],
      },
    ]);

    await crossSteamLibraries(["1", "2"]);

    const exported = await readExport();
    expect(exported).toEqual([
      expect.objectContaining({ appId: 70, ownerCount: 2, owners: expect.arrayContaining(["1", "2"]) }),
    ]);

    global.fetch = originalFetch;
  });

  test("[crossSteamLibraries] seuil partiel : garde les jeux possédés par au moins M joueurs", async () => {
    mockSteamApi([
      { steamId: "1", personaName: "A", isPublic: true, games: [{ appid: 1, name: "Jeu" }] },
      { steamId: "2", personaName: "B", isPublic: true, games: [{ appid: 1, name: "Jeu" }] },
      { steamId: "3", personaName: "C", isPublic: true, games: [] },
    ]);

    await crossSteamLibraries(["1", "2", "3"], 2);

    const exported = (await readExport()) as { appId: number; ownerCount: number }[];
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ appId: 1, ownerCount: 2 });

    global.fetch = originalFetch;
  });

  test("[crossSteamLibraries] profil privé exclu proprement, ne bloque pas le reste du groupe", async () => {
    mockSteamApi([
      { steamId: "1", personaName: "Alice", isPublic: true, games: [{ appid: 1, name: "Jeu" }] },
      { steamId: "2", personaName: "Bob", isPublic: false, games: [{ appid: 1, name: "Jeu" }] },
    ]);

    await crossSteamLibraries(["1", "2"], 1);

    const exported = (await readExport()) as { appId: number; owners: string[] }[];
    expect(exported).toEqual([expect.objectContaining({ appId: 1, owners: ["1"] })]);

    global.fetch = originalFetch;
  });

  test("[crossSteamLibraries] steamid introuvable exclu proprement", async () => {
    mockSteamApi([{ steamId: "1", personaName: "Alice", isPublic: true, games: [{ appid: 1, name: "Jeu" }] }]);

    await crossSteamLibraries(["1", "999"], 1);

    const exported = (await readExport()) as { appId: number }[];
    expect(exported).toEqual([expect.objectContaining({ appId: 1 })]);

    global.fetch = originalFetch;
  });

  test("[crossSteamLibraries] enrichit via le catalogue canonique", async () => {
    mockSteamApi([
      { steamId: "1", personaName: "Alice", isPublic: true, games: [{ appid: 620, name: "Portal 2" }] },
      { steamId: "2", personaName: "Bob", isPublic: true, games: [{ appid: 620, name: "Portal 2" }] },
    ]);

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

    await crossSteamLibraries(["1", "2"]);

    const [exported] = (await readExport()) as { canonicalGame: { title: string } | null }[];
    expect(exported?.canonicalGame?.title).toBe("Portal 2");

    global.fetch = originalFetch;
  });
});
