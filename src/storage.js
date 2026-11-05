import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PLUGIN_NAME = 'dsh-token-statusbar-workbuddy';
export const LEGACY_PLUGIN_NAME = 'dsh-token-statusbar';
export const DATA_FILES = Object.freeze([
  'payload-cache.json', 'credits-exact-v2.jsonl', 'credits.jsonl',
  'account-reconciliation.json', 'account-reconciliation.jsonl',
]);
const migrated = new Set();

export function dshHome() {
  const configured = process.env.DSH_HOME;
  return typeof configured === 'string' && configured.trim()
    ? path.resolve(configured.trim()) : path.join(os.homedir(), '.dsh');
}

export function storageDir() {
  const home = dshHome();
  const target = path.join(home, 'storages', PLUGIN_NAME);
  if (migrated.has(target)) return target;
  const legacy = path.join(home, 'storages', LEGACY_PLUGIN_NAME);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const name of DATA_FILES) {
    const from = path.join(legacy, name);
    const to = path.join(target, name);
    if (!fs.existsSync(from)) continue;
    if (!fs.lstatSync(from).isFile()) continue;
    try {
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      try { fs.chmodSync(to, 0o600); } catch {}
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  migrated.add(target);
  return target;
}
