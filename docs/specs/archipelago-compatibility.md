# Spec — Compatibilité Archipelago

> **Statut : IMPLÉMENTÉ (2026-07-10).** Les deux sources (officielle + wiki)
> sont crawlées et matchées. Accès wiki débloqué : le 403 du 2026-07-06 était
> un blocage anti-bot générique, résolu avec un User-Agent réaliste. Champ
> dérivé `archipelago: boolean` sur `getCanonicalGamesForExport` **non
> câblé** (aucun consommateur actuel — voir §10).

## 1. Problème

Exposer, pour chaque `canonical_game`, s'il est compatible avec Archipelago
(système de randomizer multi-jeux) — utile pour filtrer la bibliothèque
possédée dans [myvault-integration](myvault-integration.md). Deux sources
possibles :

- **Officielle** : `archipelago.gg/games` — liste HTML statique, ~120 jeux,
  une entrée par jeu supporté.
- **Wiki (non-officielle)** : `archipelago.miraheze.org`, catégories par
  plateforme.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Jeu Archipelago-ready** | Jeu pour lequel un "world" (module d'intégration) existe, listé sur au moins une des deux sources. |
| **Source officielle** | `archipelago.gg/games` — page HTML statique, pas de pagination, ~120 entrées (titre, description, liens Setup/Options/Advanced Options, parfois "Report a Bug"). |
| **Source wiki** | `archipelago.miraheze.org/wiki/Category:Games_by_platform` — accès **non vérifié** (403 rencontré lors de l'investigation, cf. §7). |
| **`archipelago_games`** | Table cible : une entrée par jeu listé sur une source, avant matching vers le catalogue canonique. |

## 3. Acceptance criteria

**Match direct**
- Étant donné un jeu listé sur `archipelago.gg/games` (ex: "Hollow Knight")
- Et un `canonical_game` de même titre normalisé
- Quand le matching tourne
- Alors ce `canonical_game` est reconnu Archipelago-ready.

**Absence = non ready**
- Étant donné un jeu non listé sur aucune des deux sources
- Alors aucun marquage n'existe pour lui — pas de colonne booléenne
  toujours vraie/fausse (règle "single-value field", cf. `CLAUDE.md`).

**Jeu Archipelago sans correspondance canonique**
- Étant donné un jeu listé côté Archipelago mais absent du catalogue canonique
- Quand le matching échoue à trouver un candidat
- Alors il est loggé comme non résolu, sans bloquer le traitement des autres.

**Idempotence du re-crawl**
- Étant donné un re-crawl de la même source
- Quand il s'exécute
- Alors aucun doublon n'est créé (upsert par `(source, raw_title)`).

## 4. Modèle de données (cible — NON implémenté)

```sql
CREATE TABLE archipelago_games (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('official', 'wiki')),
    raw_title TEXT NOT NULL,
    platform_hint TEXT,  -- ex: "Atari 2600", extrait du titre officiel ou de la catégorie wiki
    canonical_id BIGINT REFERENCES canonical_games(id) ON DELETE SET NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(source, raw_title)
);

CREATE INDEX idx_archipelago_games_canonical_id ON archipelago_games (canonical_id);
```

Pas de colonne booléenne sur `canonical_games` : présence dans
`archipelago_games` avec `canonical_id` renseigné = ready ; absence = non
ready. `getCanonicalGamesForExport` ajoutera un champ dérivé
`archipelago: boolean`, calculé par une jointure `EXISTS`, jamais stocké en
dur sur `canonical_games`.

## 5. Pipeline

```
Scraping source officielle (archipelago.gg/games)
  → parse HTML (une entrée = un titre, parfois suffixé "(Plateforme)")
  → upsert archipelago_games (source='official')

Scraping source wiki (SI l'accès HTTP standard fonctionne, cf. §7)
  → parse les catégories par plateforme (MediaWiki category members)
  → upsert archipelago_games (source='wiki', platform_hint = nom de la catégorie)

Matching (incrémental, WHERE canonical_id IS NULL)
  → normalizeMatchingTitle(raw_title)
  → cherche candidat(s) canonical_games
  → 1 seul candidat → lie ; 0 ou ambigu → laissé non lié, loggé
```

## 6. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Domaine | jeu Archipelago sans correspondance canonique | `canonical_id` NULL, loggé, pas d'erreur bloquante |
| Système | la page HTML change de structure (scraping fragile par nature) | échec explicite avec message clair — pas de silent failure, vérification manuelle nécessaire si le parsing casse |
| Domaine | même titre listé sur les deux sources | deux lignes distinctes (source différente) ; les deux pointent vers le même `canonical_id` après matching — pas de déduplication forcée entre sources |

## 7. Recherche préliminaire (2026-07-06)

- **Source officielle** : confirmée accessible, page HTML statique unique
  (pas de pagination, pas d'API), ~120 jeux. Chaque entrée : titre (parfois
  suffixé `(Plateforme)`, ex: "Adventure (Atari 2600)"), description courte,
  liens Game Page / Setup Guides / Options Page / Advanced Options.
- **Source wiki** : tentative de fetch direct (page catégorie ET
  `/w/api.php` MediaWiki standard) → **HTTP 403 dans les deux cas**, cause
  probable protection anti-bot (Miraheze/Cloudflare). Non concluant sur la
  faisabilité réelle — un client HTTP avec un User-Agent réaliste pourrait
  fonctionner là où l'outil de recherche utilisé pour cette investigation a
  échoué. À revérifier avant implémentation.

## 8. Lacunes identifiées

- [x] **Accès à la source wiki : débloqué (2026-07-10)** — le 403 du
  2026-07-06 était un blocage anti-bot (Cloudflare/Miraheze), résolu avec un
  User-Agent réaliste. L'API MediaWiki standard (`action=query&list=categorymembers`)
  fonctionne, 760 jeux dans `Category:Games` (liste plate, pas de découpage
  par plateforme — voir §10 pour ce qui change par rapport au plan initial).
- [x] **Structure du HTML officiel : implémentée (2026-07-10)** — chaque jeu
  est marqué par un attribut `data-game="Titre"` (81 jeux, vérifié en
  direct). Pas de suffixe plateforme dans le titre contrairement à
  l'hypothèse initiale de cette spec (voir §10). Scraping fragile par
  nature (accepté) : le parser lève une exception explicite si l'attribut
  disparaît de la page.
- [ ] **Fréquence de re-crawl** non tranchée ici — dépend de
  [catalog-update-pipeline](catalog-update-pipeline.md) (nouveaux jeux
  Archipelago ajoutés au fil du temps par la communauté).
- [ ] **Pas de détection de retrait** : un jeu qui disparaît de la liste
  officielle resterait marqué ready indéfiniment — même lacune assumée que
  pour le catalogue principal.
- [ ] **Champ dérivé `archipelago: boolean`** non ajouté à
  `getCanonicalGamesForExport` — aucun consommateur actuel (myvault-integration
  n'est pas implémenté), violerait "zéro code préventif" si ajouté
  maintenant. À câbler quand un premier consommateur existe.

## 10. Écarts avec le plan initial (constatés à l'implémentation, 2026-07-10)

- **Pas de `platform_hint`** : la colonne prévue en §4 n'a pas été créée —
  la source wiki retenue est la catégorie plate `Category:Games` (pas
  `Category:Games_by_platform`, plus simple et suffisante pour matcher),
  donc aucune plateforme à en extraire. Cohérent avec "zéro colonne sans
  producteur".
- **Pas de suffixe plateforme dans les titres officiels** : l'hypothèse
  `"Adventure (Atari 2600)"` de §1 ne correspond pas aux données réelles —
  les titres sont propres (`"Adventure"`, `"Sonic Adventure 2 Battle"`).
  Aucune désambiguïsation par plateforme nécessaire au parsing.
- Résultat en direct sur le catalogue actuel : 841 entrées crawlées
  (81 officielles + 760 wiki), 512 matchées à un canonical game.
