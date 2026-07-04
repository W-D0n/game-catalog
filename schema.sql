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

CREATE TABLE game_relationships (
    id BIGSERIAL PRIMARY KEY,
    from_canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    to_canonical_id BIGINT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('remake_of', 'remaster_of', 'dlc_of', 'edition_of', 'parent')),
    UNIQUE(from_canonical_id, to_canonical_id, type)
);

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

CREATE TABLE platforms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE game_platforms (
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
    platform_id BIGINT REFERENCES platforms(id) ON DELETE CASCADE,
    PRIMARY KEY(game_id, platform_id)
);

CREATE TABLE import_state (
    provider TEXT PRIMARY KEY,
    last_page INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE steam_library_games (
    app_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE rawg_game_credits (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    rawg_person_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, rawg_person_id)
);
