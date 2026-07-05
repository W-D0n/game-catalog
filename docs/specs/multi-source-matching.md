# Spec — Multi-source matching & ontologie de jeux

> **Statut : IMPLÉMENTÉ** (2026-07-05, 5 sessions). Code écrit et testé
> (schéma §4, algorithme §5, projection canonique §6) contre les vraies
> données RAWG×IGDB. **Pas encore ré-exécuté avec succès en production** au
> catalogue complet : le premier run a révélé un débit trop lent (~50
> groupes/s), et en corrigeant ça un incident de données (`TRUNCATE ...
> CASCADE`, voir mémoire projet) a détruit `games` — RAWG irrécupérable avant
> le 2026-08-01, IGDB en reconstruction. L'écriture est maintenant batchée et
> validée à l'échelle sur la base de test (30k jeux synthétiques, 4s) — reste
> à relancer sur les vraies données une fois reconstituées.

## 1. Problème

Agréger plusieurs sources (RAWG, IGDB, MobyGames…) en un catalogue unique sans
créer de doublons, tout en préservant la provenance et en modélisant les
relations entre œuvres (remake, remaster, DLC, édition).

Le problème n'est pas "dédupliquer" — c'est **modéliser une ontologie de jeux
avec provenance par champ**.

> **Extension de périmètre envisagée puis abandonnée (2026-07-04)** : l'idée
> de couvrir les **crédits nominatifs** (personnes physiques — développeurs
> individuels, artistes, compositeurs) en plus des studios/éditeurs a été
> explorée puis abandonnée faute de source gratuite exploitable. Voir §9 pour
> le détail des trois pistes vérifiées (IGDB, MobyGames, Giant Bomb) et leurs
> raisons d'échec respectives. Hors périmètre pour l'instant — à rouvrir si
> une source viable apparaît.

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

## 4. Modèle de données — **implémenté** (2026-07-05)

```
games  (existant)            -- source games, 1 ligne par (source, source_id)
  + canonical_id BIGINT NULL -- FK ajoutée vers canonical_games (ON DELETE SET NULL)

canonical_games              -- l'œuvre dédupliquée
  id, title, release_year, release_status, created_at

game_relationships           -- le graphe
  from_canonical_id, to_canonical_id,
  type ∈ (remake_of, remaster_of, dlc_of, edition_of, parent)

companies                    -- studios / éditeurs
  id, name
game_companies                -- une ligne par (canonical_id, company_id)
  canonical_id, company_id,
  is_developer BOOLEAN, is_publisher BOOLEAN,
  is_porting BOOLEAN, is_supporting BOOLEAN

genres                       -- ajouté 2026-07-05, oublié à la Session 2
  id, name
canonical_game_genres
  canonical_id, genre_id
```

> **Précédence effective observée** : `companies`/`genres` ne sont alimentés
> que par IGDB — RAWG ne fournit aucune de ces deux données par jeu (vérifié
> §9 pipeline RAWG). Ce n'est donc pas un vrai fallback multi-source pour
> l'instant, juste IGDB seul producteur.

> **Crédits nominatifs (`people`/`game_credits`) — abandonné, pas de table
> cible.** Envisagé le 2026-07-04 pour couvrir les personnes physiques
> (développeurs individuels, artistes, compositeurs) en plus des entreprises,
> puis abandonné faute de source gratuite exploitable — voir §9.

> Aucune de ces tables/colonnes n'est créée tant qu'IGDB ne coule pas
> (règle : zéro code préemptif).

> ⚠️ **Corrections post-vérification live (§9)** :
> - `release_status` ci-dessus doit provenir de `game_status` IGDB (pas `status`, déprécié) — voir §6.
> - `game_companies` : **tranché le 2026-07-04**. Le modèle IGDB réel
>   (`involved_companies`) expose 4 booléens indépendants et cumulables — une
>   société peut être développeur ET éditeur sur la même ligne. Le modèle
>   cible stocke ces 4 booléens tels quels (`is_developer`, `is_publisher`,
>   `is_porting`, `is_supporting`) plutôt que d'éclater en plusieurs lignes par
>   rôle : reflète directement la structure source sans transformation avec
>   perte d'info, requêtes simples (`WHERE is_developer`).

## 5. Algorithme de matching

**Étape 1 — Normalisation de titre** — **implémenté** (2026-07-05) sous
`normalizeMatchingTitle` (`src/normalizers/matching-title-normalizer.ts`),
**distinct** de `normalizeTitle` (dédup intra-source, plus agressif — supprime
toute ponctuation). `normalizeMatchingTitle` :
- lowercase, trim, NFKD + suppression diacritiques, suppression ™ ®
  (dans cet ordre — ™/® doivent être supprimés **avant** `normalize("NFKD")`,
  sinon NFKD les décompose en lettres "TM"/"R" et le strip ne matche plus rien)
- strip des suffixes d'édition (liste élargie le 2026-07-05 par comptage
  empirique, voir §10) : `Game of the Year Edition`, `Game of the Year`,
  `Definitive Edition`, `Director's Cut`, `Complete Edition`,
  `Deluxe Edition`, `Digital Deluxe`, `Collector's Edition`,
  `Ultimate Edition`, `Special Edition`, `Gold Edition`,
  `Anniversary Edition`, `Extended Edition`, `Enhanced Edition`,
  `Legendary Edition`, `Standard Edition`, `HD Edition`, `Remastered`,
  `Redux`, `GOTY` — appliqués en boucle jusqu'à point fixe (suffixes
  empilables, ex. `"Director's Cut Redux"`)
- collapse des espaces
- **conserve la ponctuation** (contrairement à `normalizeTitle`) et **interdit**
  de stripper le sous-titre après `:` (`Final Fantasy VII` ≠ `Final Fantasy VII: Remake`)

**Étape 2 — Blocking** — **implémenté** (`src/matching/blocking.ts`)
- Clé = titre normalisé exact (le ±1 an s'applique à la décision, étape 4, pas au blocking lui-même)
- Tolérance élargie pour les jeux flaggés `early_access` — **non implémenté,
  vérifié infaisable en l'état le 2026-07-05** : `resolveGameStatus` existe
  (§9, lookups résolus), mais `game_status` est **null pour 322 335 des
  322 336 jeux IGDB en base** (un seul renseigné). Vérifié en direct contre
  l'API IGDB elle-même (pas un bug d'import) : même *Baldur's Gate III*
  (connu pour son passage par l'early access) n'a **aucun** `game_status`
  renseigné côté IGDB — seul un spin-off annulé (*The Black Hound*) en a un
  (`Cancelled`). Ce champ est sporadiquement peuplé par IGDB, quel que soit
  le jeu. Implémenter une tolérance sur une donnée quasi jamais disponible
  serait un seuil invérifiable sur données inexistantes (zéro code
  préemptif) — différé tant que la couverture réelle ne s'améliore pas.
- ⚠️ **Garde-fou de longueur minimale (3 caractères)** conservé en défense en
  profondeur, mais son rôle a changé depuis le calibrage du 2026-07-04 : le
  bug alors trouvé (titres ponctuation-only du type `"!!!"` s'effondrant tous
  vers `""` avec l'ancien `normalizeTitle`, 741 321 collisions parasites sur
  942 825 mesurées) **ne se reproduit pas** avec `normalizeMatchingTitle`,
  puisqu'il préserve la ponctuation (`"!!!"` reste `"!!!"`, distinct de
  `"****"`). Le garde-fou protège désormais seulement les titres réellement
  courts (1-2 caractères, ex. `"X"`), un risque résiduel bien plus faible.

**Étape 3 — Scoring multi-signaux dans un bloc** — **implémenté**
(`src/matching/decide-match.ts`, fonction `decideMatch`)
- titre normalisé exact → confiance haute (garanti par le blocking étape 2)
- sinon ratio fuzzy (Jaro-Winkler ou token-set) > seuil → candidat — **non
  implémenté en v1** (voir §10, différé)
- année à ±1 → bonus
- recouvrement de plateformes (Jaccard sur les sets) → bonus fort (meilleur
  désambiguïsateur) — **nécessite `normalizePlatformName`/`computePlatformOverlap`**
  (`src/normalizers/platform-normalizer.ts`, ajouté 2026-07-04) : RAWG et IGDB
  nomment leurs plateformes différemment (`"PC"` vs `"PC (Microsoft
  Windows)"`, `"Commodore / Amiga"` regroupé côté RAWG vs 7 entrées séparées
  côté IGDB) — sans cette normalisation, le Jaccard sur les chaînes brutes est
  cassé (voir mesure ci-dessous).

**Étape 4 — Décision à 3 bandes — seuils calibrés le 2026-07-04, implémentés le 2026-07-05**

Le blocking (titre exact) garantit qu'il n'y a que 2 bandes atteignables en
v1 (`merge` / `pending_review`) — la bande "œuvres distinctes" est déjà
tranchée en amont par le blocking lui-même (titres différents = blocks
différents = jamais comparés). Elle ne redeviendra pertinente que si le
matching fuzzy (non implémenté, voir ci-dessus) introduit des blocks groupant
des titres non-identiques.

Calibrage effectué sur les collisions réelles RAWG×IGDB en base (799 819
jeux RAWG × 367 307 jeux IGDB, 199 872 collisions par titre normalisé exact
après exclusion des clés dégénérées) :

| Combinaison de signaux | Volume mesuré | Décision |
|---|---|---|
| Titre exact + année exacte ou ±1 + overlap plateforme (normalisé) > 0 | 118 124 | **merge auto** |
| Titre exact + (overlap = 0 **ou** année absente d'un côté) | 46 705 | `pending_review` |
| Titre exact + écart d'année > 1 an | 37 584 | `pending_review` (mélange remakes légitimes et collisions de titre générique du type `"chess"`, indiscernable sans signal supplémentaire) |

Avant correction du mapping de plateformes, le bucket "overlap = 0" était
gonflé à tort (81 869 au lieu de 4 838 sur le sous-cas année-exacte) à cause
du mismatch de vocabulaire — la normalisation des plateformes est donc une
dépendance dure de ce calibrage, pas une amélioration optionnelle.

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

**Crédits nominatifs — piste explorée et abandonnée le 2026-07-04** (voir §1, §4) :

- [x] IGDB : endpoints/messages liés aux crédits individuels — **absents**.
  Vérifié dans le schéma proto v4 live : `Character` désigne des personnages
  fictifs du jeu (champs `species`, etc.), pas des personnes réelles.
  `involved_companies` reste strictement à l'échelle entreprise. IGDB n'a
  aucune structure pour les crédits nominatifs.
- [x] MobyGames : a bien un tier gratuit non-commercial (720 req/h, distinct
  de l'abonnement payant `MobyPlus`), mais l'accès nécessite un formulaire de
  demande justifiant un usage recherche/non-profit — non applicable à ce
  projet (hobby personnel), le fournisseur oriente explicitement ce cas vers
  son tier payant "Hobbyist". Écarté pour raison budgétaire, pas technique.
- [x] Giant Bomb (piste alternative testée) : API gratuite en théorie
  (inscription + clé), avec une ressource `person` et des champs `people`/
  `first_appearance_people` sur `game`. **Bloqué en pratique** : le domaine
  est protégé par Cloudflare bot-management, qui renvoie soit un challenge JS
  (`/api/games/`) soit un faux 404 généré par Cloudflare
  (`cf-mitigated: challenge` confirmé sur `/api/search/`) pour toute requête
  serveur-à-serveur, même avec une clé API valide. Testé en direct le
  2026-07-04, échec confirmé — pas de contournement tenté (évasion anti-bot
  hors périmètre).

## 10. Lacunes identifiées

- [x] **Seuils de scoring (étape 3-4) calibrés le 2026-07-04** sur les vraies
  collisions RAWG×IGDB — voir §5 étape 4 pour les chiffres et la méthode.
- [ ] **Matching fuzzy non implémenté** : seul le titre normalisé exact est
  géré en v1 (étape 3). Les quasi-doublons avec légère divergence de titre
  entre sources ne sont pas détectés — nécessiterait une technique dédiée
  (similarité trigram, ex. extension Postgres `pg_trgm`), non couverte par ce
  calibrage. Ces cas restent des `games` non liés (pas de faux négatif fatal,
  juste une couverture incomplète du dédoublonnage).
- [ ] `src/normalizers/platform-normalizer.ts` est une curation manuelle sur
  les plateformes réellement présentes dans le catalogue au 2026-07-04, pas
  une couverture exhaustive de toutes les plateformes IGDB possibles — à
  compléter si de nouvelles plateformes apparaissent côté RAWG ou IGDB et
  que le recouvrement se dégrade silencieusement.
- [x] **Re-matching incrémental — traité conservativement le 2026-07-05** :
  `buildCanonicalProjection()` ne retraite que `canonical_id IS NULL`. Un
  nouveau jeu qui matche un seul canonical existant l'étend. Un nouveau jeu
  qui touche **plusieurs** canonical games existants (cas ambigu — devrait-il
  les fusionner ?) est **laissé non lié** plutôt que de fusionner à l'aveugle
  — pas de scission automatique de canonical existant non plus (non
  implémenté, cohérent avec "jamais de merge auto en cas d'incertitude").
- [x] **Tolérance `early_access` — vérifiée infaisable le 2026-07-05** :
  `game_status` quasi jamais peuplé côté IGDB (322 335/322 336 null),
  confirmé en direct sur l'API — voir §5 étape 2. Pas de code écrit, pas de
  seuil inventé sans donnée.
- [x] **Détection des éditions — liste élargie le 2026-07-05** par comptage
  empirique sur 799 819 RAWG + 322 337 IGDB (pas une supposition) : ajout de
  `deluxe edition` (1488 occurrences, le plus fréquent absent), `collector's
  edition` (1395), `ultimate edition`, `digital deluxe`, `special edition`,
  `gold edition`, `anniversary edition`, `extended edition`, `enhanced
  edition`, `legendary edition`, `standard edition`, `hd edition`, `redux`,
  `game of the year` (sans "edition"). **`remake` délibérément exclu** — un
  remake est une œuvre distincte (relation `remake_of`), pas une édition.
  Bug trouvé et corrigé en écrivant les tests : les suffixes empilés
  (`"Director's Cut Redux"`) n'étaient retirés qu'en une passe à ordre fixe —
  passé en boucle jusqu'à point fixe. Liste non exhaustive (le catalogue
  RAWG évoluera avec le retour du quota), mais boucle de calibrage
  reproductible désormais en place.
- [ ] **Champs source `category`/`status` à corriger** (§4, §6) : remplacer par
  `game_type`/`game_status` (lookups par id) suite à la vérification live du
  2026-07-04 — voir §9. Nuance ajoutée le 2026-07-05 : `game_status` étant
  quasi toujours null (voir ci-dessus), `release_status` sera vide pour la
  quasi-totalité des canonical games même une fois ce champ corrigé — limite
  de données, pas de code.
