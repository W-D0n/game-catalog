import { fetchSteamWishlist } from "../providers/steam/steam-wishlist-client";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { normalizeMatchingTitle } from "../normalizers/matching-title-normalizer";
import { normalizePlatformName } from "../normalizers/platform-normalizer";

export interface SteamWishlistExportEntry {
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
 * Récupère la wishlist Steam et l'enrichit avec les données du catalogue
 * canonique (genres, sociétés, plateformes, relations), par correspondance
 * de titre normalisé — même mécanisme que `export-steam-library.ts`.
 */
export async function exportSteamWishlist(): Promise<void> {
  const wishlistGames = await fetchSteamWishlist();
  console.log(`Steam : ${wishlistGames.length} jeux dans la wishlist.`);

  const canonicalGames = await getCanonicalGamesForExport();

  const canonicalByTitle = new Map<string, CanonicalGameExport[]>();
  for (const game of canonicalGames) {
    const key = normalizeMatchingTitle(game.title);
    if (!canonicalByTitle.has(key)) canonicalByTitle.set(key, []);
    canonicalByTitle.get(key)!.push(game);
  }

  const entries: SteamWishlistExportEntry[] = wishlistGames.map((wishlistGame) => {
    const key = normalizeMatchingTitle(wishlistGame.name);
    const candidates = canonicalByTitle.get(key) ?? [];

    if (candidates.length === 0) {
      return {
        appId: wishlistGame.appId,
        steamName: wishlistGame.name,
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      };
    }

    const pcCandidates = candidates.filter(isPcCandidate);
    const chosen = pcCandidates[0] ?? candidates[0]!;
    const ambiguousCandidates = candidates.length - 1;

    return {
      appId: wishlistGame.appId,
      steamName: wishlistGame.name,
      matched: true,
      ambiguousCandidates,
      canonicalGame: chosen,
    };
  });

  await exportJson("./exports/steam-wishlist-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export wishlist Steam enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
