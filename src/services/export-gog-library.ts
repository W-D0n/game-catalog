import { gogOwnedGamesClient } from "../providers/gog/gog-galaxy-db-client";
import { replaceOwnedGamesForPlatform, getOwnedGamesByPlatform } from "../database/owned-games-repository";
import { matchOwnedGames } from "./match-owned-games";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

export interface GogLibraryExportEntry {
  releaseKey: string;
  gogTitle: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
}

/**
 * Rafraîchit la bibliothèque GOG (lue depuis la base locale du client
 * Galaxy) puis l'enrichit avec les données du catalogue canonique — même
 * principe que `exportSteamLibrary`/`exportItchioLibrary`. Voir
 * docs/specs/owned-games-gog-epic-itchio.md.
 */
export async function exportGogLibrary(): Promise<void> {
  const gogGames = await gogOwnedGamesClient.fetchLibrary();
  console.log(`GOG : ${gogGames.length} jeux dans la bibliothèque.`);

  await replaceOwnedGamesForPlatform(gogOwnedGamesClient.platform, gogGames);

  await matchOwnedGames();

  const ownedGames = await getOwnedGamesByPlatform("gog");
  const canonicalGames = await getCanonicalGamesForExport();
  const canonicalById = new Map(canonicalGames.map((g) => [g.id, g]));
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: GogLibraryExportEntry[] = ownedGames.map((owned) => {
    const canonicalGame = owned.canonicalId ? (canonicalById.get(owned.canonicalId.toString()) ?? null) : null;
    // Recalculé uniquement pour l'information de transparence (nombre de candidats
    // concurrents) — la décision de matching elle-même est déjà persistée, pas recalculée.
    const { ambiguousCandidates } = matchTitleToCanonical(titleIndex, owned.rawTitle);

    return {
      releaseKey: owned.externalId,
      gogTitle: owned.rawTitle,
      matched: canonicalGame !== null,
      ambiguousCandidates,
      canonicalGame,
    };
  });

  await exportJson("./exports/gog-library-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export bibliothèque GOG enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
