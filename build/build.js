import fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as glob from 'glob';
import * as toml from 'toml';

// The official 1FPGA public key. Updating this is risky.
const PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA04SX9mHaW2D09TF5G7hOQrGgqf6uTUcRv4KOXhL4kCs=
-----END PUBLIC KEY-----
`.trim();

/**
 * Copy a file from `source` to `dest`. If `dest` is not provided, it is assumed to be the
 * `dist` folder (keeping the path from the `source`).
 * @param {string} source The source file.
 * @param {string?} dest The destination file.
 * @returns {Promise<string>} The path to the destination file/directory copied.
 */
async function copy(source, dest) {
    const sourcePath = path.resolve(process.cwd(), source);
    const destPath = dest === undefined ? path.join(process.cwd(), 'dist', source) : path.resolve(process.cwd(), 'dist', dest);
    await fs.mkdir(path.dirname(destPath), {recursive: true});

    const stat = await fs.lstat(sourcePath);

    // If `source` is a symbolic link, copy the link.
    if (stat.isSymbolicLink()) {
        // If the file is a symbolic link, copy the link
        const link = path.resolve(path.dirname(sourcePath), await fs.readlink(sourcePath));
        await copy(link, destPath);
    } else if (stat.isDirectory()) {
        // If `source` is a directory, copy everything recursively.
        for (const fPath of await glob.glob(source + '/**', {nodir: true})) {
            await copy(fPath, path.join(destPath, path.relative(source, fPath)));
        }
    } else {
        // Process the file if needed.
        switch (path.extname(sourcePath)) {
            case '.toml': {
                // Convert toml files to json.
                const json = JSON.stringify(toml.parse(await fs.readFile(sourcePath, 'utf8')));
                const dest = path.join(path.dirname(destPath), path.basename(destPath, '.toml') + '.json');
                await fs.writeFile(dest, json);
                break;
            }
            case '.md':
                // Ignore Markdown files.
                break;
            case '.json': {
                // Minimize JSON files by reading and removing whitespaces.
                const json = JSON.stringify(JSON.parse(await fs.readFile(sourcePath, 'utf8')));
                await fs.writeFile(destPath, json);
                break;
            }
            default: {
                await fs.cp(sourcePath, destPath, {dereference: true});
            }
        }
    }

    return destPath;
}

/**
 * Calculate the size and sha256 of a file.
 * @param path The path to the file.
 * @returns {Promise<(number|string)[]>} The size and sha256 of the file.
 */
async function calculateSizeAndSha256(path) {
    const stat = await fs.stat(path);
    const size = stat.size;
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex');
    return [size, sha256];
}

/**
 * Calculate the signature of a file. This is done by reading the `fPath.sig` file.
 * If the file does not exist, `null` is returned. If the file exists but is invalid,
 * an error is thrown.
 *
 * @param fPath The path to the file.
 * @param key The public key to use for verification. Defaults to the official 1FPGA public key.
 * @returns The signature of the file, or `null` if the signature file does not exist.
 * @throws Error An error if the signature file exists but is invalid.
 */
async function calculateSignature(fPath, key = PUBLIC_KEY) {
    const sigPath = fPath + '.sig';
    try {
        await fs.access(sigPath);
    } catch (_) {
        return null;
    }

    const publicKey = crypto.createPublicKey(key);
    const data = Buffer.from(await fs.readFile(fPath));
    const sig = Buffer.from(await fs.readFile(sigPath));
    const result = crypto.verify(null, data, publicKey, sig);
    if (result !== true) {
        throw new Error(`Could not validate signature in ${JSON.stringify(fPath)}...`);
    }

    return sig.toString('base64');
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
 * @param {Record} catalog The catalog object.
 * @param {string} catalogPath The path to the catalog.json file.
 */
async function buildCores(catalog, catalogPath) {
    const coresPath = path.join(path.dirname(catalogPath), catalog.cores.url);
    const coresData = JSON.parse(await fs.readFile(coresPath, 'utf8'));
    let latestCoresVersion = catalog.cores.version ?? "0";

    for (const [_name, c] of Object.entries(coresData)) {
        const cPath = path.join(path.dirname(coresPath), c.url);
        /** @type {Record} */
        const cData = JSON.parse(await fs.readFile(cPath, 'utf8'));
        let latestVersion = c.version ?? "0";

        // Update the releases' files size and sha256.
        for (const r of cData.releases) {
            latestVersion = maxVersion([latestVersion, r.version]);
            for (const f of r.files) {
                const fPath = path.join(path.dirname(cPath), f.url);
                const [size, sha256] = await calculateSizeAndSha256(fPath);
                f.size = size;
                f.sha256 = sha256;
            }
        }

        c.version = latestVersion;
        latestCoresVersion = maxVersion([latestCoresVersion, c.version]);
        await fs.writeFile(cPath, JSON.stringify(cData), 'utf8');
    }

    catalog.cores.version = maxVersion([catalog.cores.version, latestCoresVersion]);
    await fs.writeFile(coresPath, JSON.stringify(coresData), 'utf8');
}

/**
 *
 * @param {Record} catalog
 * @param {string} catalogPath
 * @returns {Promise<void>}
 */
async function buildSystems(catalog, catalogPath) {
    const systemsPath = path.join(path.dirname(catalogPath), catalog.systems.url);
    /** @type {Record} */
    const systemsData = JSON.parse(await fs.readFile(systemsPath, 'utf8'));
    let latestSystemsVersion = systemsData.version ?? "0";

    for (const [_name, s] of Object.entries(systemsData)) {
        const sPath = path.join(path.dirname(systemsPath), s.url);
        /** @type {Record} */
        const sData = JSON.parse(await fs.readFile(sPath, 'utf8'));
        let latestVersion = maxVersion([s.version, sData.version, "0"]);

        // Update the gamesDb of the system.
        if (sData.gamesDb) {
            const gamesDbPath = path.join(path.dirname(sPath), sData.gamesDb.url);
            const [size, sha256] = await calculateSizeAndSha256(gamesDbPath);
            sData.gamesDb.size = size;
            sData.gamesDb.sha256 = sha256;

            if (compareVersions(sData.gamesDb.version, latestVersion) > 0) {
                latestVersion = sData.gamesDb.version;
            }
        }

        s.version = latestVersion;
        sData.version = latestVersion;
        latestSystemsVersion = maxVersion([latestSystemsVersion, s.version]);
        await fs.writeFile(sPath, JSON.stringify(sData), 'utf8');
    }

    catalog.systems.version = maxVersion([catalog.systems.version, latestSystemsVersion]);
    await fs.writeFile(systemsPath, JSON.stringify(systemsData), 'utf8');
}

/**
 *
 * @param {Record} catalog
 * @param {string} catalogPath
 * @returns {Promise<void>}
 */
async function buildReleases(catalog, catalogPath) {
    const releasesPath = path.join(path.dirname(catalogPath), catalog.releases.url);
    /** @type {Record} */
    const releasesData = JSON.parse(await fs.readFile(releasesPath, 'utf8'));
    let latestReleasesVersion = catalog.releases.version ?? "0";
    let latestTagVersion = undefined;

    for (const value of Object.values(releasesData)) {
        /** @type {Record} */
        const r = value;
        for (const v of r) {
            latestReleasesVersion = maxVersion([latestReleasesVersion, v.version]);
            if ((r.tags ?? []).includes("latest")) {
                latestTagVersion = r.version;
            }

            // Update the files size and sha256.
            for (const f of v.files) {
                const fPath = path.join(path.dirname(releasesPath), f.url);
                const [size, sha256] = await calculateSizeAndSha256(fPath);
                f.size = size;
                f.sha256 = sha256;

                const signature = await calculateSignature(fPath);
                if (!signature) {
                    delete f.signature;
                } else {
                    f.signature = signature;
                }
            }
        }
    }

    catalog.releases.version = latestTagVersion ?? maxVersion([catalog.releases.version, latestReleasesVersion]);
    await fs.writeFile(releasesPath, JSON.stringify(releasesData), 'utf8');
}

// Ignore errors when deleting the `dist/` folder (e.g. it doesn't exist).
try {
    // Deleting the `dist/` folder.
    await fs.rm('./dist', {recursive: true});
} catch (_) {
}

// Copy files, converting files as necessary.
await copy('files', '.');

// Updating the files with the information.
const catalogPath = path.join(process.cwd(), './dist/catalog.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));

await buildCores(catalog, catalogPath);
await buildSystems(catalog, catalogPath);
await buildReleases(catalog, catalogPath);

// Update the version of catalog.json
const d = new Date();
const y = d.getFullYear();
const m = d.getMonth() + 1;
const day = d.getDate();
catalog.version = `${y}${m < 10 ? '0' : ''}${m}${day < 10 ? '0' : ''}${day}`;
await fs.writeFile(catalogPath, JSON.stringify(catalog), 'utf8');

// Load all the `src` files.
for (const dir of await glob.glob('./src/*/', {})) {
    // Using `..` because this (build) file is in the `build` folder, but we run from the root.
    const p = `../${dir}/index.js`;
    const destDir = path.join(process.cwd(), dir.replace(/^src\//, 'dist/'));
    await fs.mkdir(destDir, {recursive: true});

    const current = process.cwd();
    process.chdir(dir);

    /** @type {Record} */
    const script = await import (p);
    /** @type {function} */
    const copyFn = async (source, maybeDest)  => {
        const sourcePath = path.join(current, dir, source);
        const dest = maybeDest ?? path.join(destDir, source);
        await copy(sourcePath, dest);
    };

    await script.build(copyFn, destDir);
    process.chdir(current);
}
