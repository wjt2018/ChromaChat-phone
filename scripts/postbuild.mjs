import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '..', 'dist');
const indexFile = join(distDir, 'index.html');
const notFoundFile = join(distDir, '404.html');
const noJekyllFile = join(distDir, '.nojekyll');

try {
  await access(indexFile, constants.F_OK);
} catch {
  console.warn('postbuild: dist/index.html not found, skipping GitHub Pages fallbacks.');
  process.exit(0);
}

await mkdir(distDir, { recursive: true });
await copyFile(indexFile, notFoundFile);
await writeFile(noJekyllFile, '');
console.log('postbuild: created dist/404.html and dist/.nojekyll.');
