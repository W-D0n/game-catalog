import { epicOwnedGamesClient } from "../providers/epic/epic-legendary-client";
import { saveOwnedGame, getOwnedGamesByPlatform } from "../database/owned-games-repository";
import { matchOwnedGames } from "./match-owned-games";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";
import type { OwnedGamesClient } from "../providers/owned-games-client";

export interface EpicLibraryExportEntry {
  appName: string;
  epicTitle: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
}

/**
 * Rafraîchit la bibliothèque Epic (via `legendary list --json`) puis
 * l'enrichit avec les données du catalogue canonique — même principe que
 * `exportSteamLibrary`/`exportItchioLibrary`/`exportGogLibrary`. Voir
 * docs/specs/owned-games-gog-epic-itchio.md.
 */
export async function exportEpicLibrary(client: OwnedGamesClient = epicOwnedGamesClient): Promise<void> {
  const epicGames = await client.fetchLibrary();
  console.log(`Epic : ${epicGames.length} jeux dans la bibliothèque.`);

  for (const game of epicGames) {
    await saveOwnedGame(client.platform, game.externalId, game.rawTitle);
  }

  await matchOwnedGames();

  const ownedGames = await getOwnedGamesByPlatform(client.platform);
  const canonicalGames = await getCanonicalGamesForExport();
  const canonicalById = new Map(canonicalGames.map((g) => [g.id, g]));
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: EpicLibraryExportEntry[] = ownedGames.map((owned) => {
    const canonicalGame = owned.canonicalId ? (canonicalById.get(owned.canonicalId.toString()) ?? null) : null;
    // Recalculé uniquement pour l'information de transparence (nombre de candidats
    // concurrents) — la décision de matching elle-même est déjà persistée, pas recalculée.
    const { ambiguousCandidates } = matchTitleToCanonical(titleIndex, owned.rawTitle);

    return {
      appName: owned.externalId,
      epicTitle: owned.rawTitle,
      matched: canonicalGame !== null,
      ambiguousCandidates,
      canonicalGame,
    };
  });

  await exportJson("./exports/epic-library-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export bibliothèque Epic enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
