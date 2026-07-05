import type { Game } from "../types/game";

export interface FetchPageResult {
  games: Game[];
  /**
   * Curseur à repasser au prochain appel de `fetchPage` pour reprendre après
   * ce lot. Sémantique définie par chaque provider (ex: RAWG = numéro de
   * page ; IGDB = dernier id vu) — jamais une simple pagination offset/limit
   * calculée par l'appelant, pour rester stable même si le jeu de données
   * change pendant le crawl (voir docs/inbox.md, bug de trous de couverture
   * IGDB corrigé le 2026-07-05).
   */
  nextCursor: number;
}

export interface GameProvider {
  readonly name: string;
  fetchPage(cursor: number): Promise<FetchPageResult>;
}

/** Erreur d'un provider qui ne doit pas être retentée (permanente). */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Quota épuisé ou clé invalide — le service doit s'arrêter proprement. */
export class ProviderQuotaError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, message);
    this.name = "ProviderQuotaError";
  }
}
