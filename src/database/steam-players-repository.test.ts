import { beforeEach, describe, expect, test } from "bun:test";
import { savePlayer, saveOwnedGames } from "./steam-players-repository";
import { resetDatabase } from "./test-helpers";
import { db } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

describe("savePlayer", () => {
  test("[savePlayer] insertion nominale", async () => {
    await savePlayer({ steamId64: "1", personaName: "Alice", isPublic: true });

    const [row] = await db<{ persona_name: string; is_public: boolean }[]>`
      SELECT persona_name, is_public FROM steam_players WHERE steam_id64 = '1'
    `;

    expect(row).toEqual({ persona_name: "Alice", is_public: true });
  });

  test("[savePlayer] même steam_id64 fait un upsert, pas un doublon", async () => {
    await savePlayer({ steamId64: "1", personaName: "Alice", isPublic: true });
    await savePlayer({ steamId64: "1", personaName: "Alice (renommée)", isPublic: false });

    const rows = await db<{ persona_name: string; is_public: boolean }[]>`
      SELECT persona_name, is_public FROM steam_players WHERE steam_id64 = '1'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ persona_name: "Alice (renommée)", is_public: false });
  });
});

describe("saveOwnedGames", () => {
  test("[saveOwnedGames] insertion nominale", async () => {
    await savePlayer({ steamId64: "1", personaName: "Alice", isPublic: true });
    await saveOwnedGames("1", [{ appId: 70, name: "Half-Life" }]);

    const rows = await db<{ app_id: string; name: string }[]>`
      SELECT app_id, name FROM steam_player_games WHERE steam_id64 = '1'
    `;

    expect(rows).toEqual([{ app_id: "70", name: "Half-Life" }]);
  });

  test("[saveOwnedGames] remplace entièrement la bibliothèque précédente du joueur", async () => {
    await savePlayer({ steamId64: "1", personaName: "Alice", isPublic: true });
    await saveOwnedGames("1", [{ appId: 70, name: "Half-Life" }]);
    await saveOwnedGames("1", [{ appId: 220, name: "Half-Life 2" }]);

    const rows = await db<{ app_id: string }[]>`
      SELECT app_id FROM steam_player_games WHERE steam_id64 = '1'
    `;

    expect(rows).toEqual([{ app_id: "220" }]);
  });

  test("[saveOwnedGames] tableau vide vide la bibliothèque du joueur", async () => {
    await savePlayer({ steamId64: "1", personaName: "Alice", isPublic: true });
    await saveOwnedGames("1", [{ appId: 70, name: "Half-Life" }]);
    await saveOwnedGames("1", []);

    const rows = await db`SELECT * FROM steam_player_games WHERE steam_id64 = '1'`;

    expect(rows).toHaveLength(0);
  });
});
