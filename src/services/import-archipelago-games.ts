import { fetchOfficialArchipelagoGames } from "../providers/archipelago/archipelago-official-client";
import { fetchWikiArchipelagoGames } from "../providers/archipelago/archipelago-wiki-client";
import { saveArchipelagoGame } from "../database/archipelago-games-repository";
import { matchArchipelagoGames } from "./match-archipelago-games";

/**
 * Crawl les deux sources Archipelago (officielle + wiki), upsert dans
 * `archipelago_games`, puis matche vers le catalogue canonique — voir
 * docs/specs/archipelago-compatibility.md. Un même titre présent sur les
 * deux sources produit deux lignes distinctes (source différente), pas de
 * déduplication forcée entre sources (les deux pointeront vers le même
 * canonical_id une fois matchées).
 */
export async function importArchipelagoGames(): Promise<void> {
  const officialGames = await fetchOfficialArchipelagoGames();
  console.log(`Archipelago (officiel) : ${officialGames.length} jeux.`);
  for (const title of officialGames) {
    await saveArchipelagoGame("official", title);
  }

  const wikiGames = await fetchWikiArchipelagoGames();
  console.log(`Archipelago (wiki) : ${wikiGames.length} jeux.`);
  for (const title of wikiGames) {
    await saveArchipelagoGame("wiki", title);
  }

  await matchArchipelagoGames();
}
