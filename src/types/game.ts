export interface GameCompanyCredit {
  name: string;
  isDeveloper: boolean;
  isPublisher: boolean;
  isPorting: boolean;
  isSupporting: boolean;
}

/**
 * Métadonnées brutes propres à une source, non fusionnées, en attente de
 * projection canonique (voir docs/specs/multi-source-matching.md).
 */
export interface SourceGameMetadata {
  genres?: string[];
  companies?: GameCompanyCredit[];
  gameType?: number | null;
  gameStatus?: number | null;
  parentGame?: number | null;
  versionParent?: number | null;
}

export interface Game {
  source: string;
  sourceId: string;
  title: string;
  releaseYear: number | null;
  platforms: string[];
  slug?: string | null;
  rawMetadata?: SourceGameMetadata;
}
