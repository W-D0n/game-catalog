import { beforeEach, describe, expect, test } from "bun:test";
import {
  getOwnedGamesByPlatform,
  getUnmatchedOwnedGames,
  linkOwnedGamesToCanonicalBulk,
  saveOwnedGame,
} from "./owned-games-repository";
import { createCanonicalGamesBulk } from "./canonical-repository";
import { resetDatabase } from "./test-helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("saveOwnedGame", () => {
  test("[saveOwnedGame] insertion nominale, canonical_id NULL par défaut", async () => {
    await saveOwnedGame("steam", "70", "Half-Life");

    const [unmatched] = await getUnmatchedOwnedGames();

    expect(unmatched).toEqual({ id: expect.any(BigInt), rawTitle: "Half-Life" });
  });

  test("[saveOwnedGame] même (platform, external_id) fait un upsert, pas un doublon", async () => {
    await saveOwnedGame("steam", "70", "Half-Life");
    await saveOwnedGame("steam", "70", "Half-Life (retitré)");

    const unmatched = await getUnmatchedOwnedGames();

    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.rawTitle).toBe("Half-Life (retitré)");
  });

  test("[saveOwnedGame] même external_id, plateformes différentes ne collisionnent pas", async () => {
    await saveOwnedGame("steam", "1", "Jeu A");
    await saveOwnedGame("gog", "1", "Jeu B");

    const unmatched = await getUnmatchedOwnedGames();

    expect(unmatched).toHaveLength(2);
  });
});

describe("linkOwnedGamesToCanonicalBulk", () => {
  test("[linkOwnedGamesToCanonicalBulk] lie plusieurs jeux possédés à leur canonical game", async () => {
    await saveOwnedGame("steam", "1", "Portal 2");
    const unmatched = await getUnmatchedOwnedGames();
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: null },
    ]);

    await linkOwnedGamesToCanonicalBulk([{ ownedGameId: unmatched[0]!.id, canonicalId: canonicalId! }]);

    expect(await getUnmatchedOwnedGames()).toEqual([]);
    const [owned] = await getOwnedGamesByPlatform("steam");
    expect(owned?.canonicalId).toBe(canonicalId!);
  });

  test("[linkOwnedGamesToCanonicalBulk] tableau vide ne fait rien", async () => {
    await expect(linkOwnedGamesToCanonicalBulk([])).resolves.toBeUndefined();
  });
});

describe("getOwnedGamesByPlatform", () => {
  test("[getOwnedGamesByPlatform] ne retourne que la plateforme demandée", async () => {
    await saveOwnedGame("steam", "1", "Jeu Steam");
    await saveOwnedGame("gog", "2", "Jeu GOG");

    const steamGames = await getOwnedGamesByPlatform("steam");

    expect(steamGames).toEqual([{ externalId: "1", rawTitle: "Jeu Steam", canonicalId: null }]);
  });

  test("[getOwnedGamesByPlatform] plateforme inconnue retourne []", async () => {
    expect(await getOwnedGamesByPlatform("epic")).toEqual([]);
  });
});
