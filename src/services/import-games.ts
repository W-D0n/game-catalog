import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { getLastCursor, saveLastCursor } from "../database/import-state-repository";
import { deduplicateGames } from "../deduplication/deduplicate-games";
import { ProviderQuotaError, type GameProvider } from "../providers/provider";

export async function importGames(
  provider: GameProvider,
  maxIterations: number
): Promise<void> {
  let cursor = await getLastCursor(provider.name);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`${provider.name}: fetch depuis le curseur ${cursor}...`);

    let result;
    try {
      result = await provider.fetchPage(cursor);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log(
          `${provider.name}: quota épuisé — arrêt propre. Reprise depuis le curseur ${cursor} au prochain lancement.`
        );
        return;
      }
      throw error;
    }

    if (result.games.length === 0) {
      console.log(`${provider.name}: fin de la base atteinte (curseur ${cursor}).`);
      break;
    }

    const uniqueGames = deduplicateGames(result.games);

    for (const game of uniqueGames) {
      const gameId = await saveGame(game);
      await savePlatforms(game, gameId);
    }

    cursor = result.nextCursor;
    await saveLastCursor(provider.name, cursor);
    console.log(`${provider.name}: curseur ${cursor} — ${uniqueGames.length} jeux sauvegardés.`);
  }
}
