import type { Game } from "../../types/game";
import type { GameProvider } from "../provider";

export class IgdbProvider implements GameProvider {
  readonly name = "igdb";

  async fetchPage(page: number): Promise<Game[]> {
    console.log(`IGDB page ${page}`);

    return [];
  }
}