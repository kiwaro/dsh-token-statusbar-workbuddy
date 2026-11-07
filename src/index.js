/** Host: bridge catalog, per-response accounting, currency estimates, cache and account reconciliation. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { estimateCredit, parseJournal, summarizeSession, actualInWindow } from './accounting.js';
import { dshHome, storageDir } from './storage.js';
import { reportDiagnostic } from './diagnostics.js';
import { priceBook, bucketCost, isPeakInstant, readPricingCalendar } from './pricing.js';
import { reconcileAccounts, appendReconciliationLog, readReconciliation, startBalanceSampler } from './reconciliation.js';

/** Loopback base of THIS DSH host — the bridge routes live on the same server. */
// Independent bridge plugins expose different catalog routes. Actual credits use the connect journal.
const BRIDGE_PREFIXES = [
  '/plugins/dsh-connect-workbuddy',
  '/plugins/dsh-workbuddy-bridge',
];
/** Routes that report the signed-in state, per bridge generation. */
const STATUS_SUFFIXES = ['/usage', '/status'];
const BRIDGE_TIMEOUT_MS = 2000;

/** Our durable ledger of observed per-response credits. */
const LEDGER_VERSION = 1;

// ---- promotion badges from the WorkBuddy desktop product config -----------
//
// The bridge derives badges only from catalog `tags` that start with `badge:`,
// so a promotion that ships in the product document's `modelPromotions` list is
// invisible to it (Deepseek-V4.1-Flash is exactly that case: the desktop picker
// shows 夜间折扣 while the bridge reports no badge at all). `localPromotionBadges`
// below reads that list ourselves and `modelFacts` unions it in — a badge the
// bridge already reported always wins the slot.



/**
 * Payload cache, so a restart can paint before the network answers.
 *
 * Held per REQUEST, not globally: the status bar shows figures for a specific conversation and model, so
 * a single shared entry made one window display another's numbers (measured: a second conversation read
 * the first one's credit figure, and a two-conversation request came back missing the second).
 *
 * A cache that cannot be keyed correctly is worse than no cache: showing a wrong credit figure for the
 * user's own conversation is undetectable, while a slow number is merely slow.
 */
/** Cache format version. Bumped when the key or payload shape changes, so old entries are discarded. */
const CACHE_VERSION = 8;

/** How long a cached payload stays usable. Credits accrue continuously, so this bounds how stale a
 *  figure can be, not just whether its pricing period still matches. */
const CACHE_MAX_AGE_MS = 60000;

function payloadCachePath() {
  return path.join(storageDir(), 'payload-cache.json');
}

/**
 * The key a payload belongs to.
 *
 * Built from the model and the sorted session list, so the same question hits the same entry and a
 * different question recomputes. Order is normalised because callers list sessions in selection order.
 *
 * @param {{model?: string, sessions?: string[]}} request
 * @returns {string}
 */
/**
 * Whether a payload is fit to cache.
 *
 * Rejects three shapes that mean "the data is missing", not "the answer is zero": not signed in, no
 * credits object at all, and a day total of zero while a ledger exists. Writing those would make a
 * read failure indistinguishable from a genuine zero on the next start.
 *
 * @param {object} payload
 * @returns {boolean}
 */
function isCacheable(payload) {
  if (payload === null || typeof payload !== 'object') return false;
  if (payload.signedIn !== true) return false;
  if (payload.credits === null || typeof payload.credits !== 'object') return false;
  // A zero total is valid only when the ledger is genuinely empty; a non-empty ledger with a zero total
  // means the read failed.
  const total = Number(payload.todayCredits);
  if (Number.isFinite(total) && total === 0) {
    try {
      const size = fs.statSync(ledgerPath()).size;
      if (size > 0) return false;
    } catch (_error) {
      // No ledger file at all: a zero is honest.
    }
  }
  return true;
}

/**
 * The account whose balances were last sampled.
 *
 * Used as a cache-key component: the balance and model list belong to one account, so after a switch the
 * previous account's entry must not stay readable.
 *
 * @returns {string|undefined}
 */
function payloadKey(request, nowMs) {
  const model = typeof request.model === 'string' && request.model !== '' ? request.model : '';
  const list = Array.isArray(request.sessions) ? [...new Set(request.sessions.filter((id) => typeof id === 'string' && id !== ''))] : [];
  // The pricing state is part of the answer: the same query returns a different unit price and promo
  // badge inside and outside a peak window. Without this, a cache filled before 09:00 kept showing the
  // night discount after the peak window opened, and nothing on screen could reveal it.
  const period = isPeakInstant(nowMs) ? 'peak' : 'off';
  // The account belongs in the key too: the balance and model list are per account, so after a switch the
  // previous account's entry would otherwise stay readable for a full minute.
  const account = typeof request.account === 'string' && request.account !== '' ? request.account : '';
  return 'accounting-v2-session-day|' + (request.provider || 'workbuddy') + ':' + account + '|' + model + '|' + period + '|' + list.join(',') + ';calendar=' + JSON.stringify(readPricingCalendar());
}

/**
 * Read the whole cache file, tolerating absence and damage.
 *
 * @returns {{day: string, entries: Record<string, {at: number, payload: object}>}}
 */
function readCacheFile() {
  try {
    const doc = JSON.parse(fs.readFileSync(payloadCachePath(), 'utf8'));
    if (doc === null || typeof doc !== 'object' || typeof doc.entries !== 'object' || doc.entries === null) {
      return { day: '', entries: {} };
    }
    // An older file may hold entries in a previous key or payload shape; drop them rather than serve
    // figures whose meaning changed.
    if (doc.version !== CACHE_VERSION) return { day: '', entries: {} };
    return { day: typeof doc.day === 'string' ? doc.day : '', entries: doc.entries };
  } catch (_error) {
    return { day: '', entries: {} };
  }
}

/**
 * Cached payload for one request, or null.
 *
 * Rejected when it belongs to a different day (the figures are day-scoped), when the key is unknown, or
 * when the entry carries no usable payload.
 *
 * @param {{model?: string, sessions?: string[]}} request
 * @param {number} nowMs
 * @returns {object|null}
 */
function readPayloadCache(request, nowMs) {
  const file = readCacheFile();
  // Same day boundary as the credit totals, so the cache window and the statistics window agree.
  if (file.day !== cstDateKey(nowMs)) return null;
  const entry = file.entries[payloadKey(request, nowMs)];
  if (entry === undefined || entry === null || typeof entry !== 'object') return null;

  // The pricing state must match the one the entry was priced under. An entry written before this field
  // existed fails the check, which is intended: it was priced under an unknown state.
  const period = isPeakInstant(nowMs) ? 'peak' : 'off';
  if (entry.period !== period) return null;

  // Age limit. Credits keep accruing within a period, so a period match alone would serve a stale total
  // indefinitely; measured drift inside one period was 22.37 credits over 15 minutes.
  const age = nowMs - (Number(entry.at) || 0);
  if (!Number.isFinite(age) || age < 0 || age > CACHE_MAX_AGE_MS) return null;

  return entry.payload !== null && typeof entry.payload === 'object' ? entry.payload : null;
}

/**
 * Store a payload for one request.
 *
 * Only that request's own entry is written. An earlier version replaced the whole file, so a
 * request without a session list overwrote a keyed entry with empty per-session figures — the bar then
 * reported a cache hit while showing zero credits.
 *
 * @param {{model?: string, sessions?: string[]}} request
 * @param {object} payload
 * @param {number} nowMs
 * @returns {void}
 */
function writePayloadCache(request, payload, nowMs) {
  // Refuse a write whose pricing period went stale while the computation ran: storing it would put
  // off-peak prices under a peak slot (or the reverse) and the next read would serve the wrong rate.
  const pricedPeriod = isPeakInstant(nowMs) ? 'peak' : 'off';
  const nowPeriod = isPeakInstant(Date.now()) ? 'peak' : 'off';
  if (pricedPeriod !== nowPeriod) return;

  const day = cstDateKey(nowMs);
  const file = readCacheFile();
  const entries = file.day === day ? { ...file.entries } : {};
  entries[payloadKey(request, nowMs)] = { at: nowMs, period: isPeakInstant(nowMs) ? 'peak' : 'off', payload };

  // Drop entries written in an older key format: they can never be hit again, yet each one occupies a
  // slot in the bounded budget.
  for (const key of Object.keys(entries)) {
    const segments = key.split('|');
    if (segments.length !== 5 || segments[0] !== 'accounting-v2-session-day') delete entries[key];
  }

  // Keep the file bounded: drop the oldest entries beyond a small cap.
  const keys = Object.keys(entries);
  const LIMIT = 16;
  if (keys.length > LIMIT) {
    keys.sort((a, b) => (entries[a].at || 0) - (entries[b].at || 0));
    for (const stale of keys.slice(0, keys.length - LIMIT)) delete entries[stale];
  }

  try {
    fs.mkdirSync(storageDir(), { recursive: true });
    // Write to a temporary file and rename: a crash mid-write must not leave a truncated JSON that turns
    // every later start into a cold start.
    const target = payloadCachePath();
    const temp = target + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ version: CACHE_VERSION, day, entries }), 'utf8');
    fs.renameSync(temp, target);
  } catch (_error) {
    /* a failing disk must not break the caller */
  }
}




function quoteUsage(model, usage, time) {
  const book = priceBook(model);
  const rate = isPeakInstant(time) ? book.peak : book.off;
  return bucketCost({ uncached: usage.inputTokens || 0, cacheRead: usage.cacheReadTokens || 0, cacheWrite: usage.cacheWriteTokens || 0, output: usage.outputTokens || 0 }, rate);
}
function estimateResponseCredit(model, usage, time) { return estimateCredit(model, usage, time, quoteUsage); }
function readResponseCredits({ strict = false } = {}) {
  const records = new Map();
  for (const channel of ['dsh-connect-workbuddy', 'dsh-connect-trae']) {
    try {
      const rows = parseJournal(fs.readFileSync(path.join(dshHome(), 'storages', channel, 'response-credits.jsonl'), 'utf8'));
      for (const [id, row] of rows) {
        const provider = channel === 'dsh-connect-workbuddy' ? 'workbuddy' : row.p || row.provider || 'trae';
        if (!['workbuddy','trae','trae-enterprise','trae-global'].includes(provider)) continue;
        const key = provider === 'workbuddy' || id.startsWith(provider + '/') ? id : provider + '/' + id;
        records.set(key, {...row, r:key});
      }
    } catch (error) { if(error.code !== 'ENOENT') { reportDiagnostic('response-credits-read',error); if(strict) throw error; } }
  }
  return records;
}
function importExactCredits(ledger, sessionId, readings = readResponseCredits(), now = Date.now()) {
  const file = sessionLogPath(sessionId);
  const summary = summarizeSession(file ? readTranscript(file) : '', readings, sessionCreatedAt(sessionId), quoteUsage, now, isPeakInstant);
  if (summary.checked >= 5 && summary.mismatch / summary.checked >= 0.25) reportDiagnostic('credit-calibration-review', {code:'EDRIFT'});
  for (const record of summary.actualRecords) appendLedger(ledger, sessionId, { [record.r]: record.c }, record.t);
  const { actualRecords, ...coverage } = summary;
  return coverage;
}

function ledgerPath() {
  return path.join(storageDir(), 'credits-exact-v2.jsonl');
}

/** The DSH host's own origin, so we can call the bridge's loopback routes. */
function selfBaseFrom(req) {
  const host = req && req.headers && typeof req.headers.host === 'string' ? req.headers.host : '';
  if (/^[A-Za-z0-9.\-]+:\d{1,5}$/.test(host) || /^\[[0-9a-f:]+\]:\d{1,5}$/i.test(host)) {
    return 'http://' + host;
  }
  return 'http://127.0.0.1';
}

/**
 * Read one bridge route, trying every known prefix.
 *
 * @param {string} base - origin of the host.
 * @param {string} suffix - route below the prefix, e.g. `/usage`.
 * @returns {Promise<object|undefined>} Parsed JSON, or undefined when no prefix answers.
 */
async function bridgeJson(base, suffix) {
  for (const prefix of BRIDGE_PREFIXES) {
    try {
      const res = await fetch(base + prefix + suffix, { signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS) });
      if (!res.ok) continue;
      const text = await res.text();
      // The bridge answers valid JSON; strip a BOM just in case.
      return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch (_error) {
      /* try the next prefix */
    }
  }
  return undefined;
}

/**
 * Read the first route that answers, trying several suffixes in order.
 * @param {string} base
 * @param {string[]} suffixes
 * @returns {Promise<object|undefined>}
 */
async function bridgeFirst(base, suffixes) {
  for (const suffix of suffixes) {
    const page = await bridgeJson(base, suffix);
    if (page !== undefined && page !== null) return page;
  }
  return undefined;
}

/** Parse "x0.11" / "0.11" / 0.11 into a number. */
function parseRate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const m = value.trim().match(/^x?\s*(-?\d+(?:\.\d+)?)$/i);
  if (m === null) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The WorkBuddy desktop app's own promotional table, as `modelId -> label[]`.
 *
 * Why this exists rather than just trusting the bridge: the bridge merges CN
 * badges from ONE source — the `badge:<label>` tags on the console models
 * document (`/console/enterprises/personal/models`), which tags only a handful
 * of models. The desktop app itself paints badges from a different, richer
 * source: the product config's `modelPromotions` array, which attaches
 * promotions (label + schedule + optional discount) to model ids. The two
 * disagree in practice — today `deepseek-v4.1-flash` carries an active
 * 「夜间折扣」 in the product config and no tag at all in the console document —
 * so reading only the bridge under-reports promotions.
 *
 * Evaluation mirrors the app and the bridge's own `parsePromotions`:
 *   - `enabled: true` is required;
 *   - `schedule.validFrom` / `validUntil` bound the offer;
 *   - `schedule.daily` windows are matched in `schedule.timezone`, crossing
 *     midnight when `end < start` (e.g. 23:00-08:00).
 *
 * Best-effort by construction, for the same reason the bridge treats its
 * console read that way: a badge is a label on a price, so an unreadable or
 * missing config file must degrade to "no extra badges", never fail billing.
 */
function workbuddyProductConfigPath() {
  const dir = path.join(os.homedir(), '.workbuddy', 'cache');
  // The vendor rotates this file: older builds wrote one fixed name, newer ones write
  // `acc-product-config-v3-<pid>-<uuid>.json` per session and remove the old file. Prefer
  // the fixed name when present, then fall back to the newest timestamped sibling so a
  // rotation does not silently erase every promotion badge.
  const fixed = path.join(dir, 'acc-product-config-v3.json');
  if (fs.existsSync(fixed)) return fixed;

  let newest = null;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_error) {
    return fixed;
  }
  for (const name of entries) {
    if (!name.startsWith('acc-product-config-v3') || !name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    let stamp;
    try {
      stamp = fs.statSync(full).mtimeMs;
    } catch (_error) {
      continue;
    }
    if (newest === null || stamp > newest.stamp) newest = { full, stamp };
  }
  return newest === null ? fixed : newest.full;
}

/** Minutes since midnight for `date` in `timeZone`. */
function minutesInZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour');
    const minute = parts.find((p) => p.type === 'minute');
    if (hour === undefined || minute === undefined) return undefined;
    // `24` appears for midnight under some ICU builds; normalise it to 0.
    const h = Number(hour.value) % 24;
    const m = Number(minute.value);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** Parse "23:00" / "7:50" into minutes since midnight. */
function parseClock(value) {
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m === null) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return Number.isFinite(h) && Number.isFinite(min) ? h * 60 + min : undefined;
}

/** Whether one promotion is in force at `now`. */
/**
 * DeepSeek's peak window, transcribed from WorkBuddy's own promotion text:
 * "周一至周五 09:00–12:00、14:00–18:00 属高峰原价，非高峰期积分5折".
 *
 * Peak hours are billed at the original rate; every other minute earns the 5折
 * discount. The vendor expresses this in prose rather than in `schedule`, so the
 * window has to be encoded here.
 *
 * @param {number} nowMs
 * @returns {boolean} True when peak rates apply.
 */
/** Label shown while a prose-rule promotion is outside its discount window. */
const PEAK_BADGE_LABEL = '高峰';

const isDeepseekPeak = isPeakInstant;

/**
 * Whether a promotion's discount is in force right now.
 *
 * Two shapes exist in the product document:
 *   - the discount window is spelled out in `schedule.daily` and carries a
 *     `discount` object (glm-5.2, hy4-preview);
 *   - the schedule merely describes when the badge may appear, while the actual
 *     rule lives in `hover.textZh` (all DeepSeek models, whose window is the
 *     complement of the peak hours).
 *
 * @param {object} promo
 * @param {number} nowMs
 * @returns {boolean}
 */
function discountInForce(promo, nowMs) {
  if (!promo || typeof promo !== 'object') return false;
  const text = promo.hover && typeof promo.hover.textZh === 'string' ? promo.hover.textZh : '';
  // A prose rule that names peak hours means the discount applies outside them.
  if (/高峰/.test(text) && /折|免费/.test(text)) return !isDeepseekPeak(nowMs);
  // Otherwise defer to the structured schedule.
  return promotionActiveNow(promo, nowMs);
}

function promotionActiveNow(promo, now) {
  if (!promo || promo.enabled !== true) return false;
  const schedule = promo.schedule;
  if (!schedule || typeof schedule !== 'object') return true;

  const from = typeof schedule.validFrom === 'string' ? Date.parse(schedule.validFrom) : NaN;
  if (Number.isFinite(from) && now < from) return false;
  const until = typeof schedule.validUntil === 'string' ? Date.parse(schedule.validUntil) : NaN;
  if (Number.isFinite(until) && now >= until) return false;

  const windows = Array.isArray(schedule.daily) ? schedule.daily : [];
  if (windows.length === 0) return true;

  const minutes = minutesInZone(new Date(now), typeof schedule.timezone === 'string' ? schedule.timezone : 'Asia/Shanghai');
  if (minutes === undefined) return false;

  for (const window of windows) {
    if (!window || typeof window !== 'object') continue;
    const start = parseClock(window.start);
    if (start === undefined) continue;
    const end = parseClock(window.end) ?? start;
    const inWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (inWindow) return true;
  }
  return false;
}

/**
 * Minutes of the day covered by a list of `HH:MM` windows, each minute counted
 * once. A complementary day/night pair therefore totals 1440, which lets the
 * client print 全天 instead of two ranges that together mean the whole day.
 * @param {Array<{start: string, end: string}>} windows
 * @returns {number} 0..1440
 */
function coverageMinutes(windows) {
  const minutesOf = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    return m === null ? null : Number(m[1]) * 60 + Number(m[2]);
  };
  const flags = new Uint8Array(1440);
  for (const w of windows) {
    const start = minutesOf(w.start);
    const end = minutesOf(w.end);
    if (start === null || end === null || start === end) continue;
    // A window whose end precedes its start wraps past midnight.
    const span = start < end ? end - start : 1440 - start + end;
    for (let i = 0; i < span; i += 1) flags[(start + i) % 1440] = 1;
  }
  let total = 0;
  for (let i = 0; i < 1440; i += 1) total += flags[i];
  return total;
}

/**
 * Read and evaluate the product config's badges: `modelId -> label[]`.
 *
 * Two independent sources in that document label a model:
 *   - `modelPromotions` — time-boxed offers (限时免费 / 夜间折扣 …), each with an
 *     optional `schedule` (`validFrom`/`validUntil` plus `daily` windows);
 *   - `modelTiers` — a standing tier badge (订阅优先) on a fixed model set.
 * The desktop picker paints both, so we collect both.
 */
function localPromotionBadges(nowMs) {
  const out = new Map();
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(workbuddyProductConfigPath(), 'utf8'));
  } catch (_error) {
    return out;
  }
  const now = typeof nowMs === 'number' ? nowMs : Date.now();

  const add = (id, label, schedule) => {
    if (typeof id !== 'string' || id === '') return;
    const daily = schedule && Array.isArray(schedule.daily)
      ? schedule.daily
          .filter((w) => w && typeof w.start === 'string' && typeof w.end === 'string')
          .map((w) => ({ start: w.start, end: w.end }))
      : [];
    // A rule is the vendor's own sentence; it replaces the hour list rather than
    // accompanying it, because both would describe the same offer differently.
    const rule = schedule && typeof schedule.rule === 'string' && schedule.rule.trim() !== ''
      ? schedule.rule.trim()
      : undefined;
    const timezone = schedule && typeof schedule.timezone === 'string' ? schedule.timezone : 'Asia/Shanghai';
    const list = out.get(id);
    const entry = rule === undefined ? { label, daily, timezone, allDay: false } : { label, daily, timezone, allDay: false, rule };
    if (list === undefined) {
      out.set(id, [entry]);
    } else {
      // The same label can arrive from a complementary window pair (day/night);
      // merge its ranges into one row instead of listing the badge twice.
      const existing = list.find((item) => item.label === label);
      if (existing === undefined) list.push(entry);
      else for (const w of daily) {
        if (!existing.daily.some((x) => x.start === w.start && x.end === w.end)) existing.daily.push(w);
      }
    }
    // 1439 minutes means the offer is in force all day (a window written as
    // 00:00–23:59 leaves one minute out, which is the end-exclusive bound).
    for (const item of out.get(id)) item.allDay = coverageMinutes(item.daily) >= 1439;
  };

  // Promotions fall into three shapes, and one rule covers all of them:
  //
  //   A. discount entry — carries `discount`; its `schedule.daily` IS the window the
  //      offer runs in (glm-5.2 23:00–07:50, hy4 23:00–08:00, hy3 all day).
  //   B. complement entry — same label, no `discount`; its window is when the offer is
  //      OFF, so it must not emit a badge. A label with no discount partner at all is a
  //      standing tag (订阅优先) and shows permanently.
  //   C. prose rule — the single DeepSeek entry whose schedule is only a display window
  //      while the real rule lives in `hover.textZh` (peak hours at list price,
  //      otherwise half). Handled by `isDeepseekPeak`.
  const promotions = doc && Array.isArray(doc.modelPromotions) ? doc.modelPromotions : [];

  // Labels that have at least one discount-bearing entry, so their discount-free
  // partners can be recognised as complements rather than standing tags.
  const discountedLabels = new Set();
  for (const promo of promotions) {
    if (!promo || promo.discount === undefined || promo.discount === null) continue;
    const label = promo.badge && typeof promo.badge.label === 'string' ? promo.badge.label.trim() : '';
    if (label !== '') discountedLabels.add(label);
  }

  for (const promo of promotions) {
    const label = promo && promo.badge && typeof promo.badge.label === 'string' ? promo.badge.label.trim() : '';
    if (label === '') continue;

    const hasDiscount = promo.discount !== undefined && promo.discount !== null;
    const proseRule = /高峰/.test((promo.hover && promo.hover.textZh) || '');
    const ids = Array.isArray(promo.modelIds) ? promo.modelIds : [];

    // C: peak hours vs off-peak discount, decided by the clock rather than a window.
    if (proseRule) {
      const discounted = discountInForce(promo, now);
      // The vendor states this offer as a RULE, not a schedule: peak hours are list price
      // and every other hour is discounted. Quoting that sentence is the only honest way to
      // show when it applies — any window we derived would be invented.
      const rule = promo.hover && typeof promo.hover.textZh === 'string' ? promo.hover.textZh : '';
      for (const id of ids) {
        if (discounted) add(id, label, { rule });
        else add(id, PEAK_BADGE_LABEL, { rule });
      }
      continue;
    }

    // B: a discount-free partner of a discounted label marks the offer's off hours.
    if (!hasDiscount) {
      if (discountedLabels.has(label)) continue;
      // A standing tag: no time window at all.
      for (const id of ids) add(id, label, null);
      continue;
    }

    // A: the offer runs inside its own window.
    if (!promotionActiveNow(promo, now)) continue;
    for (const id of ids) add(id, label, promo.schedule);
  }

  // Tier badges are not time-boxed: an enabled tier applies to its whole set.
  const tiers = doc && Array.isArray(doc.modelTiers) ? doc.modelTiers : [];
  for (const tier of tiers) {
    if (!tier || tier.enabled === false) continue;
    const label = tier.badge && typeof tier.badge.label === 'string' ? tier.badge.label.trim() : '';
    if (label === '') continue;
    for (const id of Array.isArray(tier.modelIds) ? tier.modelIds : []) add(id, label, null);
  }

  return out;
}

/** Fold bridge /status models into the compact map the client renders. */
/**
 * Whether a bridge-supplied badge label is inside its published window right now.
 *
 * The bridge names an offer (夜间免费) without saying when it applies, so the answer
 * comes from the product document: match the label against its promotions and test
 * the schedule. A label the document does not describe is kept, because it may be a
 * standing tag (限时免费) rather than a time-boxed one.
 *
 * @param {string} modelId
 * @param {string} label
 * @param {number} nowMs
 * @returns {boolean}
 */
function badgeInWindow(modelId, label, nowMs) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(workbuddyProductConfigPath(), 'utf8'));
  } catch (_error) {
    return true;
  }
  const promotions = doc && Array.isArray(doc.modelPromotions) ? doc.modelPromotions : [];
  const now = typeof nowMs === 'number' ? nowMs : Date.now();

  let described = false;
  for (const promo of promotions) {
    const ids = Array.isArray(promo.modelIds) ? promo.modelIds : [];
    if (!ids.includes(modelId)) continue;
    const promoLabel = promo.badge && typeof promo.badge.label === 'string' ? promo.badge.label.trim() : '';
    if (promoLabel !== label) continue;
    described = true;
    // An entry with a discount is the one that grants the offer; it must also be
    // inside its own window for the badge to be truthful.
    const hasDiscount = promo.discount !== undefined && promo.discount !== null;
    if (!hasDiscount) continue;
    if (promotionActiveNow(promo, now)) return true;
  }
  // A described-but-inactive offer is suppressed; an unknown label is left alone.
  return !described;
}

/**
 * The discount factor in force for one model right now.
 *
 * A promotion states its effect as `discount.factor` (0 = free, 0.5 = half) and as a
 * display string `discountedCredits` ("0.00x"). Both mean "multiply the base rate by
 * this", so the factor is what the bar must apply — otherwise it keeps advertising the
 * undiscounted multiplier during the offer.
 *
 * @param {string} modelId
 * @param {number} nowMs
 * @returns {{factor: number, label: string, discountedCredits: string}|null}
 */
function discountInEffect(modelId, nowMs) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(workbuddyProductConfigPath(), 'utf8'));
  } catch (_error) {
    return null;
  }
  const promotions = doc && Array.isArray(doc.modelPromotions) ? doc.modelPromotions : [];
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const proseNow = isDeepseekPeak(now) ? 1 : 0.5;

  for (const promo of promotions) {
    const ids = Array.isArray(promo.modelIds) ? promo.modelIds : [];
    if (!ids.includes(modelId)) continue;
    const label = promo.badge && typeof promo.badge.label === 'string' ? promo.badge.label.trim() : '';

    // Prose rule: peak hours are list price, everything else is half off.
    if (/高峰/.test((promo.hover && promo.hover.textZh) || '')) {
      return { factor: proseNow, label, discountedCredits: proseNow === 0.5 ? '0.50x' : '1x' };
    }

    if (promo.discount === undefined || promo.discount === null) continue;
    if (!promotionActiveNow(promo, now)) continue;
    const factor = typeof promo.discount.factor === 'number' ? promo.discount.factor : null;
    if (factor === null) continue;
    return {
      factor,
      label,
      discountedCredits: typeof promo.discount.discountedCredits === 'string' ? promo.discount.discountedCredits : '',
    };
  }
  return null;
}

function traeModelRate(model, nowMs) {
  const discount = model.activityDiscount;
  const off = discount?.offPeak;
  if (Number.isFinite(off?.rate)) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: off.timeZone || 'Asia/Shanghai', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
    }).formatToParts(new Date(nowMs)).map(part => [part.type, part.value]));
    const weekday = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[parts.weekday];
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    if (off.windows?.some(window => window.weekdays?.includes(weekday) && minute >= window.startMinute && minute < window.endMinute)) return off.rate;
  }
  const current = discount?.current;
  return current?.discountType && current.discountType !== 'none' && Number.isFinite(current.rate) ? current.rate : model.creditMultiplier;
}

// 保留完整活动说明，非优惠时段仍可查询规则；徽标只标记正在生效的优惠。
function traeModelFacts(model, nowMs) {
  const rate = traeModelRate(model, nowMs);
  const discount = model.activityDiscount;
  const badges = [];
  const promoDetails = [];
  const labelOf = (price, name) => {
    const percent = Number.isFinite(price.discountPercent) ? price.discountPercent
      : price.beforeRate > 0 && Number.isFinite(price.rate) ? price.rate / price.beforeRate * 100 : null;
    return name + (percent !== null ? ' ' + Number((percent / 10).toFixed(2)) + ' 折' : '');
  };
  const rates = price => Number.isFinite(price.beforeRate) && Number.isFinite(price.rate)
    ? '原倍率 ×' + price.beforeRate + '，优惠倍率 ×' + price.rate : '';
  const current = discount?.current;
  if (current?.discountType && current.discountType !== 'none' && Number.isFinite(current.rate)
      && (!Number.isFinite(current.beforeRate) || current.rate < current.beforeRate)) {
    const name = /off/.test(current.discountType) ? '闲时' : /limited/.test(current.discountType) ? '限时' : '专属补贴';
    const label = labelOf(current, name);
    badges.push(label);
    promoDetails.push(label + '：' + rates(current));
  }
  const off = discount?.offPeak;
  if (off && Number.isFinite(off.rate) && Array.isArray(off.windows) && off.windows.length) {
    const label = labelOf(off, '闲时');
    const clock = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
    const days = ['','周一','周二','周三','周四','周五','周六','周日'];
    const hours = off.windows.map(window => (window.weekdays || []).map(day => days[day]).filter(Boolean).join('、')
      + ' ' + clock(window.startMinute) + ' 至 ' + clock(window.endMinute)).join('；');
    promoDetails.push(label + '：' + rates(off) + '。' + hours + '（' + (off.timeZone || 'Asia/Shanghai') + '）');
    if (rate === off.rate && !badges.includes(label)) badges.push(label);
  }
  const member = discount?.member;
  if (member && Number.isFinite(member.rate)) {
    promoDetails.push(labelOf(member, '会员专享') + '：' + rates(member) + '。需符合会员优惠条件，不代表当前账号已享受。');
  }
  return { rate, badges, promoDetails };
}

function modelFacts(status, localBadges, nowMs) {
  const out = {};
  const models = status && Array.isArray(status.models) ? status.models : [];
  for (const m of models) {
    if (!m || typeof m.id !== 'string') continue;
    // Two bridge generations spell the multiplier differently: the old one used a
    // string ("x0.11") in `credits`, the new one a number in `creditMultiplier`.
    const rate = parseRate(m.credits !== undefined ? m.credits : m.creditMultiplier);
    // Bridge badges name an offer but carry no time window, so the bridge keeps
    // reporting 夜间免费 in broad daylight. The product document knows when each offer
    // actually runs, so a bridge badge is only kept when the schedule agrees.
    const bridgeBadges = Array.isArray(m.badges) ? m.badges.filter((b) => typeof b === 'string' && b !== '') : [];
    const badges = bridgeBadges.filter((label) => badgeInWindow(m.id, label, nowMs));
    // Union, bridge first: the bridge's tag is upstream's own word on the price,
    // the product config's label is the app's; a model can carry both.
    const extra = localBadges && localBadges.get(m.id);
    // Daily windows keyed by badge label, so the card can print when an offer
    // applies. The bridge carries no windows, so they come from the product
    // document alone.
    const windows = {};
    if (Array.isArray(extra)) {
      for (const item of extra) {
        if (item === null || typeof item !== 'object') continue;
        if (typeof item.label !== 'string' || item.label === '') continue;
        if (!badges.includes(item.label)) badges.push(item.label);
        if (Array.isArray(item.daily) && item.daily.length > 0) {
          windows[item.label] = {
            daily: item.daily,
            timezone: item.timezone || 'Asia/Shanghai',
            allDay: item.allDay === true,
          };
        }
        // A rule-based offer has no hour list; it carries the vendor's own sentence so the
        // card can quote it instead of printing an hour list we made up.
        if (typeof item.rule === 'string' && item.rule !== '') {
          windows[item.label] = {
            daily: [],
            timezone: item.timezone || 'Asia/Shanghai',
            allDay: false,
            rule: item.rule,
          };
        }
      }
    }
    // A running offer scales the base rate, so the bar reports the price in force
    // rather than the list multiplier. `free` follows the scaled value.
    const discount = discountInEffect(m.id, nowMs);
    const effectiveRate = rate === undefined
      ? undefined
      : (discount === null ? rate : Number((rate * discount.factor).toFixed(6)));

    out[m.id] = {
      // The vendor's own display name ("DeepSeek-V4.1-Flash"), for card headings. The DSH model id is a
      // slug and reads poorly as a title.
      name: typeof m.name === 'string' ? m.name : undefined,
      rate: effectiveRate,
      baseRate: rate === undefined ? undefined : rate,
      discountFactor: discount === null ? undefined : discount.factor,
      free: m.free === true || effectiveRate === 0,
      badges,
      windows,
    };
  }
  return out;
}

/** The account credit balance from bridge /status. */
function balanceFact(status) {
  const credits = status && status.credits;
  if (!credits || typeof credits !== 'object') return null;
  const total = typeof credits.total === 'number' && Number.isFinite(credits.total) ? credits.total : null;
  if (total === null) return null;
  const accounts = Array.isArray(credits.accounts)
    ? credits.accounts
        .filter((a) => a && typeof a.remain === 'number')
        .map((a) => ({ name: typeof a.packageName === 'string' ? a.packageName : '', remain: a.remain, size: typeof a.size === 'number' ? a.size : null }))
    : [];
  return {
    total,
    unlimited: credits.unlimited === true,
    cycleResetTime: typeof credits.cycleResetTime === 'string' ? credits.cycleResetTime : null,
    accounts,
  };
}


// ---- weighted cost --------------------------------------------------------

/**
 * Every conversation's weighted cost over one window, plus the implied price ratio.
 *
 * The account balance reports ONE number for all conversations, so a credit drop cannot be attributed
 * by observation. Splitting it by weighted cost is the closest defensible estimate: it accounts for
 * peak/off-peak rates, cache-hit pricing and output pricing, which a raw token count ignores.
 *
 * The ratio is the self-check: today's credits divided by today's weighted cost must land near the
 * historical median (about 14 credits per CNY). A wild ratio means the inputs are wrong.
 *
 * @param {number} fromMs - window start.
 * @param {number} nowMs - window end.
 * @param {string} modelId - model whose rate book applies.
 * @param {number|null} totalCredits - credits actually spent in the window, for the ratio.
 * @returns {{sessions: Record<string, {cny: number, share: number, credits: number}>, totalCny: number, ratio: number|null}}
 */
/**
 * Credits recorded in the ledger inside a window, across every conversation.
 *
 * @param {Array<object>} ledger
 * @param {number} fromMs
 * @param {number} toMs
 * @returns {number}
 */
function selectedModelId(models, requested) {
  if (typeof requested === 'string' && requested !== '') return requested;
  const keys = Object.keys(models || {});
  return keys.length > 0 ? keys[0] : 'deepseek-v4.1-flash';
}

/**
 * Billed tokens inside a window.
 *
 * @param {string} file - transcript path.
 * @param {number} fromMs
 * @param {number} toMs
 * @returns {number}
 */
/**
 * Find one session's transcript across every workspace directory.
 *
 * @param {string} sessionId
 * @returns {string|null}
 */
function sessionLogPath(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const root = path.join(dshHome(), 'sessions');
  let workspaces;
  try {
    workspaces = fs.readdirSync(root);
  } catch (_error) {
    return null;
  }
  for (const ws of workspaces) {
    const candidate = path.join(root, ws, sessionId, 'session.v4.jsonl.zstd');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Decompress a transcript, which is stored as concatenated zstd frames.
 *
 * @param {string} file
 * @returns {string} The concatenated plain text, or '' when unreadable.
 */
function readTranscript(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (_error) {
    return '';
  }
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
  const starts = [];
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) {
      starts.push(i);
    }
  }
  if (starts.length === 0) return '';
  const parts = [];
  for (let f = 0; f < starts.length; f++) {
    const from = starts[f];
    const to = f + 1 < starts.length ? starts[f + 1] : buf.length;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(from, to)).toString('utf8'));
    } catch (_error) {
      /* a damaged frame must not discard the rest */
    }
  }
  return parts.join('\n');
}

/** Parsed transcripts, keyed by path, so a poll does not decompress the same log twice. */
const TRANSCRIPT_CACHE = new Map();

/**
 * Split a WHOLE session's billed tokens by the pricing period each message ran in.
 *
 * Reads the transcript rather than the projection: the projection's `requests` array is trimmed
 * to the newest 1500 records, so a split from it covers only part of a long session. Every
 * `assistant/message` carries its own `time` and `usage`, so this covers the complete log.
 *
 * @param {string} sessionId
 * @returns {{peak: object, off: object, total: object, complete: boolean}|null}
 */
/**
 * When a session was created, which is the boundary between its own events and any inherited
 * history.
 *
 * A forked session replays the parent's messages into its own transcript but stamps its own
 * creation time, so events before that instant belong to the ancestor and were already billed
 * there.
 *
 * @param {string} sessionId
 * @returns {number|null} Epoch milliseconds, or null when the projection is unavailable.
 */
function sessionCreatedAt(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    const file = path.join(dshHome(), 'storages', 'session_projcache', 'sessions', sessionId + '.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const identity = doc && doc.record && doc.record.identity;
    if (identity === undefined || identity === null) return null;
    const stamp = Number(identity.createdAt);
    return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Per-model breakdown of a session's own spend.
 *
 * A conversation may switch models between replies, and their prices differ by an order of magnitude, so
 * a single heading cannot describe the credit total. Each entry carries the model id, its message count,
 * its billed tokens and its priced cost.
 *
 * @param {string} sessionId
 * @returns {Array<{model: string, messages: number, tokens: number, cny: number}>} Heaviest first.
 */
function modelBreakdown(sessionId) {
  // `splitSessionByPeriod` now tallies the per-model figures in its own pass, so this reads the cache
  // instead of decompressing the log a second time.
  const split = splitSessionByPeriod(sessionId);
  if (split === null) return [];
  return Array.isArray(split.models) ? split.models : [];
}

function splitSessionByPeriod(sessionId) {
  const file = sessionLogPath(sessionId);
  if (file === null) return null;

  const calendarKey = JSON.stringify(readPricingCalendar());
  let cached = TRANSCRIPT_CACHE.get(file);
  if (cached === undefined) {
    let stamp = 0;
    try {
      stamp = fs.statSync(file).mtimeMs;
    } catch (_error) {
      return null;
    }
    cached = { stamp, split: null };
    TRANSCRIPT_CACHE.set(file, cached);
  }

  // Recompute only when the log has grown since the last read.
  let currentStamp = cached.stamp;
  try {
    currentStamp = fs.statSync(file).mtimeMs;
  } catch (_error) {
    /* keep the previous stamp */
  }
  if (cached.split !== null && currentStamp === cached.stamp && cached.calendarKey === calendarKey) return cached.split;

  cached.calendarKey = calendarKey;
  const text = readTranscript(file);
  if (text === '') return null;

  // A fork's transcript carries the parent's messages as inherited history, which was already
  // billed to the parent. Counting them here double-charges: one fork on this machine is 75%
  // inherited. Only events at or after this session's own creation are its spend.
  const ownSince = sessionCreatedAt(sessionId);

  const zero = () => ({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
  // Fee of the inherited (ancestor) messages, priced with the flash rate book: the ancestor ran under
  // the same configured model, and this figure is only used as a denominator for the own-cost share.
  const PERIOD_PRICES_INHERIT = priceBook('deepseek-v4.1-flash');
  let inheritedCost = 0;
  let inheritedPeak = 0;
  const peak = zero();
  const off = zero();
  let messages = 0;
  let inherited = 0;
  // Per-model spend is accumulated in the SAME pass. Reading the log twice — once for the period
  // split, once for the model breakdown — doubled the cost of every cold start.
  const perModel = new Map();

  for (const line of text.split('\n')) {
    if (line.length < 2 || line.charCodeAt(0) !== 123) continue; // '{'
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    if (rec === null || typeof rec !== 'object' || rec.type !== 'assistant/message') continue;
    const usage = rec.data && rec.data.usage;
    if (usage === null || typeof usage !== 'object') continue;
    const time = Number(rec.time);
    if (!Number.isFinite(time)) continue;

    const tokens = (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0)
      + (Number(usage.cacheWriteTokens) || 0) + (Number(usage.outputTokens) || 0);
    if (ownSince !== null && time < ownSince) {
      inherited += tokens;
      // Price the ancestor's message with the same rate book, so the caller can compute what fraction of
      // the session's lifetime spend belongs to the session itself.
      inheritedPeak += isPeakInstant(time) ? 0 : 0;
      const rate = isPeakInstant(time) ? PERIOD_PRICES_INHERIT.peak : PERIOD_PRICES_INHERIT.off;
      inheritedCost += (
        (Number(usage.inputTokens) || 0) * rate.input
        + (Number(usage.cacheReadTokens) || 0) * rate.cacheHit
        + (Number(usage.cacheWriteTokens) || 0) * rate.cacheWrite
        + (Number(usage.outputTokens) || 0) * rate.output
      ) / 1e6;
      continue;
    }

    messages += 1;
    const target = isPeakInstant(time) ? peak : off;
    target.uncached += Number(usage.inputTokens) || 0;
    target.cacheRead += Number(usage.cacheReadTokens) || 0;
    target.cacheWrite += Number(usage.cacheWriteTokens) || 0;
    target.output += Number(usage.outputTokens) || 0;

    // Same message, second tally: which model produced it and what it cost at THAT model's rate.
    const source = rec.data && rec.data.message && rec.data.message.source;
    const model = source && typeof source.model === 'string' && source.model !== '' ? source.model : 'unknown';
    const row = perModel.get(model) || { model, messages: 0, tokens: 0, cny: 0, peakTokens: 0, offTokens: 0, peakCny: 0, offCny: 0 };
    row.messages += 1;
    row.tokens += tokens;
    const modelPeak = isPeakInstant(time);
    const modelBook = priceBook(model);
    const modelRate = modelPeak ? modelBook.peak : modelBook.off;
    const modelCost = (
      (Number(usage.inputTokens) || 0) * modelRate.input
      + (Number(usage.cacheReadTokens) || 0) * modelRate.cacheHit
      + (Number(usage.cacheWriteTokens) || 0) * modelRate.cacheWrite
      + (Number(usage.outputTokens) || 0) * modelRate.output
    ) / 1e6;
    row.cny += modelCost;
    // Split by pricing period: a model that ran across a peak boundary was charged two rates, and the
    // card must show both rather than one blended figure.
    if (modelPeak) {
      row.peakTokens += tokens;
      row.peakCny += modelCost;
    } else {
      row.offTokens += tokens;
      row.offCny += modelCost;
    }
    perModel.set(model, row);
  }

  if (messages === 0) return null;

  const total = {
    uncached: peak.uncached + off.uncached,
    cacheRead: peak.cacheRead + off.cacheRead,
    cacheWrite: peak.cacheWrite + off.cacheWrite,
    output: peak.output + off.output,
  };
  const split = {
    peak,
    off,
    total,
    complete: true,
    messages,
    inheritedExcluded: inherited,
    inheritedCost,
    // Per-model split rides along, so the caller never has to read the log again.
    models: [...perModel.values()].sort((a, b) => b.cny - a.cny),
  };
  cached.stamp = currentStamp;
  cached.split = split;
  return split;
}

// ---- peak / off-peak split ------------------------------------------------
// ---- balance sampling -----------------------------------------------------

/** File holding the last observed balance, so a restart does not lose the baseline. */

/**
 * File holding per-account baselines.
 *
 * The bridge can switch accounts at any time, so a single figure cannot represent "the balance":
 * each account is tracked separately and a reading is only compared with the previous reading of
 * the SAME account.
 */
function readLedger() {
  const map = new Map();
  let text;
  try {
    text = fs.readFileSync(ledgerPath(), 'utf8');
  } catch (_error) {
    return map;
  }
  for (const line of text.split('\n')) {
    if (line.length < 2) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    if (!rec || typeof rec.s !== 'string' || typeof rec.r !== 'string') continue;
    if (typeof rec.c !== 'number' || !Number.isFinite(rec.c) || rec.c < 0) continue;
    map.set(rec.s + '\u0000' + rec.r, { c: rec.c, t: typeof rec.t === 'number' ? rec.t : 0 });
  }
  return map;
}

/** Append only the records not already in the ledger. Returns how many were new. */
function appendLedger(known, sessionId, credits, nowMs) {
  const fresh = [];
  for (const [responseId, credit] of Object.entries(credits || {})) {
    if (typeof credit !== 'number' || !Number.isFinite(credit)) continue;
    const key = sessionId + '\u0000' + responseId;
    if (known.has(key)) continue;
    fresh.push(JSON.stringify({ v: LEDGER_VERSION, s: sessionId, r: responseId, c: credit, t: nowMs }));
  }
  if (fresh.length === 0) return 0;
  try {
    fs.mkdirSync(storageDir(), { recursive: true });
    fs.appendFileSync(ledgerPath(), fresh.join('\n') + '\n', 'utf8');
    for (const line of fresh) { const row=JSON.parse(line); known.set(row.s+'\u0000'+row.r,{c:row.c,t:row.t}); }
  } catch (_error) {
    /* a failing disk must not break the status bar */
  }
  return fresh.length;
}

/** CST (UTC+8) calendar day key. */
/**
 * Epoch milliseconds for the start of the day in China Standard Time.
 *
 * @param {number} ms
 * @returns {number}
 */
/** Rate memory file, so yesterday's ratio survives a restart without re-walking every transcript. */
function cstDayStart(ms) {
  const shifted = ms + 8 * 3600 * 1000;
  const midnightShifted = shifted - (shifted % (24 * 3600 * 1000));
  return midnightShifted - 8 * 3600 * 1000;
}

function cstDateKey(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Sum the ledger for one session and for today.
 * @param {Map<string,{c:number,t:number}>} ledger
 * @param {string|undefined} sessionId
 */
export const __test = {
  readTranscript, reconcileAccounts, appendReconciliationLog, reportDiagnostic,
  traeModelRate, traeModelFacts, quoteUsage, estimateResponseCredit, payloadKey, readPayloadCache,
  isDeepseekPeak,
  discountInForce,
  localPromotionBadges,
  modelFacts,
  splitSessionByPeriod,
  sessionCreatedAt,
  isPeakInstant,
};

/** Whether a background refresh is already running, so a burst of requests does not stack them. */
let REFRESHING = false;

/**
 * Recompute the payload without blocking the caller.
 *
 * Called when a cached payload was served. The result lands in the cache, so the next request picks it
 * up; sampling the balance here also keeps the ledger filling while cached figures are on screen.
 *
 * @param {string} base - host origin.
 * @param {object} q - the original query, with the cache hint removed.
 * @returns {Promise<void>}
 */
async function refreshInBackground(base, requestKey, nowMs) {
  if (REFRESHING) return;
  REFRESHING = true;
  try {
    await buildBilling(base, {
      model: requestKey.model,
      provider: requestKey.provider,
      sessions: Array.isArray(requestKey.sessions) ? requestKey.sessions.join(',') : undefined,
      fresh: '1',
      now: nowMs,
    });
  } catch (_error) {
    /* the cache stays; the next attempt will try again */
  } finally {
    REFRESHING = false;
  }
}

export async function buildBilling(base, q) {
  const nowMs = typeof q.now === 'number' && Number.isFinite(q.now) ? q.now : Date.now();
  /** Every conversation this payload must report on, primary first. */
  const wanted = [];
  if (typeof q.sessionId === 'string' && q.sessionId !== '') wanted.push(q.sessionId);
  if (typeof q.sessions === 'string' && q.sessions !== '') {
    for (const raw of q.sessions.split(',')) {
      const id = raw.trim();
      if (id !== '' && !wanted.includes(id)) wanted.push(id);
    }
  }
  const sessionId = wanted.length > 0 ? wanted[0] : undefined;

  // Check the cache BEFORE any round trip. Placing it after the bridge call meant a hit still waited
  // ~830 ms for the network, which is why the first version never felt fast.
  const requestKey = {
    model: typeof q.model === 'string' ? q.model : undefined,
    provider: typeof q.provider === 'string' ? q.provider : 'workbuddy',
    sessions: wanted,
    // The account is read from the persisted baselines, not from the bridge status: the cache check runs
    // before any round trip, so the status is not available yet.
    account: String(readReconciliation().at || 0),
  };
  const forced = q.fresh === '1';
  if (!forced) {
    const cached = readPayloadCache(requestKey, nowMs);
    if (cached !== null) {
      // Refresh after replying, so the cached figures are on screen while the work happens.
      setImmediate(() => { void refreshInBackground(base, requestKey, nowMs); });
      return { ...cached, fromCache: true };
    }
  }

  const traePanel = { trae: 'cn', 'trae-enterprise': 'enterprise', 'trae-global': 'ai' }[requestKey.provider];
  let status;
  if (traePanel) {
    try {
      const res = await fetch(base + '/plugins/dsh-connect-trae/usage?region=' + traePanel, { signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS) });
      if (res.ok) status = await res.json();
    } catch (error) { reportDiagnostic('trae-status-read', error); }
  } else if (requestKey.provider === 'workbuddy') status = await bridgeFirst(base, STATUS_SUFFIXES);

  let models = {};
  let balance = null;
  let signedIn = false;
  let domain = null;
  if (status !== undefined && status !== null) {
    signedIn = status.status === 'signed-in';
    domain = typeof status.domain === 'string' ? status.domain : null;
    if (traePanel) {
      models = Object.fromEntries((status.models || []).map(row => [row.id,
        traePanel === 'cn' ? traeModelFacts(row, nowMs) : { badges: [] },
      ]));
      const available = status.credits?.generalAvailable;
      balance = Number.isFinite(available) ? { total: available, unlimited: false, accounts: [] } : null;
    } else {
      models = modelFacts(status, localPromotionBadges(nowMs), nowMs);
      balance = balanceFact(status);
    }
  }

  // Pull the bridge's in-memory per-message spend (only present while this DSH
  // process has served WorkBuddy requests) and fold it into our ledger. Every
  // requested conversation is drained, so a background window keeps its own
  // running total instead of only being refreshed while it has focus.
  const ledger = readLedger();
  const bySession = {};
  // Join upstream response credits to each requested session independently.
  const readings = readResponseCredits();
  for (const [key, record] of ledger) {
    const id=key.slice(key.indexOf("\u0000")+1);
    if(!readings.has(id))readings.set(id,{r:id,c:record.c,t:record.t,a:""});
  }
  const exactCoverage = {};
  for (const id of wanted) exactCoverage[id] = importExactCredits(ledger, id, readings, nowMs);
  // Compute every snapshot after all requested sessions have entered the ledger.
  const dayActual = actualInWindow(readings, cstDayStart(nowMs), nowMs);
  for (const id of wanted) bySession[id] = {
    session: exactCoverage[id].actual, sessionCount: exactCoverage[id].matched,
    displayTotal: exactCoverage[id].displayTotal,
    sessionToday: exactCoverage[id].todayTotal,
    today: dayActual.total, todayCount: dayActual.count, coverage: exactCoverage[id],
  };

  // Peak / off-peak split, measured on the host where the request timestamps exist. The
  // browser's projection view carries `requests: []`, so this cannot be computed there.
  const periodSplit = {};
  // Per-model spend for each requested conversation: one conversation may switch models between
  // replies, and their prices differ by an order of magnitude, so a single heading cannot describe
  // the total.
  const modelSplits = {};
  for (const id of wanted) {
    // Whole-session split from the transcript, which is append-only and therefore covers every
    // message. The projection's `requests` array is trimmed to 1500 and would only describe part
    // of a long session.
    const split = splitSessionByPeriod(id);
    if (split !== null) periodSplit[id] = split;
    modelSplits[id] = modelBreakdown(id);
  }

  // Weighted cost attribution for today, and the ratio it implies. Both are derived from the
  // transcripts plus the credit total, so the client can show a defensible per-session share and a
  // live 积分/元 reading that doubles as a sanity check on the whole calculation.
  // Start of the day in China Standard Time, the same zone the cache keys and the ledger use.
  // Account-wide, so it must not depend on a session id being supplied — the request may name none.
  const todayCredits = dayActual.total;

  // Currency estimates and actual credits are separate measures.
  const attribution = { sessions: {}, totalCny: 0, ratio: null };
  // Preserve the legacy response shape while disabling cross-session inferred credit attribution.
  attribution.ratio = null;
  attribution.rateFrom = "upstream-credit";

  const built = {
    ok: true,
    provider: requestKey.provider,
    creditMode: "exact-v2",
    reconciliation: readReconciliation(),
    signedIn,
    domain,
    models,
    balance,
    // Per-conversation weighted share of today's spend, plus the implied credits-per-CNY ratio.
    attribution,
    // Credits spent today across every conversation — the figure the ratio is computed against.
    todayCredits,
    // Which conversation the host considers current. The client falls back to this when its slot
    // supplies no id, so "本会话" still resolves instead of reading zero.
    activeSession: mostRecentlyActiveSession() || '',
    // The primary conversation's totals stay at the top level for the single
    // session shape; `bySession` carries one entry per requested conversation.
    credits: sessionId === undefined ? { session: null, sessionCount: 0, today: dayActual.total, todayCount: dayActual.count } : bySession[sessionId],
    bySession,
    periodSplit,
    // Per-model breakdown of each conversation, heaviest first.
    modelSplits,
    at: new Date().toISOString(),
  }
  // Persist only a payload that looks trustworthy. An unreadable ledger yields an empty map and a
  // zero total; caching that would present a disk failure as "you spent nothing" on the next start.
  if (isCacheable(built)) {
    writePayloadCache(requestKey, built, nowMs);
  }
  return built;
;
}

/**
 * Sample the account balance on a fixed cadence.
 *
 * The client polls only while its bar is mounted, so relying on those requests loses every drop that
 * happens while the UI is closed. Sampling from the host keeps the ledger continuous.
 *
 * @param {number} intervalMs
 * @param {() => string} resolveBase - origin of the host, known once the web server has a port.
 * @returns {() => void} Stop function.
 */
/**
 * The conversation that wrote most recently.
 *
 * Session directory mtimes stop advancing once written, so ordering by them credits an old
 * conversation. The transcript's own mtime tracks the running one.
 *
 * @returns {string|null}
 */
function mostRecentlyActiveSession() {
  const root = path.join(dshHome(), 'sessions');
  let best = null;
  let bestAt = -1;
  let workspaces;
  try {
    workspaces = fs.readdirSync(root);
  } catch (_error) {
    return null;
  }
  for (const workspace of workspaces) {
    let names;
    try {
      names = fs.readdirSync(path.join(root, workspace));
    } catch (_error) {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('session-')) continue;
      const dir = path.join(root, workspace, name);
      for (const file of ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd', 'session.v4.jsonl']) {
        try {
          const at = fs.statSync(path.join(dir, file)).mtimeMs;
          if (at > bestAt) {
            bestAt = at;
            best = name;
          }
          break;
        } catch (_error) {
          /* try the next candidate filename */
        }
      }
    }
  }
  return best;
}

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    // Sample the balance on the host's own clock so the ledger keeps filling while the UI is closed.
    // The origin comes from the server: its listen port is the only place the bridge is reachable.
    const resolveBase = () => {
      try {
        const address = typeof scope.webServer.server.address === 'function' ? scope.webServer.server.address() : null;
        if (address !== null && typeof address === 'object' && Number.isFinite(address.port)) {
          return 'http://127.0.0.1:' + address.port;
        }
      } catch (_error) {
        /* fall through to the default origin */
      }
      return 'http://127.0.0.1';
    };
    ctx.effect(() => startBalanceSampler(60000, resolveBase, () => readResponseCredits({strict:true})), 'dsh-token-statusbar-workbuddy: balance reconciliation');

    const stop = scope.webServer.register({
      kind: 'exact',
      // `/api/...` is fenced by the host's route guard (even nonexistent paths 401),
      // while `/plugins/...` is served directly, so the route lives under /plugins/.
      path: '/plugins/dsh-token-statusbar-workbuddy/billing',
      handler: (req, res) => {
        let q = {};
        try {
          const url = new URL(req.url, 'http://127.0.0.1');
          q = {
            model: url.searchParams.get('model') || undefined,
            provider: url.searchParams.get('provider') || undefined,
            sessionId: url.searchParams.get('sessionId') || undefined,
            sessions: url.searchParams.get('sessions') || undefined,
            // Bypass the cache for this one request.
            fresh: url.searchParams.get('fresh') || undefined,
          };
        } catch (_error) {
          q = {};
        }
        buildBilling(selfBaseFrom(req), q)
          .then((payload) => {
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify(payload));
          })
          .catch((error) => {
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ ok: false, models: {}, balance: null, credits: { session: 0, today: 0 }, error: String(error && error.message) }));
          });
      },
    });
    scope.effect(() => stop);
  });
}
