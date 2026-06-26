# Spec — Multi-source matching & ontologie de jeux

> **Statut : CONCEPTION.** Implémentation différée jusqu'à ce qu'une 2ᵉ source
> (IGDB) coule réellement. Les seuils de matching sont empiriques et se
> calibrent sur de vraies collisions inter-sources — les coder avant serait
> hardcoder des nombres invérifiables sur des données inexistantes.

## 1. Problème

Agréger plusieurs sources (RAWG, IGDB, MobyGames…) en un catalogue unique sans
créer de doublons, tout en préservant la provenance et en modélisant les
relations entre œuvres (remake, remaster, DLC, édition).

Le problème n'est pas "dédupliquer" — c'est **modéliser une ontologie de jeux
avec provenance par champ**.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Source game** | Un enregistrement brut tel que fourni par une source. Une ligne par `(source, source_id)`. Jamais fusionné, jamais écrasé. C'est la table `games` actuelle. |
| **Canonical game** | L'œuvre dédupliquée. Projection recalculable à partir d'un ou plusieurs source games. |
| **Œuvre** | Une création distincte. Demon's Souls 2009 et Demon's Souls 2020 sont deux œuvres. |
| **Édition** | Un repackaging d'une même œuvre (GOTY, Definitive, Complete). N'est PAS une œuvre distincte. |
| **Relation** | Une arête typée entre deux canonical games (`remake_of`, `remaster_of`, `dlc_of`, `edition_of`, `parent`). |
| **Blocking key** | Clé de regroupement grossière (titre normalisé + année ±1) pour éviter la comparaison O(n²). |
| **Bande de revue** | Plage de score où le matching est incertain → revue manuelle, jamais de merge auto. |
| **Backfill** | Mode de constitution initiale : crawl par page. |
| **Incremental** | Mode de mise à jour : "tout ce qui a changé depuis le dernier sync". |

## 3. Acceptance criteria

**Éditions collapsent**
- Étant donné `The Witcher 3: Wild Hunt` (2015) et `The Witcher 3: Game of the Year Edition` (2016) de la même source
- Quand on construit la projection canonique
- Alors il existe **un seul** canonical game, l'édition GOTY étant une variante.

**Remakes ne collapsent pas, ils se relient**
- Étant donné `Demon's Souls` (2009) et `Demon's Souls` (2020)
- Quand on construit la projection
- Alors il existe **deux** canonical games, reliés par une arête `remake_of`.

**Provenance préservée**
- Étant donné un jeu présent dans RAWG et IGDB
- Quand on construit la projection
- Alors les deux lignes `games` restent intactes, et le canonical game référence les deux.

**Précédence par champ**
- Étant donné un jeu où RAWG et IGDB divergent sur le studio
- Quand on calcule le champ `studios` du canonical game
- Alors c'est la valeur IGDB qui est retenue (précédence studios = IGDB), sans suppression de la valeur RAWG.

**Bande de revue**
- Étant donné deux source games avec un score de similarité dans la bande intermédiaire
- Quand on tente le matching
- Alors ils sont marqués `pending_review` et **jamais** fusionnés automatiquement.

**Early access ne casse pas le matching**
- Étant donné un jeu EA avec date-EA dans une source et date-1.0 dans l'autre (écart > 1 an)
- Quand on calcule le blocking
- Alors la tolérance d'année est élargie pour les jeux flaggés EA, et le match reste possible.

## 4. Modèle de données (cible — NON implémenté)

```
games  (existant)            -- source games, 1 ligne par (source, source_id)
  + canonical_id BIGINT NULL -- FK ajoutée vers canonical_games

canonical_games              -- l'œuvre dédupliquée
  id, title, release_year, release_status, created_at

game_relationships           -- le graphe
  from_canonical_id, to_canonical_id,
  type ∈ (remake_of, remaster_of, dlc_of, edition_of, parent)

companies                    -- studios / éditeurs
  id, name
game_companies
  canonical_id, company_id,
  role ∈ (developer, publisher, porting, supporting)
```

> Aucune de ces tables/colonnes n'est créée tant qu'IGDB ne coule pas
> (règle : zéro code préemptif).

## 5. Algorithme de matching

**Étape 1 — Normalisation de titre** (étend `normalizeTitle` actuel)
- lowercase, trim, NFKD + suppression diacritiques, suppression ™ ®
- strip des suffixes d'édition : `Game of the Year Edition`, `Definitive Edition`, `Remastered`, `GOTY`, `Director's Cut`, `Complete Edition`
- collapse des espaces
- **interdit** : stripper le sous-titre après `:` (`Final Fantasy VII` ≠ `Final Fantasy VII: Remake`)

**Étape 2 — Blocking**
- Clé = titre normalisé + année **±1** (les sources se contredisent souvent d'un an)
- Tolérance élargie pour les jeux flaggés `early_access`

**Étape 3 — Scoring multi-signaux dans un bloc**
- titre normalisé exact → confiance haute
- sinon ratio fuzzy (Jaro-Winkler ou token-set) > seuil → candidat
- année à ±1 → bonus
- recouvrement de plateformes (Jaccard sur les sets) → bonus fort (meilleur désambiguïsateur)

**Étape 4 — Décision à 3 bandes**
- score > seuil haut → merge auto
- bande intermédiaire → `pending_review`
- score < seuil bas → œuvres distinctes

**Étape 5 — Résolution de conflit (projection canonique)**
- précédence **par champ**, pas par source globale
- jamais d'écrasement silencieux : la valeur non retenue reste accessible via sa ligne source

## 6. Précédence par champ (cible — à valider)

| Champ | Autorité | Fallback |
|---|---|---|
| relations (remake/dlc) | IGDB | — |
| category / status | IGDB | RAWG |
| studios / éditeurs | IGDB | RAWG → MobyGames |
| genres | IGDB | RAWG |
| popularité / ratings | RAWG | IGDB |
| screenshots | RAWG | IGDB |

## 7. Deux modes de synchronisation

- **Backfill** (existant) : crawl par page, `import_state.last_page`.
- **Incremental** (futur) : filtre `updated` (RAWG) / `updated_at` (IGDB) depuis
  `last_synced_at`. Impose d'ajouter `last_synced_at` à `import_state` — **uniquement**
  au moment d'implémenter ce mode.

## 8. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Domaine | titre vide, année hors plage | exclu du matching, loggé en compteur |
| Système | API source indisponible, timeout | retry + reprise via import_state, message générique |
| Ambiguïté | score en bande de revue | `pending_review`, jamais de merge auto |

## 9. À VÉRIFIER contre la doc live avant implémentation

Les éléments suivants sont donnés **de mémoire** et doivent être confirmés
contre la documentation officielle avant tout code (règle : ne jamais asserter
une API sans vérifier) :

- [ ] IGDB : champ `category` et ses valeurs (main_game, remake, remaster, dlc, expansion…)
- [ ] IGDB : champ `status` et ses valeurs (released, early_access, alpha, beta, cancelled…)
- [ ] IGDB : `involved_companies` + rôles (developer, publisher, porting, supporting)
- [ ] IGDB : `version_parent` / `parent_game` pour les relations
- [ ] IGDB : filtre `updated_at` pour l'incrémental
- [ ] RAWG : filtre `updated` et fiabilité de `developers`/`publishers`
- [ ] MobyGames : granularité réelle des crédits + contraintes d'API

## 10. Lacunes identifiées

- [ ] Seuils de scoring (étape 3-4) non chiffrés — **bloquant pour l'implémentation**,
  se calibrent sur de vraies collisions RAWG×IGDB.
- [ ] Stratégie de re-matching incrémental (un canonical existant qui doit se
  re-scinder ou fusionner après nouvelle donnée) non spécifiée.
- [ ] Détection des éditions : la liste de suffixes (étape 1) est un point de
  départ, pas exhaustive.
