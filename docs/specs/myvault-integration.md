# Spec — Intégration avec MyVault

> **Statut : Export prêt côté game-catalog (2026-07-11), complété avec les
> crédits RAWG et le nettoyage Galaxy (2026-07-17). Réception livrée séparément
> dans MyVault.** Dépendances
> ([cross-platform-library-model](cross-platform-library-model.md),
> [archipelago-compatibility](archipelago-compatibility.md)) implémentées.
> **Règle stricte : ce projet (game-catalog) ne touche jamais au code ni
> à la base de données de MyVault.**
>
> **Décision (2026-07-11)** : MyVault gère déjà lui-même l'ownership de sa
> bibliothèque (récupération directe depuis les plateformes) — game-catalog
> ne duplique pas ce mécanisme. game-catalog fournit uniquement
> l'**enrichissement** qu'il calcule déjà (média, genres, companies, crédits
> RAWG, statut Archipelago-ready), sous forme d'un **export ponctuel prêt à être
> importé**, pas une synchronisation permanente ni un accès direct entre
> les deux bases.

## 1. Problème

game-catalog calcule un enrichissement (média, genres multiples,
companies, crédits RAWG, statut Archipelago) que MyVault ne recalcule pas.
Il faut le rendre consommable sans dupliquer la logique de
matching/enrichissement déjà présente ici, et sans introduire de
dépendance réseau permanente entre les deux projets (bases de données
distinctes, hébergements distincts).

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Identifiant de possession** | Couple (plateforme, id externe) — ex: appid Steam, releaseKey GOG. Identique des deux côtés puisque calculé à partir du même compte réel. |
| **Import row** | Une ligne du fichier `exports/myvault-games-import.json` — un jeu déjà regroupé par identité canonique, prêt à être consommé côté cible. |

## 3. Ce que game-catalog fournit (fait, 2026-07-11)

`bun run export-myvault-games` → `exports/myvault-games-import.json`.
Implémenté dans `src/services/export-myvault-games.ts`
(`buildMyvaultGamesImport`), testé (`export-myvault-games.test.ts`),
vérifié en direct : **1207 lignes** (681 groupées sur plusieurs
plateformes, 54 marquées `archipelago: true`).

**Regroupement** : `owned_games` est groupé par `canonical_id` — un jeu
possédé sur deux plateformes (ex: Steam et GOG) devient **une seule
ligne** avec un identifiant de possession par plateforme. Les jeux non
matchés au catalogue canonique restent chacun leur propre ligne (aucune
identité commune pour les regrouper), titre brut tel que remonté par la
plateforme.

**Forme d'une ligne** (`MyvaultGameImportRow`, voir le code source pour
le détail exact des types) :

- `title`, `coverUrl`, `platforms` (liste d'identifiants de possession),
  `genre` (un seul, le premier de la liste — perte volontaire si la cible
  ne gère qu'un genre unique), `year`, `description` — champs "de base",
  probablement déjà supportés par n'importe quel modèle de bibliothèque
  de jeux simple.
- `archipelago`, `genres` (liste complète), `companies`, `people`,
  `screenshotUrls`, `videoIds`, `storyline` — champs d'enrichissement, qui nécessitent que
  le système cible ait (ou ajoute) les colonnes correspondantes pour les
  recevoir. `people` transporte `{ source, externalId, name, slug, role }` ;
  le rôle disponible est `development_team` et la source est RAWG.
  `bun run enrich-rawg-library` ne parcourt plus le catalogue RAWG complet :
  il recherche seulement les titres canoniques présents dans `owned_games`,
  accepte un match exact normalisé, le relie au canonical existant puis
  récupère `development-team`. Le marqueur de fetch rend la commande
  reprenable, y compris pour les équipes vides.
  La commande travaille uniquement sur le snapshot `owned_games` déjà persisté ;
  les refresh Steam/GOG/Epic/Itch restent des commandes préalables séparées.

Les champs liés au temps de jeu/dernière session/URL boutique sont
laissés à une valeur neutre : cette donnée n'existe pas côté game-catalog
(aucune API de possession utilisée ne la fournit) — à peupler par le
mécanisme d'ownership propre à la cible si besoin, pas par cet import.

**Nettoyage Galaxy (2026-07-17)** : Galaxy agrège aussi des bibliothèques
tierces dans `LibraryReleases`. Le client GOG ne conserve désormais que les
release keys natives `gog_*`. Le service remplace atomiquement le snapshot
`owned_games(platform='gog')`, ce qui purge les anciennes lignes `epic_*` /
`steam_*`. MyVault peut conserver son filtre défensif, mais l'export n'émet
plus ces artefacts. `export-myvault-games` applique aussi cette règle à la
lecture du snapshot : même si un ancien snapshot pollué n'a pas encore été
rafraîchi, aucun identifiant Galaxy tiers ne traverse la frontière JSON.

## 4. Ce qui reste à faire (hors scope de ce dépôt)

Le système cible doit pouvoir stocker les champs d'enrichissement listés
en §3 (ajouter les colonnes/champs correspondants si son modèle actuel ne
les a pas), puis importer le fichier JSON produit ici — une fois, pas une
synchronisation continue. L'idempotence d'un import rejoué (reconnaître
un jeu déjà importé) est une décision et une implémentation qui
appartiennent entièrement au système cible, pas à ce dépôt.

## 5. Taxonomie d'erreurs

Hérite des specs référencées ([cross-platform-library-model](cross-platform-library-model.md),
[archipelago-compatibility](archipelago-compatibility.md)) côté
game-catalog. Les erreurs du côté import (migration, insertion,
idempotence) sont hors scope de ce dépôt.

## 6. Lacunes identifiées

- [x] **Export game-catalog : FAIT (2026-07-11)** — `bun run export-myvault-games`,
  regroupement par `canonical_id`, testé, vérifié en direct (1207 lignes).
- [x] **Réception côté MyVault** — livrée dans le dépôt séparé MyVault ;
  aucun lien de code, DB ou runtime ajouté depuis ce dépôt.
- [x] **Doublons Galaxy/Epic** — filtrés à la source et purgés par remplacement
  atomique du snapshot GOG.
- [ ] **Temps de jeu / dernière session / URL boutique** toujours neutres
  à l'import — à peupler par le mécanisme d'ownership propre au système
  cible, pas par cet export.
