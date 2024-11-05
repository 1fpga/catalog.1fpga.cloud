import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as toml from 'toml';
import * as crypto from 'crypto';

// Update sha1sum and sizes.
function calculateSizeAndSha1(path) {
    const stat = fs.statSync(path);
    const size = stat.size;
    const sha1 = crypto.createHash('sha1').update(fs.readFileSync(path)).digest('hex');
    return [size, sha1];
}

/**
 * Compare two versions. Since we always use dates for versions, we can just subtract them.
 * @param a
 * @param b
 * @returns {number} Smaller than 0 if `a` is older than `b`, greater than 0 if `a` is newer
 *                   than `b`, 0 if they are the same.
 */
function compareVersions(a, b) {
    return +a - +b;
}

/**
 * Return the maximum version of a list of versions.
 */
function maxVersion(versions) {
    return versions.reduce((a, b) => compareVersions(a, b) > 0 ? a : b);
}

/**
 * Build the cores.json file.
 * @param catalog The catalog object.
 * @param catalogPath The path to the catalog.json file.
 */
function buildCores(catalog, catalogPath) {
    const coresPath = path.join(path.dirname(catalogPath), catalog.cores.url);
    const coresData = JSON.parse(fs.readFileSync(coresPath, 'utf8'));
    let latestCoresVersion = catalog.cores.version ?? "0";

    for (const [_name, c] of Object.entries(coresData)) {
        const cPath = path.join(path.dirname(coresPath), c.url);
        const cData = JSON.parse(fs.readFileSync(cPath, 'utf8'));
        let latestVersion = c.version ?? "0";

        // Update the releases' files size and sha1.
        for (const r of cData.releases) {
            latestVersion = maxVersion([latestVersion, r.version]);
            for (const f of r.files) {
                const fPath = path.join(path.dirname(cPath), f.url);
                const [size, sha1] = calculateSizeAndSha1(fPath);
                f.size = size;
                f.sha1 = sha1;
            }
        }

        c.version = latestVersion;
        latestCoresVersion = maxVersion([latestCoresVersion, c.version]);
        fs.writeFileSync(cPath, JSON.stringify(cData), 'utf8');
    }

    catalog.cores.version = maxVersion([catalog.cores.version, latestCoresVersion]);
    fs.writeFileSync(coresPath, JSON.stringify(coresData), 'utf8');
}

function buildSystems(catalog, catalogPath) {
    const systemsPath = path.join(path.dirname(catalogPath), catalog.systems.url);
    const systemsData = JSON.parse(fs.readFileSync(systemsPath, 'utf8'));
    let latestSystemsVersion = systemsData.version ?? "0";

    for (const [_name, s] of Object.entries(systemsData)) {
        const sPath = path.join(path.dirname(systemsPath), s.url);
        const sData = JSON.parse(fs.readFileSync(sPath, 'utf8'));
        let latestVersion = maxVersion([s.version, sData.version, "0"]);

        // Update the gamesDb of the system.
        if (sData.gamesDb) {
            const gamesDbPath = path.join(path.dirname(sPath), sData.gamesDb.url);
            const [size, sha1] = calculateSizeAndSha1(gamesDbPath);
            sData.gamesDb.size = size;
            sData.gamesDb.sha1 = sha1;

            if (compareVersions(sData.gamesDb.version, latestVersion) > 0) {
                latestVersion = sData.gamesDb.version;
            }
        }

        s.version = latestVersion;
        sData.version = latestVersion;
        latestSystemsVersion = maxVersion([latestSystemsVersion, s.version]);
        fs.writeFileSync(sPath, JSON.stringify(sData), 'utf8');
    }

    catalog.systems.version = maxVersion([catalog.systems.version, latestSystemsVersion]);
    fs.writeFileSync(systemsPath, JSON.stringify(systemsData), 'utf8');
}

// Copy files, converting files as necessary.
glob.globSync('../files/**', { nodir: true }).forEach(file => {
    const destDir = path.dirname(file.replace('../files/', '../dist/'));
    fs.mkdirSync(destDir, { recursive: true });

    // Convert toml files to json.
    if (path.extname(file) === '.toml') {
        const destPath = path.join(destDir, path.basename(file, '.toml') + '.json');
        const json = JSON.stringify(toml.parse(fs.readFileSync(file, 'utf8')));
        fs.writeFileSync(destPath, json);
    } else if (path.extname(file) === '.md') {
        // Ignore README.md files.
    } else if (path.extname(file) === '.json') {
        // Minimize JSON files by reading and removing whitespaces.
        const destPath = path.join(destDir, path.basename(file));
        const json = JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')));
        fs.writeFileSync(destPath, json);
    } else {
        fs.copyFileSync(file, path.join(destDir, path.basename(file)));
    }
});

// Updating the files with the information.
const catalogPath = path.join(process.cwd(),'../dist/catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

 buildCores(catalog, catalogPath);
 buildSystems(catalog, catalogPath);

// Update the version of catalog.json
catalog.version = maxVersion([catalog.version, catalog.cores.version, catalog.systems.version]);
fs.writeFileSync(catalogPath, JSON.stringify(catalog), 'utf8');
