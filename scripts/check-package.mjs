import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'dsh-token-statusbar-workbuddy');
for (const entry of Object.values(pkg.exports)) assert(fs.existsSync(path.join(root, entry)), entry);
for (const name of ['index.js', 'client.js', 'accounting.js', 'storage.js']) {
  assert(fs.readFileSync(path.join(root, 'src', name)).equals(fs.readFileSync(path.join(root, 'lib', name))), name);
}
assert(!fs.readFileSync(path.join(root, 'src/client.js'), 'utf8').includes('D:/tmp/'));
console.log('Package entries and generated files verified.');
