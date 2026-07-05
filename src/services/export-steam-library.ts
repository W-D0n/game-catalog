import { fetchSteamLibrary } from "../providers/steam/steam-library-client";
import { saveLibraryGame, getLibraryGames } from "../database/steam-library-repository";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { normalizeMatchingTitle } from "../normalizers/matching-title-normalizer";
import { normalizePlatformName } from "../normalizers/platform-normalizer";

export interface SteamLibraryExportEntry {
  appId: number;
  steamName: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
}

function isPcCandidate(game: CanonicalGameExport): boolean {
  return game.platforms.some((p) => normalizePlatformName(p) === "PC");
}

/**
 * Rafraîchit la bibliothèque Steam puis l'enrichit avec les données du
 * catalogue canonique (genres, sociétés, plateformes, relations), par
 * correspondance de titre normalisé. Les jeux Steam sont toujours PC —
 * utilisé pour désambiguïser quand plusieurs canonical games partagent le
 * même titre normalisé (ex. plusieurs jeux nommés "Chess").
 */
export async function exportSteamLibrary(): Promise<void> {
  const steamGames = await fetchSteamLibrary();
  console.log(`Steam : ${steamGames.length} jeux dans la bibliothèque.`);

  for (const game of steamGames) {
    await saveLibraryGame(game);
  }

  const libraryGames = await getLibraryGames();
  const canonicalGames = await getCanonicalGamesForExport();

  const canonicalByTitle = new Map<string, CanonicalGameExport[]>();
  for (const game of canonicalGames) {
    const key = normalizeMatchingTitle(game.title);
    if (!canonicalByTitle.has(key)) canonicalByTitle.set(key, []);
    canonicalByTitle.get(key)!.push(game);
  }

  const entries: SteamLibraryExportEntry[] = libraryGames.map((steamGame) => {
    const key = normalizeMatchingTitle(steamGame.name);
    const candidates = canonicalByTitle.get(key) ?? [];

    if (candidates.length === 0) {
      return {
        appId: steamGame.appId,
        steamName: steamGame.name,
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      };
    }

    const pcCandidates = candidates.filter(isPcCandidate);
    const chosen = pcCandidates[0] ?? candidates[0]!;
    // Nombre total d'autres canonical games partageant ce titre, que la
    // désambiguïsation par plateforme PC ait tranché ou non — signal de
    // transparence pour l'utilisateur de l'export.
    const ambiguousCandidates = candidates.length - 1;

    return {
      appId: steamGame.appId,
      steamName: steamGame.name,
      matched: true,
      ambiguousCandidates,
      canonicalGame: chosen,
    };
  });

  await exportJson("./exports/steam-library-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export bibliothèque Steam enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
