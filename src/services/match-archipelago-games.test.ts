import { beforeEach, describe, expect, test } from "bun:test";
import { matchArchipelagoGames } from "./match-archipelago-games";
import { saveArchipelagoGame } from "../database/archipelago-games-repository";
import { createCanonicalGamesBulk } from "../database/canonical-repository";
import { resetDatabase } from "../database/test-helpers";
import { db } from "../database/db";

async function getArchipelagoGame(rawTitle: string) {
  const [row] = await db<{ canonicalId: string | null }[]>`
    SELECT canonical_id AS "canonicalId" FROM archipelago_games WHERE raw_title = ${rawTitle}
  `;
  return row ?? null;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("matchArchipelagoGames", () => {
  test("[matchArchipelagoGames] lie un jeu Archipelago au canonical game de même titre", async () => {
    await saveArchipelagoGame("official", "Celeste");
    await createCanonicalGamesBulk([{ title: "Celeste", releaseYear: 2018, releaseStatus: null }]);

    await matchArchipelagoGames();

    const game = await getArchipelagoGame("Celeste");
    expect(game?.canonicalId).not.toBeNull();
  });

  test("[matchArchipelagoGames] aucun candidat laisse canonical_id NULL", async () => {
    await saveArchipelagoGame("official", "Jeu Introuvable");

    await matchArchipelagoGames();

    const game = await getArchipelagoGame("Jeu Introuvable");
    expect(game?.canonicalId).toBeNull();
  });

  test("[matchArchipelagoGames] incrémental : ne retraite pas un jeu déjà lié", async () => {
    await saveArchipelagoGame("official", "Celeste");
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: null },
    ]);
    await matchArchipelagoGames();

    const [secondCanonicalId] = await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: null },
    ]);
    await matchArchipelagoGames();

    const game = await getArchipelagoGame("Celeste");
    expect(game?.canonicalId).toBe(canonicalId!.toString());
    expect(game?.canonicalId).not.toBe(secondCanonicalId!.toString());
  });

  test("[matchArchipelagoGames] même titre sur les deux sources produit deux lignes distinctes", async () => {
    await saveArchipelagoGame("official", "Celeste");
    await saveArchipelagoGame("wiki", "Celeste");
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: null },
    ]);

    await matchArchipelagoGames();

    const rows = await db<{ source: string; canonicalId: string | null }[]>`
      SELECT source, canonical_id AS "canonicalId" FROM archipelago_games WHERE raw_title = 'Celeste'
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.canonicalId === canonicalId!.toString())).toBe(true);
  });

  test("[matchArchipelagoGames] base sans jeu non matché ne fait rien", async () => {
    await expect(matchArchipelagoGames()).resolves.toBeUndefined();
  });
});
