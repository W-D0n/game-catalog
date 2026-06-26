import { describe, expect, test } from "bun:test";
import { isRetriableStatus } from "./rawg-provider";

describe("isRetriableStatus", () => {
  test("[isRetriableStatus] 429 trop de requêtes est retriable", () => {
    expect(isRetriableStatus(429)).toBe(true);
  });

  test("[isRetriableStatus] 500 erreur serveur est retriable", () => {
    expect(isRetriableStatus(500)).toBe(true);
  });

  test("[isRetriableStatus] 502 et 503 sont retriables", () => {
    expect(isRetriableStatus(502)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
  });

  test("[isRetriableStatus] 401 non autorisé n'est pas retriable", () => {
    expect(isRetriableStatus(401)).toBe(false);
  });

  test("[isRetriableStatus] 403 interdit (quota) n'est pas retriable", () => {
    expect(isRetriableStatus(403)).toBe(false);
  });

  test("[isRetriableStatus] 400 et 404 ne sont pas retriables", () => {
    expect(isRetriableStatus(400)).toBe(false);
    expect(isRetriableStatus(404)).toBe(false);
  });
});
