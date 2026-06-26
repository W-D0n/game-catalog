import { writeFile } from "node:fs/promises";
import type { Game } from "../types/game";

export async function exportJson(filename: string, games: Game[]) {
  await writeFile(filename, JSON.stringify(games, null, 2), "utf-8");
}
