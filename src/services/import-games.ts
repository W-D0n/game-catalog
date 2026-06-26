import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { getLastPage, saveLastPage } from "../database/import-state-repository";
import { deduplicateGames } from "../deduplication/deduplicate-games";
import { ProviderQuotaError, type GameProvider } from "../providers/provider";
import type { Game } from "../types/game";

export async function importGames(
  provider: GameProvider,
  maxPages: number
): Promise<void> {
  const startPage = (await getLastPage(provider.name)) + 1;

  if (startPage > maxPages) {
    console.log(`${provider.name}: déjà importé jusqu'à la page ${maxPages}.`);
    return;
  }

  for (let page = startPage; page <= maxPages; page++) {
    console.log(`${provider.name}: import page ${page}/${maxPages}...`);

    let games: Game[];
    try {
      games = await provider.fetchPage(page);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log(
          `${provider.name}: quota épuisé — arrêt propre. Reprise à la page ${page} au prochain lancement.`
        );
        return;
      }
      throw error;
    }

    if (games.length === 0) {
      console.log(`${provider.name}: fin de la base atteinte à la page ${page}.`);
      break;
    }

    const uniqueGames = deduplicateGames(games);

    for (const game of uniqueGames) {
      const gameId = await saveGame(game);
      await savePlatforms(game, gameId);
    }

    await saveLastPage(provider.name, page);
    console.log(`${provider.name}: page ${page} — ${uniqueGames.length} jeux sauvegardés.`);
  }
}
