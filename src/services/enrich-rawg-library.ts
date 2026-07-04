import { fetchSteamLibrary } from "../providers/steam/steam-library-client";
import { saveLibraryGame, getLibraryGames } from "../database/steam-library-repository";
import { getGameIdentitiesBySource } from "../database/game-repository";
import { fetchDevelopmentTeam } from "../providers/rawg/rawg-development-team-client";
import { saveGameCredits } from "../database/rawg-credits-repository";
import { ProviderQuotaError } from "../providers/provider";
import { normalizeTitle } from "../normalizers/game-normalizer";

const DELAY_MS = 500;

/**
 * Enrichit les jeux RAWG de la bibliothèque Steam avec leurs crédits
 * individuels (development-team). Déclenchement manuel, volume limité à la
 * taille de la bibliothèque — pas tout le catalogue RAWG.
 */
export async function enrichRawgLibrary(): Promise<void> {
  const steamGames = await fetchSteamLibrary();
  console.log(`Steam : ${steamGames.length} jeux dans la bibliothèque.`);

  for (const game of steamGames) {
    await saveLibraryGame(game);
  }

  const libraryGames = await getLibraryGames();
  const libraryTitles = new Set(libraryGames.map((g) => normalizeTitle(g.name)));

  const rawgGames = await getGameIdentitiesBySource("rawg");
  const matches = rawgGames.filter((game) => libraryTitles.has(normalizeTitle(game.title)));

  console.log(`${matches.length} jeux RAWG correspondent à la bibliothèque Steam.`);

  for (const [index, game] of matches.entries()) {
    console.log(`[${index + 1}/${matches.length}] ${game.title} (rawg:${game.sourceId})...`);

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    try {
      const people = await fetchDevelopmentTeam(game.sourceId);
      await saveGameCredits(game.id, people);
      console.log(`  ${people.length} crédit(s) sauvegardé(s).`);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log(`  quota épuisé — arrêt propre à "${game.title}".`);
        return;
      }
      throw error;
    }
  }

  console.log("Enrichissement terminé.");
}
