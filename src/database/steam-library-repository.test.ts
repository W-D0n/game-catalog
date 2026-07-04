import { beforeEach, describe, expect, test } from "bun:test";
import { getLibraryGames, saveLibraryGame } from "./steam-library-repository";
import { resetDatabase } from "./test-helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("saveLibraryGame / getLibraryGames", () => {
  test("[getLibraryGames] base vide retourne []", async () => {
    expect(await getLibraryGames()).toEqual([]);
  });

  test("[saveLibraryGame] insertion nominale", async () => {
    await saveLibraryGame({ appId: 70, name: "Half-Life" });

    expect(await getLibraryGames()).toEqual([{ appId: 70, name: "Half-Life" }]);
  });

  test("[saveLibraryGame] même appId fait un upsert, pas un doublon", async () => {
    await saveLibraryGame({ appId: 70, name: "Half-Life" });
    await saveLibraryGame({ appId: 70, name: "Half-Life (retitré)" });

    const games = await getLibraryGames();

    expect(games).toHaveLength(1);
    expect(games[0]?.name).toBe("Half-Life (retitré)");
  });

  test("[getLibraryGames] triés par nom", async () => {
    await saveLibraryGame({ appId: 220, name: "Half-Life 2" });
    await saveLibraryGame({ appId: 70, name: "Half-Life" });

    const games = await getLibraryGames();

    expect(games.map((g) => g.name)).toEqual(["Half-Life", "Half-Life 2"]);
  });
});
