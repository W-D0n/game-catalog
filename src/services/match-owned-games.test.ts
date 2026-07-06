import { beforeEach, describe, expect, test } from "bun:test";
import { matchOwnedGames } from "./match-owned-games";
import { getOwnedGamesByPlatform, saveOwnedGame } from "../database/owned-games-repository";
import { createCanonicalGamesBulk } from "../database/canonical-repository";
import { resetDatabase } from "../database/test-helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("matchOwnedGames", () => {
  test("[matchOwnedGames] lie un jeu possédé au canonical game de même titre", async () => {
    await saveOwnedGame("steam", "620", "Portal 2");
    await createCanonicalGamesBulk([{ title: "Portal 2", releaseYear: 2011, releaseStatus: null }]);

    await matchOwnedGames();

    const [owned] = await getOwnedGamesByPlatform("steam");
    expect(owned?.canonicalId).not.toBeNull();
  });

  test("[matchOwnedGames] aucun candidat laisse canonical_id NULL", async () => {
    await saveOwnedGame("steam", "1", "Jeu Introuvable");

    await matchOwnedGames();

    const [owned] = await getOwnedGamesByPlatform("steam");
    expect(owned?.canonicalId).toBeNull();
  });

  test("[matchOwnedGames] incrémental : ne retraite pas un jeu déjà lié", async () => {
    await saveOwnedGame("steam", "620", "Portal 2");
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: null },
    ]);
    await matchOwnedGames();

    const [secondCanonicalId] = await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: null },
    ]);
    await matchOwnedGames();

    const [owned] = await getOwnedGamesByPlatform("steam");
    expect(owned?.canonicalId).toBe(canonicalId!);
    expect(owned?.canonicalId).not.toBe(secondCanonicalId!);
  });

  test("[matchOwnedGames] base sans jeu non matché ne fait rien", async () => {
    await expect(matchOwnedGames()).resolves.toBeUndefined();
  });
});
