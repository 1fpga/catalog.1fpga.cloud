import sqlite from 'sqlite3';
import {createSqliteTag} from "@sqltags/sqlite";
import fs from "node:fs/promises";
import cliProgress from 'cli-progress';

/**
 * Insert a tag in the database.
 * @param sql {SqlTag} The SQL tag object to call into the database.
 * @param name {string} The name of the tag to insert.
 * @param table {string?} The table to insert the tag into ("tags" by default).
 * @return {Promise<*>} The ID of the new tag.
 * @throws {string} If the tag could not be found or inserted.
 */
async function insertTag(sql, name, table = "tags") {
    const [row] = await sql`
        INSERT INTO ${sql.id(table)}
            ${sql.insertValues({name})}
        ON CONFLICT
        DO NOTHING
        RETURNING id
    `;
    let tagsId = row?.id;
    if (tagsId === undefined) {
        const [row] = await sql`
            SELECT id
            FROM ${sql.id(table)}
            WHERE name = ${name}
        `;
        tagsId = row.id;
    }
    if (tagsId === undefined) {
        throw `Could not find ${table} "${t}" but could not insert it either...`;
    }

    return tagsId;
}

/**
 *
 * @param {function(string, string?): Promise<void>} copy The function to copy files from source to dest.
 * @param {string} dest The destination folder for these files.
 */
export async function build(copy, dest) {
    console.log("Building NES database...");
    await copy('nes.json');

    // Build the SQLite database in the parent systems folder.
    const db = new sqlite.Database(`${dest}/nes.sqlite`);
    db.exec(await fs.readFile('init.sql', 'utf8'));

    db.exec("BEGIN TRANSACTION");

    const sql = createSqliteTag(db);
    if (process.env.SQL_DEBUG) {
        sql.on("beforeQuery", (query) => console.log(query));
    }

    // Insert system-level tags.
    const system = JSON.parse(await fs.readFile(`${dest}/../nes.json`, "utf-8"));
    for (const key of Object.getOwnPropertyNames(system)) {
        const value = system[key];
        if (typeof value == "string") {
            await sql`
                INSERT INTO metadata
                    ${sql.insertValues({key, value})}
            `;
        }
    }
    for (const tag of system.tags ?? []) {
        const tagsId = await insertTag(sql, tag);
        await sql`
            INSERT INTO SystemTags
                ${sql.insertValues({tagsId})}
        `;
    }

    const gamesDb = JSON.parse(await fs.readFile("./nes.json", "utf-8")); //(await import('./nes.json', {type: 'json'})).default;

    // Insert version.
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const version = gamesDb.version ?? `${y}${m < 10 ? '0' : ''}${m}${day < 10 ? '0' : ''}${day}`;
    await sql`
        INSERT INTO Metadata (key, value)
        VALUES ('version', ${version})`;

    // Insert the whole games identification.
    console.log("Inserting games...");
    let bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    if (!process.stdout.isTTY) {
        bar = {
            value: 0, update: () => {
            }, stop: () => {
            }
        };
    } else {
        bar.start(gamesDb['games'].length, 0);
    }

    for (const g of gamesDb['games']) {
        bar.update(bar.value + 1);

        const TAGS_RE = /[(\[](?<tag>.*?)[)\]]/g;
        const SHORTNAME_RE = /^(?<name>.*?)\s*[(\[]/;

        let {name, shortname, nameAlt, region, languages, year, tags, sources, playlists} = g;
        shortname = shortname ?? (SHORTNAME_RE.exec(name)?.groups?.name ?? null);

        let tag;
        tags = tags ?? [];
        while ((tag = TAGS_RE.exec(name)) !== null) {
            tags.push(tag.groups.tag);
        }
        // Unique tags only.
        tags = [...(new Set(tags))];

        const regions = (region ?? "").split(',').map(r => r.trim()).filter(r => !!r);
        languages = (Array.isArray(languages) ? languages : [languages])
            .filter(l => !!l)
            .map(l => l.trim())
            .filter(l => !!l);

        let title = shortname ?? null;
        let originalTitle = nameAlt ?? null;
        const [{id: gamesId}] = await sql`
            INSERT INTO GamesId
                ${sql.insertValues({
                    fullname: name,
                    title, // For now always use the full name or original title.
                    originalTitle,
                    year: year ?? null
                })} RETURNING id
        `;

        // Insert tags.
        await Promise.all(tags.map(async t => {
            const tagsId = await insertTag(sql, t);
            await sql`
                INSERT INTO GamesTags
                    ${sql.insertValues({gamesId, tagsId})}
            `;
        }));

        // Insert regions.
        await Promise.all(regions.map(async r => {
            const regionsId = await insertTag(sql, r, "regions");

            await sql`
                INSERT INTO GamesRegions
                    ${sql.insertValues({gamesId, regionsId})}
            `;
        }));

        // Insert languages.
        await Promise.all(languages.map(async l => {
            const languagesId = await insertTag(sql, l, "languages");

            await sql`
                INSERT INTO GamesLanguages
                    ${sql.insertValues({gamesId, languagesId})}
            `;
        }));

        // Insert checksums and sources.
        await Promise.all(sources.map(async s => {
            await Promise.all(s.files.map(async f => {
                let {sha256, size, extension} = f;
                sha256 = Buffer.from(sha256, 'hex');
                await sql`
                    INSERT INTO GamesSources
                        ${sql.insertValues({gamesId, sha256, size, extension})}
                `;

            }))
        }));

        // Insert playlists.
        if (playlists) {
            await Promise.all(Object.entries(playlists).map(async ([name, priority]) => {
                await sql`
                    INSERT INTO Playlists ${sql.insertValues({name})}
                    ON CONFLICT DO NOTHING
                `;
                const [{ id: playlistsId }] = await sql`SELECT id
                                        FROM Playlists
                                        WHERE name = ${name}`;
                await sql`
                    INSERT INTO PlaylistsGamesId ${sql.insertValues({ gamesId, playlistsId, priority })}
                `;
            }))
        }
    }

    bar.stop();

    db.exec("COMMIT TRANSACTION");
    db.exec("VACUUM");  // Collect garbage.
    await new Promise((res, rej) => {
        db.close(e => {
            if (e) {
                rej(e);
            } else {
                res(e);
            }
        });
    });
}
