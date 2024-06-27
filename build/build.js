import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as toml from 'toml';

// Copy files.
glob.globSync('../files/**', { nodir: true }).forEach(file => {
    const dest = path.dirname(file.replace('../files/', '../dist/'));

    // Convert toml files to json.
    if (path.extname(file) === '.toml') {
        const destPath = path.join(destDir, path.basename(file, '.toml') + '.json');
        const json = JSON.stringify(toml.parse(fs.readFileSync(file, 'utf8')));

        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(destPath, json);
    } else if (path.basename(file) === 'README.md') {
        // Ignore README.md files.
    } else {
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(file, path.join(dest, path.basename(file)));
    }
});
