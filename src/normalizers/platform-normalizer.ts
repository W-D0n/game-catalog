/**
 * RAWG et IGDB nomment leurs plateformes différemment (granularité et
 * libellés distincts, ex: RAWG "PC" / IGDB "PC (Microsoft Windows)",
 * RAWG "Commodore / Amiga" regroupé / IGDB éclaté en 7 entrées). Cette table
 * fait correspondre chaque nom de plateforme IGDB observé dans nos données
 * vers son équivalent RAWG (l'espace canonique retenu, plus grossier).
 *
 * Curation manuelle sur les plateformes réellement présentes dans le
 * catalogue importé (2026-07-04) — pas une couverture exhaustive de toutes
 * les plateformes IGDB possibles.
 */
const IGDB_TO_RAWG_PLATFORM: Record<string, string> = {
  "3DO Interactive Multiplayer": "3DO",
  Android: "Android",
  "Apple II": "Apple II",
  "Atari 2600": "Atari 2600",
  "Atari 5200": "Atari 5200",
  "Atari 7800": "Atari 7800",
  "Atari 8-bit": "Atari 8-bit",
  "Atari Jaguar": "Jaguar",
  "Atari Lynx": "Atari Lynx",
  "Atari ST/STE": "Atari ST",
  Amiga: "Commodore / Amiga",
  "Amiga CD32": "Commodore / Amiga",
  "Commodore 16": "Commodore / Amiga",
  "Commodore C64/128/MAX": "Commodore / Amiga",
  "Commodore CDTV": "Commodore / Amiga",
  "Commodore PET": "Commodore / Amiga",
  "Commodore Plus/4": "Commodore / Amiga",
  "Commodore VIC-20": "Commodore / Amiga",
  Dreamcast: "Dreamcast",
  "Game Boy": "Game Boy",
  "Game Boy Advance": "Game Boy Advance",
  "Game Boy Color": "Game Boy Color",
  "Sega Game Gear": "Game Gear",
  "Nintendo GameCube": "GameCube",
  "Sega Mega Drive/Genesis": "Genesis",
  Linux: "Linux",
  "Nintendo Entertainment System": "NES",
  "Neo Geo AES": "Neo Geo",
  "Neo Geo MVS": "Neo Geo",
  "Neo Geo CD": "Neo Geo",
  "Nintendo 3DS": "Nintendo 3DS",
  "New Nintendo 3DS": "Nintendo 3DS",
  "Nintendo 64": "Nintendo 64",
  "Nintendo DS": "Nintendo DS",
  "Nintendo DSi": "Nintendo DSi",
  "Nintendo Switch": "Nintendo Switch",
  "PC (Microsoft Windows)": "PC",
  "PlayStation Vita": "PS Vita",
  "PlayStation Portable": "PSP",
  PlayStation: "PlayStation",
  "PlayStation 2": "PlayStation 2",
  "PlayStation 3": "PlayStation 3",
  "PlayStation 4": "PlayStation 4",
  "PlayStation 5": "PlayStation 5",
  "Sega 32X": "SEGA 32X",
  "Sega CD": "SEGA CD",
  "Sega Master System/Mark III": "SEGA Master System",
  "Sega Saturn": "SEGA Saturn",
  "Super Nintendo Entertainment System": "SNES",
  "Super Famicom": "SNES",
  "Web browser": "Web",
  Wii: "Wii",
  "Wii U": "Wii U",
  Xbox: "Xbox",
  "Xbox 360": "Xbox 360",
  "Xbox One": "Xbox One",
  "Xbox Series X|S": "Xbox Series S/X",
  iOS: "iOS",
  Mac: "macOS",
};

/** Nom de plateforme RAWG canonique (identité) pour aligner les deux espaces. */
const RAWG_CANONICAL_PLATFORMS = new Set([
  "3DO", "Android", "Apple II", "Atari 2600", "Atari 5200", "Atari 7800", "Atari 8-bit",
  "Atari Flashback", "Atari Lynx", "Atari ST", "Atari XEGS", "Classic Macintosh",
  "Commodore / Amiga", "Dreamcast", "Game Boy", "Game Boy Advance", "Game Boy Color",
  "Game Gear", "GameCube", "Genesis", "Jaguar", "Linux", "NES", "Neo Geo", "Nintendo 3DS",
  "Nintendo 64", "Nintendo DS", "Nintendo DSi", "Nintendo Switch", "PC", "PS Vita", "PSP",
  "PlayStation", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation 5",
  "SEGA 32X", "SEGA CD", "SEGA Master System", "SEGA Saturn", "SNES", "Web", "Wii", "Wii U",
  "Xbox", "Xbox 360", "Xbox One", "Xbox Series S/X", "iOS", "macOS",
]);

/**
 * Normalise un nom de plateforme (RAWG ou IGDB) vers l'espace canonique
 * (RAWG). Retourne le nom RAWG déjà canonique tel quel, traduit un nom IGDB
 * connu, ou renvoie le nom d'origine si aucune correspondance n'est connue
 * (pas de désambiguation possible, mais pas d'exclusion silencieuse non plus).
 */
export function normalizePlatformName(name: string): string {
  if (RAWG_CANONICAL_PLATFORMS.has(name)) {
    return name;
  }
  return IGDB_TO_RAWG_PLATFORM[name] ?? name;
}
