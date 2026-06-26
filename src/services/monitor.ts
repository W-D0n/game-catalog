import { db } from "../database/db";

const [gamesRow] = await db<{ count: string }[]>`
  SELECT COUNT(*) as count FROM games
`;

const [platformsRow] = await db<{ count: string }[]>`
  SELECT COUNT(*) as count FROM platforms
`;

const importState = await db<{ provider: string; last_page: number }[]>`
  SELECT provider, last_page FROM import_state ORDER BY provider
`;

console.log("=== game-catalog — état de la base ===\n");
console.log(`Jeux      : ${gamesRow?.count ?? 0}`);
console.log(`Plateformes: ${platformsRow?.count ?? 0}`);
console.log("");
console.log("Import state :");
for (const row of importState) {
  console.log(`  ${row.provider} : page ${row.last_page}`);
}
