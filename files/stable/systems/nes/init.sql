-- Description: This file contains the SQL schema for the NES database.

-- The metadata table will be used to store the version and system information.
CREATE TABLE metadata
(
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT             NOT NULL
);

-- The tags table will be used to store the tags that will be used to categorize the games.
CREATE TABLE tags
(
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT unique_tag_name UNIQUE (name)
);

CREATE TABLE languages
(
    id   INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE regions
(
    id   INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- System tags.
CREATE TABLE system_tags
(
    id     INTEGER PRIMARY KEY,
    tag_id INTEGER REFERENCES tags (id),
    CONSTRAINT unique_tag UNIQUE (tag_id)
);

-- The identification database itself. Will be populated from the games.json file.
CREATE TABLE games_id
(
    id             INTEGER PRIMARY KEY,
    fullname       TEXT UNIQUE NOT NULL,
    title          TEXT,
    original_title TEXT,
    year           INTEGER
);

CREATE TABLE games_sources
(
    id        INTEGER PRIMARY KEY,
    game_id   INTEGER REFERENCES games_id (id),
    extension TEXT NOT NULL,
    sha256    BLOB NOT NULL,
    size      INTEGER
);

CREATE TABLE games_tags
(
    id      INTEGER PRIMARY KEY,
    game_id INTEGER REFERENCES games_id (id),
    tag_id  INTEGER REFERENCES tags (id),
    CONSTRAINT unique_tag UNIQUE (game_id, tag_id)
);

CREATE TABLE games_languages
(
    id          INTEGER PRIMARY KEY,
    game_id     INTEGER REFERENCES games_id (id),
    language_id INTEGER REFERENCES languages (id),
    CONSTRAINT unique_language UNIQUE (game_id, language_id)
);

CREATE TABLE games_regions
(
    id        INTEGER PRIMARY KEY,
    game_id   INTEGER REFERENCES games_id (id),
    region_id INTEGER REFERENCES regions (id),
    CONSTRAINT unique_region UNIQUE (game_id, region_id)
);
