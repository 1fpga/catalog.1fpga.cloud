import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as toml from 'toml';

// Convert the toml files to json.
glob.globSync('../json/**/*.toml').forEach(file => {
    const destDir = path.dirname(file.replace('../db/', '../dist/db/'));
    fs.mkdirSync(destDir, { recursive: true });

    const destPath = path.join(destDir, path.basename(file, '.toml') + '.json');
    const json = JSON.stringify(toml.parse(fs.readFileSync(file, 'utf8')));
    fs.writeFileSync(destPath, json);
});

// Copy files.
glob.globSync('../files/**', { nodir: true }).forEach(file => {
    const dest = path.dirname(file.replace('../files/', '../dist/'));
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(file, path.join(dest, path.basename(file)));
});
