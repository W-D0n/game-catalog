import { itchioOwnedGamesClient } from "../providers/itchio/itchio-library-client";
import { saveOwnedGame, getOwnedGamesByPlatform } from "../database/owned-games-repository";
import { matchOwnedGames } from "./match-owned-games";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

export interface ItchioLibraryExportEntry {
  gameId: number;
  itchioTitle: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
}

/**
 * Rafraîchit la bibliothèque itch.io puis l'enrichit avec les données du
 * catalogue canonique — même principe que `exportSteamLibrary` (matching
 * persisté dans `owned_games` via `matchOwnedGames`, jamais recalculé à
 * l'export). Voir docs/specs/owned-games-gog-epic-itchio.md.
 */
export async function exportItchioLibrary(): Promise<void> {
  const itchioGames = await itchioOwnedGamesClient.fetchLibrary();
  console.log(`Itch.io : ${itchioGames.length} jeux dans la bibliothèque.`);

  for (const game of itchioGames) {
    await saveOwnedGame(itchioOwnedGamesClient.platform, game.externalId, game.rawTitle);
  }

  await matchOwnedGames();

  const ownedGames = await getOwnedGamesByPlatform("itchio");
  const canonicalGames = await getCanonicalGamesForExport();
  const canonicalById = new Map(canonicalGames.map((g) => [g.id, g]));
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: ItchioLibraryExportEntry[] = ownedGames.map((owned) => {
    const canonicalGame = owned.canonicalId ? (canonicalById.get(owned.canonicalId.toString()) ?? null) : null;
    // Recalculé uniquement pour l'information de transparence (nombre de candidats
    // concurrents) — la décision de matching elle-même est déjà persistée, pas recalculée.
    const { ambiguousCandidates } = matchTitleToCanonical(titleIndex, owned.rawTitle);

    return {
      gameId: Number(owned.externalId),
      itchioTitle: owned.rawTitle,
      matched: canonicalGame !== null,
      ambiguousCandidates,
      canonicalGame,
    };
  });

  await exportJson("./exports/itchio-library-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export bibliothèque itch.io enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
