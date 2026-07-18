import { afterEach, describe, expect, test } from "bun:test";
import { fetchDevelopmentTeam } from "./rawg-development-team-client";
import { ProviderError } from "../provider";

describe("fetchDevelopmentTeam", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("[fetchDevelopmentTeam] réponse conforme mappée en RawgPerson[]", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              { id: 1, name: "Hidetaka Miyazaki", slug: "hidetaka-miyazaki" },
              { id: 2, name: "Some Dev" },
            ],
          }),
          { status: 200 }
        )
      )) as unknown as typeof fetch;

    const people = await fetchDevelopmentTeam("3498");

    expect(people).toEqual([
      { id: 1, name: "Hidetaka Miyazaki", slug: "hidetaka-miyazaki" },
      { id: 2, name: "Some Dev", slug: null },
    ]);
  });

  test("[fetchDevelopmentTeam] aucun crédit retourne []", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }))) as unknown as typeof fetch;

    expect(await fetchDevelopmentTeam("1")).toEqual([]);
  });

  test("[fetchDevelopmentTeam] 401 signale une clé rejetée", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))) as unknown as typeof fetch;

    await expect(fetchDevelopmentTeam("1")).rejects.toThrow("clé RAWG rejetée (HTTP 401)");
  });

  test("[fetchDevelopmentTeam] 404 permanent rejette avec ProviderError", async () => {
    global.fetch = (() =>
      Promise.resolve(new Response("Not found", { status: 404 }))) as unknown as typeof fetch;

    await expect(fetchDevelopmentTeam("999999")).rejects.toThrow(ProviderError);
  });

  test("[fetchDevelopmentTeam] réponse hors schéma rejette avec ProviderError", async () => {
    global.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [{ id: "pas-un-nombre" }] }), { status: 200 })
      )) as unknown as typeof fetch;

    await expect(fetchDevelopmentTeam("1")).rejects.toThrow(ProviderError);
  });
});
