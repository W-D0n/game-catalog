**Handoff — 2026-06-26**

---

**Ce qui a été fait cette session**

| Livrable | État |
|----------|------|
| Pipeline d'import RAWG durci : retry backoff sur transitoire + terminaison sans perte de la dernière page | ✅ Fait |
| Détection de quota propre par classe de statut HTTP (`ProviderError` / `ProviderQuotaError`, arrêt gracieux) | ✅ Fait |
| 21 tests unitaires (normalizeTitle, deduplicateGames, isRetriableStatus) — sans réseau ni DB | ✅ Fait |
| Refactor archi : écritures routées via repositories, `saveGame` retourne l'id, nouveau `import-state-repository` | ✅ Résolu |
| Spec `rawg-import-pipeline.md` (implémenté) + `multi-source-matching.md` (conception, différée) | ✅ Fait |
| Tooling : script `monitor` + scripts bun `import`/`monitor`/`test` | ✅ Fait |
| Setup projet : CLAUDE.md, docs/overview, docs/inbox, repo poussé sur GitHub `master` | ✅ Fait |
| Export JSON : route lecture via repository + inclure les plateformes (perdues actuellement) | 🔲 À faire |

---

**État actuel des specs auditées**

```
rawg-import-pipeline.md   🔴 0  🟠 0  🟡 1   — implémenté ; lacune ouverte : terminaison non vérifiée en fin de catalogue (~22 500 pages)
multi-source-matching.md  🔴 1  🟠 0  🟡 2   — CONCEPTION, implémentation différée jusqu'à IGDB ; bloquant : seuils de scoring non chiffrés (calibrage empirique requis)
```
(tracking specs-audit-state.json non disponible — compteurs dérivés des sections Lacunes des specs)

---

**Contexte vivant**

- **Le backfill RAWG tourne** (laissé en cours). Reprise auto via `import_state` ; était autour de la page 2877+.
- Suivre l'avancement : `bun run monitor` dans un terminal séparé.
- Quota plan gratuit : 20 000 req/mois (~800 000 jeux/mois à page_size=40). Le catalogue complet peut dépasser ce quota sur un mois → l'arrêt gracieux sur 401/403 est en place.

---

**Prochaine action recommandée**

1. **Export complet** : créer `getGamesBySource()` dans `game-repository.ts`, router la lecture de [src/index.ts:10](src/index.ts) à travers, et **corriger l'export pour inclure les plateformes** (jointure `game_platforms`). Bug actuel : le cast `db<Game[]>` ment, les jeux exportés n'ont pas de champ `platforms`. Changement de comportement → traiter délibérément.
2. **Débloquer IGDB** : régler la 2FA Twitch, créer l'app Twitch Developer, récupérer `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET`.
3. **Avant de coder IGDB** : vérifier la checklist `§9` de [multi-source-matching.md](docs/specs/multi-source-matching.md) contre la doc live (champs `category`, `status`, `involved_companies`, `updated_at`).
4. **Confirmer le code HTTP exact** du quota RAWG épuisé (401 vs 403 vs 429) quand l'occasion se présente — actuellement couvert par classe.
5. **Implémenter le matching multi-sources** (spec prête) une fois IGDB qui coule — calibrer les seuils sur de vraies collisions RAWG×IGDB.

---

**Fichiers clés**

```
src/services/import-games.ts          ← orchestration pure (zéro SQL brut)
src/providers/rawg/rawg-provider.ts   ← fetch + retry + classification statut
src/providers/provider.ts             ← GameProvider + ProviderError/ProviderQuotaError
src/database/game-repository.ts        ← saveGame (retourne id)
src/database/import-state-repository.ts ← getLastPage/saveLastPage
src/index.ts                          ← ⚠ SQL brut + export sans plateformes (à refactorer, action 1)
docs/specs/                           ← 2 specs + _index
schema.sql                            ← 4 tables (games, platforms, game_platforms, import_state)
```
