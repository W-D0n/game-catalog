-- Préparé pour le matching fuzzy (différé au 2026-08-01, voir
-- docs/specs/multi-source-matching.md §10) — pas encore utilisé par le code.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE canonical_games (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    release_year INTEGER,
    release_status TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE games (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    release_year INTEGER,
    slug TEXT,
    raw_metadata JSONB,
    canonical_id BIGINT REFERENCES canonical_games(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, source_id)
);

CREATE INDEX idx_games_canonical_id ON games (canonical_id);

-- Idem : préparé pour le matching fuzzy, pas encore utilisé.
CREATE INDEX idx_games_title_trgm ON games USING GIN (title gin_trgm_ops);

CREATE TABLE game_relationships (
    id BIGSERIAL PRIMARY KEY,
    from_canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    to_canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('remake_of', 'remaster_of', 'dlc_of', 'edition_of', 'parent')),
    CHECK (from_canonical_id != to_canonical_id),
    UNIQUE(from_canonical_id, to_canonical_id, type)
);

CREATE INDEX idx_game_relationships_to_canonical_id ON game_relationships (to_canonical_id);

CREATE TABLE companies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE game_companies (
    canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_developer BOOLEAN NOT NULL DEFAULT FALSE,
    is_publisher BOOLEAN NOT NULL DEFAULT FALSE,
    is_porting BOOLEAN NOT NULL DEFAULT FALSE,
    is_supporting BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (canonical_id, company_id)
);

CREATE INDEX idx_game_companies_company_id ON game_companies (company_id);

CREATE TABLE genres (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE canonical_game_genres (
    canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    genre_id BIGINT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (canonical_id, genre_id)
);

CREATE INDEX idx_canonical_game_genres_genre_id ON canonical_game_genres (genre_id);

CREATE TABLE platforms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE game_platforms (
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
    platform_id BIGINT REFERENCES platforms(id) ON DELETE CASCADE,
    PRIMARY KEY(game_id, platform_id)
);

CREATE INDEX idx_game_platforms_platform_id ON game_platforms (platform_id);

-- last_cursor : sémantique définie par chaque provider (RAWG : dernier
-- numéro de page complété ; IGDB : dernier id vu, pagination par curseur).
-- last_update_check (voir docs/specs/catalog-update-pipeline.md) : timestamp
-- unix du dernier sweep incrémental réussi (NULL = jamais) — distinct du
-- curseur de backfill, qui reste figé une fois le backfill terminé.
CREATE TABLE import_state (
    provider TEXT PRIMARY KEY,
    last_cursor BIGINT NOT NULL DEFAULT 0,
    last_update_check BIGINT
);

-- Croisement de bibliothèques Steam multi-utilisateurs (voir
-- docs/specs/steam-library-crossing.md). Distinct de owned_games (ma
-- bibliothèque de référence) : ici il s'agit des bibliothèques d'AUTRES
-- comptes, comparées entre elles, pas possédées par moi.
CREATE TABLE steam_players (
    steam_id64 TEXT PRIMARY KEY,
    persona_name TEXT NOT NULL,
    is_public BOOLEAN NOT NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE steam_player_games (
    steam_id64 TEXT NOT NULL REFERENCES steam_players(steam_id64) ON DELETE CASCADE,
    app_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (steam_id64, app_id)
);

-- Bibliothèque possédée cross-plateforme (voir
-- docs/specs/cross-platform-library-model.md). Matching persisté vers
-- canonical_games une fois pour toutes (matchOwnedGames), contrairement
-- au recalcul en mémoire fait auparavant par chaque export. Remplace
-- l'ancienne steam_library_games (migrée le 2026-07-06).
CREATE TABLE owned_games (
    id BIGSERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    raw_title TEXT NOT NULL,
    canonical_id BIGINT REFERENCES canonical_games(id) ON DELETE SET NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(platform, external_id)
);

CREATE INDEX idx_owned_games_canonical_id ON owned_games (canonical_id);

-- Compatibilité Archipelago (voir docs/specs/archipelago-compatibility.md).
-- Pas de colonne booléenne sur canonical_games (règle "single-value field") :
-- présence ici avec canonical_id renseigné = ready, absence = non ready.
CREATE TABLE archipelago_games (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('official', 'wiki')),
    raw_title TEXT NOT NULL,
    canonical_id BIGINT REFERENCES canonical_games(id) ON DELETE SET NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(source, raw_title)
);

CREATE INDEX idx_archipelago_games_canonical_id ON archipelago_games (canonical_id);

CREATE TABLE rawg_game_credits (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    rawg_person_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, rawg_person_id)
);
