import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as toml from 'toml';

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
