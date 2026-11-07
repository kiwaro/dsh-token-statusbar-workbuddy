/** Pure response accounting. Currency pricing is supplied by the host. */
export const CALIBRATION = Object.freeze({
  'deepseek-v4.1-flash': { factor: 100 / 7, sample: 107 },
  'glm-5.3-flash': { factor: 18.603, sample: 16 },
});

const amount = value => Math.round(value * 1e6) / 1e6;
export function parseJournal(text) {
  const records = new Map();
  for (const line of text.split('\n')) {
    try {
      const row = JSON.parse(line);
      if (typeof row.r !== 'string' || !row.r || !Number.isFinite(row.c) || row.c < 0 || !Number.isFinite(row.t)) continue;
      if (!records.has(row.r) || records.get(row.r).t <= row.t) records.set(row.r, row);
    } catch {}
  }
  return records;
}

export function estimateCredit(model, usage, time, quote) {
  const bareModel = typeof model === 'string' ? model.slice(model.lastIndexOf('/') + 1) : model;
  const calibration = CALIBRATION[bareModel];
  if (!calibration || !Number.isFinite(time) || !usage) return null;
  if (typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number') return null;
  const counts = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'].map(key => usage[key] ?? 0);
  if (counts.some(n => !Number.isFinite(n) || n < 0) || counts[2] > 0) return null;
  const cny = quote(model, usage, time);
  if (!Number.isFinite(cny) || cny < 0) return null;
  return { credits: Number((cny * calibration.factor).toFixed(2)), cny, factor: calibration.factor, source: 'sample-calibration' };
}

export function summarizeSession(text, records, createdAt, quote, now = Date.now(), isPeak = () => false) {
  const dayStart = Math.floor((now + 28800000) / 86400000) * 86400000 - 28800000;
  let todayActual = 0, todayEstimated = 0;
  const responses = new Map();
  const todayModels = {};
  for (const line of text.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type !== 'assistant/message' || !Number.isFinite(Number(event.time))) continue;
      if (createdAt !== null && Number(event.time) < createdAt) continue;
      const source = event.data?.message?.source || event.data?.source;
      const response = source?.replayState?.response;
      const provider = response?.provider || source?.provider;
      if (!['workbuddy', 'trae', 'trae-enterprise', 'trae-global'].includes(provider)) continue;
      const nativeId = response?.responseId;
      const fallback = Number.isInteger(event.data?.turn) && Number.isInteger(event.data?.step)
        ? `turn:${event.data.turn}:step:${event.data.step}` : null;
      const id = typeof nativeId === 'string' && nativeId ? nativeId : fallback;
      if (!id) continue;
      const key = provider === 'workbuddy' ? id : `${provider}/${id}`;
      responses.set(key, { event, response: { ...response, provider, model: response?.model || source?.model } });
    } catch {}
  }
  const result = { expected: responses.size, matched: 0, models: {}, turns: {}, estimated: 0, estimatedCount: 0, checked: 0, mismatch: 0, actual: 0, displayTotal: 0, unresolved: 0, estimateSource: 'sample-calibration', actualRecords: [] };
  for (const [id, {event, response}] of responses) {
    const model = response.provider === 'workbuddy' ? response.model || 'unknown' : `${response.provider}/${response.model || 'unknown'}`;
    const row = result.models[model] ||= { credits: 0, estimated: 0, displayCredits: 0, count: 0, estimatedCount: 0, tokens: 0 };
    const usage = event.data?.usage;
    const estimate = estimateCredit(model, usage, Number(event.time), quote);
    const actual = records.get(id);
    const addUsage = target => {
      const tokens = ['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'].reduce((sum,key)=>sum+Math.max(0,Number(usage?.[key])||0),0);
      target.tokens = (target.tokens || 0) + tokens;
      const period = isPeak(Number(event.time)) ? 'peakTokens' : 'offTokens';
      target[period] = (target[period] || 0) + tokens;
      const cost = usage ? quote(model,usage,Number(event.time)) : null;
      target.cny = (target.cny || 0) + (Number.isFinite(cost) ? cost : 0);
    };
    addUsage(row);
    const turnId = event.data?.turn;
    if (Number.isInteger(turnId) && turnId >= 0) {
      const turn = result.turns[turnId] ||= { total: 0, models: {} };
      const credits = actual ? actual.c : estimate?.credits || 0;
      turn.total = amount(turn.total + credits);
      const modelRow = turn.models[model] ||= { credits: 0, count: 0 };
      modelRow.credits = amount(modelRow.credits + credits);
      modelRow.count++;
      if (!actual && !estimate) modelRow.unresolved = (modelRow.unresolved || 0) + 1;
      addUsage(modelRow);
    }
    const today = Number(event.time) >= dayStart && Number(event.time) <= now;
    if (today) {
      const todayRow = todayModels[model] ||= { credits: 0, count: 0 };
      todayRow.credits += actual ? actual.c : estimate?.credits || 0;
      if (!actual && !estimate) todayRow.unresolved = (todayRow.unresolved || 0) + 1;
      todayRow.count++;
      addUsage(todayRow);
    }
    if (actual) {
      if (today) todayActual += actual.c;
      result.actual += actual.c; result.matched++; row.credits += actual.c; row.count++;
      result.actualRecords.push(actual);
      if (estimate) { result.checked++; if (Math.abs(estimate.credits - actual.c) > 0.010001) result.mismatch++; }
    } else if (estimate) {
      if (today) todayEstimated += estimate.credits;
      result.estimated += estimate.credits; result.estimatedCount++;
      row.estimated += estimate.credits; row.estimatedCount++;
    } else { result.unresolved++; row.unresolved = (row.unresolved || 0) + 1; }
  }
  result.actual = amount(result.actual); result.estimated = amount(result.estimated);
  for (const row of Object.values(result.models)) {
    row.credits = amount(row.credits); row.estimated = amount(row.estimated);
    row.displayCredits = amount(row.credits + row.estimated);
  }
  result.displayTotal = amount(Object.values(result.models).reduce((sum,row) => sum + row.displayCredits, 0));
  result.todayModels = Object.fromEntries(Object.entries(todayModels).map(([model, row]) => [model, {...row, credits: amount(row.credits)}]));
  result.todayActual = amount(todayActual);
  result.todayEstimated = amount(todayEstimated);
  result.todayTotal = amount(todayActual + todayEstimated);
  return result;
}

export function actualInWindow(records, from, to) {
  let total = 0, count = 0;
  for (const row of records.values()) if (row.t >= from && row.t < to) { total += row.c; count++; }
  return { total: amount(total), count };
}
