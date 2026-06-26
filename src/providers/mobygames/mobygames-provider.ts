import type { Game } from "../../types/game";
import type { GameProvider } from "../provider";

export class MobyGamesProvider implements GameProvider {
  readonly name = "mobygames";

  async fetchPage(page: number): Promise<Game[]> {
    console.log(`MobyGames page ${page}`);

    return [];
  }
}