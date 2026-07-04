import { beforeEach, describe, expect, test } from "bun:test";
import { getAllImportStates, getLastPage, saveLastPage } from "./import-state-repository";
import { resetDatabase } from "./test-helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("getLastPage", () => {
  test("[getLastPage] provider inconnu retourne 0", async () => {
    expect(await getLastPage("rawg")).toBe(0);
  });

  test("[getLastPage] retourne la dernière page sauvegardée", async () => {
    await saveLastPage("rawg", 42);

    expect(await getLastPage("rawg")).toBe(42);
  });
});

describe("saveLastPage", () => {
  test("[saveLastPage] rejouer avec une nouvelle valeur fait un upsert", async () => {
    await saveLastPage("rawg", 10);
    await saveLastPage("rawg", 11);

    expect(await getLastPage("rawg")).toBe(11);
  });

  test("[saveLastPage] providers différents ne se marchent pas dessus", async () => {
    await saveLastPage("rawg", 100);
    await saveLastPage("igdb", 5);

    expect(await getLastPage("rawg")).toBe(100);
    expect(await getLastPage("igdb")).toBe(5);
  });
});

describe("getAllImportStates", () => {
  test("[getAllImportStates] base vide retourne []", async () => {
    expect(await getAllImportStates()).toEqual([]);
  });

  test("[getAllImportStates] triés par provider", async () => {
    await saveLastPage("rawg", 100);
    await saveLastPage("igdb", 5);

    const states = await getAllImportStates();

    expect(states).toEqual([
      { provider: "igdb", lastPage: 5 },
      { provider: "rawg", lastPage: 100 },
    ]);
  });
});
