import { describe, expect, test } from "bun:test";
import { buildBlockingKey, groupByBlockingKey } from "./blocking";

describe("buildBlockingKey", () => {
  test("[buildBlockingKey] titre nominal retourne la clé normalisée", () => {
    expect(buildBlockingKey("The Witcher 3")).toBe("the witcher 3");
  });

  test("[buildBlockingKey] titre court (1-2 caractères) retourne null", () => {
    expect(buildBlockingKey("X")).toBeNull();
    expect(buildBlockingKey("Q2")).toBeNull();
  });

  test("[buildBlockingKey] titre de 3 caractères exactement est accepté", () => {
    expect(buildBlockingKey("Fez")).toBe("fez");
  });

  test("[buildBlockingKey] titre uniquement ponctuation n'est plus dégénéré (contrairement à normalizeTitle)", () => {
    // normalizeMatchingTitle préserve la ponctuation, donc "!!!" reste "!!!"
    // (longueur 3) au lieu de s'effondrer en "" comme le ferait normalizeTitle.
    expect(buildBlockingKey("!!!")).toBe("!!!");
  });

  test("[buildBlockingKey] titre vide retourne null", () => {
    expect(buildBlockingKey("")).toBeNull();
  });
});

describe("groupByBlockingKey", () => {
  test("[groupByBlockingKey] même titre normalisé groupé ensemble", () => {
    const games = [{ title: "Portal 2" }, { title: "portal 2" }];

    const blocks = groupByBlockingKey(games);

    expect(blocks.size).toBe(1);
    expect(blocks.get("portal 2")).toHaveLength(2);
  });

  test("[groupByBlockingKey] titres différents dans des blocks séparés", () => {
    const games = [{ title: "Portal" }, { title: "Portal 2" }];

    const blocks = groupByBlockingKey(games);

    expect(blocks.size).toBe(2);
  });

  test("[groupByBlockingKey] clés dégénérées (titres trop courts) exclues des blocks", () => {
    const games = [{ title: "X" }, { title: "Q2" }, { title: "Portal" }];

    const blocks = groupByBlockingKey(games);

    expect(blocks.size).toBe(1);
    expect(blocks.has("x")).toBe(false);
  });

  test("[groupByBlockingKey] tableau vide retourne une Map vide", () => {
    expect(groupByBlockingKey([]).size).toBe(0);
  });
});
