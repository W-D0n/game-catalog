import { z } from "zod";
import { requireEnv } from "../../config";
import type { OwnedGamesClient } from "../owned-games-client";

const EpicLibraryEntrySchema = z
  .object({
    app_name: z.string(),
    app_title: z.string(),
  })
  .passthrough();

const EpicLibraryResponseSchema = z.array(EpicLibraryEntrySchema);

export interface EpicLibraryGame {
  appName: string;
  title: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runLegendaryList(): Promise<CommandResult> {
  const exePath = requireEnv("EPIC_LEGENDARY_EXE_PATH");
  const proc = Bun.spawn([exePath, "list", "--json"], { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

/**
 * Récupère la bibliothèque Epic via `legendary list --json` — pas d'API
 * distante viable pour un compte perso (voir
 * docs/specs/owned-games-gog-epic-itchio.md §9). S'appuie sur la session déjà
 * authentifiée en cache par `legendary auth` (EPIC_LEGENDARY_EXE_PATH pointe
 * vers l'exécutable) plutôt que de rejouer nous-mêmes le flow OAuth
 * reverse-engineré du launcher.
 */
export async function fetchEpicLibrary(
  runLegendary: () => Promise<CommandResult> = runLegendaryList
): Promise<EpicLibraryGame[]> {
  const { stdout, stderr, exitCode } = await runLegendary();

  if (exitCode !== 0) {
    throw new Error(`legendary list --json a échoué (code ${exitCode}) : ${stderr}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`legendary list --json : sortie non JSON (${(error as Error).message})`);
  }

  const parsed = EpicLibraryResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(`legendary list --json : réponse invalide (${parsed.error.message})`);
  }

  return parsed.data.map((entry) => ({ appName: entry.app_name, title: entry.app_title }));
}

export const epicOwnedGamesClient: OwnedGamesClient = {
  platform: "epic",
  async fetchLibrary() {
    const games = await fetchEpicLibrary();
    return games.map((game) => ({
      externalId: game.appName,
      rawTitle: game.title,
    }));
  },
};
