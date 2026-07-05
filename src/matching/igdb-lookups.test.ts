import { describe, expect, test } from "bun:test";
import { relationshipTypeFromGameType, resolveGameStatus } from "./igdb-lookups";

describe("resolveGameStatus", () => {
  test("[resolveGameStatus] id connu retourne le libellé", () => {
    expect(resolveGameStatus(0)).toBe("Released");
    expect(resolveGameStatus(4)).toBe("Early Access");
  });

  test("[resolveGameStatus] null/undefined retourne null", () => {
    expect(resolveGameStatus(null)).toBeNull();
    expect(resolveGameStatus(undefined)).toBeNull();
  });

  test("[resolveGameStatus] id inconnu retourne null", () => {
    expect(resolveGameStatus(999)).toBeNull();
  });
});

describe("relationshipTypeFromGameType", () => {
  test("[relationshipTypeFromGameType] remake (8) -> remake_of", () => {
    expect(relationshipTypeFromGameType(8)).toBe("remake_of");
  });

  test("[relationshipTypeFromGameType] remaster (9) -> remaster_of", () => {
    expect(relationshipTypeFromGameType(9)).toBe("remaster_of");
  });

  test("[relationshipTypeFromGameType] DLC/expansion/season/pack -> dlc_of", () => {
    expect(relationshipTypeFromGameType(1)).toBe("dlc_of");
    expect(relationshipTypeFromGameType(2)).toBe("dlc_of");
    expect(relationshipTypeFromGameType(4)).toBe("dlc_of");
    expect(relationshipTypeFromGameType(6)).toBe("dlc_of");
    expect(relationshipTypeFromGameType(7)).toBe("dlc_of");
    expect(relationshipTypeFromGameType(13)).toBe("dlc_of");
  });

  test("[relationshipTypeFromGameType] autres types (port, mod, bundle...) -> parent", () => {
    expect(relationshipTypeFromGameType(11)).toBe("parent");
    expect(relationshipTypeFromGameType(5)).toBe("parent");
    expect(relationshipTypeFromGameType(null)).toBe("parent");
  });
});
