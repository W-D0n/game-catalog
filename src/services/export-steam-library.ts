import { fetchSteamLibrary } from "../providers/steam/steam-library-client";
import { saveOwnedGame, getOwnedGamesByPlatform } from "../database/owned-games-repository";
import { matchOwnedGames } from "./match-owned-games";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

export interface SteamLibraryExportEntry {
  appId: number;
  steamName: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
}

/**
 * Rafraîchit la bibliothèque Steam puis l'enrichit avec les données du
 * catalogue canonique (genres, sociétés, plateformes, relations). Le
 * matching titre → canonical game est persisté dans `owned_games`
 * (`matchOwnedGames`, incrémental) plutôt que recalculé à chaque export —
 * voir docs/specs/cross-platform-library-model.md.
 */
export async function exportSteamLibrary(): Promise<void> {
  const steamGames = await fetchSteamLibrary();
  console.log(`Steam : ${steamGames.length} jeux dans la bibliothèque.`);

  for (const game of steamGames) {
    await saveOwnedGame("steam", String(game.appId), game.name);
  }

  await matchOwnedGames();

  const ownedGames = await getOwnedGamesByPlatform("steam");
  const canonicalGames = await getCanonicalGamesForExport();
  const canonicalById = new Map(canonicalGames.map((g) => [g.id, g]));
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: SteamLibraryExportEntry[] = ownedGames.map((owned) => {
    const canonicalGame = owned.canonicalId ? (canonicalById.get(owned.canonicalId.toString()) ?? null) : null;
    // Recalculé uniquement pour l'information de transparence (nombre de candidats
    // concurrents) — la décision de matching elle-même est déjà persistée, pas recalculée.
    const { ambiguousCandidates } = matchTitleToCanonical(titleIndex, owned.rawTitle);

    return {
      appId: Number(owned.externalId),
      steamName: owned.rawTitle,
      matched: canonicalGame !== null,
      ambiguousCandidates,
      canonicalGame,
    };
  });

  await exportJson("./exports/steam-library-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export bibliothèque Steam enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
