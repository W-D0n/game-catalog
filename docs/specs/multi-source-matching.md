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

> **Extension de périmètre (2026-07-04)** : le matching doit aussi couvrir les
> **crédits nominatifs** (personnes physiques — développeurs individuels,
> artistes, compositeurs, etc.), pas seulement les studios/éditeurs à l'échelle
> entreprise. Voir §4 et §9.

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

people                       -- crédits nominatifs (extension, pas remplacement)
  id, name
game_credits
  canonical_id, person_id,
  role ∈ (director, writer, composer, artist, programmer, ...)
```

> **Extension crédits nominatifs** : `people`/`game_credits` s'ajoutent à
> `companies`/`game_companies`, ils ne les remplacent pas — l'un couvre les
> entreprises, l'autre les individus. Source la plus probable : MobyGames
> (granularité de crédits historiquement la plus fine, cf. `docs/overview.md`
> — "bonne couverture rétro"), à confirmer contre sa doc live avant
> implémentation (checklist §9, point non coché). Liste de rôles ci-dessus
> non exhaustive — à valider contre les données réelles au moment de
> l'implémentation (même principe que les seuils de scoring, §10).

> Aucune de ces tables/colonnes n'est créée tant qu'IGDB ne coule pas
> (règle : zéro code préemptif).

> ⚠️ **Corrections post-vérification live (§9)** :
> - `release_status` ci-dessus doit provenir de `game_status` IGDB (pas `status`, déprécié) — voir §6.
> - `game_companies.role` suppose un rôle unique par ligne. Le modèle IGDB réel
>   (`involved_companies`) expose 4 booléens indépendants et cumulables
>   (`developer`, `publisher`, `porting`, `supporting`) — une société peut être
>   développeur ET éditeur sur la même ligne. **Décision à prendre avant
>   implémentation** : soit `game_companies` stocke les 4 booléens tels quels,
>   soit on éclate une ligne IGDB en plusieurs lignes `game_companies` (une par
>   rôle vrai). Non tranché.

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

> ⚠️ Ligne « category / status » à corriger : les champs IGDB `category` et
> `status` sont **dépréciés** (`[deprecated = true]` dans le schéma proto v4
> live). Les remplaçants non dépréciés sont `game_type` (remplace `category`)
> et `game_status` (remplace `status`) — tous deux des références vers des
> endpoints de lookup (`game_types`, `game_statuses`), pas des enums inline.
> La précédence IGDB > RAWG reste valide, seuls les noms de champs source
> changent. Voir §9.

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

**Vérifié le 2026-07-04** contre le schéma proto v4 live (`https://api.igdb.com/v4/igdbapi.proto`) :

- [x] IGDB : champ `category` — **existe mais déprécié** (`[deprecated = true]`,
  champ 8). Valeurs historiques (`GameCategoryEnum`, lui-même déprécié) :
  `main_game=0, dlc_addon=1, expansion=2, bundle=3, standalone_expansion=4,
  mod=5, episode=6, season=7, remake=8, remaster=9, expanded_game=10, port=11,
  fork=12, pack=13, update=14`. **Remplaçant non déprécié : `game_type`**
  (champ 60), référence vers l'endpoint de lookup `game_types`.
- [x] IGDB : champ `status` — **existe mais déprécié** (`[deprecated = true]`,
  champ 37). Valeurs historiques (`GameStatusEnum`, lui-même déprécié) :
  `released=0, alpha=2, beta=3, early_access=4, offline=5, cancelled=6,
  rumored=7, delisted=8`. **Remplaçant non déprécié : `game_status`**
  (champ 59), référence vers l'endpoint de lookup `game_statuses`.
- [x] IGDB : `involved_companies` — confirmé, mais **pas un champ `role`
  unique** : chaque ligne `InvolvedCompany` expose 4 booléens indépendants et
  cumulables `developer`, `publisher`, `porting`, `supporting` (+ `id`,
  `company`, `game`, `created_at`, `updated_at`, `checksum`). Décision de
  modélisation à prendre — voir §4.
- [x] IGDB : `version_parent` / `parent_game` — confirmés tels quels, non
  dépréciés, tous deux de type `Game` (auto-référence). Conformes à
  l'hypothèse de la spec.
- [x] IGDB : filtre `updated_at` — confirmé, non déprécié,
  `google.protobuf.Timestamp` (champ 44). Filtre incrémental faisable tel que
  prévu en §7.

**Non vérifié** (hors périmètre de la vérification du 2026-07-04) :

- [ ] RAWG : filtre `updated` et fiabilité de `developers`/`publishers`
- [ ] MobyGames : granularité réelle des crédits + contraintes d'API — **condition
  bloquante pour l'extension crédits nominatifs** (§1, §4) : confirmer que
  MobyGames expose bien des crédits par personne (pas seulement par studio)
  et sous quelle forme (endpoint, rôles disponibles, limites de rate-limit)
  avant d'implémenter `people`/`game_credits`.
- [ ] IGDB : endpoints `credits` / `character` / `involved_companies` à
  l'échelle individu — vérifier si IGDB expose des crédits nominatifs
  garantis complets, ou si cette source reste limitée à l'échelle entreprise
  (auquel cas MobyGames devient l'autorité de précédence pour ce champ, à
  ajouter en §6 une fois tranché).

## 10. Lacunes identifiées

- [ ] Seuils de scoring (étape 3-4) non chiffrés — **bloquant pour l'implémentation**,
  se calibrent sur de vraies collisions RAWG×IGDB.
- [ ] Stratégie de re-matching incrémental (un canonical existant qui doit se
  re-scinder ou fusionner après nouvelle donnée) non spécifiée.
- [ ] Détection des éditions : la liste de suffixes (étape 1) est un point de
  départ, pas exhaustive.
- [ ] **Champs source `category`/`status` à corriger** (§4, §6) : remplacer par
  `game_type`/`game_status` (lookups par id) suite à la vérification live du
  2026-07-04 — voir §9.
- [ ] **Modélisation `game_companies.role` non tranchée** (§4) : 4 booléens
  IGDB cumulables (`developer`/`publisher`/`porting`/`supporting`) vs un rôle
  unique par ligne côté modèle cible — voir §9.
- [ ] **Crédits nominatifs (`people`/`game_credits`) non implémentés** —
  extension de périmètre actée le 2026-07-04, dépend de la vérification
  MobyGames/IGDB non faite (§9). Ni la source d'autorité ni la liste de rôles
  ne sont tranchées.
