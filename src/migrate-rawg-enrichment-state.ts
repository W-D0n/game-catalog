import { SQL } from "bun";
import { migrateRawgEnrichmentStateSchema } from "./database/rawg-enrichment-repository";

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL est requis et doit désigner le rôle DB dédié aux migrations."
  );
}

const migrationDb = new SQL({ url: migrationUrl });
await migrateRawgEnrichmentStateSchema(migrationDb);
console.log("Migration rawg_enrichment_state appliquée.");
process.exit(0);
