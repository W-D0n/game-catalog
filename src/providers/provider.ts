import type { Game } from "../types/game";

export interface GameProvider {
  readonly name: string;
  fetchPage(page: number): Promise<Game[]>;
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