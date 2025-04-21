/// Build the `db.json.zip` file.
import * as crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import archiver from 'archiver';
import * as toml from 'toml';

/**
 * Calculate the size and md5 of a file.
 * @param path The path to the file.
 * @returns {Promise<(number|string)[]>} The size and md5 of the file.
 */
async function calculateSizeAndMd5(path) {
    const stat = await fs.stat(path);
    const size = stat.size;
    const sha256 = crypto.createHash('md5').update(await fs.readFile(path)).digest('hex');
    return [size, sha256];
}

/**
 *
 * @param {function(string, string?): Promise<void>} copy The function to copy files from source to dest.
 * @param {string} dest The destination folder for these files, absolute.
 */
export async function build(copy, dest) {
    const db = toml.parse(await fs.readFile('db.toml', 'utf8'));

    // Update timestamp
    db.timestamp = Math.floor(Date.now() / 1000.0);

    // Update the db with MD5 and size.
    const [size, md5sum] = await calculateSizeAndMd5('Scripts/1fpga.sh');
    db.files['Scripts/1fpga.sh'].hash = md5sum;
    db.files['Scripts/1fpga.sh'].size = size;

    await new Promise((resolve, reject) => {
        const output = createWriteStream(`${dest}/db.json.zip`);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);

        archive.append(JSON.stringify(db), { name: 'db.json' });
        archive.finalize();
    });

    // Copy other files.
    await copy('Scripts');
}
