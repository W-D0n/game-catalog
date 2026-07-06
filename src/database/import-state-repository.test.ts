import { beforeEach, describe, expect, test } from "bun:test";
import {
  getAllImportStates,
  getLastCursor,
  getLastUpdateCheck,
  saveLastCursor,
  saveLastUpdateCheck,
} from "./import-state-repository";
import { resetDatabase } from "./test-helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("getLastCursor", () => {
  test("[getLastCursor] provider inconnu retourne 0", async () => {
    expect(await getLastCursor("rawg")).toBe(0);
  });

  test("[getLastCursor] retourne le dernier curseur sauvegardé", async () => {
    await saveLastCursor("rawg", 42);

    expect(await getLastCursor("rawg")).toBe(42);
  });
});

describe("saveLastCursor", () => {
  test("[saveLastCursor] rejouer avec une nouvelle valeur fait un upsert", async () => {
    await saveLastCursor("rawg", 10);
    await saveLastCursor("rawg", 11);

    expect(await getLastCursor("rawg")).toBe(11);
  });

  test("[saveLastCursor] providers différents ne se marchent pas dessus", async () => {
    await saveLastCursor("rawg", 100);
    await saveLastCursor("igdb", 5);

    expect(await getLastCursor("rawg")).toBe(100);
    expect(await getLastCursor("igdb")).toBe(5);
  });
});

describe("getLastUpdateCheck / saveLastUpdateCheck", () => {
  test("[getLastUpdateCheck] provider inconnu retourne null (jamais sweepé)", async () => {
    expect(await getLastUpdateCheck("igdb")).toBeNull();
  });

  test("[saveLastUpdateCheck] rejouer avec une nouvelle valeur fait un upsert", async () => {
    await saveLastUpdateCheck("igdb", 1000);
    await saveLastUpdateCheck("igdb", 2000);

    expect(await getLastUpdateCheck("igdb")).toBe(2000);
  });

  test("[saveLastUpdateCheck] indépendant de last_cursor sur le même provider", async () => {
    await saveLastCursor("igdb", 409040);
    await saveLastUpdateCheck("igdb", 1000);

    expect(await getLastCursor("igdb")).toBe(409040);
    expect(await getLastUpdateCheck("igdb")).toBe(1000);
  });
});

describe("getAllImportStates", () => {
  test("[getAllImportStates] base vide retourne []", async () => {
    expect(await getAllImportStates()).toEqual([]);
  });

  test("[getAllImportStates] triés par provider", async () => {
    await saveLastCursor("rawg", 100);
    await saveLastCursor("igdb", 5);

    const states = await getAllImportStates();

    expect(states).toEqual([
      { provider: "igdb", lastCursor: 5 },
      { provider: "rawg", lastCursor: 100 },
    ]);
  });
});
