import { describe, expect, test } from "bun:test";
import { fetchEpicLibrary } from "./epic-legendary-client";

describe("fetchEpicLibrary", () => {
  test("[fetchEpicLibrary] réponse conforme mappée en EpicLibraryGame[]", async () => {
    const runner = async () => ({
      stdout: JSON.stringify([
        { app_name: "59aaa2432a784431b0bfdbb54f3554ee", app_title: "112 Operator", dlcs: [] },
        { app_name: "4656facc740742a39e265b026e13d075", app_title: "20 Minutes Till Dawn", dlcs: [] },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const games = await fetchEpicLibrary(runner);

    expect(games).toEqual([
      { appName: "59aaa2432a784431b0bfdbb54f3554ee", title: "112 Operator" },
      { appName: "4656facc740742a39e265b026e13d075", title: "20 Minutes Till Dawn" },
    ]);
  });

  test("[fetchEpicLibrary] bibliothèque vide retourne []", async () => {
    const runner = async () => ({ stdout: "[]", stderr: "", exitCode: 0 });

    const games = await fetchEpicLibrary(runner);

    expect(games).toEqual([]);
  });

  test("[fetchEpicLibrary] code de sortie non nul lève une exception", async () => {
    const runner = async () => ({ stdout: "", stderr: "authentification expirée", exitCode: 1 });

    await expect(fetchEpicLibrary(runner)).rejects.toThrow();
  });

  test("[fetchEpicLibrary] sortie non JSON lève une exception", async () => {
    const runner = async () => ({ stdout: "pas du json", stderr: "", exitCode: 0 });

    await expect(fetchEpicLibrary(runner)).rejects.toThrow();
  });

  test("[fetchEpicLibrary] réponse hors schéma lève une exception", async () => {
    const runner = async () => ({ stdout: JSON.stringify([{ app_name: "x" }]), stderr: "", exitCode: 0 });

    await expect(fetchEpicLibrary(runner)).rejects.toThrow();
  });
});
