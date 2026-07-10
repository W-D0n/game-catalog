export interface OwnedGame {
  externalId: string;
  rawTitle: string;
}

export interface OwnedGamesClient {
  readonly platform: string;
  fetchLibrary(): Promise<OwnedGame[]>;
}
