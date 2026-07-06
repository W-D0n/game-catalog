import { fetchSteamLibrary } from "../providers/steam/steam-library-client";
import { saveOwnedGame, getOwnedGamesByPlatform } from "../database/owned-games-repository";
import { getGameIdentitiesBySource } from "../database/game-repository";
import { fetchDevelopmentTeam } from "../providers/rawg/rawg-development-team-client";
import { saveGameCredits, getGameIdsWithCredits } from "../database/rawg-credits-repository";
import { ProviderQuotaError } from "../providers/provider";
import { normalizeMatchingTitle } from "../normalizers/matching-title-normalizer";

const DELAY_MS = 500;

/**
 * Enrichit les jeux RAWG de la bibliothèque Steam avec leurs crédits
 * individuels (development-team). Déclenchement manuel, volume limité à la
 * taille de la bibliothèque — pas tout le catalogue RAWG. Reprend là où un
 * run précédent s'est arrêté (quota) sans re-traiter les jeux déjà enrichis.
 */
export async function enrichRawgLibrary(): Promise<void> {
  const steamGames = await fetchSteamLibrary();
  console.log(`Steam : ${steamGames.length} jeux dans la bibliothèque.`);

  for (const game of steamGames) {
    await saveOwnedGame("steam", String(game.appId), game.name);
  }

  const libraryGames = await getOwnedGamesByPlatform("steam");
  const libraryTitles = new Set(libraryGames.map((g) => normalizeMatchingTitle(g.rawTitle)));

  const rawgGames = await getGameIdentitiesBySource("rawg");
  const matches = rawgGames.filter((game) =>
    libraryTitles.has(normalizeMatchingTitle(game.title))
  );

  const alreadyEnriched = await getGameIdsWithCredits();
  const remaining = matches.filter((game) => !alreadyEnriched.has(game.id));

  console.log(
    `${matches.length} jeux RAWG correspondent à la bibliothèque Steam, ${remaining.length} restent à enrichir.`
  );

  for (const [index, game] of remaining.entries()) {
    console.log(`[${index + 1}/${remaining.length}] ${game.title} (rawg:${game.sourceId})...`);

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
