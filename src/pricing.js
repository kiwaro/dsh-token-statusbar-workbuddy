import fs from 'node:fs';
import path from 'node:path';
import { dshHome, PLUGIN_NAME } from './storage.js';
import { reportDiagnostic } from './diagnostics.js';

const PERIOD_PRICES = {
  'deepseek-v4.1-flash': {
    off: { input: 1, cacheHit: 0.02, cacheWrite: 1, output: 4 },
    peak: { input: 2, cacheHit: 0.04, cacheWrite: 2, output: 8 },
  },
  'deepseek-v4-flash': {
    off: { input: 1, cacheHit: 0.02, cacheWrite: 1, output: 4 },
    peak: { input: 2, cacheHit: 0.04, cacheWrite: 2, output: 8 },
  },
  'deepseek-v4-pro': {
    off: { input: 4.5, cacheHit: 0.15, cacheWrite: 4.5, output: 13.5 },
    peak: { input: 9, cacheHit: 0.3, cacheWrite: 9, output: 27 },
  },
  // Single-rate models: both periods carry the same figures, so the peak/off distinction has no effect.
  // Listed explicitly so priceBook never falls back to the DeepSeek rate for them.
  'glm-5.3': { off: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 }, peak: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 } },
  'glm-5.3-flash': { off: { input: 0.8, cacheHit: 0.23, cacheWrite: 0.23, output: 2.8 }, peak: { input: 0.8, cacheHit: 0.23, cacheWrite: 0.23, output: 2.8 } },
  'glm-5.3-flashx': { off: { input: 2, cacheHit: 0.57, cacheWrite: 0.57, output: 7 }, peak: { input: 2, cacheHit: 0.57, cacheWrite: 0.57, output: 7 } },
  'glm-5.2': { off: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 }, peak: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 } },
  'glm-5.1': { off: { input: 6, cacheHit: 1.3, cacheWrite: 1.3, output: 24 }, peak: { input: 6, cacheHit: 1.3, cacheWrite: 1.3, output: 24 } },
  'glm-5.0-turbo': { off: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 }, peak: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 } },
  'glm-5v-turbo': { off: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 }, peak: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 } },
  'glm-4.6v': { off: { input: 1, cacheHit: 0.2, cacheWrite: 0.2, output: 3 }, peak: { input: 1, cacheHit: 0.2, cacheWrite: 0.2, output: 3 } },
  'kimi-k3.1-pro': { off: { input: 13, cacheHit: 1.3, cacheWrite: 13, output: 68 }, peak: { input: 13, cacheHit: 1.3, cacheWrite: 13, output: 68 } },
  'kimi-k3.1-pro-highspeed': { off: { input: 26, cacheHit: 1.3, cacheWrite: 26, output: 136 }, peak: { input: 26, cacheHit: 1.3, cacheWrite: 26, output: 136 } },
  'kimi-k3-2': { off: { input: 20, cacheHit: 2, cacheWrite: 20, output: 100 }, peak: { input: 20, cacheHit: 2, cacheWrite: 20, output: 100 } },
  'minimax-m3-pay': { off: { input: 4.2, cacheHit: 0.84, cacheWrite: 0.84, output: 16.8 }, peak: { input: 4.2, cacheHit: 0.84, cacheWrite: 0.84, output: 16.8 } },
  'minimax-m3.1-flash': { off: { input: 1, cacheHit: 0.1, cacheWrite: 0.1, output: 4 }, peak: { input: 1, cacheHit: 0.1, cacheWrite: 0.1, output: 4 } },
  'step-5-preview': { off: { input: 7, cacheHit: 0.7, cacheWrite: 0.7, output: 20 }, peak: { input: 7, cacheHit: 0.7, cacheWrite: 0.7, output: 20 } },
  'mimo-v2.6-pro': { off: { input: 3, cacheHit: 0.025, cacheWrite: 0.025, output: 6 }, peak: { input: 3, cacheHit: 0.025, cacheWrite: 0.025, output: 6 } },
};

/** The rate book for a model, falling back to the flash rate when the model is unpriced. */
export function priceBook(modelId) {
  const direct = PERIOD_PRICES[modelId];
  if (direct !== undefined) return direct;
  // Strip a provider prefix such as "workbuddy/" before giving up.
  if (typeof modelId === 'string') {
    const tail = modelId.slice(modelId.lastIndexOf('/') + 1);
    if (PERIOD_PRICES[tail] !== undefined) return PERIOD_PRICES[tail];
  }
  // Unknown model: fall back to the cheapest known book so a figure still appears, but the caller can tell
  // it was a fallback by comparing the id against the table.
  return PERIOD_PRICES['deepseek-v4.1-flash'];
}

/**
 * Cost in CNY of one period's buckets.
 *
 * @param {{uncached: number, cacheRead: number, cacheWrite: number, output: number}} bucket
 * @param {{input: number, cacheHit: number, cacheWrite: number, output: number}} rate
 * @returns {number}
 */
export function bucketCost(bucket, rate) {
  return (
    bucket.uncached * rate.input
    + bucket.cacheRead * rate.cacheHit
    + bucket.cacheWrite * rate.cacheWrite
    + bucket.output * rate.output
  ) / 1e6;
}

/** Validated date overrides shared by pricing and promotion badges. */
let calendarCache = { file:null, at:0, days:{} };
export function readPricingCalendar() {
  const file = path.join(dshHome(), 'storages', PLUGIN_NAME, 'pricing-calendar.json');
  if (calendarCache.file === file && Date.now() - calendarCache.at < 1000) return calendarCache.days;
  const remember = days => { calendarCache={file,at:Date.now(),days}; return days; };
  try {
    const calendar = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (calendar.version !== 1 || typeof calendar.source !== 'string' || !calendar.source.trim()
      || !calendar.days || typeof calendar.days !== 'object' || Array.isArray(calendar.days)) throw new Error('Invalid calendar');
    for (const [day, mode] of Object.entries(calendar.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !['off', 'weekday'].includes(mode)
        || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) throw new Error('Invalid day');
    }
    return remember(calendar.days);
  } catch (error) {
    if (error.code !== 'ENOENT') reportDiagnostic('pricing-calendar-read', {code:'ECALENDAR'});
    return remember({});
  }
}

export function isPeakInstant(ms, calendar = readPricingCalendar()) {
  if (!Number.isFinite(ms)) return false;
  const cst = new Date(ms + 8 * 3600 * 1000);
  const day = cst.getUTCDay();
  const mode = calendar[cst.toISOString().slice(0,10)];
  if (mode === 'off' || (mode !== 'weekday' && (day === 0 || day === 6))) return false;
  const minutes = cst.getUTCHours() * 60 + cst.getUTCMinutes();
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}

