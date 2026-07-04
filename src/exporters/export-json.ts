import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Game } from "../types/game";

export async function exportJson(filename: string, games: Game[]) {
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(games, null, 2), "utf-8");
}
