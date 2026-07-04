import { countGames } from "../database/game-repository";
import { countPlatforms } from "../database/platform-repository";
import { getAllImportStates } from "../database/import-state-repository";

const gamesCount = await countGames();
const platformsCount = await countPlatforms();
const importStates = await getAllImportStates();

console.log("=== game-catalog — état de la base ===\n");
console.log(`Jeux      : ${gamesCount}`);
console.log(`Plateformes: ${platformsCount}`);
console.log("");
console.log("Import state :");
for (const state of importStates) {
  console.log(`  ${state.provider} : page ${state.lastPage}`);
}
