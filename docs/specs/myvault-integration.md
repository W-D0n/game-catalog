# Spec — Intégration avec MyVault

> **Statut : CONCEPTION.** Pas de code écrit. Dépend de
> [cross-platform-library-model](cross-platform-library-model.md) et
> [archipelago-compatibility](archipelago-compatibility.md), ni l'une ni
> l'autre implémentée — rien n'est exploitable ici avant elles.
> Cette spec décrit uniquement le contrat côté **game-catalog** ; MyVault
> est un projet séparé, en construction, dont la stack n'est pas connue
> depuis ce dépôt et n'est donc pas spécifiée ici.

## 1. Problème

Définir ce que game-catalog s'engage à fournir pour que MyVault puisse
construire sa page "bibliothèque" (jeux possédés cross-plateformes,
enrichis : média, genres, statut Archipelago-ready) — sans dupliquer la
logique de matching/enrichissement déjà présente dans game-catalog.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Contrat d'intégration** | Ce que game-catalog fournit (schéma stable, export, ou accès direct) — pas une API HTTP pour l'instant (aucune n'existe dans ce projet). |
| **Page Library (MyVault)** | Vue prévue côté MyVault listant les jeux possédés, enrichis. |
| **`LibraryEntry`** | Vue logique exposée par ce contrat, indépendante du mode de transport choisi (cf. §4). |

## 3. Acceptance criteria (côté game-catalog uniquement)

**Une seule jointure pour tout l'enrichissement**
- Étant donné un jeu possédé matché (`owned_games.canonical_id` renseigné)
- Quand MyVault veut l'afficher enrichi
- Alors un JOIN `owned_games` → `canonical_games` (+ le lookup média déjà
  exposé par `getCanonicalGamesForExport`) suffit — pas de recalcul de
  matching côté MyVault.

**Statut Archipelago disponible dans le même flux**
- Étant donné le champ `archipelago: boolean` (cf.
  [archipelago-compatibility](archipelago-compatibility.md) §4)
- Quand l'enrichissement d'un jeu possédé est produit
- Alors ce champ est présent dans la même sortie que le reste (média,
  genres, companies) — pas un appel séparé.

**Pas d'hypothèse sur la colocalisation**
- Cette spec ne suppose PAS que MyVault tourne sur le même serveur Postgres
  que game-catalog. Le mode de transport (§4) reste à trancher selon
  l'architecture réelle de MyVault — inconnue à ce stade.

## 4. Modes d'intégration envisagés (non tranché — bloquant)

1. **Lecture DB directe** : MyVault se connecte au même Postgres via un
   rôle restreint lecture seule dédié — cohérent avec les rôles DB
   restreints déjà en place suite à l'incident TRUNCATE
   (`docs/specs/safety-guardrails.md`).
2. **Export JSON** : MyVault consomme les fichiers `exports/*.json`
   existants (mécanisme déjà en place), régénérés manuellement ou via
   [catalog-update-pipeline](catalog-update-pipeline.md) une fois ce
   dernier implémenté.
3. **API HTTP dédiée** : n'existe pas aujourd'hui dans game-catalog — pure
   lecture, à exposer seulement si MyVault ne peut consommer ni la DB ni
   des fichiers JSON statiques.

Cette spec **ne tranche pas** entre ces trois options : la décision dépend
de la stack, de l'hébergement et de l'accès réseau de MyVault, inconnus
depuis ce dépôt. **Point bloquant explicite — à valider avec le owner avant
toute implémentation.**

## 5. Modèle exposé (vue logique, indépendante du transport)

```
LibraryEntry {
  platform: string                              // 'steam', 'gog', ...
  externalId: string
  rawTitle: string
  canonicalGame: CanonicalGameExport | null      // déjà défini dans canonical-repository.ts
  archipelagoReady: boolean
}
```

`CanonicalGameExport` (déjà existant, `src/database/canonical-repository.ts`)
inclut déjà `media`, `genres`, `companies`, `platforms`, `relationships` —
rien de neuf à ajouter côté canonical export pour satisfaire ce contrat, à
l'exception du champ `archipelago` (cf. spec dédiée).

## 6. Taxonomie d'erreurs

Hérite des specs référencées ([cross-platform-library-model](cross-platform-library-model.md),
[archipelago-compatibility](archipelago-compatibility.md)) — cette spec est
une couche de contrat, pas un pipeline, elle n'introduit pas de nouvelle
catégorie d'erreur propre.

## 7. Lacunes identifiées

- [ ] **Stack/architecture de MyVault inconnue depuis ce dépôt** — mode
  d'intégration (§4) non tranché, blocage explicite.
- [ ] **Authentification/autorisation** si accès DB direct ou API — hors
  scope tant que le mode de transport n'est pas choisi.
- [ ] Cette spec dépend de deux specs non encore implémentées
  ([cross-platform-library-model](cross-platform-library-model.md),
  [archipelago-compatibility](archipelago-compatibility.md)) — rien n'est
  exploitable avant leur implémentation.
