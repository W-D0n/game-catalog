# Spec — Garde-fous de sécurité (code + DB)

> **Statut : IMPLÉMENTÉ** (2026-07-05). Rédigé suite à l'incident
> `TRUNCATE ... CASCADE` qui a détruit la table `games` (1 167 128 lignes) en
> production. Cette spec découle d'une revue exhaustive de tout le code
> (`src/`), pas seulement de l'incident lui-même. Tous les points ci-dessous
> sont faits sauf 2.5 (sauvegardes, différé — voir §5).

## 1. Incident de référence

`TRUNCATE canonical_games CASCADE` ignore `ON DELETE SET NULL` déclaré sur
`games.canonical_id` — contrairement à `DELETE`, `TRUNCATE ... CASCADE`
truncate toute table ayant une FK vers la cible, quelle que soit l'action
`ON DELETE` déclarée. Résultat : toute la table `games` détruite en voulant
nettoyer une écriture partielle de `canonical_games`. RAWG (799 819 jeux)
irrécupérable avant le 2026-08-01 (quota).

## 2. Garde-fous DB

### 2.1 Rôle applicatif restreint — **fait**

Actuellement, l'application se connecte avec un rôle qui peut tout faire
(`TRUNCATE`, `DROP`, etc.) — le même rôle sert au code et aux commandes
manuelles de maintenance. **Proposition** : créer un second rôle Postgres,
`game_catalog_app`, avec uniquement `SELECT`/`INSERT`/`UPDATE`/`DELETE` sur
les tables applicatives — **sans** `TRUNCATE` ni `DROP`. `DATABASE_URL`
pointe vers ce rôle restreint. Les opérations de maintenance destructrices
(rares, déjà exceptionnelles) se font explicitement via une connexion
superuser distincte, jamais via `.env`/le code applicatif.

**Pourquoi c'est un vrai garde-fou** : même une erreur de ma part (ou un bug
futur) ne pourrait plus jamais exécuter un `TRUNCATE` contre la table
`games` — Postgres refuserait la commande avec une erreur de permission,
peu importe le SQL exact tenté.

**Implémenté** : rôle `game_catalog_app` créé avec `SELECT`/`INSERT`/
`UPDATE`/`DELETE` sur `game_catalog` (jamais `TRUNCATE`/`DROP`), `TRUNCATE`
accordé uniquement sur `game_catalog_test` (nécessaire à `resetDatabase()`
des tests). `DATABASE_URL`/`TEST_DATABASE_URL` basculés dessus. Vérifié :
suite de tests complète au vert avec ce rôle (141 tests), monitor fonctionnel
contre la prod. Tentative de `TRUNCATE` contre `game_catalog` bloquée par
Postgres (non ré-exécutée pour vérifier — le classificateur de sécurité l'a
lui-même refusée ; confirmé par les GRANT effectivement accordés, qui
n'incluent pas TRUNCATE sur cette base).

### 2.2 Contrainte anti-auto-référence sur `game_relationships` — **fait**

```sql
ALTER TABLE game_relationships
  ADD CONSTRAINT no_self_reference CHECK (from_canonical_id != to_canonical_id);
```

Appliquée aux deux bases. Testée : `saveGameRelationshipsBulk` avec
`fromCanonicalId === toCanonicalId` lève bien une erreur de contrainte.

### 2.3 Projection canonique — **vraie incrémentalité implémentée**

`buildCanonicalProjection()` ne retraite plus que les jeux avec
`canonical_id IS NULL`. Pour chaque groupe de blocking contenant au moins un
jeu nouveau :
- Aucun membre déjà lié → nouveau `canonical_games` créé.
- Tous les membres déjà liés pointent vers le **même** canonical existant →
  les nouveaux membres l'étendent (liaison + ajout sociétés/genres, jamais de
  ligne dupliquée).
- Les membres déjà liés touchent **plusieurs** canonical games distincts →
  ambigu (re-matching incrémental non spécifié, cf. spec multi-source-matching
  §10) — les nouveaux membres sont laissés **non liés** plutôt que fusionnés
  à l'aveugle, avec un log explicite.

Plus besoin de nettoyer quoi que ce soit avant de relancer — c'est le point
qui a directement motivé l'incident, désormais éliminé structurellement.

### 2.4 Docker : Postgres accessible uniquement en local — **fait**

```yaml
ports:
  - "127.0.0.1:5434:5432"   # au lieu de "5434:5432"
```

Sans le préfixe `127.0.0.1:`, Docker bind sur `0.0.0.0` — le port est exposé
à tout le réseau local avec les identifiants faibles `postgres`/`postgres`.

### 2.5 Sauvegarde avant opération à risque

Aucune sauvegarde n'existe. Proposition minimale : un script
`bun run backup` lançant `pg_dump` vers un fichier horodaté hors du
conteneur, à exécuter avant toute migration de schéma ou toute manipulation
manuelle de données en production.

## 3. Garde-fous code

### 3.1 Validation des variables d'environnement au démarrage — **fait**

7 identifiants externes (`IGDB_CLIENT_ID`/`SECRET`, `RAWG_API_KEY`,
`STEAM_API_KEY`/`STEAM_ID64`) sont lus via `!` (assertion non-null) sans
vérification runtime. Une variable absente produit une requête HTTP réelle
contenant `"undefined"` au lieu d'un échec immédiat et clair.

Proposition : un helper `requireEnv(name: string): string` dans
`src/config.ts` :

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}
```

Remplace chaque `process.env.X!` par `requireEnv("X")`.
`src/config.ts` créé, les 7 usages remplacés dans les providers RAWG/IGDB/Steam.

### 3.2 Suivi de progression pour `enrichRawgLibrary` — **fait**

Aucun état persistant (contrairement à `import_state` pour le backfill
principal) — un run interrompu par le quota (déjà observé) redémarre du
début à la prochaine tentative, sans garantie d'ordre (`getGameIdentitiesBySource`
n'a pas de `ORDER BY`), gaspillant un quota RAWG rare.

`ORDER BY id` ajouté à `getGameIdentitiesBySource`, filtrage via
`getGameIdsWithCredits()` avant de re-traiter.

### 3.3 Cohérence de normalisation de titre — **fait**

`enrich-rawg-library.ts` utilise encore `normalizeTitle` (agressif) pour le
matching bibliothèque Steam ↔ RAWG, alors que `normalizeMatchingTitle`
existe précisément pour éviter le bug de collision des titres
ponctuation-only (Session 3/4). Aligné.

### 3.4 Plafond de taille sur les groupes de blocking — **fait**

`buildCanonicalGroups` compare toutes les paires au sein d'un groupe
(O(k²)), sans plafond. Proposition : si un groupe dépasse ~200 entrées,
sauter la comparaison par paires et marquer tout le groupe comme non-fusionné
(chaque jeu reste séparé) plutôt que risquer un ralentissement pathologique.
`MAX_BLOCK_SIZE = 200` ajouté à `buildCanonicalGroups`, testé.

### 3.5 Nettoyage du code mort — **fait**

- `MobyGamesProvider` (`src/providers/mobygames/`) : jamais instancié, stub
  mort depuis le début du projet.
- `resolveGameTypeLabel` (`src/matching/igdb-lookups.ts`) : jamais appelé
  hors de son propre test.
- Les fonctions non-bulk de `canonical-repository.ts` (`createCanonicalGame`,
  `linkGameToCanonical`, `saveCompany`, `saveGameCompany`, `saveGenre`,
  `saveCanonicalGenre`, `saveGameRelationship`) : jamais appelées par
  l'orchestration réelle (qui utilise exclusivement les variantes `*Bulk`) —
  seulement par leurs propres tests. Supprimées, tests réécrits pour
  exercer les variantes bulk directement.

## 4. Garde-fou opérationnel (protocole, pas du code)

**Règle non négociable** : jamais de `TRUNCATE`/`DELETE`/`DROP` contre
`game_catalog` sans l'avoir d'abord vérifié sur `game_catalog_test`. Cette
règle existe déjà en mémoire de session — elle est dupliquée ici pour être
visible par quiconque lit le dépôt, pas seulement dans un contexte de
session Claude.

## 5. Priorisation proposée

| # | Garde-fou | Effort | Risque si absent |
|---|---|---|---|
| 2.1 | Rôle DB restreint | Moyen (config Postgres) | **Le plus fort** — empêche structurellement la récidive de l'incident |
| 2.3 | Reset sûr projection canonique | Faible | Fort — la pression qui a causé l'incident revient à coup sûr |
| 2.4 | Docker bind localhost | Trivial | Moyen (exposition réseau) |
| 2.2 | CHECK anti-auto-référence | Trivial | Faible (défense en profondeur) |
| 3.1 | `requireEnv` | Faible | Faible (clarté d'erreur, pas de corruption) |
| 3.2 | Progression `enrichRawgLibrary` | Faible | Moyen (gaspillage de quota) |
| 3.3 | Cohérence normalizeTitle | Trivial | Faible (biblio Steam, volume limité) |
| 3.4 | Plafond blocking | Faible | Faible (pas encore observé en pratique) |
| 2.5 | Sauvegardes | Moyen | Élevé à long terme, mais pas immédiat |
