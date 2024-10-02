import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as toml from 'toml';
import * as crypto from 'crypto';

// Copy files.
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

// Update sha1sum and sizes.
function calculateSizeAndSha1(path) {
    const stat = fs.statSync(path);
    const size = stat.size;
    const sha1 = crypto.createHash('sha1').update(fs.readFileSync(path)).digest('hex');
    return [size, sha1];
}

const catalogPath = path.join(process.cwd(),'../dist/catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
for (const s of Object.values(catalog.systems)) {
    const sPath = path.join(path.dirname(catalogPath), s.url);
    const sData = JSON.parse(fs.readFileSync(sPath, 'utf8'));

    // Update the gamesDb of the system.
    if (sData.gamesDb) {
        const gamesDbPath = path.join(path.dirname(sPath), sData.gamesDb.url);
        const [size, sha1] = calculateSizeAndSha1(gamesDbPath);
        sData.gamesDb.size = size;
        sData.gamesDb.sha1 = sha1;
    }

    fs.writeFileSync(sPath, JSON.stringify(sData), 'utf8');

    // Update the cores' releases' files size and sha1.
    for (const c of Object.values(sData.cores)) {
        const cPath = path.join(path.dirname(sPath), c.url);
        const cData = JSON.parse(fs.readFileSync(cPath, 'utf8'));

        for (const r of cData.releases) {
            for (const f of r.files) {
                const fPath = path.join(path.dirname(cPath), f.url);
                const [size, sha1] = calculateSizeAndSha1(fPath);
                f.size = size;
                f.sha1 = sha1;
            }
        }

        fs.writeFileSync(cPath, JSON.stringify(cData), 'utf8');
    }
}
