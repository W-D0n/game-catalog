# CLAUDE.md — game-catalog

## Path Mappings

| Concept | Path |
|---|---|
| `{overview}` | `docs/overview.md` |
| `{inbox}` | `docs/inbox.md` |
| `{specs}` | `docs/specs/` |

## Stack

- Runtime : Bun
- Langage : TypeScript (strict)
- Base de données : PostgreSQL 18
- Package manager : Bun (jamais npm/yarn/pnpm)

## Architecture

```
src/
  providers/        # Sources de données (RAWG, IGDB, MobyGames)
  normalizers/      # Normalisation des titres
  deduplication/    # Déduplication par titre normalisé + année
  database/         # Connexion DB + repositories
  services/         # Orchestration (import-games)
  exporters/        # Export JSON
  types/            # Types partagés (Game, GameProvider)
```

## Règles projet

- Chaque provider implémente `GameProvider` (`src/providers/provider.ts`)
- La DB est accédée uniquement via les repositories (`game-repository.ts`, `platform-repository.ts`)
- `import_state` trace la progression par provider — ne jamais bypasser
- `page_size` RAWG = 40 (maximum autorisé), délai 500ms entre pages
- Les exports JSON vont dans `exports/` (ignoré par git)
- Les données brutes vont dans `data/` (ignoré par git)

## Variables d'environnement requises

```
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/game_catalog
RAWG_API_KEY=...
```

## Schéma DB

Tables : `games`, `platforms`, `game_platforms`, `import_state`
Schéma source : `schema.sql`
