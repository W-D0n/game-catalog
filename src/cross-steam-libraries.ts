import { existsSync, readFileSync } from "node:fs";
import { crossSteamLibraries } from "./services/cross-steam-libraries";

const CONFIG_PATH = "./steam-players.json";
const THRESHOLD_PREFIX = "--threshold=";

interface ParsedArgs {
  steamIds: string[];
  threshold?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const steamIds: string[] = [];
  let threshold: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith(THRESHOLD_PREFIX)) {
      threshold = Number(arg.slice(THRESHOLD_PREFIX.length));
    } else {
      steamIds.push(arg);
    }
  }

  return { steamIds, threshold };
}

function readConfigFile(): ParsedArgs {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Aucun SteamID64 fourni en argument et aucun fichier ${CONFIG_PATH} trouvé. ` +
        `Usage : bun run cross-steam-libraries <steamid1> <steamid2> ... [--threshold=N]`
    );
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as {
    steamIds: string[];
    threshold?: number;
  };
  return { steamIds: config.steamIds, threshold: config.threshold };
}

const cliArgs = parseArgs(process.argv.slice(2));
const { steamIds, threshold } = cliArgs.steamIds.length > 0 ? cliArgs : readConfigFile();

if (steamIds.length < 2) {
  throw new Error("Il faut au moins 2 SteamID64 pour calculer un croisement.");
}

await crossSteamLibraries(steamIds, threshold);
