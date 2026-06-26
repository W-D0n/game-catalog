import type { Game } from "../types/game";

export interface GameProvider {
  readonly name: string;
  fetchPage(page: number): Promise<Game[]>;
}