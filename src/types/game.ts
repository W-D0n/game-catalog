export interface Game {
  source: string;
  sourceId: string;
  title: string;
  releaseYear: number | null;
  platforms: string[];
  slug?: string | null;
}
