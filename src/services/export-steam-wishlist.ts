import { fetchSteamWishlist } from "../providers/steam/steam-wishlist-client";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

export interface SteamWishlistExportEntry {
  appId: number;
  steamName: string;
  matched: boolean;
  ambiguousCandidates: number;
  canonicalGame: CanonicalGameExport | null;
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
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: SteamWishlistExportEntry[] = wishlistGames.map((wishlistGame) => {
    const result = matchTitleToCanonical(titleIndex, wishlistGame.name);

    return {
      appId: wishlistGame.appId,
      steamName: wishlistGame.name,
      matched: result.matched,
      ambiguousCandidates: result.ambiguousCandidates,
      canonicalGame: result.canonicalGame,
    };
  });

  await exportJson("./exports/steam-wishlist-enriched.json", entries);

  const matchedCount = entries.filter((e) => e.matched).length;
  console.log(
    `Export wishlist Steam enrichie terminé : ${entries.length} jeux, ${matchedCount} matchés (${entries.length - matchedCount} non trouvés dans le catalogue).`
  );
}
