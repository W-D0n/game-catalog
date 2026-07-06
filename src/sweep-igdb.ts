import { runIgdbUpdateSweep } from "./services/igdb-update-sweep";

const MAX_NEW_GAMES_ITERATIONS = 999_999;

await runIgdbUpdateSweep(MAX_NEW_GAMES_ITERATIONS);
