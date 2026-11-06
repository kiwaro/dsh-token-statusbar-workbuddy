import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
for (const name of ['index.js', 'client.js', 'accounting.js', 'storage.js', 'diagnostics.js', 'pricing.js', 'reconciliation.js']) {
  fs.copyFileSync(path.join(root, 'src', name), path.join(root, 'lib', name));
}
console.log('Built 7 JavaScript files.');
