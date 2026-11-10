/**
 * dsh-token-statusbar-workbuddy — Client half.
 *
 * Places a persistent usage status bar in the composer's input dock
 * (`conversation.input.dock`, a session-scoped `list` slot rendered by
 * `@deepseek-ai/dsh-client-ui-conversation` as a normal-flow row directly
 * ABOVE the composer card, where the queue panel also lives). Owning its own
 * line is the whole point: `conversation.composer.dock` is an absolutely
 * positioned 28px band over the card's own toolbar, so a full bar placed there
 * overlaps those controls.
 *
 * Usage comes from DSH projections and the loaded node window. Cost estimates use
 * DeepSeek's official CNY list prices, which are compiled into this file, so the
 * browser never reaches the network for pricing:
 *   - `useProjection('tokenUsage')`     durable session token buckets
 *   - `useProjection('contextPressure')` context occupancy (used / window)
 *   - `useProjection('contextTimeline')` full-session timing and billed-token pricing data
 *   - `useChat(s => s.legacy.nodes)`    per-node timing, usage, tool results
 *   - `useProjection('sessionStats')`   optional pre-folded activity stats
 *
 * The strip keeps only quick readings. Each segment opens its own detail card,
 * anchored to the segment currently under the pointer or keyboard focus.
 *
 * Every field can be switched off from the ⚙ panel; the choice is remembered
 * per browser via localStorage.
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-statusbar-workbuddy',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-token-statusbar-workbuddy';

    /** Stable empty node list so the useChat selector never re-fires on null. */
    const EMPTY_NODES = [];

    /** localStorage key for the field-visibility preferences. */
    const PREFS_KEY = 'dsh-token-statusbar-workbuddy:prefs';
    const LEGACY_PREFS_KEY = 'dsh-token-statusbar:prefs';

    /** Default segment visibility. */
    const DEFAULT_PREFS = {
      speed: true,
      turn: true,
      session: true,
      context: true,
      promo: true,
      credits: true,
    };

    const EN = {
      'chart.sessionScope': 'This session',
      'seg.speed': 'Speed',
      'seg.turn': 'This turn',
      'seg.session': 'Session',
      'seg.tools': 'Tools',
      'seg.context': 'Context',
      'unit.tps': 't/s',
      'unit.requests': 'req',
      'unit.turns': 'turn',
      'unit.turnsPlural': 'turns',
      'unit.total': 'Σ',
      'unit.creditsPerCny': 'credits/CNY',
      'tip.ratioHint': "Today's credits ÷ today's weighted list price",
      'tip.cached': 'cached',
      'unit.ttft': 'TTFT',
      'prefs.title': 'Display settings',
      'prefs.speed': 'Generation speed',
      'prefs.turn': 'This turn',
      'prefs.session': 'Session total',
      'prefs.tools': 'Tool details',
      'prefs.context': 'Context usage',
      'prefs.hint': 'Settings saved automatically',
      'err.none': 'No usage yet',
      'seg.promo': 'Promotion',
      'seg.credits': 'Credits',
      'prefs.promo': 'Plan promotion badge',
      'prefs.credits': 'Credits spent',
      'tip.promo': 'Promotion',
      'promo.window': 'Applies',
      'promo.allDay': 'All day',
      'promo.estimated': 'estimated',
      'tip.model': 'Model',
      'tip.rate': 'Rate',
      'tip.creditsToday': 'Today',
      'tip.creditsSession': 'This session',
      'tip.balance': 'Balance left',
      'tip.creditsModel': 'Unit',
      'tip.creditsNote': 'Credits',
      'credit.unit': 'credits',
      // hover-card field labels
      'tip.scope': 'Scope',
      'tip.reading': 'Reading',
      'tip.total': 'Total tokens',
      'split.peak': 'Peak',
      'split.off': 'Off-peak',
      'tip.input': 'Input (uncached)',
      'tip.output': 'Output',
      'tip.turnCost': 'Estimated cost',
      'tip.turnCostBasis': 'off-peak',
      'tip.cacheRead': 'Cache read',
      'tip.cacheWrite': 'Cache write',
      'tip.cacheHit': 'Cache hit',
      'tip.requests': 'Requests',
      'tip.llm': 'Model time (Σ)',
      'tip.ttft': 'Last TTFT',
      'tip.turns': 'Turns',
      'tip.calls': 'Calls',
      'tip.errors': 'Errors',
      'tip.used': 'Used',
      'tip.window': 'Window',
      'tip.percent': 'Occupancy',
      'tip.ctxSystem': 'System prompt',
      'tip.ctxUser': 'User messages',
      'tip.ctxInject': 'Injected context',
      'tip.ctxSkill': 'Skill injections',
      'tip.ctxAssistant': 'Assistant messages',
      'tip.ctxTool': 'Tool results',
      'tip.ctxTools': 'Tool schemas',
      'tip.ctxMessages': 'Conversation',
      'tip.ctxUsed': 'Context used',
      'tip.today': 'Today (all sessions)',
      'chart.speed': 'Output speed by request',
      'chart.tokens': 'Session token composition',
      'chart.credits': 'Recorded credit use',
      'chart.rate': 'Billing multiplier',
      'chart.promo': 'Promotion status',
      'chart.standard': 'Standard ×1',
      'chart.current': 'Current',
      'chart.active': 'Active',
      'chart.inactive': 'Inactive',
      'chart.sessionCredits': 'Credits spent',
      'chart.sessionTodayCredits': 'Credits spent today',
      'credit.pending': '—',
      'credit.priceUnavailable': 'CNY price unavailable',
      'summary.estimatePartial': 'Estimated cost',
      'credit.pendingDetail': 'Subtotal of recorded and estimated credits; some response credits remain unmatched',
      'chart.creditStatistics': 'Credit usage statistics',
      'chart.turnCredits': 'Turn credits',
      'chart.todayCredits': 'Today',
      'summary.turn': 'This turn',
      'summary.session': 'Session total',
      'summary.modelTime': 'Model time',
      'summary.activeTime': 'Total time',
      'summary.estimate': 'Estimated cost',
      'summary.creditsActual': 'Actual credits',
      'summary.avgTtft': 'Avg. first token',
      'summary.speed': 'Output speed',
      'summary.averageSpeed': 'Average speed',
      'summary.turnRequests': 'Requests this turn',
      'timing.wait': 'Model waiting',
      'timing.reasoning': 'Model thinking',
      'timing.reply': 'Model reply',
      'timing.arguments': 'Tool arguments',
      'timing.tools': 'Tool execution',
      'timing.other': 'Other overhead',
      'summary.credits': 'Credits',
      'summary.cacheHit': 'Cache hit',
      'summary.tools': 'Tool calls',
      'summary.context': 'Context used',
      'summary.turnPrefix': 'Turn',
      'val.tokenW': 'tokens',
    };

    const ZH = {
      'credit.priceUnavailable': '单价暂无依据',
      'summary.estimatePartial': '费用估算',
      'unit.cnyPerYiToken': '元/亿token',
      'chart.sessionScope': '本会话',
      'seg.speed': '生成速度',
      'seg.turn': '本轮',
      'seg.session': '会话累计',
      'seg.tools': '工具',
      'seg.context': '上下文',
      'unit.tps': 't/s',
      'unit.requests': '次',
      'unit.turns': '轮',
      'unit.turnsPlural': '轮',
      'unit.total': 'Σ',
      'unit.creditsPerCny': '积分/元',
      'tip.ratioHint': '今日积分 ÷ 今日加权官方价',
      'tip.cached': '缓存',
      'unit.ttft': '首字',
      'prefs.title': '显示设置',
      'prefs.speed': '生成速度',
      'prefs.turn': '本轮用量',
      'prefs.session': 'Token 统计',
      'prefs.tools': '工具调用',
      'prefs.context': '上下文占用',
      'prefs.hint': '设置自动保存',
      'err.none': '暂无用量',
      'seg.promo': '促销',
      'seg.credits': '积分消耗',
      'prefs.promo': '模型优惠',
      'prefs.credits': '积分',
      'tip.promo': '促销',
      'promo.window': '适用时段',
      'promo.allDay': '全天',
      'promo.estimated': '估算',
      'tip.model': '模型',
      'tip.rate': '倍率',
      'tip.creditsToday': '今日消耗',
      'tip.creditsSession': '本会话',
      'tip.balance': '剩余积分',
      'tip.creditsModel': '单位',
      'tip.creditsNote': '积分',
      'credit.unit': 'credits',
      // hover-card field labels
      'tip.scope': '范围',
      'tip.reading': '读数',
      'tip.total': '总 token',
      'split.peak': '高峰',
      'split.off': '非高峰',
      'tip.input': '未缓存输入',
      'tip.output': '输出',
      'tip.turnCost': '费用估算',
      'tip.turnCostBasis': '空闲价',
      'tip.cacheRead': '缓存读取',
      'tip.cacheWrite': '缓存写入',
      'tip.cacheHit': '缓存命中',
      'tip.requests': '请求次数',
      'tip.llm': '模型耗时（Σ）',
      'tip.ttft': '最近首字延迟',
      'tip.turns': '轮数',
      'tip.calls': '工具调用',
      'tip.errors': '工具错误',
      'tip.used': '已用',
      'tip.window': '窗口',
      'tip.percent': '占用率',
      'tip.ctxSystem': '系统提示词',
      'tip.ctxUser': '用户消息',
      'tip.ctxInject': '注入内容',
      'tip.ctxSkill': '技能注入',
      'tip.ctxAssistant': '助手消息',
      'tip.ctxTool': '工具结果',
      'tip.ctxTools': '工具定义',
      'tip.ctxMessages': '对话消息',
      'tip.ctxUsed': '上下文已用',
      'tip.today': '今日消耗（全部会话）',
      'chart.speed': '每次请求的输出速度',
      'chart.tokens': '会话 token 构成',
      'chart.credits': '已记录 credits 消耗',
      'chart.rate': '计费倍率',
      'chart.promo': '促销状态',
      'chart.standard': '标准 ×1',
      'chart.current': '当前',
      'chart.active': '生效中',
      'chart.inactive': '未生效',
      'chart.sessionCredits': '积分消耗',
      'chart.creditStatistics': '积分消耗统计',
      'chart.turnCredits': '积分用量',
      'chart.todayCredits': '今日消耗',
      'chart.sessionTodayCredits': '今日积分消耗',
      'credit.pending': '—',
      'credit.pendingDetail': '当前数值为已记录与可估算积分之和，部分响应积分尚未匹配',
      'summary.turn': '本轮用量',
      'summary.session': 'Token 统计',
      'summary.modelTime': '模型用时',
      'summary.activeTime': '会话用时',
      'summary.estimate': '费用估算',
      'summary.creditsActual': '实际消耗',
      'summary.avgTtft': '平均首字延迟',
      'summary.speed': '输出速度',
      'summary.averageSpeed': '平均速度',
      'summary.turnRequests': '本轮请求',
      'timing.wait': '模型等待',
      'timing.reasoning': '模型思考',
      'timing.reply': '模型回复',
      'timing.arguments': '工具参数',
      'timing.tools': '工具执行',
      'timing.other': '其他开销',
      'summary.credits': '积分',
      'summary.cacheHit': '缓存命中',
      'summary.tools': '工具调用',
      'summary.context': '上下文已用',
      'summary.turnPrefix': '本轮',
      'val.tokenW': 'tokens',
    };

    const CSS = [
      // `overflow-x:auto` is the real guard: when every field is on and the
      // window is narrow, the row scrolls inside its own box instead of
      // spilling right into the perched companion.
      '.tsb-root{display:inline-flex;align-items:center;gap:0;flex-wrap:nowrap;min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;margin:0 130px 0 12px;padding:2px 4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover) 72%,transparent);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}',
      '.tsb-root *{box-sizing:border-box}',
      '.tsb-seg{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;white-space:nowrap;border-radius:3px;min-width:0;overflow:hidden;text-overflow:ellipsis;transition:color .12s ease}',
      '.tsb-seg[title]{cursor:default}',
      '.tsb-div{flex:none;color:var(--dsw-alias-separator-primary);opacity:.5;margin:0 -4px;user-select:none}',
      '.tsb-num{color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.tsb-strong{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.tsb-dim{color:var(--dsw-alias-label-tertiary)}',
      '.tsb-ico{flex:none;display:inline-flex;align-items:center;opacity:.85}',
      '.tsb-pill{font:inherit;font-variant-numeric:tabular-nums;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:1px 7px;border-radius:var(--dsw-radius-sm)}',
      '.tsb-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.tsb-gear{flex:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;display:inline-grid;place-items:center;width:24px;height:22px;margin-left:3px;border-radius:var(--dsw-radius-sm);font-size:13px;line-height:1;padding:0}',
      '.tsb-gear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.tsb-panel{position:fixed;z-index:1200;box-sizing:border-box;min-width:196px;padding:8px;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);border:.5px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.tsb-panelTitle{font-weight:600;color:var(--dsw-alias-label-primary);padding:2px 6px 8px}',
      '.tsb-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:var(--dsw-radius-sm);cursor:pointer}',
      '.tsb-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tsb-row input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}',
      '.tsb-scope{margin-top:6px;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.tsb-scopeTitle{padding:2px 6px 4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.tsb-hint{padding:8px 6px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;border-top:.5px solid var(--dsw-alias-border-l1);margin-top:6px}',
      '.tsb-red{color:#d93838}',
      '.tsb-green{color:#1a9e55}',
      '.tsb-amber{color:#c98a00}',
      // Coloured 绿/黄/红 words inside the hover-card value column.
      '.tsb-tipG{color:#1a9e55;font-weight:600}',
      '.tsb-tipA{color:#c98a00;font-weight:600}',
      '.tsb-tipR{color:#d93838;font-weight:600}',
      '.tsb-promo{display:inline-flex;align-items:center;gap:4px;font-weight:600}',
      // Context ring + its reference-card pieces.
      '.tsb-ring{flex:none;display:block}',
      // One headline line: "上下文已用" then a large %, used/window pushed right.
      '.tsb-ctxHead{display:flex;align-items:baseline;gap:8px;margin:0 0 9px}',
      '.tsb-ctxHeadLabel{color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.tsb-ctxHeadPct{font-size:22px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.1;font-variant-numeric:tabular-nums}',
      '.tsb-ctxHeadUsed{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.tsb-ctxBar{display:flex;height:7px;border-radius:999px;overflow:hidden;background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 16%, transparent);margin:0 0 11px;gap:1px}',
      '.tsb-ctxSeg{height:100%;min-width:0;flex:none}',
      '.tsb-ctxLegend{display:flex;flex-direction:column;gap:7px}',
      '.tsb-ctxRow{display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;font-size:13px}',
      '.tsb-ctxSw{flex:none;width:9px;height:9px;border-radius:2px}',
      '.tsb-ctxK{color:var(--dsw-alias-label-secondary)}',
      '.tsb-ctxV{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:500}',
      '.tsb-overview .tsb-ctxHead{margin-bottom:10px}',
      '.tsb-overview .tsb-ctxHeadPct{font-size:21px}',
      '.tsb-overview .tsb-ctxBar{height:7px;margin:0 0 13px}',
      '.tsb-overview .tsb-ctxLegend{gap:7px}',
      '.tsb-overviewDivider{height:1px;background:var(--dsw-alias-border-l1);margin:13px 0 11px}',
      '.tsb-metricGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;row-gap:10px}',
      '.tsb-metricGrid.is-solo{grid-template-columns:1fr}',
      // Label keeps its width, value takes the rest. Without a floor the label column collapsed and its
      // characters stacked one per line in a half-width cell.
      '.tsb-metric{display:flex;flex-direction:row;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}',
      '.tsb-metricLabel{flex:0 0 auto;min-width:3.5em;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis}',
      // A row whose label or value needs the full width takes both columns of the grid.
      '.tsb-metricWide{grid-column:1 / -1}',
      // A row may carry a unit: it stacks under the name, so the value side stays a bare number.
      '.tsb-metricName{display:block}',
      '.tsb-metricUnit{display:block;font-size:10px;line-height:12px;opacity:.7}',
      '.tsb-metricValue{margin-left:auto;text-align:right;color:var(--dsw-alias-label-primary);font-size:13px;line-height:21px;font-weight:500;min-width:0;word-break:break-word}',
      '.tsb-timingGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}',
      '.tsb-timingItem{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:2px 6px;align-items:center;min-width:0}',
      '.tsb-timingSwatch{width:8px;height:8px;border-radius:2px}',
      '.tsb-timingLabel{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tsb-timingPercent{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;text-align:right}',
      '.tsb-timingDetail{grid-column:2 / 4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.tsb-overviewModel{display:flex;align-items:center;gap:6px;margin-top:11px;padding-top:9px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;min-width:0}',
      '.tsb-overviewModelName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // Rate chip shown beside each model in the picker.
      '.tsb-mrate{display:inline-flex;align-items:center;gap:2px;margin-left:6px;padding:0 5px;border-radius:8px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);vertical-align:middle;white-space:nowrap}',
      '.tsb-mrate[data-free="1"]{color:#1a9e55;background:rgba(26,158,85,.12)}',
      '.tsb-mlabel{display:inline-flex;align-items:center;min-width:0;max-width:100%}',
      '.tsb-mlabelText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tsb-mbadge{display:inline-flex;align-items:center;gap:2px;margin-left:6px;padding:0 5px;border-radius:8px;font-size:10.5px;line-height:15px;white-space:nowrap;background:rgba(0,146,115,.12);color:#009273}',
      // Rendered inside `conversation.input.dock` — the normal-flow vertical row
      // that sits directly ABOVE the composer card (the queue panel lives here
      // too). It is not the absolutely-positioned `composer.dock` band, so the
      // The wrap occupies real space in the dock and never overlaps the card's
      // toolbar. Left-aligned so the row begins at the card's left edge and
      // stays clear of the perched companion at the card's right corner. The
      // right padding reserves that corner; the companion sits at right:24px
      // and is about 96px wide, so 130px keeps the last item (the gear) clear.
      '.tsb-wrap{position:relative;width:100%;max-width:var(--dsh-composer-card-max-width,100%);margin:0 auto;display:flex;justify-content:flex-start;align-items:center;min-width:0;flex:none;padding:0;box-sizing:border-box;container-type:inline-size;container-name:tsb}',
      // Narrow windows shrink the reserved corner so the row keeps its room.
      '@container tsb (max-width:760px){.tsb-root{margin-right:104px}}',
      '@container tsb (max-width:620px){.tsb-root{margin-right:16px}}',
      '@container tsb (max-width:636px){.tsb-seg[data-seg="usage"]{display:none}}',
      '@container tsb (max-width:508px){.tsb-seg[data-seg="session"]{display:none}}',
      '',
      '@container tsb (max-width:348px){.tsb-seg[data-seg="context"]{display:none}}',
      '@container tsb (max-width:286px){.tsb-seg[data-seg="promo"]{display:none}}',
      '',
'@container tsb (max-width:636px){.tsb-div:has(+ .tsb-seg[data-seg="usage"]){display:none}}',
      '',
      '@container tsb (max-width:348px){.tsb-div:has(+ .tsb-seg[data-seg="context"]){display:none}}',
      '@container tsb (max-width:286px){.tsb-div:has(+ .tsb-seg[data-seg="promo"]){display:none}}',
      '',
      // Each segment opens a focused card at its own screen position.
      '.tsb-seg{cursor:default}',
      '.tsb-seg[data-tip]:hover{color:var(--dsw-alias-label-primary)}',
      '.tsb-seg[data-tip]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}',
      '.tsb-tip{position:fixed;z-index:1200;box-sizing:border-box;width:min(380px,calc(100vw - 24px));min-width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);padding:12px;border-radius:14px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px;pointer-events:none;font-variant-numeric:tabular-nums}',
      '.tsb-tip.tsb-overview{width:min(340px,calc(100vw - 24px));min-width:0}',
      // A group is one topic: heading plus its own content. The gap and rule belong to the group, not
      // to a heading, so adding a group never leaves the boundary ambiguous.
      // A group is a panel: its own padding and a faint tint, so the boundary is a shape rather than a
      // rule that competes with the row separators inside it.
      '.tsb-group{padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.06))}',
      '.tsb-group+.tsb-group{margin-top:8px}',
      // The heading sits on its own band so a group reads as a titled section. Its tint is derived from the
      // theme's label colour with color-mix — the same technique the bars and tracks use — so it follows the
      // theme instead of laying a fixed grey over it. The negative inline margin lets it reach the panel edges.
      '.tsb-tipHead{font-weight:600;color:var(--dsw-alias-label-primary);font-size:12px;margin:-10px -12px 8px;padding:8px 12px;border-radius:8px 8px 0 0;background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 7%, transparent)}',
      '.tsb-speedHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:nowrap}',
      '.tsb-speedValue{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:auto}',
      '.tsb-ratio{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;white-space:nowrap;flex:0 0 auto}',
      // The account-level ratio sits on its own line, right-aligned under the figures it relates.
      '.tsb-ratioRow{text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:6px}',
      '.tsb-cached{font-size:10px;line-height:14px;padding:0 4px;border-radius:3px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.16));color:var(--dsw-alias-label-tertiary);margin-left:6px}',
      '.tsb-cachedRow{font-size:10px;color:var(--dsw-alias-label-tertiary);margin:4px 0}',
      // Models left, ratio right: one row, so the ratio sits beside the figures it converts between.
      '.tsb-modelBlock{display:flex;align-items:flex-end;gap:12px}',
      '.tsb-modelBlock>.tsb-modelList{flex:1 1 auto;min-width:0}',
      '.tsb-ratioSide{flex:0 0 auto;margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-bottom:2px;text-align:right}',
      // One model per line: swatch, name, credits right-aligned, tokens beneath the name.
      '.tsb-modelList{display:flex;flex-direction:column;gap:8px}',
      // The credit group's heading: a title on the left, the conversation total on the right.
      // Shared by every group heading: only the two-column layout is added; the look comes from
      // tsb-tipHead, so a heading can never drift from the others.
      '.tsb-headRow{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
      '.tsb-headTotal{font-variant-numeric:tabular-nums}',
      '.tsb-modelRow{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:2px 8px;align-items:center}',
      '.tsb-modelName{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tsb-modelCredits{font-size:12px;font-weight:600;text-align:right;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.tsb-modelTokens{grid-column:2 / 3;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      // The rate aligns with the credit figure above it, so each model's numbers form one right edge.
      '.tsb-modelRate{grid-column:3 / 4;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);text-align:right;white-space:nowrap}',
      // The period split sits under the model's figures, spanning the row.
      '.tsb-modelPeriods{grid-column:2 / 4;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.tsb-timingCard .tsb-timingGrid{padding-top:8px}',
      // A tip value can be a full sentence (a promotion's own wording), so the row must be
      // able to wrap instead of pushing text past the card edge. The key keeps its width and
      // the value takes the remainder, breaking on word boundaries.
      '.tsb-div{color:var(--dsw-alias-border-secondary,rgba(128,128,128,0.3));padding:0 2px}',
      // Group boundary: more space and a dimmer rule, so groups read as blocks.
      '.tsb-divWide{padding:0 7px;opacity:0.6}',
      '.tsb-dot{color:var(--dsw-alias-label-tertiary);opacity:.55;padding:0 1px}',
      '.tsb-tipRow{display:flex;justify-content:space-between;gap:20px;min-height:20px;align-items:flex-start}',
      '.tsb-tipSection+.tsb-tipSection{margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,0.22))}',
      // Section headline figure (e.g. "2.73亿 tokens").
      // Two-column breakdown: label left, share and detail right.
      // One separator per boundary: the heading underline is suppressed inside the merged card, and
      // the section gap keeps its own rule.
      // No underline inside the merged card, but a real gap under each heading so the title does not
      // touch the figures below it.
      '.tsb-tipSection .tsb-tipHead{margin:0 0 8px;padding:0;border-bottom:none}',
      // The in-section divider is not drawn, but it still occupies the slot between the figures and the
      // detail rows. Give that slot a height so the two never touch — a zero-height block relying on
      // margins can be collapsed away, an explicit height cannot.
      '.tsb-tipSection .tsb-overviewDivider{display:block;height:12px;background:none;border:none;margin:0}',
      '.tsb-tipK{color:var(--dsw-alias-label-tertiary);flex:0 0 auto;white-space:nowrap}',
      '.tsb-tipV{color:var(--dsw-alias-label-primary);font-weight:500;flex:1 1 auto;min-width:0;text-align:right;overflow-wrap:anywhere}',
      '.tsb-tipFoot{margin-top:6px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;white-space:normal}',
      '.tsb-chart{padding:8px 0 10px;margin:0 0 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.tsb-chartTitle{margin-bottom:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}',
      '.tsb-spark{display:flex;align-items:flex-end;gap:7px;height:54px;padding:0 2px}',
      '.tsb-sparkCol{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%;min-width:0}',
      '.tsb-sparkValue{color:var(--dsw-alias-label-secondary);font-size:10px;line-height:12px}',
      '.tsb-sparkBar{display:block;width:min(14px,70%);min-height:3px;border-radius:3px 3px 1px 1px;background:var(--dsw-alias-state-business-primary)}',
      '.tsb-sparkAxis{display:flex;justify-content:space-between;margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:13px}',
      '.tsb-chartRow{display:grid;grid-template-columns:84px minmax(0,1fr) 76px;align-items:center;gap:9px;min-height:19px}',
      '.tsb-chartLabel{overflow:hidden;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap}',
      '.tsb-chartTrack{display:block;height:6px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent)}',
      '.tsb-chartFill{display:block;height:100%;min-width:0;border-radius:inherit;background:var(--dsw-alias-state-business-primary);transition:width .18s ease}',
      '.tsb-chartValue{min-width:42px;text-align:right;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
      '.tsb-rateTrack{position:relative;height:8px;margin:10px 3px 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent)}',
      '.tsb-rateFill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-state-business-primary)}',
      '.tsb-rateBaseline,.tsb-rateCurrent{position:absolute;top:50%;width:2px;height:14px;border-radius:2px;background:var(--dsw-alias-label-secondary);transform:translate(-50%,-50%)}',
      '.tsb-rateCurrent{width:7px;height:7px;border:2px solid var(--dsw-specific-menu);border-radius:50%;background:var(--dsw-alias-state-business-primary)}',
      // Three columns: the floor, the standard marker, and the current rate. Absolute positioning let the
      // marker label collide with the rate when the marker sat near the right edge.
      '.tsb-rateOverflowTrack{position:relative;height:6px;margin:0 3px 8px;background:color-mix(in srgb,#d94841 12%,transparent);border-radius:999px}',
      '.tsb-rateFixed{background:transparent}',
      '.tsb-rateStandardZone{position:absolute;inset:0 auto 0 0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent)}',
      '.tsb-rateFixed .tsb-rateFill{position:absolute;left:0;top:0}',
      '.tsb-rateExcess{position:absolute;top:0;height:100%;background:#d94841;border-radius:0 999px 999px 0}',
      '.tsb-rateCurrent.is-over{background:#d94841}',
      '.tsb-rateFixedAxis{position:relative;height:17px;margin:0 3px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary)}',
      '.tsb-rateZero{position:absolute;left:0;top:0}',
      '.tsb-rateStandardLabel{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}',
      '.tsb-rateOverLabel{position:absolute;left:0;top:17px;color:#d94841;font-weight:600}',
      '.tsb-rateHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.tsb-rateValueLabel{white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.tsb-rateValueLabel.is-over{color:#d94841}',
      '.tsb-rateAxis{display:grid;grid-template-columns:auto 1fr auto;align-items:baseline;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;margin-top:6px}',
      '.tsb-rateAxis span:nth-child(2){text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tsb-rateAxis strong{color:var(--dsw-alias-label-primary);font-size:11px;font-weight:600;white-space:nowrap}',
      '.tsb-statusChart{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 12%,transparent)}',
      '.tsb-statusTrack{padding:5px 4px;border-radius:4px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}',
      '.tsb-statusTrack.is-active{background:var(--dsw-specific-menu);color:var(--dsw-alias-state-business-primary);font-weight:600;box-shadow:var(--dsw-elevation-subtle)}',
    ];

    const TAG_ID = 'dsh-token-statusbar-workbuddy/statusbar.module.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(TAG_ID) + ']') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-token-statusbar-workbuddy';
      tag.dataset.pluginCss = TAG_ID;
      tag.textContent = CSS.join('');
      document.head.appendChild(tag);
    }

    // ---- formatting helpers -------------------------------------------------

    function trimNum(x) {
      let s = x.toFixed(2);
      if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
      return s;
    }

    /**
     * Compact token count in three magnitude tiers: `k`, `M`, and `亿`.
     *
     * The tiers apply in both locales; only the top glyph is localized — Chinese
     * uses `亿`, English keeps `B`. One decimal place keeps 1.8M and 16.2M apart.
     */
    function fmtTokens(n, locale) {
      if (n === undefined || n === null || !Number.isFinite(n)) return '—';
      n = Math.max(0, n);
      const zh = /^zh/i.test(locale || '');
      const one = (x) => (Math.round(x * 10) / 10).toFixed(1);
      // Two decimals at the 亿/B scale: one decimal there is a 10M-token step, too coarse for a
      // figure this large. Smaller units keep one decimal, where it is already fine enough.
      if (n >= 1e8) return (n / 1e8).toFixed(2) + (zh ? '亿' : 'B');
      if (n >= 1e6) return one(n / 1e6) + 'M';
      if (n >= 1e3) return one(n / 1e3) + 'k';
      return String(Math.round(n));
    }

    /** K/M token count always, e.g. ~481K / 1M — matches the reference card. */
    function fmtKM(n) {
      if (n === undefined || n === null || !Number.isFinite(n)) return '—';
      n = Math.max(0, n);
      if (n >= 1e6) {
        const v = n / 1e6;
        return (Number.isInteger(v) ? String(v) : trimNum(v)) + 'M';
      }
      if (n >= 1e3) return Math.round(n / 1e3) + 'K';
      return String(Math.round(n));
    }

    /** ~481K / 1M — the reference card's used/window headline. */
    function fmtUsedWindow(used, win) {
      return '≈' + fmtKM(used) + ' / ' + fmtKM(win);
    }

    function fmtExactTokens(n) {
      return Number.isFinite(n) && n >= 0 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
    }

    /** Read-cache percentage of billed input, displayed to two decimal places. */
    function fmtCacheHitPct(read, billed) {
      if (!Number.isFinite(read) || !Number.isFinite(billed) || billed <= 0) return null;
      return (Math.max(0, read) / billed * 100).toFixed(2);
    }

/**
 * The live credits-per-yuan ratio, as a short label.
 *
 * Computed by the Host from today's token spend (weighted by period, cache and output rates) and
 * today's credits. A reading far from the historical norm means an input is wrong, which is why it
 * is shown rather than hidden.
 *
 * @param {object|null} snapshot - billing snapshot.
 * @returns {string} e.g. "13.19 积分/¥", or '' when it cannot be computed.
 */
/**
 * Cost in yuan of one 亿 (100M) tokens for this conversation.
 *
 * Derived from the Host's weighted attribution: the share of today's spend divided by the share of
 * today's tokens. It answers "how expensive was this conversation per token", which the raw token count
 * and the credit total cannot express on their own.
 *
 * @param {object|null} snapshot - billing snapshot.
 * @param {string} sessionId
 * @returns {string|null} e.g. "12.34", or null when the inputs are missing.
 */
/**
 * Cost in yuan of a session's own period split.
 *
 * Uses the same rate book as every other figure on the card, so the unit price it produces is
 * consistent with the fee estimate beside it.
 *
 * @param {{peak: object, off: object, total: object}|null} split
 * @param {string} model
 * @returns {number|null} CNY, or null when the split or the rates are missing.
 */
/**
 * This session's own share of its lifetime cost.
 *
 * The transcript totals a session's WHOLE life (an forked session replays its parent's messages), while
 * the credits recorded against it are lifetime too. The own-only span is what the card's token headline
 * shows, so both the credit figure and the unit price are adjusted by this ratio to agree with it.
 *
 * @param {{peak: object, off: object, total: object}|null} split - own-only buckets.
 * @param {string} model
 * @param {{cny: number}|null} officialCost - lifetime fee estimate.
 * @returns {number} Ratio in [0, 1]; 1 when it cannot be measured.
 */
function ownCostShare(split, model, officialCost) {
  if (split === null || split === undefined) return 1;

  // No inherited history: the session IS its own lifetime total.
  const inheritedCost = Number(split.inheritedCost) || 0;
  if (inheritedCost <= 0) return 1;

  // Both figures priced, so cache-heavy history is weighted by what it actually cost rather than by how
  // many tokens it happened to move.
  const own = ownCostOf(split, model);
  if (own === null || own <= 0) return 1;

  const lifetime = own + inheritedCost;
  const ratio = own / lifetime;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(1, ratio);
}

/**
 * Per-model spend for a conversation, heaviest first.
 *
 * @param {object|null} snapshot - billing snapshot.
 * @param {string} sessionId
 * @returns {Array<{model: string, messages: number, tokens: number, cny: number}>}
 */
function modelSplitsFor(snapshot, sessionId) {
  const splits = snapshot && snapshot.modelSplits;
  if (splits === null || typeof splits !== 'object') return [];
  if (typeof sessionId !== 'string' || sessionId === '') return [];
  const rows = splits[sessionId];
  return Array.isArray(rows) ? rows.filter((row) => row !== null && typeof row === 'object' && row.tokens > 0) : [];
}

/**
 * A model id as a readable label.
 *
 * The transcript stores the id, not a display name, so capitalise the well-known vendor prefixes and
 * keep the rest as-is — inventing a prettier name would misreport what ran.
 *
 * @param {string} model
 * @returns {string}
 */
function modelLabel(model) {
  if (typeof model !== 'string' || model === '') return 'unknown';
  if (model === 'unknown') return 'unknown';
  return model;
}

/**
 * The credits to show for a conversation, derived from its own priced fee.
 *
 * The ledger cannot attribute spend to a conversation, so this uses the account-level ratio instead:
 * fee × credits-per-yuan. Returns null when either input is missing.
 *
 * @param {object|null} snapshot
 * @param {string} sessionId
 * @param {{peak: object, off: object}|null} ownSplit
 * @param {string} selModel
 * @param {{cny: number}|null} officialCost
 * @returns {number|null}
 */
function creditsForConversation(snapshot, sessionId, ownSplit, selModel, officialCost) {
 if(snapshot?.creditMode==='exact-v2') { const row=snapshot.bySession?.[sessionId]; return row?.sessionCount>0 ? row.session : null; }

  const attribution = snapshot && snapshot.attribution;
  const ratio = attribution && typeof attribution.ratio === 'number' ? attribution.ratio : null;
  if (ratio === null) return null;
  const own = ownCostOf(ownSplit, selModel);
  if (own === null) return null;
  return own * ratio;
}

function ownCostOf(split, model) {
  if (split === null || split === undefined) return null;
  if (split.peak === null || split.off === null) return null;
  const offRate = ratesForPeriod(model, 'off');
  const peakRate = ratesForPeriod(model, 'peak');
  if (offRate === null && peakRate === null) return null;

  const fee = (rate, bucket) => {
    if (rate === null || bucket === null || bucket === undefined) return 0;
    return (
      (Number(bucket.uncached) || 0) * (rate.input || 0)
      + (Number(bucket.cacheRead) || 0) * (rate.cacheHit || 0)
      + (Number(bucket.cacheWrite) || 0) * (rate.cacheWrite || 0)
      + (Number(bucket.output) || 0) * (rate.output || 0)
    ) / 1e6;
  };

  return fee(peakRate, split.peak) + fee(offRate, split.off);
}

function unitPricePerYiToken(officialCost, sessionTotal, sessionId, snapshot) {
  if (officialCost?.partial) return null;
  // Prefer this conversation's own numbers: its fee estimate divided by its own token count is the
  // price per token, and it is available for every session, including historical ones.
  const cny = officialCost !== null && typeof officialCost === 'object' && typeof officialCost.cny === 'number'
    ? officialCost.cny
    : null;
  const tokens = typeof sessionTotal === 'number' && Number.isFinite(sessionTotal) ? sessionTotal : null;
  if (cny !== null && tokens !== null && tokens > 0) {
    return (cny / (tokens / 1e8)).toFixed(2);
  }

  // Fall back to the Host's day-scoped attribution when the session's own figures are missing.
  const attribution = snapshot && snapshot.attribution;
  const sessions = attribution && attribution.sessions;
  if (sessions === null || typeof sessions !== 'object') return null;
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const row = sessions[sessionId];
  if (row === undefined || row === null) return null;
  const rowCny = typeof row.cny === 'number' ? row.cny : null;
  const rowTokens = typeof row.tokens === 'number' ? row.tokens : null;
  if (rowCny === null || rowTokens === null || rowTokens <= 0) return null;
  return (rowCny / (rowTokens / 1e8)).toFixed(2);
}

/** Preserve known response credits when other responses remain unmatched. */
function creditSummaryText(value, models) {
  const rows = Object.values(models || {});
  if (!rows.some(row => row.unresolved)) return value;
  const known = rows.some(row => row.count > 0 || row.estimatedCount > 0 || row.credits > 0 || row.displayCredits > 0);
  return known && value !== null && value !== '—' ? value : '—';
}

function referenceCostOfRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const known = rows.filter(row => Number.isFinite(row.cny) && !row.unpricedCount);
  if (known.length === 0) return null;
  return { cny: known.reduce((sum, row) => sum + row.cny, 0), partial: known.length !== rows.length };
}

/**
 * The conversation's overall rate in yuan per 亿 tokens.
 *
 * The headline shows a token total; this says what those tokens cost, so the two can be read together.
 *
 * @param {{cny: number}|null} officialCost
 * @param {number|null} sessionTotal
 * @param {Function} translate
 * @returns {string} e.g. "2.59 元/亿token", or '' when it cannot be computed.
 */
function sessionUnitPriceText(officialCost, sessionTotal, translate) {
  if (officialCost?.partial) return '';
  const cny = officialCost !== null && typeof officialCost === 'object' && typeof officialCost.cny === 'number'
    ? officialCost.cny
    : null;
  const tokens = typeof sessionTotal === 'number' && Number.isFinite(sessionTotal) ? sessionTotal : null;
  if (cny === null || tokens === null || tokens <= 0) return '';
  const unit = typeof translate === 'function' ? translate('unit.cnyPerYiToken') : 'yuan/100M tok';
  return (cny / (tokens / 1e8)).toFixed(2) + ' ' + unit;
}

function priceRatioText(snapshot, translate) {
  const attribution = snapshot && snapshot.attribution;
  const ratio = attribution && typeof attribution.ratio === 'number' ? attribution.ratio : null;
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return '';
  const unit = typeof translate === 'function' ? translate('unit.creditsPerCny') : '\\u79ef\\u5206/\\u5143';
  return ratio.toFixed(2) + ' ' + unit;
}

/**
 * This conversation's share of today's credits, apportioned by weighted cost.
 *
 * The raw ledger credits whichever conversation the sampler happened to pick, so a session that ran
 * alongside another shows too little. The Host apportions today's credits by priced cost instead.
 *
 * @param {object|null} snapshot - billing snapshot.
 * @param {string} sessionId
 * @returns {number|null} Credits, or null when the Host supplied no attribution.
 */
function attributedCreditsFor(snapshot, sessionId) {
  const attribution = snapshot && snapshot.attribution;
  const sessions = attribution && attribution.sessions;
  if (sessions === null || typeof sessions !== 'object') return null;
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const row = sessions[sessionId];
  if (row === undefined || row === null) return null;
  return typeof row.credits === 'number' && Number.isFinite(row.credits) ? row.credits : null;
}

    /**
 * A credit amount with two decimals.
 *
 * The bridge reports floats at full precision (3602.6900020000003), which reads as noise.
 * Two decimals is the display granularity for this unit.
 *
 * @param {number|null} value
 * @returns {string} Formatted amount, or an em dash when unknown.
 */
function fmtCredit(value) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

/** One-decimal seconds, e.g. 18.4s; null for non-positive input. */
    function fmtSeconds(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return (ms / 1000).toFixed(1) + 's';
    }

    function fmtDuration(ms, locale) {
      if (!Number.isFinite(ms) || ms <= 0) return null;
      const total = Math.floor(ms / 1000);
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      if (/^zh/i.test(locale || '')) {
        return minutes + '分' + seconds + '秒';
      }
      return minutes + 'm ' + seconds + 's';
    }

    function fmtCny(amount) {
      if (!Number.isFinite(amount) || amount < 0) return null;
      return '¥' + amount.toFixed(4);
    }

    /** Rounded tokens/second; null when nothing measurable. */
    function fmtSpeed(tokens, ms) {
      if (!Number.isFinite(tokens) || !Number.isFinite(ms) || tokens <= 0 || ms <= 0) return null;
      return Math.round(tokens / (ms / 1000));
    }

    function speedClass(tps) {
      if (tps >= 70) return 'tsb-green';
      if (tps >= 40) return 'tsb-amber';
      return 'tsb-red';
    }

    function ctxClass(pct) {
      if (pct >= 85) return 'tsb-red';
      if (pct >= 70) return 'tsb-amber';
      return '';
    }

    // ---- node folding (mirrors ui-chat's deriveStats + additions) -----------

    function usageOutputTokens(usage) {
      if (typeof usage !== 'object' || usage === null) return null;
      const v = usage.outputTokens;
      return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    }

    function assistantStepReading(node) {
      const timing = node.timing;
      return {
        ttftMs:
          timing !== undefined && timing.stepStartTime !== null && timing.firstTokenTime !== null
            ? Math.max(0, timing.firstTokenTime - timing.stepStartTime)
            : null,
        decodeMs:
          timing !== undefined && timing.firstTokenTime !== null
            ? Math.max(0, timing.completedTime - timing.firstTokenTime)
            : null,
        outputTokens: usageOutputTokens(node.usage),
      };
    }

    /** Billed prompt-side input for one provider usage sample. */
    function billedInput(usage) {
      if (typeof usage !== 'object' || usage === null) return 0;
      const uncached = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
      const read = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
      const write = Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;
      return uncached + read + write;
    }

    /**
     * One pass over the node list producing both the session-wide totals and the
     * latest turn's aggregate.
     *
     * The two used to be separate functions that each walked `nodes` (three
     * passes in total). The latest-turn figures are derived from a per-turn
     * accumulator filled during the same walk, so callers get both answers for
     * one traversal.
     *
     * @param {ReadonlyArray<object>} nodes - session nodes in sequence order.
     * @returns {{stats: object, latest: object|null}} Session totals and the
     *   highest `turn` aggregate, or `null` when the list holds no assistant node.
     */
    function deriveNodeSummary(nodes) {
      const turns = new Set();
      const toolCalls = new Set();
      const toolErrors = new Set();
      let steps = 0;
      let llmMs = 0;
      let toolMs = 0;
      let ttftMs = 0;
      let ttftSteps = 0;
      let decodeMs = 0;
      let decodeTokens = 0;

      // Latest-turn accumulators: `latestTurn` rises as later turns appear, and
      // the per-turn map keeps each turn's own figures so the winner is available
      // without a second pass.
      let latestTurn = null;
      const perTurn = new Map();

      for (const node of nodes) {
        if (node.kind === 'tool-result') {
          const id = node.callId !== undefined && node.callId !== null && node.callId !== '' ? node.callId : node.seq;
          toolCalls.add(id);
          if (node.isError === true) toolErrors.add(id);
          if (node.callTime !== null && node.callTime !== undefined) toolMs += Math.max(0, node.time - node.callTime);
          continue;
        }
        if (node.kind !== 'assistant') continue;

        turns.add(node.turn);
        steps += 1;
        const reading = assistantStepReading(node);
        if (node.timing !== undefined && node.timing.stepStartTime !== null) {
          llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
        }
        if (reading.ttftMs !== null) {
          ttftMs += reading.ttftMs;
          ttftSteps += 1;
        }
        if (reading.decodeMs !== null && reading.outputTokens !== null) {
          decodeMs += reading.decodeMs;
          decodeTokens += reading.outputTokens;
        }

        const turnKey = node.turn;
        let turn = perTurn.get(turnKey);
        if (turn === undefined) {
          turn = { turn: turnKey, requests: 0, input: 0, output: 0, read: 0, write: 0, llmMs: 0, lastTtft: null, lastCompleted: -Infinity };
          perTurn.set(turnKey, turn);
        }
        turn.requests += 1;
        const usage = node.usage;
        if (usage && typeof usage === 'object') {
          if (Number.isFinite(usage.inputTokens)) turn.input += usage.inputTokens;
          if (Number.isFinite(usage.outputTokens)) turn.output += usage.outputTokens;
          if (Number.isFinite(usage.cacheReadTokens)) turn.read += usage.cacheReadTokens;
          if (Number.isFinite(usage.cacheWriteTokens)) turn.write += usage.cacheWriteTokens;
        }
        if (node.timing !== undefined && node.timing.stepStartTime !== null) {
          turn.llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
        }
        // The latest completed step decides the turn's TTFT figure.
        const completed = node.timing !== undefined ? node.timing.completedTime : node.time;
        if (completed !== undefined && completed >= turn.lastCompleted) {
          turn.lastCompleted = completed;
          turn.lastTtft = reading.ttftMs;
        }
        if (latestTurn === null || turnKey > latestTurn) latestTurn = turnKey;
      }

      const stats = {
        turns: turns.size,
        steps,
        llmMs,
        toolMs,
        ttftMs,
        ttftSteps,
        decodeMs,
        decodeTokens,
        toolCalls: toolCalls.size,
        toolErrors: toolErrors.size,
      };

      if (latestTurn === null) return { stats, latest: null };

      const chosen = perTurn.get(latestTurn);
      const billed = chosen.input + chosen.read + chosen.write;
      return {
        stats,
        latest: {
          turn: chosen.turn,
          requests: chosen.requests,
          billed,
          input: chosen.input,
          output: chosen.output,
          cacheRead: chosen.read,
          cacheWrite: chosen.write,
          total: billed + chosen.output,
          cacheHit: fmtCacheHitPct(chosen.read, billed),
          llmMs: chosen.llmMs,
          lastTtft: chosen.lastTtft,
        },
      };
    }

    function deriveSpeedSamples(nodes) {
      const samples = [];
      for (const node of nodes) {
        if (node.kind !== 'assistant') continue;
        const reading = assistantStepReading(node);
        const value = fmtSpeed(reading.outputTokens, reading.decodeMs);
        if (value !== null) samples.push(value);
      }
      return samples.slice(-8);
    }

    function fullSessionUsage(cost) {
      if (!cost || typeof cost !== 'object') return null;
      const result = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
      let found = false;
      for (const models of Object.values(cost)) {
        if (!models || typeof models !== 'object') continue;
        for (const periods of Object.values(models)) {
          if (!periods || typeof periods !== 'object') continue;
          for (const period of ['peak', 'off']) {
            const bucket = periods[period];
            if (!bucket || typeof bucket !== 'object') continue;
            for (const [source, target] of [['uncached', 'uncachedInputTokens'], ['cacheRead', 'cacheReadTokens'], ['cacheWrite', 'cacheWriteTokens'], ['output', 'outputTokens']]) {
              if (Number.isFinite(bucket[source]) && bucket[source] >= 0) {
                result[target] += bucket[source];
                found = true;
              }
            }
          }
        }
      }
      return found ? result : null;
    }

    /** The four billed buckets of one cost entry, or null when absent. */
    function billedBucketOf(period, key) {
      if (!period || typeof period !== 'object') return null;
      const bucket = period[key];
      if (!bucket || typeof bucket !== 'object') return null;
      const read = (name) => (Number.isFinite(bucket[name]) && bucket[name] >= 0 ? bucket[name] : 0);
      return {
        uncached: read('uncached'),
        cacheRead: read('cacheRead'),
        cacheWrite: read('cacheWrite'),
        output: read('output'),
      };
    }

    /** Sum two optional buckets without mutating either. */
    function addBucket(into, extra) {
      if (extra === null) return into;
      into.uncached += extra.uncached;
      into.cacheRead += extra.cacheRead;
      into.cacheWrite += extra.cacheWrite;
      into.output += extra.output;
      return into;
    }

    /**
     * Break a `contextTimeline.cost` table into the two views the card shows.
     *
     * The projection nests `cost[provider][model] = { peak, off }`, so the flat
     * total `fullSessionUsage` produces discards both grouping dimensions. This
     * keeps them:
     *
     *   byModel[]: one row per provider/model, each carrying its own peak/off split
     *   byPeriod:  peak and off totals across every model
     *
     * Totals are billed-token sums (uncached + cacheRead + cacheWrite + output).
     *
     * @param {object|undefined} cost - the projection's cost table.
     * @returns {{byModel: object[], byPeriod: object, total: number}|null} Null when
     *   the table carries no readable bucket.
     */
    function splitCostByModelAndPeriod(cost) {
      if (!cost || typeof cost !== 'object') return null;
      const byModel = [];
      const byPeriod = { peak: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, off: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 } };
      let found = false;

      for (const [provider, models] of Object.entries(cost)) {
        if (!models || typeof models !== 'object') continue;
        for (const [model, periods] of Object.entries(models)) {
          if (!periods || typeof periods !== 'object') continue;
          const peak = billedBucketOf(periods, 'peak');
          const off = billedBucketOf(periods, 'off');
          if (peak === null && off === null) continue;
          found = true;
          const peakTotal = peak === null ? 0 : peak.uncached + peak.cacheRead + peak.cacheWrite + peak.output;
          const offTotal = off === null ? 0 : off.uncached + off.cacheRead + off.cacheWrite + off.output;
          addBucket(byPeriod.peak, peak);
          addBucket(byPeriod.off, off);
          byModel.push({
            provider,
            model,
            peak: peakTotal,
            off: offTotal,
            total: peakTotal + offTotal,
            buckets: addBucket(addBucket({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, peak), off),
          });
        }
      }

      if (!found) return null;
      byModel.sort((a, b) => b.total - a.total);
      const peakTotalAll = byPeriod.peak.uncached + byPeriod.peak.cacheRead + byPeriod.peak.cacheWrite + byPeriod.peak.output;
      const offTotalAll = byPeriod.off.uncached + byPeriod.off.cacheRead + byPeriod.off.cacheWrite + byPeriod.off.output;
      return {
        byModel,
        byPeriod: {
          peak: { ...byPeriod.peak, total: peakTotalAll },
          off: { ...byPeriod.off, total: offTotalAll },
        },
        total: peakTotalAll + offTotalAll,
      };
    }

    function selectSessionUsage(projected, timeline) {
      const total = (usage) => {
        if (!usage || !Number.isFinite(usage.uncachedInputTokens)) return -1;
        return ['uncachedInputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']
          .reduce((sum, key) => sum + (Number.isFinite(usage[key]) ? Math.max(0, usage[key]) : 0), 0);
      };
      // Both projections are cumulative for this session, but may cover different
      // amounts of history. Keep one complete bucket set; never add them together.
      return total(projected) >= total(timeline) ? projected : timeline;
    }

    // ---- billing data (rate / promotion badge / credits / balance) ---------
    //
    // Served by this plugin's Host half, which proxies `dsh-workbuddy-bridge`
    // (a same-DSH plugin, so it is up whenever DSH is) and adds a durable credit
    // ledger of its own.
    //
    // Model facts and the balance are account-wide, so one snapshot serves every
    // consumer. The CREDIT figures are per-conversation, and DSH keeps several
    // conversations alive at once (a new window does not unload the old one), so
    // they must be cached PER SESSION: a single shared figure made every status
    // bar show whichever conversation had most recently mounted, which is what
    // "starting a new session reset them all" looked like.

    /** Account-wide facts shared by every consumer. */
    let BILLING = { models: {}, balance: null, credits: { today: 0, session: 0 } };
    let BILLING_MODEL;
    let BILLING_PROVIDER;
    /**
     * Per-session credit totals, keyed by session id, each entry shaped like
     * `{ session, sessionCount, today, todayCount, at }`.
     *
     * Kept beside the account snapshot rather than inside it: the same poll can
     * then update one entry without invalidating the other sessions' figures.
     */
    const CREDITS_BY_SESSION = new Map();
    // Host-measured peak / off-peak split per session. The browser cannot compute it: the
    // projection view it receives carries an empty `requests` array.
    const PERIOD_SPLIT_BY_SESSION = new Map();
    /** Sessions the poller currently refreshes on each tick. */
    const trackedSessions = new Set();
    /** Guards the fallback session lookup so a tick cannot stack requests. */
    let adoptInflight = false;
    const billingWatchers = new Set();
    let billingTimer = 0;
    let billingInflight = false;
    /** Consecutive failed pulls; lets the bar tell "no data" from "failing". */
    let BILLING_FAILURES = 0;
    /** Message of the most recent failed pull, for diagnostics. */
    let BILLING_LAST_ERROR = null;
    /** Set when a registration arrives mid-poll, so it is replayed afterwards. */
    let rerequest = false;

    // The route moved from `/api/` (now fenced by the host's guard) to `/plugins/`.
// Both are tried so an older host build still works.
const BILLING_ENDPOINTS = [
  '/plugins/dsh-token-statusbar-workbuddy/billing',
  '/api/dsh-token-statusbar-workbuddy/billing',
];
    const BILLING_POLL_MS = 4000;

    function getBilling() {
      return BILLING;
    }

    /** Credit totals for one session, or the account snapshot's own figures. */
    function getCredits(sessionId) {
      const cached = typeof sessionId === 'string' ? CREDITS_BY_SESSION.get(sessionId) : undefined;
      return {
        session: cached ? cached.session : null,
        sessionCount: cached ? cached.sessionCount : null,
        sessionToday: cached && Number.isFinite(cached.sessionToday) ? cached.sessionToday : null,
        today: BILLING.credits.today,
        todayCount: BILLING.credits.todayCount,
      };
    }

    function subscribeBilling(listener) {
      billingWatchers.add(listener);
      ensureBillingPolling();
      return () => {
        billingWatchers.delete(listener);
      };
    }

    function notifyBillingWatchers() {
      for (const listener of billingWatchers) {
        try {
          listener();
        } catch (_error) {
          /* one bad watcher must not stop the fan-out */
        }
      }
    }

    function ensureBillingPolling() {
      if (billingTimer !== 0 || typeof window === 'undefined') return;
      const tick = () => {
        void refreshBilling();
      };
      tick();
      billingTimer = window.setInterval(tick, BILLING_POLL_MS);
    }

    /**
     * Request one poll. `sessionId` joins the tracked set rather than replacing it.
     *
     * A registration made while another poll is in flight must NOT be dropped:
     * the in-flight request was built before this session was tracked, so its
     * reply cannot carry the new conversation's figures. The call therefore sets
     * `rerequest`, and the in-flight poll runs again once it finishes — one
     * extra round trip instead of a stale bar that waits for the next 4s tick.
     */
    async function refreshBilling(sessionId) {
      if (typeof sessionId === 'string' && sessionId !== '') trackedSessions.add(sessionId);
      if (billingInflight) {
        rerequest = true;
        return;
      }
      billingInflight = true;
      try {
        const requestedProvider = BILLING_PROVIDER;
        const params = [];
        if (BILLING_PROVIDER) params.push('provider=' + encodeURIComponent(BILLING_PROVIDER));
        if (BILLING_MODEL) params.push('model=' + encodeURIComponent(BILLING_MODEL));
        // The session list is what makes the per-conversation figures correct on
        // an unmounted-but-still-open conversation: every tracked session is
        // refreshed on every tick, not just the most recent one.
        // Only this window's own conversation id. Sending the union of every tracked session made two
        // windows ask the same question, so both showed combined figures instead of their own.
        const sessions = sessionId !== undefined && sessionId !== null && sessionId !== ''
          ? [sessionId]
          : [...trackedSessions];
        if (sessions.length > 0) params.push('sessions=' + encodeURIComponent(sessions.join(',')));
        const qs = params.length > 0 ? '?' + params.join('&') : '';
        // Walk the endpoint list so a fenced prefix (`/api/` on newer hosts) falls
        // through to the served one instead of showing the bar as unavailable.
        let res = null;
        for (const endpoint of BILLING_ENDPOINTS) {
          const attempt = await fetch(endpoint + qs, { headers: { accept: 'application/json' } });
          if (attempt.ok) { res = attempt; break; }
          if (res === null) res = attempt;
        }
        if (res === null || !res.ok) {
          BILLING_FAILURES += 1;
          BILLING_LAST_ERROR = 'HTTP ' + (res === null ? 'network' : res.status);
          return;
        }
        const next = await res.json();
        if (requestedProvider !== BILLING_PROVIDER) { rerequest = true; return; }
        if (next === null || typeof next !== 'object') {
          BILLING_FAILURES += 1;
          BILLING_LAST_ERROR = 'response was not a JSON object';
          return;
        }
        // Peak / off-peak split measured on the host, where the request timestamps are
        // available. The browser's projection view drops them, so this is the only way the
        // bar can show a measured split instead of an estimate.
        const periodSplit = next.periodSplit && typeof next.periodSplit === 'object' ? next.periodSplit : null;
        if (periodSplit !== null) {
          for (const [sid, split] of Object.entries(periodSplit)) {
            if (split === null || typeof split !== 'object') continue;
            PERIOD_SPLIT_BY_SESSION.set(sid, split);
          }
        }
        // Merge the per-session block. An entry only replaces its predecessor
        // when the Host actually answered for that session, so a partial reply
        // cannot blank out a figure it did not carry.
        const bySession = next.bySession && typeof next.bySession === 'object' ? next.bySession : null;
        if (bySession !== null) {
          for (const [sid, totals] of Object.entries(bySession)) {
            if (totals === null || typeof totals !== 'object') continue;
            CREDITS_BY_SESSION.set(sid, totals);
          }
        }
        BILLING = {
          reconciliation: next.reconciliation,
          creditMode: next.creditMode,
          provider: next.provider,
          bySession: Object.fromEntries(CREDITS_BY_SESSION),
          models: next.models && typeof next.models === 'object' ? next.models : {},
          balance: next.balance && typeof next.balance === 'object' ? next.balance : null,
          credits: next.credits && typeof next.credits === 'object' ? next.credits : { today: 0, session: 0 },
          signedIn: next.signedIn === true,
          failures: BILLING_FAILURES,
          periodSplit: periodSplit,
          // Weighted per-conversation attribution and the credits-per-yuan ratio. Rebuilding the
          // snapshot field by field silently dropped this, which is why the ratio never appeared.
          attribution: next.attribution && typeof next.attribution === 'object' ? next.attribution : null,
          // Per-model breakdown, keyed by session: a conversation can switch models mid-way.
          modelSplits: next.modelSplits && typeof next.modelSplits === 'object' ? next.modelSplits : null,
          todayCredits: typeof next.todayCredits === 'number' ? next.todayCredits : null,
        };
        // A successful pull clears the failure marks, so they only ever describe
        // the current outage rather than an old one.
        BILLING_FAILURES = 0;
        BILLING_LAST_ERROR = null;
        notifyBillingWatchers();
      } catch (_error) {
        // Keep the last good snapshot, but record that this attempt failed: the
        // bar then distinguishes "no data yet" from "the endpoint is failing",
        // which a silent catch cannot express.
        BILLING_FAILURES += 1;
        BILLING_LAST_ERROR = _error instanceof Error ? _error.message : String(_error);
      } finally {
        billingInflight = false;
        if (rerequest) {
          rerequest = false;
          void refreshBilling();
        }
      }
    }

    /** Point the Host at the selected model (kept for symmetry with the picker). */
    function noteSelectedModel(modelId, providerId) {
      if (typeof modelId !== 'string' || modelId === '') return;
      if (BILLING_MODEL === modelId && BILLING_PROVIDER === providerId) return;
      BILLING_PROVIDER = providerId;
      BILLING = { models: {}, balance: null, credits: {} };
      CREDITS_BY_SESSION.clear();
      notifyBillingWatchers();
      BILLING_MODEL = modelId;
      void refreshBilling();
    }

    /**
     * Register this conversation so the Host scopes the credit ledger to it.
     *
     * Registration is additive: several conversations can be open at once, and
     * unregistering/overwriting on mount is exactly what made one window's spend
     * appear in every other window's status bar.
     */
    function noteSession(sessionId) {
      // The slot may not supply an id; ask the host which conversation is current rather than silently
      // dropping the registration, which left "本会话" at 0.
      if (typeof sessionId !== 'string' || sessionId === '') {
        void adoptActiveSession();
        return;
      }
      trackedSessions.add(sessionId);
      void refreshBilling(sessionId);
    }

    /**
     * Register whichever conversation the host says is active.
     *
     * Last resort when the slot supplies no id: without it the ledger is never scoped to this
     * conversation, so its credit figure cannot be shown.
     *
     * @returns {Promise<void>}
     */
    async function adoptActiveSession() {
      if (adoptInflight) return;
      adoptInflight = true;
      try {
        for (const endpoint of BILLING_ENDPOINTS) {
          let res;
          try {
            res = await fetch(endpoint + '?probe=active', { headers: { accept: 'application/json' } });
          } catch (_error) {
            continue;
          }
          if (!res || !res.ok) continue;
          let payload;
          try {
            payload = await res.json();
          } catch (_error) {
            continue;
          }
          const active = typeof payload.activeSession === 'string' ? payload.activeSession : '';
          if (active !== '') {
            trackedSessions.add(active);
            void refreshBilling(active);
          }
          return;
        }
      } finally {
        adoptInflight = false;
      }
    }

    /** Stop refreshing a conversation the user is done with (best effort). */
    function forgetSession(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      trackedSessions.delete(sessionId);
    }

    /**
     * The provider/model pair currently in force, from the `modelSelection`
     * projection.
     *
     * That projection is `{ lastUsed, next }` — two nullable `{ provider, model,
     * reasoningEffort }` records, NOT a flat pair. Reading `.model` off its top
     * level therefore always yielded `undefined`, which silently disabled the
     * rate chip and the promotion badge; with the badge as the only enabled
     * field the whole bar then rendered as nothing.
     *
     * `next` wins when present: it is the pending choice the next message will
     * use, which is what the picker displays. `lastUsed` is the fallback (the
     * model of the last request). A flat `{ provider, model }` is still accepted
     * so a changed host shape cannot quietly disable billing again.
     *
     * @param {unknown} selection - the projection value.
     * @returns {{provider?: string, model?: string}} whatever is known.
     */
    function selectionOf(selection) {
      if (selection === null || typeof selection !== 'object') return {};
      const read = (value) => (value !== null && typeof value === 'object'
        ? {
            provider: typeof value.provider === 'string' && value.provider !== '' ? value.provider : undefined,
            model: typeof value.model === 'string' && value.model !== '' ? value.model : undefined,
          }
        : undefined);
      const next = read(selection.next);
      if (next !== undefined && next.model !== undefined) return next;
      const lastUsed = read(selection.lastUsed);
      if (lastUsed !== undefined && lastUsed.model !== undefined) return lastUsed;
      const flat = read(selection);
      return flat !== undefined && flat.model !== undefined ? flat : {};
    }

    /**
     * Billing facts for one model, or undefined.
     *
     * The bridge keys models by their own id (`deepseek-v4.1-flash`), while DSH
     * model ids may carry a vendor prefix (`workbuddy/deepseek-v4.1-flash`), so
     * try the full id first and then the part after the last slash.
     */
    function billingFor(snapshot, providerId, modelId) {
      if (!snapshot || !snapshot.models || typeof modelId !== 'string') return undefined;
      const direct = snapshot.models[modelId];
      if (direct !== undefined) return direct;
      const slash = modelId.lastIndexOf('/');
      if (slash >= 0 && slash < modelId.length - 1) {
        const bare = modelId.slice(slash + 1);
        if (snapshot.models[bare] !== undefined) return snapshot.models[bare];
      }
      return undefined;
    }

    /** "×0.11" / "免费" label, or null. */
    function rateLabel(facts) {
      if (!facts) return null;
      if (facts.free === true || facts.rate === 0) return '免费';
      if (typeof facts.rate === 'number' && Number.isFinite(facts.rate)) return '×' + facts.rate;
      return null;
    }

    /** The first promotional badge for a model, or null. */
    function badgeOf(facts) {
      if (!facts || !Array.isArray(facts.badges) || facts.badges.length === 0) return null;
      const first = facts.badges.find((b) => typeof b === 'string' && b !== '');
      return first === undefined ? null : first;
    }

    /**
     * The daily window of the badge currently shown, as printable text.
     *
     * `facts.windows` is keyed by badge label and carries the promotion's own
     * `HH:MM` ranges; `allDay` marks an offer in force the whole day, which reads
     * better than two complementary ranges.
     *
     * @param {object|undefined} facts - one model's billing facts.
     * @param {string|null} label - the badge already chosen for display.
     * @param {Function} translate - locale lookup.
     * @returns {string|null} e.g. `23:00–07:50` / `全天`, or null without a window.
     */
    /**
     * When a promotion applies, expressed the way its vendor expressed it.
     *
     * Two shapes exist: offers with a published hour list (glm-5.2 23:00–07:50) print those
     * hours, while offers stated as a rule (deepseek's peak-hours sentence) quote the
     * vendor's own sentence. A rule-based offer carries no hours, so it must not fall
     * through to "no window".
     *
     * @param {object} facts - one model's facts.
     * @param {string} label - the badge label.
     * @param {Function} translate - locale lookup.
     * @returns {string|null}
     */
    function promoWindowText(facts, label, translate) {
      if (!facts || !facts.windows || typeof label !== 'string') return null;
      const win = facts.windows[label];
      if (!win) return null;

      // The vendor's sentence is already the complete answer to "when does this apply".
      if (typeof win.rule === 'string' && win.rule !== '') return win.rule;

      if (!Array.isArray(win.daily) || win.daily.length === 0) return null;
      if (win.allDay === true) return translate('promo.allDay');
      return win.daily.map((w) => w.start + '–' + w.end).join(' · ');
    }

    // ---- prefs --------------------------------------------------------------

    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY) ?? window.localStorage.getItem(LEGACY_PREFS_KEY);
        if (raw === null) return { ...DEFAULT_PREFS };
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS };
        const out = { ...DEFAULT_PREFS };
        for (const key of Object.keys(DEFAULT_PREFS)) {
          if (typeof parsed[key] === 'boolean') out[key] = parsed[key];
        }
        return out;
      } catch (_error) {
        return { ...DEFAULT_PREFS };
      }
    }

    function writePrefs(prefs) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch (_error) {
        /* storage may be unavailable; ignore */
      }
    }

    // ---- components ---------------------------------------------------------

    /** Colours mirror the dsh-context palette for the same categories. */
    const CTX_COLORS = {
      system: '#aeb3bb',
      tools: '#9b8afb',
      messages: '#5b8def',
      track: 'color-mix(in srgb, var(--dsw-alias-label-tertiary) 18%, transparent)',
    };
    const TOKEN_COLORS = {
      input: '#939aa4',
      cacheRead: '#9b8afb',
      cacheWrite: '#5b8def',
      output: '#36a77a',
      // The fee row is a price, not a token slice, so it takes a distinct swatch
      // instead of reusing one of the four billing buckets.
      cost: '#d98e04',
    };

    /**
     * Official list prices, in yuan per million tokens, keyed by model id.
     *
     * These are the vendors' own published numbers (see the project's
     * `workbuddy-model-prices.json`), not a credit-multiplier derivation: DSH
     * already counts each token type separately, so the fee is the plain sum of
     * "tokens × that type's published rate".
     *
     * Each entry carries the four buckets the host records:
     *   - `input`      uncached prompt tokens
     *   - `cacheHit`   prompt tokens served from the prompt cache
     *   - `cacheWrite` tokens written into the cache
     *   - `output`     generated tokens
     *
     * DeepSeek is the only vendor here with peak/off-peak pricing; everyone else
     * publishes one flat rate, so `off` and `peak` hold the same numbers for
     * them. Rates change upstream — regenerate the file rather than editing rates
     * here by hand.
     */
    const OFFICIAL_PRICES = {
      // ---- DeepSeek (peak = 2× off-peak) ----
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
      // ---- Zhipu GLM (flat) ----
      'glm-5.3': { flat: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 } },
      'glm-5.3-flash': { flat: { input: 0.8, cacheHit: 0.23, cacheWrite: 0.23, output: 2.8 } },
      'glm-5.3-flashx': { flat: { input: 2, cacheHit: 0.57, cacheWrite: 0.57, output: 7 } },
      'glm-5.2': { flat: { input: 8, cacheHit: 2, cacheWrite: 2, output: 28 } },
      'glm-5.1': { flat: { input: 6, cacheHit: 1.3, cacheWrite: 1.3, output: 24 } },
      'glm-5.0-turbo': { flat: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 } },
      'glm-5v-turbo': { flat: { input: 5, cacheHit: 1.2, cacheWrite: 1.2, output: 22 } },
      'glm-4.6v': { flat: { input: 1, cacheHit: 0.2, cacheWrite: 0.2, output: 3 } },
      // ---- Moonshot Kimi (flat) ----
      'kimi-k3.1-pro': { flat: { input: 13, cacheHit: 1.3, cacheWrite: 13, output: 68 } },
      'kimi-k3.1-pro-highspeed': { flat: { input: 26, cacheHit: 1.3, cacheWrite: 26, output: 136 } },
      'kimi-k3-2': { flat: { input: 20, cacheHit: 2, cacheWrite: 20, output: 100 } },
      // ---- MiniMax (flat); M3 above 512k input is a different tier ----
      'minimax-m3-pay': { flat: { input: 4.2, cacheHit: 0.84, cacheWrite: 0.84, output: 16.8 } },
      'minimax-m3.1-flash': { flat: { input: 1, cacheHit: 0.1, cacheWrite: 0.1, output: 4 } },
      // ---- Stepfun (flat) ----
      'step-5-preview': { flat: { input: 7, cacheHit: 0.7, cacheWrite: 0.7, output: 20 } },
      // ---- Xiaomi MiMo (flat) ----
      'mimo-v2.6-pro': { flat: { input: 3, cacheHit: 0.025, cacheWrite: 0.025, output: 6 } },
    };

    /**
     * Rates for one model id, or null when the model is not priced.
     * @param {string} model
     * @returns {{input?: number, cacheHit?: number, cacheWrite?: number, output?: number}|null}
     */
    function ratesFor(model) {
      if (typeof model !== 'string') return null;
      if (/^trae(?:-enterprise|-global)?\//.test(model)) return null;
      const key = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
      const entry = OFFICIAL_PRICES[key];
      if (entry === undefined) return null;
      return entry.flat !== undefined ? entry.flat : null;
    }

    /**
     * Rates for one model id in one billing period.
     * @param {string} model
     * @param {'peak'|'off'} period
     */
    /**
     * Whether a model charges different rates in the two pricing periods.
     *
     * A flat-priced model (one rate all day) must not show a peak/off-peak breakdown: the
     * rows would suggest a saving that does not exist. Models whose two rates happen to be
     * equal are treated the same way.
     *
     * @param {string} model - model id.
     * @returns {boolean} True when peak and off-peak rates differ.
     */
    function modelHasPeriodPricing(model) {
      if (typeof model !== 'string') return false;
      if (/^trae(?:-enterprise|-global)?\//.test(model)) return false;
      const key = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
      const entry = OFFICIAL_PRICES[key];
      if (entry === undefined) return false;
      // A single-rate entry bills both periods identically.
      if (entry.flat !== undefined) return false;
      const peak = entry.peak;
      const off = entry.off;
      if (peak === undefined || off === undefined) return false;
      return peak.input !== off.input
        || peak.cacheHit !== off.cacheHit
        || peak.cacheWrite !== off.cacheWrite
        || peak.output !== off.output;
    }

    function ratesForPeriod(model, period) {
      if (typeof model !== 'string') return null;
      if (/^trae(?:-enterprise|-global)?\//.test(model)) return null;
      const key = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
      const entry = OFFICIAL_PRICES[key];
      if (entry === undefined) return null;
      if (entry.flat !== undefined) return entry.flat;
      return entry[period] || entry.off || null;
    }

    /**
     * Sum the peak bucket out of a `contextTimeline.cost` table.
     *
     * The table is keyed `provider -> model -> period -> {uncached, cacheRead,
     * cacheWrite, output}`. A session can switch models, so several providers may
     * appear and their buckets are added together.
     *
     * @param {object|null} costUsage
     * @returns {{uncached: number, cacheRead: number, cacheWrite: number, output: number}}
     */
    /**
     * Split billed tokens into the two pricing periods, using request timestamps.
     *
     * DeepSeek's peak window is Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time. Each
     * request record carries its own `time` and token counts, so the split is measured
     * rather than inferred from a bucket label: dsh-context files third-party providers
     * entirely under `peak` regardless of when the work happened.
     *
     * @param {object[]|null} requests - `contextTimeline.requests`.
     * @returns {{peak: object, off: object, total: object}|null} Buckets, or null when the
     *   list cannot support a split.
     */
    /**
     * Scale a measured peak/off-peak split up to the session's own totals.
     *
     * `contextTimeline.requests` retains only the newest 1500 records, so on a long session
     * the split covers part of the billed tokens. The uncovered remainder is unknown, and the
     * defensible assumption is that it carries the same period mix as the part we can see —
     * not that it was all off-peak.
     *
     * @param {{peak: object, off: object, total: object}} split - measured split.
     * @param {object} totals - `tokenUsage.totals` for the whole session.
     * @returns {object|null} Peak bucket scaled to the full session.
     */
    function scaleSplitToTotals(split, totals) {
      if (split === null || totals === null || totals === undefined) return null;
      const value = (n) => (Number.isFinite(n) ? Math.max(0, n) : 0);
      const peakSum = split.peak.uncached + split.peak.cacheRead + split.peak.cacheWrite + split.peak.output;
      const allSum = peakSum + split.off.uncached + split.off.cacheRead + split.off.cacheWrite + split.off.output;
      // No measurement, or full coverage: the bucket is already absolute.
      if (allSum <= 0) return null;
      if (peakSum === 0) return { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

      const totalSum = value(totals.uncachedInputTokens) + value(totals.cacheReadTokens)
        + value(totals.cacheWriteTokens) + value(totals.outputTokens);
      if (totalSum <= 0) return split.peak;

      // Scale each bucket by the same coverage ratio so the peak share stays proportional.
      const ratio = totalSum / allSum;
      return {
        uncached: Math.round(split.peak.uncached * ratio),
        cacheRead: Math.round(split.peak.cacheRead * ratio),
        cacheWrite: Math.round(split.peak.cacheWrite * ratio),
        output: Math.round(split.peak.output * ratio),
      };
    }

    function splitByRequestTime(requests) {
      if (!Array.isArray(requests) || requests.length === 0) return null;
      const zero = () => ({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
      const peak = zero();
      const off = zero();
      let usable = 0;

      for (const r of requests) {
        if (r === null || typeof r !== 'object') continue;
        const time = Number(r.time);
        if (!Number.isFinite(time)) continue;
        usable += 1;

        // A request's prompt is its uncached input plus its cache reads; `prompt` already
        // carries the sum, and `cacheRead` the cache slice of it.
        const prompt = Number.isFinite(r.prompt) ? r.prompt : 0;
        const cacheRead = Number.isFinite(r.cacheRead) ? r.cacheRead : 0;
        const output = Number.isFinite(r.output) ? r.output : 0;
        const uncached = Math.max(0, prompt - cacheRead);

        const target = isPeakInstant(time) ? peak : off;
        target.uncached += uncached;
        target.cacheRead += cacheRead;
        target.output += output;
      }

      if (usable === 0) return null;
      const total = {
        uncached: peak.uncached + off.uncached,
        cacheRead: peak.cacheRead + off.cacheRead,
        cacheWrite: peak.cacheWrite + off.cacheWrite,
        output: peak.output + off.output,
      };
      return { peak, off, total };
    }

    /**
     * Whether an instant falls inside DeepSeek's peak-priced window.
     *
     * Weekdays 09:00–12:00 and 14:00–18:00 Beijing time; weekends are never peak.
     *
     * @param {number} ms - epoch milliseconds.
     * @returns {boolean}
     */
    function isPeakInstant(ms) {
      const cst = new Date(ms + 8 * 3600 * 1000);
      const day = cst.getUTCDay();
      if (day === 0 || day === 6) return false;
      const minutes = cst.getUTCHours() * 60 + cst.getUTCMinutes();
      return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
    }

    function peakBucketOf(costUsage) {
      const out = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
      if (costUsage === null || costUsage === undefined || typeof costUsage !== 'object') return out;
      for (const models of Object.values(costUsage)) {
        if (models === null || typeof models !== 'object') continue;
        for (const periods of Object.values(models)) {
          if (periods === null || typeof periods !== 'object') continue;
          const peak = periods.peak;
          if (peak === null || peak === undefined || typeof peak !== 'object') continue;
          out.uncached += Number(peak.uncached) || 0;
          out.cacheRead += Number(peak.cacheRead) || 0;
          out.cacheWrite += Number(peak.cacheWrite) || 0;
          out.output += Number(peak.output) || 0;
        }
      }
      return out;
    }

    /**
     * Fee for a whole session, in yuan, billed by period.
     *
     * Two projections answer different halves of the question:
     *   - `totals` (`tokenUsage`) is the complete session — DSH describes it as
     *     "provider-reported usage accumulated across the complete durable log";
     *   - `peakUsage` (`contextTimeline.cost[...].peak`) is the part of that total
     *     which ran inside DeepSeek's peak window.
     *
     * Subtracting the peak bucket from the total gives the off-peak remainder, so
     * each part is billed at its own rate. Billing the whole total at a single rate
     * either overcharges (peak rate everywhere) or undercharges (off-peak
     * everywhere); splitting covers both correctly.
     *
     * @param {object|null} totals - `{uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens}`.
     * @param {object|null} peakUsage - `{uncached, cacheRead, cacheWrite, output}` for peak hours.
     * @param {string} model - model id in use.
     * @returns {number|null}
     */
    function sessionCost(totals, peakUsage, model) {
      if (totals === null || totals === undefined) return null;
      const offRate = ratesForPeriod(model, 'off');
      const peakRate = ratesForPeriod(model, 'peak');
      if (offRate === null && peakRate === null) return null;

      const value = (n) => (Number.isFinite(n) ? n : 0);

      const totalUncached = value(totals.uncachedInputTokens);
      const totalCacheRead = value(totals.cacheReadTokens);
      const totalCacheWrite = value(totals.cacheWriteTokens);
      const totalOutput = value(totals.outputTokens);

      // Clamp to the total so a stale projection can never yield a negative remainder.
      const peak = peakUsage && typeof peakUsage === 'object' ? peakUsage : {};
      const peakUncached = Math.min(totalUncached, value(peak.uncached));
      const peakCacheRead = Math.min(totalCacheRead, value(peak.cacheRead));
      const peakCacheWrite = Math.min(totalCacheWrite, value(peak.cacheWrite));
      const peakOutput = Math.min(totalOutput, value(peak.output));

      /** Per-million-token cost of one bucket set at one rate. */
      const feeFor = (rate, u, c, w, o) => (
        rate === null
          ? 0
          : (u * (rate.input || 0) + c * (rate.cacheHit || 0) + w * (rate.cacheWrite || 0) + o * (rate.output || 0)) / 1e6
      );

      const peakFee = feeFor(peakRate, peakUncached, peakCacheRead, peakCacheWrite, peakOutput);
      const offFee = feeFor(
        offRate,
        totalUncached - peakUncached,
        totalCacheRead - peakCacheRead,
        totalCacheWrite - peakCacheWrite,
        totalOutput - peakOutput,
      );
      return peakFee + offFee;
    }

    /**
     * Fee for one turn's four buckets, in yuan, or null when it cannot be priced.
     *
     * A turn records no peak/off split — that split is kept per provider/model over
     * the whole session — so the off-peak rate is used. The figure is therefore a
     * lower bound, which is the honest direction for a cost estimate.
     *
     * @param {object|null} turn - `{input, cacheRead, cacheWrite, output}`.
     * @param {string} model - model id in use.
     * @returns {number|null}
     */
    function turnCost(turn, model) {
      if (turn === null || turn === undefined) return null;
      const rate = ratesForPeriod(model, 'off');
      if (rate === null) return null;
      return (
        (Number(turn.input) || 0) * (rate.input || 0) +
        (Number(turn.cacheRead) || 0) * (rate.cacheHit || 0) +
        (Number(turn.cacheWrite) || 0) * (rate.cacheWrite || 0) +
        (Number(turn.output) || 0) * (rate.output || 0)
      ) / 1e6;
    }

    /**
     * Fee for one `contextTimeline.cost` table, in yuan.
     *
     * The host records four token counts per period, and each is billed at its own
     * published rate — cache hits are an order of magnitude cheaper than misses,
     * so lumping them together would be wrong by a large factor.
     *
     * @param {object} costUsage - `contextTimeline.cost`.
     * @returns {{cny: number, partial: boolean}|null} Null when nothing could be
     *   priced, so the caller can omit the line instead of showing a misleading 0.
     */
    function estimateCost(costUsage) {
      if (!costUsage || typeof costUsage !== 'object') return null;
      let total = 0;
      let priced = false;
      let missing = false;

      for (const [provider, models] of Object.entries(costUsage)) {
        if (!models || typeof models !== 'object') continue;
        for (const [model, periods] of Object.entries(models)) {
          if (!periods || typeof periods !== 'object') continue;
          let anyPeriod = false;
          for (const period of ['peak', 'off']) {
            const usage = periods[period];
            if (!usage) continue;
            const rate = ratesForPeriod(provider + '/' + model, period);
            if (rate === null) continue;
            const fee = (
              (Number(usage.uncached) || 0) * (rate.input || 0) +
              (Number(usage.cacheRead) || 0) * (rate.cacheHit || 0) +
              (Number(usage.cacheWrite) || 0) * (rate.cacheWrite || 0) +
              (Number(usage.output) || 0) * (rate.output || 0)
            ) / 1e6;
            total += fee;
            anyPeriod = true;
          }
          if (anyPeriod) priced = true;
          else missing = true;
        }
      }
      // `partial` marks a figure that excludes some models, so the card can say so
      // rather than presenting an understated total as complete.
      return priced ? { cny: total, partial: missing } : null;
    }

    /** A compact occupancy ring, styled after dsh-context's donut. */
    function ContextRing(props) {
      const { pct, size } = props;
      const r = 5.5;
      const c = 2 * Math.PI * r;
      const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
      const offset = c * (1 - p / 100);
      const stroke = p >= 85 ? '#d93838' : p >= 70 ? '#c98a00' : 'var(--dsw-alias-label-tertiary)';
      return h(
        'svg',
        { className: 'tsb-ring', width: size || 14, height: size || 14, viewBox: '0 0 14 14', 'aria-hidden': true },
        h('circle', { cx: 7, cy: 7, r, fill: 'none', stroke: CTX_COLORS.track, strokeWidth: 2 }),
        h('circle', {
          cx: 7, cy: 7, r, fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round',
          strokeDasharray: c, strokeDashoffset: offset, transform: 'rotate(-90 7 7)',
        }),
      );
    }

    /** One composition row: swatch + label on the left, "~N K" on the right. */
    function ctxLegendRow(key, color, label, tokens) {
      return h(
        'div',
        { className: 'tsb-ctxRow', key },
        h('span', { className: 'tsb-ctxSw', style: { background: color } }),
        h('span', { className: 'tsb-ctxK' }, label),
        h('span', { className: 'tsb-ctxV' }, '≈' + fmtKM(tokens)),
      );
    }

    function Segment(props) {
      const { children, hidden, tipKey, onHover, anchorRef, segKey } = props;
      if (hidden) return null;
      return h(
        'span',
        {
          className: 'tsb-seg',
          ref: anchorRef,
          'data-seg': segKey,
          'data-tip': tipKey ? '' : undefined,
          onMouseEnter: tipKey ? (event) => onHover(tipKey, event.currentTarget) : undefined,
          onMouseOver: tipKey ? (event) => onHover(tipKey, event.currentTarget) : undefined,
          onMouseLeave: tipKey ? () => onHover(null) : undefined,
          onMouseOut: tipKey ? (event) => {
            // Only clear when leaving the segment entirely (not moving between its children).
            if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
            onHover(null);
          } : undefined,
          onFocus: tipKey ? (event) => onHover(tipKey, event.currentTarget) : undefined,
          onBlur: tipKey ? () => onHover(null) : undefined,
          tabIndex: tipKey ? 0 : undefined,
        },
        children,
      );
    }

    function InfoChart(props) {
      const { chart } = props;
      if (!chart) return null;
      if (chart.type === 'trend') {
        const values = chart.items.map((item) => item.value).filter(Number.isFinite);
        const max = Math.max(1, ...values);
        return h(
          'div',
          { className: 'tsb-chart', role: 'img', 'aria-label': chart.title },
          chart.hideTitle ? null : h('div', { className: 'tsb-chartTitle' }, chart.title),
          h('div', { className: 'tsb-spark' }, chart.items.map((item, index) => h(
            'span',
            {
              key: index,
              className: 'tsb-sparkCol',
              title: item.label + ': ' + item.value + ' ' + (chart.unit || ''),
            },
            h('span', { className: 'tsb-sparkValue' }, String(item.value)),
            h('span', { className: 'tsb-sparkBar', style: { height: Math.max(3, item.value / max * 36) + 'px' } }),
          ))),
          h('div', { className: 'tsb-sparkAxis' }, h('span', null, chart.items[0] ? chart.items[0].label : ''), h('span', null, chart.items.length > 1 ? chart.items[chart.items.length - 1].label : '')),
        );
      }
      if (chart.type === 'bars') {
        const values = chart.items.map((item) => item.value).filter(Number.isFinite);
        const max = Math.max(1, ...values);
        return h(
          'div',
          { className: 'tsb-chart', role: 'img', 'aria-label': chart.title },
          chart.hideTitle ? null : h('div', { className: 'tsb-chartTitle' }, chart.title),
          chart.items.map((item, index) => h(
            'div',
            { className: 'tsb-chartRow', key: index },
            h('span', { className: 'tsb-chartLabel' }, item.label),
            h('span', { className: 'tsb-chartTrack' }, h('span', {
              className: 'tsb-chartFill',
              style: {
                width: Number.isFinite(item.value) ? Math.max(item.value > 0 ? 2 : 0, item.value / max * 100) + '%' : '0%',
                background: item.color || undefined,
              },
            })),
            h('span', { className: 'tsb-chartValue' }, item.valueLabel || (Number.isFinite(item.value) ? String(item.value) + (chart.unit || '') : '—')),
          )),
        );
      }
      if (chart.type === 'rate') {
        const value = Math.max(0, Number(chart.value) || 0);
        const baseline = 100;
        const current = Math.min(100, value * baseline);
        const excess = Math.max(0, value - 1);
        return h(
          'div',
          { className: 'tsb-chart', role: 'img', 'aria-label': chart.title },
          h('div', { className: 'tsb-chartTitle tsb-rateHeading' }, h('span', null, chart.title), h('strong', { className: 'tsb-rateValueLabel' + (excess > 0 ? ' is-over' : '') }, chart.valueLabel)),
          h('div', { className: 'tsb-rateTrack tsb-rateFixed' },
            h('span', { className: 'tsb-rateStandardZone', style: { width: baseline + '%' } }),
            h('span', { className: 'tsb-rateFill', style: { width: Math.min(value, 1) * baseline + '%' } }),

            h('span', { className: 'tsb-rateBaseline', style: { left: baseline + '%' } }),
            h('span', { className: 'tsb-rateCurrent' + (excess > 0 ? ' is-over' : ''), style: { left: current + '%' } }),
          ),
          h('div', { className: 'tsb-rateFixedAxis' },
            h('span', { className: 'tsb-rateZero' }, '×0'),
            h('span', { className: 'tsb-rateStandardLabel', style: { left: baseline + '%', transform: 'translateX(-100%)' } }, chart.standardLabel),
            excess > 0 ? h('span', { className: 'tsb-rateOverLabel' }, '+' + Number((excess * 100).toFixed(2)) + '%') : null,
          ),
          excess > 0 ? h('div', { className: 'tsb-rateOverflowTrack' }, h('span', { className: 'tsb-rateExcess', style: { left: '0%', width: Math.min(100, excess * 100) + '%' } })) : null,
        );
      }
      if (chart.type === 'status') {
        return h(
          'div',
          { className: 'tsb-chart', role: 'img', 'aria-label': chart.title },
          h('div', { className: 'tsb-chartTitle' }, chart.title),
          h('div', { className: 'tsb-statusChart' },
            h('span', { className: chart.active ? 'tsb-statusTrack' : 'tsb-statusTrack is-active' }, chart.inactiveLabel),
            h('span', { className: chart.active ? 'tsb-statusTrack is-active' : 'tsb-statusTrack' }, chart.activeLabel),
          ),
        );
      }
      return null;
    }

    /** Colour the 绿/黄/红 words in a "档位" value. Only the CJK colour words are
     * matched — never English "red"/"green", which would light up substrings
     * inside ordinary words like "credits". */
    function colorizeValue(text) {
      if (typeof text !== 'string') return text;
      const map = { '绿': 'tsb-tipG', '黄': 'tsb-tipA', '红': 'tsb-tipR' };
      const re = /[绿黄红]/g;
      const out = [];
      let last = 0;
      let m;
      let n = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const w = m[0];
        out.push(h('span', { className: map[w], key: 'c' + n++ }, w));
        last = m.index + w.length;
      }
      if (out.length === 0) return text;
      if (last < text.length) out.push(text.slice(last));
      return out;
    }

/**
 * Build the six timing rows for one session's timing slice.
 *
 * Each row gets its own share of the wall clock so the widths in the card add
 * up: wait and tool time are clamped to the wall, generation is split across
 * reasoning, reply and tool arguments in that order, and the remainder is
 * reported as 其他.
 *
 * @param {object|null} timelineTiming - `contextTimeline.timing`, or null.
 * @param {Function} T - locale lookup.
 * @returns {object[]} Rows with `label`, `percent` and `detail` filled in.
 */
    /**
     * Rebuild timing totals from `sessionStats` when `contextTimeline` is absent.
     *
     * `sessionStats` reports the same primitives under different names, so the mapping is
     * mechanical:
     *   ttftMs       → ttftMs      (first-token wait)
     *   decodeMs     → genMs       (generation window)
     *   toolMs       → toolsMs     (tool execution)
     *   llmMs + toolMs → wallMs    (model + tools; overhead is not separately measured)
     *   steps        → calls       (answered steps)
     *
     * @param {object|null} stats - the `sessionStats` projection.
     * @returns {object|null} A `contextTimeline.timing`-shaped object, or null.
     */
    function timingFromSessionStats(stats) {
      if (stats === null || typeof stats !== 'object') return null;
      const num = (key) => (Number.isFinite(stats[key]) && stats[key] >= 0 ? stats[key] : null);
      const ttftMs = num('ttftMs');
      const decodeMs = num('decodeMs');
      const toolMs = num('toolMs');
      const llmMs = num('llmMs');
      // Without the model window there is no denominator, so nothing can be trusted.
      if (llmMs === null) return null;
      const toolsMs = toolMs === null ? 0 : toolMs;
      return {
        wallMs: llmMs + toolsMs,
        ttftMs: ttftMs === null ? 0 : ttftMs,
        genMs: decodeMs === null ? Math.max(0, llmMs - (ttftMs === null ? 0 : ttftMs)) : decodeMs,
        toolsMs,
        calls: num('steps') === null ? 0 : stats.steps,
        toolCalls: 0,
        // The stream's block framing (reasoning / text / arguments) is not in
        // sessionStats, so the generation window is attributed to 回复 wholesale rather
        // than leaving it unallocated — otherwise the slices would not add up to wallMs.
        reasoningMs: 0,
        textMs: decodeMs === null ? Math.max(0, llmMs - (ttftMs === null ? 0 : ttftMs)) : decodeMs,
        toolArgMs: 0,
      };
    }

    function buildTimingItems(timelineTiming, T) {
    const timingValue = (key) => timelineTiming && Number.isFinite(timelineTiming[key]) && timelineTiming[key] >= 0 ? timelineTiming[key] : null;
    const timingWall = timingValue('wallMs');
    const timingWait = timingValue('ttftMs');
    const timingGen = timingValue('genMs');
    const timingTools = timingValue('toolsMs');
    const waitSlice = timingWall === null || timingWait === null ? null : Math.min(timingWall, timingWait);
    const genSlice = timingWall === null || waitSlice === null || timingGen === null ? null : Math.min(timingGen, Math.max(0, timingWall - waitSlice));
    const toolsSlice = timingWall === null || waitSlice === null || genSlice === null || timingTools === null ? null : Math.min(timingTools, Math.max(0, timingWall - waitSlice - genSlice));
    const otherSlice = toolsSlice === null ? null : Math.max(0, timingWall - waitSlice - genSlice - toolsSlice);
    let remainingGen = genSlice;
    const generationSlice = (key) => {
      const ms = timingValue(key);
      if (ms === null || remainingGen === null) return null;
      const slice = Math.min(ms, remainingGen);
      remainingGen -= slice;
      return slice;
    };
    const compactTime = (ms) => {
      if (ms === null) return '—';
      const seconds = Math.floor(ms / 1000);
      if (seconds >= 3600) return Math.floor(seconds / 3600) + 'h' + Math.floor(seconds % 3600 / 60) + 'm';
      if (seconds >= 60) return Math.floor(seconds / 60) + 'm' + seconds % 60 + 's';
      return (ms / 1000).toFixed(1) + 's';
    };
    return [
      { key: 'wait', color: '#487dff', ms: timingWait, slice: waitSlice, count: timingValue('calls') },
      { key: 'reasoning', color: '#8957ff', ms: timingValue('reasoningMs'), slice: generationSlice('reasoningMs'), count: timingValue('reasoningBlocks') },
      { key: 'reply', color: '#e44c98', ms: timingValue('textMs'), slice: generationSlice('textMs'), count: timingValue('textBlocks') },
      { key: 'arguments', color: '#eea009', ms: timingValue('toolArgMs'), slice: generationSlice('toolArgMs'), count: timingValue('toolArgBlocks') },
      { key: 'tools', color: '#47b5a5', ms: timingTools, slice: toolsSlice, count: timingValue('toolCalls') },
      { key: 'other', color: '#96a2b8', ms: otherSlice, slice: otherSlice, count: null },
    ].map((item) => ({
      ...item,
      label: T('timing.' + item.key),
      percent: timingWall > 0 && item.slice !== null ? (item.slice / timingWall * 100).toFixed(1) + '%' : '—',
      detail: compactTime(item.ms) + (item.count === null ? '' : ' · ' + item.count + ' ' + T('unit.requests')),
    }));
    }

    /**
     * Every derived figure the status bar renders, computed from the DSH
     * projections and the billing snapshot.
     *
     * This is a plain function rather than a hook: it reads no component state,
     * so the component can memoise the result on the inputs below. Keeping it
     * out of the render body is what stops the component from turning into one
     * 500-line scope where a single mis-ordered `const` blanks the whole bar.
     *
     * @param {object} input
     * @param {object} input.billing - billing facade (`get`, `getCredits`).
     * @param {string} input.sessionId - conversation id for per-session credits.
     * @param {object|null} input.modelSelection - `modelSelection` projection.
     * @param {object|null} input.projectedUsage - `tokenUsage` projection.
     * @param {object|null} input.sessionStats - `sessionStats` projection.
     * @param {object|null} input.contextTimeline - `contextTimeline` projection.
     * @param {object|null} input.statFacts - summary from `deriveNodeSummary`.
     * @param {object|null} input.latestFacts - latest-turn summary.
     * @param {string} input.locale - active locale id.
     * @param {Function} input.t - locale lookup for the active namespace.
     * @param {object} input.prefs - user display preferences (`creditScope`).
     * @returns {object} All derived values, ready for the card builders.
     */
    function deriveStatusFacts(input) {
      const { billing, sessionId, modelSelection, sessionStats, contextTimeline, locale, t, prefs } = input;
      const stats = input.statFacts;
      const latest = input.latestFacts;
      const usage = input.projectedUsage;
      const pressure = input.pressure;
      const breakdown = input.breakdown;
    // ---- billing-derived segments (promotion badge, credits) -------------
    // The Host endpoint may not have answered yet (first render after a
    // restart), so the snapshot can be undefined or null; fall back to an
    // empty one instead of dereferencing it.
    const rawSnap = billing.get();
    const billingSnap = rawSnap && typeof rawSnap === 'object' ? rawSnap : {};
    const selection = selectionOf(modelSelection);
    const selProvider = selection.provider;
    const selModel = selection.model;
    const facts = billingFor(billingSnap, selProvider, selModel);
    const promoBadge = badgeOf(facts);
    const promoRate = rateLabel(facts);
    const promoStatus = [promoBadge, promoRate].filter(Boolean).join(' · ') || null;
    const promoRateValue = facts && Number.isFinite(facts.rate)
      ? Math.max(0, facts.rate)
      : facts && facts.free === true ? 0 : null;
    // Credit figures for THIS conversation. The account snapshot carries an
    // account-wide `credits` object, but several conversations stay mounted at
    // once, so the per-session cache is what keeps each bar showing its own
    // spend rather than whichever session polled last.
    //
    // The accessor is probed rather than assumed: a build whose host/plugin
    // halves disagree would otherwise throw here and take the whole status bar
    // down instead of falling back to the account-level figures.
    const creditScopeFacts = typeof billing.getCredits === 'function'
      ? billing.getCredits(sessionId)
      : billingSnap.credits;
    const sessionToday = creditScopeFacts && Number.isFinite(creditScopeFacts.sessionToday) ? creditScopeFacts.sessionToday : null;
    const creditToday = creditScopeFacts && Number.isFinite(creditScopeFacts.today) ? creditScopeFacts.today : null;
    // Same derivation as the card's credit total: the ledger cannot attribute spend to one conversation,
    // so the figure comes from this session's own priced fee times the account-level ratio. Reading the
    // ledger here made the bar and the card disagree by construction.
    const creditSession = (() => {
      if (billingSnap.creditMode === "exact-v2") {
        const facts=billingSnap.bySession?.[sessionId];
        return facts && Number.isFinite(facts.session) ? (Number.isFinite(facts.displayTotal) ? facts.displayTotal : facts.session + (Number(facts.coverage?.estimated)||0)) : null;
      }
      const ratio = billingSnap.attribution && typeof billingSnap.attribution.ratio === 'number'
        ? billingSnap.attribution.ratio
        : null;
      const ledger = creditScopeFacts && Number.isFinite(creditScopeFacts.session) ? creditScopeFacts.session : null;
      if (ratio === null) return ledger;
      const rows = modelSplitsFor(billingSnap, sessionId);
      if (!Array.isArray(rows) || rows.length === 0) return ledger;
      const cny = rows.reduce((sum, row) => sum + (Number(row.cny) || 0), 0);
      return cny > 0 ? cny * ratio : ledger;
    })();
    const creditPendingToday = Object.values(billingSnap.bySession?.[sessionId]?.coverage?.todayModels || {}).some(row => row.unresolved);
    const hasCredits = creditPendingToday || (creditToday !== null && creditToday > 0) || (creditSession !== null && creditSession > 0);
    // Account credit balance from the bridge (a single account, not per-provider).
    const bal = billingSnap.balance && typeof billingSnap.balance === 'object' ? billingSnap.balance : null;
    const balTotal = bal !== null && Number.isFinite(bal.total) ? bal.total : null;
    const balText = balTotal === null ? null : (bal.unlimited === true ? '不限量' : fmtCredit(balTotal) + ' credits');
    const hasBalance = balText !== null;
    const modelTitle = selModel !== undefined ? String(selModel) : '';

    /**
     * The number the ◈ chip shows, per the user's chosen scope.
     *
     * Kept as a function of `T` rather than a value computed here: the
     * translator is bound further down this component, and reading it before
     * that point is a temporal-dead-zone error, not just an ordering smell.
     *
     * Falling back matters: "session" is 0 at the start of a conversation
     * even though the account has spent credits today, and "balance" does not
     * exist when the bridge is unreachable. Each scope therefore degrades to
     * whichever number is actually known, so the chip never shows a bare
     * placeholder while a real figure is available.
     */
    const creditChipFor = (T2) => {
      const unit = T2('credit.unit');
      return { head: creditSummaryText(sessionToday === null ? '—' : fmtCredit(sessionToday), billingSnap.bySession?.[sessionId]?.coverage?.todayModels), unit, scope: 'sessionToday', title: T2('chart.sessionTodayCredits') };
    };
    // ---- session totals: prefer the durable tokenUsage projection --------
    let sessionTotal = null;
    let sessionCacheHit = null;
    // The Host split arrives with the first poll; until then the only figure available is the raw
    // projection, which counts a fork’s inherited history and reads several times too large.
    // The chip still renders (its turns/steps are useful immediately) but the headline is held back,
    // because a number that is about to change threefold is worse than a blank one.
    const splitReady = typeof billing.getPeriodSplit === 'function' && billing.getPeriodSplit(sessionId) !== undefined;
    if (usage !== undefined && usage !== null) {
      const billed = Number.isFinite(usage.uncachedInputTokens)
        ? usage.uncachedInputTokens + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
        : null;
      const output = Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0;
      if (billed !== null) {
        sessionTotal = splitReady ? billed + output : null;
        sessionCacheHit = splitReady ? fmtCacheHitPct(usage.cacheReadTokens || 0, billed) : null;
      }
    }

    // ---- context occupancy + composition (mirrors dsh-context) ----------
    // Occupancy is the same `contextPressure` reading the composer ring uses;
    // composition is `contextBreakdown` (system / tools / conversation). The
    // catalog uses the 7-category palette, but this projection only splits
    // three buckets, so the big two categories map straight onto its colours
    // (system → indigo, tools → amber, everything else → conversation green).
    let contextPct = null;
    let contextUsed = null;
    let contextWindow = null;
    if (pressure !== undefined && pressure !== null) {
      const used = pressure.projectedTokens !== undefined ? pressure.projectedTokens : pressure.pressureTokens;
      if (Number.isFinite(used) && Number.isFinite(pressure.contextWindow) && pressure.contextWindow > 0) {
        contextUsed = used;
        contextWindow = pressure.contextWindow;
        contextPct = Math.min(100, (used / pressure.contextWindow) * 100);
      }
    }
    const ctxSystem = breakdown && Number.isFinite(breakdown.systemTokens) ? breakdown.systemTokens : 0;
    const ctxTools = breakdown && Number.isFinite(breakdown.toolsTokens) ? breakdown.toolsTokens : 0;
    const ctxMessages = breakdown && Number.isFinite(breakdown.messageTokens) ? breakdown.messageTokens : 0;
    const ctxTotal = ctxSystem + ctxTools + ctxMessages;
    const ctxHasBreakdown = ctxTotal > 0;

    // ---- speed ----------------------------------------------------------
    const decodeMs = sessionStats && Number.isFinite(sessionStats.decodeMs) ? sessionStats.decodeMs : stats.decodeMs;
    const decodeTokens = sessionStats && Number.isFinite(sessionStats.decodeTokens) ? sessionStats.decodeTokens : stats.decodeTokens;
    const speed = fmtSpeed(decodeTokens, decodeMs);

    // Nothing to say yet — keep the dock empty. Evaluated later, once every
    // field it reads is initialised: `promoStatus`, `creditChip`, `hasCredits`
    // and `hasBalance` are all declared below, so testing them here would hit
    // the temporal dead zone and throw, blanking the whole bar.

    const T = (k) => t(k);
    const creditChip = creditChipFor(T);
    const timelineTiming = contextTimeline && contextTimeline.timing && typeof contextTimeline.timing === 'object'
      ? contextTimeline.timing
      // dsh-context is optional: when it is absent, the same primitives come from the
      // host's own `sessionStats` projection and the timing strip still fills in.
      : timingFromSessionStats(stats);
    const activeMs = timelineTiming && Number.isFinite(timelineTiming.wallMs)
      ? timelineTiming.wallMs
      : stats.llmMs;
    const activeTime = fmtDuration(activeMs, locale);
    const averageTtftMs = timelineTiming && timelineTiming.calls > 0
      ? timelineTiming.ttftMs / timelineTiming.calls
      : stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : null;
    const averageTtft = fmtSeconds(averageTtftMs);
    const overviewSpeed = timelineTiming && Number.isFinite(timelineTiming.speedTokens) && Number.isFinite(timelineTiming.speedMs)
      ? fmtSpeed(timelineTiming.speedTokens, timelineTiming.speedMs)
      : speed;
    // The fee needs both projections: the session total from `tokenUsage`, and the
    // peak-hour share from `contextTimeline.cost`. The cost table holds only the peak
    // bucket — it is not a smaller copy of the whole session — so using it alone
    // understated the fee by roughly an order of magnitude.
    // The peak/off-peak split lives in `contextTimeline.cost`, which only exists when the
    // optional dsh-context plugin is installed. Without it, bill the whole session at the
    // rate for the current period: an approximation, but the figure stays present.
    // The split is measured from the request list's own timestamps. The `cost` bucket is
    // only a fallback: dsh-context files third-party providers entirely under `peak` no
    // matter when the work ran, so trusting that label billed off-peak sessions at peak
    // rates and doubled the fee.
    // The split is measured on the host: the projection view delivered to the browser has an
    // empty `requests` array, so a timestamp-based split cannot run here. Falls back when the
    // host had nothing to measure.
    const hostSplit = billing && typeof billing.getPeriodSplit === 'function'
      ? billing.getPeriodSplit(sessionId)
      : undefined;
    const timeSplit = hostSplit && hostSplit.peak && hostSplit.off
      ? { peak: hostSplit.peak, off: hostSplit.off, total: hostSplit.total, complete: hostSplit.complete === true }
      : null;
    // The host derives this from the append-only session log, which covers every message, so the
    // buckets are already absolute and must NOT be rescaled — rescaling would move tokens that
    // were measured at a known timestamp into a period chosen by arithmetic.
    const peakUsage = timeSplit !== null
      ? timeSplit.peak
      : peakBucketOf(contextTimeline && contextTimeline.cost);
    // Whether the selected model has two distinct rates, which decides if the card should
    // show the peak/off-peak rows at all.
    const selectedPriceModel = selProvider ? selProvider + '/' + selModel : selModel;
    const periodPricing = modelHasPeriodPricing(selectedPriceModel);
    // Price each recorded provider/model separately. The current selection cannot
    // establish which model produced historical tokens while the host is loading.
    const officialCost = referenceCostOfRows(hostSplit?.models);
    // The same projection also answers "which models, and peak vs off-peak".
    // Kept beside `officialCost` so both read one source.
    // With request timestamps the split is measured. Without them, the `cost` bucket is not a
    // substitute: dsh-context files every non-`deepseek` provider under `peak` no matter when
    // the work happened, so trusting it claimed 100% peak for every session. The fallback
    // therefore attributes the billed tokens to whichever period is in force now, and the card
    // labels the rows as estimated.
    const sessionPeakNow = isPeakInstant(Date.now());
    const costSplit = timeSplit !== null
      ? (() => {
          // Both buckets are measured on the host from the append-only log, which covers every
          // message. Print them as given: recomputing `off = totals - peak` would only make sense
          // if the split were a partial sample.
          const totalOf = (b) => b.uncached + b.cacheRead + b.cacheWrite + b.output;
          const peak = {
            uncached: timeSplit.peak.uncached,
            cacheRead: timeSplit.peak.cacheRead,
            cacheWrite: timeSplit.peak.cacheWrite,
            output: timeSplit.peak.output,
          };
          const off = {
            uncached: timeSplit.off.uncached,
            cacheRead: timeSplit.off.cacheRead,
            cacheWrite: timeSplit.off.cacheWrite,
            output: timeSplit.off.output,
          };
          return {
            byPeriod: {
              peak: { ...peak, total: totalOf(peak) },
              off: { ...off, total: totalOf(off) },
            },
            total: totalOf(peak) + totalOf(off),
            byModel: [],
            complete: timeSplit.complete === true,
          };
        })()
      : (() => {
          // No timestamps: place the whole session in the current period.
          const zero = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
          const billed = zero;
          if (usage !== null && usage !== undefined) {
            billed.uncached = Number(usage.uncachedInputTokens) || 0;
            billed.cacheRead = Number(usage.cacheReadTokens) || 0;
            billed.cacheWrite = Number(usage.cacheWriteTokens) || 0;
            billed.output = Number(usage.outputTokens) || 0;
          }
          const total = billed.uncached + billed.cacheRead + billed.cacheWrite + billed.output;
          return {
            byPeriod: {
              peak: sessionPeakNow ? { ...billed, total } : { ...zero, total: 0 },
              off: sessionPeakNow ? { ...zero, total: 0 } : { ...billed, total },
            },
            total,
            byModel: [],
            estimated: true,
          };
        })();
    // The timing strip is self-contained: it reads only the projection's
    // timing slice, so it lives as a module-level builder.
    const timingItems = buildTimingItems(timelineTiming, T);
    const headline = contextPct !== null
      ? { label: T('summary.context'), pct: String(Math.round(contextPct)), used: fmtUsedWindow(contextUsed, contextWindow) }
      : null;
    const stack = contextPct === null
      ? null
      : ctxHasBreakdown
        ? [
            { key: 'system', pct: ctxSystem / contextWindow * Math.min(1, contextWindow / ctxTotal) * 100, color: CTX_COLORS.system },
            { key: 'tools', pct: ctxTools / contextWindow * Math.min(1, contextWindow / ctxTotal) * 100, color: CTX_COLORS.tools },
            { key: 'messages', pct: ctxMessages / contextWindow * Math.min(1, contextWindow / ctxTotal) * 100, color: CTX_COLORS.messages },
          ]
        : [{ key: 'used', pct: contextPct, color: CTX_COLORS.messages }];
    const legend = ctxHasBreakdown
      ? [
          ctxLegendRow('system', CTX_COLORS.system, T('tip.ctxSystem'), ctxSystem),
          ctxLegendRow('tools', CTX_COLORS.tools, T('tip.ctxTools'), ctxTools),
          ctxLegendRow('messages', CTX_COLORS.messages, T('tip.ctxMessages'), ctxMessages),
        ]
      : null;
    // The eight slices must add up to the headline. The headline is the
    // session's billed total (`sessionTotal` = uncached input + cache reads +
    // cache writes + output), so the seven context categories are apportioned
    // onto the prompt side of that total using their shares in
    // `contextTimeline.current`, and `output` takes the remainder. Whatever the
    // weights, the eight slices sum back to `sessionTotal`.
    const CHART_KEYS = ['system', 'tools', 'user', 'inject', 'skill', 'assistant', 'tool'];
    const tlCurrent = contextTimeline && contextTimeline.current && typeof contextTimeline.current === 'object'
      ? contextTimeline.current
      : null;
    const outputTokens = usage && Number.isFinite(usage.outputTokens)
      ? usage.outputTokens
      : latest !== null && Number.isFinite(latest.output) ? latest.output : 0;
    /** Weights for the seven categories; `current` supplies them when present. */
    const weights = {};
    let weightSum = 0;
    for (const key of CHART_KEYS) {
      const raw = tlCurrent !== null && Number.isFinite(tlCurrent[key]) && tlCurrent[key] > 0 ? tlCurrent[key] : 0;
      weights[key] = raw;
      weightSum += raw;
    }
    // Fall back to `contextBreakdown` when `current` carries no usable weights,
    // so an early session still splits into three meaningful groups.
    if (weightSum <= 0 && breakdown && typeof breakdown === 'object') {
      weights.system = Number.isFinite(breakdown.systemTokens) ? breakdown.systemTokens : 0;
      weights.tools = Number.isFinite(breakdown.toolsTokens) ? breakdown.toolsTokens : 0;
      const msg = Number.isFinite(breakdown.messageTokens) ? breakdown.messageTokens : 0;
      weights.user = msg;
      weightSum = weights.system + weights.tools + msg;
    }
    const promptTotal = sessionTotal !== null ? Math.max(0, sessionTotal - outputTokens) : null;
    const chartFacts = {};
    if (promptTotal !== null && weightSum > 0) {
      let assigned = 0;
      let largestKey = CHART_KEYS[0];
      for (const key of CHART_KEYS) {
        const share = Math.round(promptTotal * (weights[key] / weightSum));
        chartFacts[key] = share;
        assigned += share;
        if (weights[key] > weights[largestKey]) largestKey = key;
      }
      // Rounding remainder goes to the largest category: the eight slices then
      // equal promptTotal + output = sessionTotal exactly.
      chartFacts[largestKey] = Math.max(0, chartFacts[largestKey] + promptTotal - assigned);
    }
    const CHART_CATEGORIES = [
      ['system', 'tip.ctxSystem', TOKEN_COLORS.input],
      ['tools', 'tip.ctxTools', TOKEN_COLORS.cacheRead],
      ['user', 'tip.ctxUser', TOKEN_COLORS.cacheRead],
      ['inject', 'tip.ctxInject', TOKEN_COLORS.cacheWrite],
      ['skill', 'tip.ctxSkill', TOKEN_COLORS.output],
      ['assistant', 'tip.ctxAssistant', TOKEN_COLORS.cacheWrite],
      ['tool', 'tip.ctxTool', TOKEN_COLORS.cacheRead],
    ];
    const tokenChartItems = [];
    for (const [key, labelKey, color] of CHART_CATEGORIES) {
      const value = chartFacts[key];
      if (!Number.isFinite(value) || value <= 0) continue;
      tokenChartItems.push({ label: T(labelKey), value, valueLabel: fmtTokens(value, locale), color });
    }
    // The output slice takes the remaining part of the billed total, so the
    // eight slices add up to `sessionTotal` exactly.
    if (outputTokens > 0) {
      tokenChartItems.push({ label: T('tip.output'), value: outputTokens, valueLabel: fmtTokens(outputTokens, locale), color: TOKEN_COLORS.output });
    }
    if (tokenChartItems.length === 0) {
      const tokenUsage = usage && Number.isFinite(usage.uncachedInputTokens) ? usage : latest;
      if (tokenUsage) {
        const input = tokenUsage === usage ? usage.uncachedInputTokens : latest.input;
        const cacheRead = tokenUsage === usage ? usage.cacheReadTokens : latest.cacheRead;
        const cacheWrite = tokenUsage === usage ? usage.cacheWriteTokens : latest.cacheWrite;
        const output = tokenUsage === usage ? usage.outputTokens : latest.output;
        if (Number.isFinite(input)) tokenChartItems.push({ label: T('tip.input'), value: input, valueLabel: fmtTokens(input, locale), color: TOKEN_COLORS.input });
        if (Number.isFinite(cacheRead)) tokenChartItems.push({ label: T('tip.cacheRead'), value: cacheRead, valueLabel: fmtTokens(cacheRead, locale), color: TOKEN_COLORS.cacheRead });
        if (Number.isFinite(cacheWrite) && cacheWrite > 0) tokenChartItems.push({ label: T('tip.cacheWrite'), value: cacheWrite, valueLabel: fmtTokens(cacheWrite, locale), color: TOKEN_COLORS.cacheWrite });
        if (Number.isFinite(output)) tokenChartItems.push({ label: T('tip.output'), value: output, valueLabel: fmtTokens(output, locale), color: TOKEN_COLORS.output });
      }
    }
      return {
        facts, promoBadge, promoRate, promoStatus, promoRateValue,
        creditChipFor, creditToday, sessionToday, creditSession, hasCredits,
        bal, balTotal, balText, hasBalance, modelTitle, selModel, selProvider,
        sessionTotal, sessionCacheHit,
        contextPct, contextUsed, contextWindow,
        ctxSystem, ctxTools, ctxMessages, ctxTotal, ctxHasBreakdown,
        decodeMs, decodeTokens, speed,
        T, creditChip, timelineTiming,
        activeMs, activeTime, averageTtftMs, averageTtft, overviewSpeed,
        officialCost, costSplit, timingItems, hasPeriodPricing: periodPricing,
        headline, stack, legend,
        tlCurrent, outputTokens, promptTotal, chartFacts, tokenChartItems,
      };
    }

    /**
     * A two-column grid of label/value pairs.
     *
     * Every card that lays detail out this way renders through here, so the markup exists once: a row is
     * a label on the left and its figure on the right, two per line. Callers pass plain rows; they do not
     * carry markup of their own.
     *
     * @param {object} props
     * @param {Array<[string, string]>} props.rows - label/value pairs.
     * @returns {object|null} The grid, or null when there is nothing to show.
     */
    /**
     * The one card body.
     *
     * Every popover renders through here: a card is a list of groups, a group is a heading plus body
     * blocks, and a block is one of timing / metrics / chart / rows / models / text. Cards cannot drift
     * apart visually because there is only one place that decides how a card looks.
     *
     * @param {object} props
     * @param {Array<object>} props.groups - see {@link groupBlocks}.
     * @param {Function} props.t - translator.
     * @returns {object|null}
     */
    function CreditModelList({ rows, t }) {
      return h('div', { className: 'tsb-modelList' }, rows.map((row) => h('div', { className: 'tsb-modelRow', key: row.key },
              h('span', { className: 'tsb-timingSwatch', style: { background: row.color } }),
              h('span', { className: 'tsb-modelName' }, row.label),
              h('span', { className: 'tsb-modelCredits' }, row.credits),
              row.periodText || row.tokens ? h('span', { className: 'tsb-modelTokens' }, row.periodText || row.tokens) : null,
              row.unitPrice === null || row.unitPrice === undefined
                ? (row.unitPriceNote ? h('span', { className: 'tsb-modelRate' }, row.unitPriceNote) : null)
                : h('span', { className: 'tsb-modelRate' }, row.unitPrice + ' ' + (row.unitPriceUnit || t('unit.cnyPerYiToken'))),
            )));
    }

    function CardBody(props) {
      const groups = Array.isArray(props.groups) ? props.groups.filter((g) => g !== null && typeof g === 'object') : [];
      if (groups.length === 0) return null;
      const t = props.t;
      return groups.map((group, index) => h(
        'div',
        { className: 'tsb-group', key: group.key || index },
        // The three-part headline sits above everything else in its group.
        group.headline
          ? h('div', { className: 'tsb-ctxHead' },
              h('span', { className: 'tsb-ctxHeadLabel' }, group.headline.label),
              h('span', { className: 'tsb-ctxHeadPct' }, group.headline.pct + '%'),
              h('span', { className: 'tsb-ctxHeadUsed' }, group.headline.used),
            )
          : null,
        group.head
          ? h('div', { className: 'tsb-tipHead' + (group.headTotal ? ' tsb-headRow' : '') },
              h('span', null, group.head),
              group.cached ? h('span', { className: 'tsb-cached' }, t('tip.cached')) : null,
              group.headTotal ? h('span', { className: 'tsb-headTotal' }, group.headTotal) : null,
            )
          : null,
        // The proportion bar: one segment per slice, sized by its percentage of the window.
        Array.isArray(group.stack) && group.stack.length > 0
          ? h('div', { className: 'tsb-ctxBar' }, group.stack.map((seg) => h('span', {
              key: seg.key,
              className: 'tsb-ctxSeg',
              style: { width: (Number(seg.pct) || 0) + '%', background: seg.color },
            })))
          : null,
        // The legend entries are already rendered rows, so they are placed as-is.
        Array.isArray(group.legend) && group.legend.length > 0
          ? h('div', { className: 'tsb-ctxLegend' }, group.legend)
          : null,
        Array.isArray(group.timing) && group.timing.length > 0
          ? h('div', { className: 'tsb-timingGrid' }, group.timing.map((item) => h('div', { className: 'tsb-timingItem', key: item.key },
              h('span', { className: 'tsb-timingSwatch', style: { background: item.color } }),
              h('span', { className: 'tsb-timingLabel' }, item.label),
              h('span', { className: 'tsb-timingPercent' }, item.percent),
              h('span', { className: 'tsb-timingDetail' }, item.detail),
            )))
          : null,
        group.chart ? h(InfoChart, { chart: group.chart }) : null,
        // No divider here: the chart class already ends with its own border-bottom, so adding one
        // produced two rules a few pixels apart. That border is the separator.
        Array.isArray(group.modelRows) && group.modelRows.length > 0
          ? h(CreditModelList, { rows: group.modelRows, t })
          : null,
        // Only when no chart preceded it: a chart plus rows must not produce two rules.
        !group.chart && Array.isArray(group.rows) && group.rows.length > 0
          ? h('div', { className: 'tsb-overviewDivider' })
          : null,
        h(MetricGrid, { rows: group.rows }),
        // The model line under the context figures, when the card has one.
        Array.isArray(group.modelLine) && group.modelLine.length > 0
          ? h('div', { className: 'tsb-overviewModel' }, group.modelLine.map((part, index) => h('span', { className: 'tsb-overviewModelPart', key: 'ml-' + index }, part)))
          : null,
        group.foot ? h('div', { className: 'tsb-tipFoot' }, group.foot) : null,
      ));
    }

    /**
     * The two-column figure grid.
     *
     * A single row takes the whole width: keeping it in a half-width column made its label wrap and its
     * value truncate, which is what a one-row card looked like.
     *
     * @param {object} props
     * @param {Array<[string, *]>} props.rows
     * @returns {object|null}
     */
    function MetricGrid(props) {
      const rows = Array.isArray(props.rows) ? props.rows.filter((row) => Array.isArray(row) && row[1] !== null && row[1] !== undefined) : [];
      if (rows.length === 0) return null;
      const solo = rows.length === 1;
      // A long value cannot share a half-width column; it would wrap into a narrow strip.
      const isLong = (value) => String(value === null || value === undefined ? '' : value).length > 12;
      return h('div', { className: solo ? 'tsb-metricGrid is-solo' : 'tsb-metricGrid' }, rows.map(([label, value], index) => h(
        'div',
        {
          className: (solo ? 'tsb-metric is-solo' : 'tsb-metric') + (isLong(value) ? ' tsb-metricWide' : ''),
          key: index,
        },
        h('span', { className: 'tsb-metricLabel' }, label),
        h('span', { className: 'tsb-metricValue' }, colorizeValue(value)),
      )));
    }

    function HoverCard(props) {
      const { tip, t, anchorRef } = props;
      const cardRef = React.useRef(null);
      const [pos, setPos] = React.useState(null);
      React.useLayoutEffect(() => {
        const anchor = anchorRef.current;
        const card = cardRef.current;
        if (!anchor) return;
        const a = anchor.getBoundingClientRect();
        const w = card ? card.getBoundingClientRect().width : tip.overview ? 340 : 380;
        const hgt = card ? card.getBoundingClientRect().height : 120;
        let left = a.left + a.width / 2 - w / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        // Sit directly ABOVE the field, right edge aligned to the strip so a
        // right-side field's card never spills over a lateral panel.
        const strip = a.right + 8;
        const rightEdge = Math.min(window.innerWidth - 8, strip);
        left = Math.max(8, rightEdge - w);
        if (a.top - 8 - hgt < 8) {
          setPos({ left: left + 'px', top: a.bottom + 8 + 'px', transform: 'none' });
        } else {
          setPos({ left: left + 'px', bottom: window.innerHeight - a.top + 8 + 'px', top: 'auto' });
        }
      }, [anchorRef, tip]);
      // One renderer for every card: a tip is a list of groups, so the card never has to know which
      // shape it received. The branches that used to live here diverged purely by accident of growth.
      if (Array.isArray(tip.groups) && tip.groups.length > 0) {
        return h(
          'div',
          { className: 'tsb-tip tsb-overview tsb-timingCard', ref: cardRef, role: 'tooltip', style: pos || { left: '8px', bottom: '64px' } },
          h(CardBody, { groups: tip.groups, t }),
        );
      }
      return h(
        'div',
        { className: 'tsb-tip', ref: cardRef, role: 'tooltip', style: pos || { left: '8px', bottom: '64px' } },
        // Context-style card: a single headline row (label + big % + used/window),
        // no separate title line, exactly like the reference panel.
        tip.headline
          ? h(
              'div',
              { className: 'tsb-ctxHead' },
              h('span', { className: 'tsb-ctxHeadLabel' }, tip.headline.label),
              h('span', { className: 'tsb-ctxHeadPct' }, tip.headline.pct + '%'),
              h('span', { className: 'tsb-ctxHeadUsed' }, tip.headline.used),
            )
          : h('div', { className: 'tsb-tipHead' }, tip.head),
        h(InfoChart, { chart: tip.chart }),        // Optional stacked composition bar + its legend.
        tip.stack ? h('div', { className: 'tsb-ctxBar' }, tip.stack.map((seg) => h('span', { key: seg.key, className: 'tsb-ctxSeg', style: { width: seg.pct + '%', background: seg.color } }))) : null,
        tip.legend ? h('div', { className: 'tsb-ctxLegend' }, tip.legend) : null,
        (tip.rows || []).map(([k, v], i) => h('div', { className: 'tsb-tipRow', key: i }, h('span', { className: 'tsb-tipK' }, k), h('span', { className: 'tsb-tipV' }, colorizeValue(v)))),
        tip.foot ? h('div', { className: 'tsb-tipFoot' }, tip.foot) : null,
      );
    }

    /**
     * The separator between status-bar segments.
     *
     * @param {object} props
     * @param {boolean} [props.wide] - marks a boundary between groups, drawn as a wider gap.
     */
    function Divider(props) {
      const wide = props !== undefined && props !== null && props.wide === true;
      return h('span', { className: wide ? 'tsb-div tsb-divWide' : 'tsb-div', 'aria-hidden': true }, '|');
    }

    function PrefsPanel(props) {
      const { prefs, onToggle, t, anchorRef, onClose } = props;
      const panelRef = React.useRef(null);
      const [pos, setPos] = React.useState(null);

      React.useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = 232;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        const top = rect.top - 8; // panel grows upward via transform
        setPos({ left: left + 'px', bottom: window.innerHeight - top + 'px', width: width + 'px' });
      }, [anchorRef]);

      React.useEffect(() => {
        const onDocPointer = (event) => {
          const panel = panelRef.current;
          const anchor = anchorRef.current;
          if (panel && panel.contains(event.target)) return;
          if (anchor && anchor.contains(event.target)) return;
          onClose();
        };
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('pointerdown', onDocPointer, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('pointerdown', onDocPointer, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [anchorRef, onClose]);

      const rows = [
        ['speed', 'prefs.speed'],
        ['turn', 'prefs.turn'],
        // Credits had no switch of their own while they rode in the 本轮用量 chip.
        ['credits', 'prefs.credits'],
        ['session', 'prefs.session'],
        ['context', 'prefs.context'],
        ['promo', 'prefs.promo'],
      ];

      return h(
        'div',
        { className: 'tsb-panel', ref: panelRef, role: 'dialog', 'aria-label': t('prefs.title'), style: pos || { left: '8px', bottom: '64px', width: '232px' } },
        h('div', { className: 'tsb-panelTitle' }, t('prefs.title')),
        rows.map(([key, labelKey]) =>
          h(
            'label',
            { className: 'tsb-row', key },
            h('input', { type: 'checkbox', checked: prefs[key] === true, onChange: () => onToggle(key) }),
            h('span', null, t(labelKey)),
          ),
        ),
        h('div', { className: 'tsb-hint' }, t('prefs.hint')),
      );
    }

    function StatusBar(props) {
      const { useProjection, useChat, t, useStatusLocale, billing, sessionId } = props;
      // Whether the figures on screen came from the disk cache. Shown as a marker: a number that may be
      // seconds old must not look identical to a freshly computed one.
      const fromCache = billing.get() && billing.get().fromCache === true;
      const locale = useStatusLocale((value) => value);
      const nodes = useChat((state) => {
        if (state && state.legacy && Array.isArray(state.legacy.nodes)) return state.legacy.nodes;
        return EMPTY_NODES;
      });
      const projectedUsage = useProjection('tokenUsage');
      const pressure = useProjection('contextPressure');
      const breakdown = useProjection('contextBreakdown');
      const sessionStats = useProjection('sessionStats');
      const contextTimeline = useProjection('contextTimeline');
      // The host split measures this session's OWN billed tokens (it excludes the inherited
      // history a fork replays). When present it is authoritative, because the raw projection
      // counts the ancestor's messages too — which is how the card could show 14.7亿 of tokens
      // next to a fee computed for 2.04亿.
      const ownSplit = billing && typeof billing.getPeriodSplit === 'function'
        ? billing.getPeriodSplit(sessionId)
        : undefined;
      const ownUsage = ownSplit && ownSplit.total
        ? {
            uncachedInputTokens: Math.max(0, Number(ownSplit.total.uncached) || 0),
            cacheReadTokens: Math.max(0, Number(ownSplit.total.cacheRead) || 0),
            cacheWriteTokens: Math.max(0, Number(ownSplit.total.cacheWrite) || 0),
            outputTokens: Math.max(0, Number(ownSplit.total.output) || 0),
          }
        : null;
      const usage = ownUsage !== null
        ? ownUsage
        : selectSessionUsage(projectedUsage, fullSessionUsage(contextTimeline && contextTimeline.cost));
      const modelSelection = useProjection('modelSelection');

      // Re-render whenever the shared billing snapshot refreshes.
      const [billingTick, setBillingTick] = React.useState(0);
      React.useEffect(() => billing.subscribe(() => setBillingTick((n) => n + 1)), [billing]);

      // Tell the Host which model is selected (for the picker's rate lookup) and
      // which conversation this is (to scope "this session" credits).
      const selModelId = selectionOf(modelSelection).model;
      React.useEffect(() => {
        billing.noteSelectedModel(selModelId, selectionOf(modelSelection).provider);
      }, [selModelId, selectionOf(modelSelection).provider, billing]);
      React.useEffect(() => {
        billing.noteSession(sessionId);
      }, [sessionId, billing]);

      // One traversal yields both the session totals and the latest turn.
      const nodeSummary = React.useMemo(() => deriveNodeSummary(nodes), [nodes]);
      const stats = nodeSummary.stats;
      const latest = nodeSummary.latest;

      const [prefs, setPrefs] = React.useState(readPrefs);
      const [open, setOpen] = React.useState(false);
      const gearRef = React.useRef(null);

      const toggle = React.useCallback((key) => {
        setPrefs((prev) => {
          const next = { ...prev, [key]: !prev[key] };
          writePrefs(next);
          return next;
        });
      }, []);
      const closePanel = React.useCallback(() => setOpen(false), []);

      // Keep the active segment as the popover anchor so each card follows its source.
      // A short leave
      // grace avoids flicker when the pointer crosses the tiny gaps between a
      // field's own child spans.
      const [hover, setHover] = React.useState(null);
      const hoveredAnchorRef = React.useRef(null);
      const leaveTimer = React.useRef(0);
      const onHover = React.useCallback((key, target) => {
        if (leaveTimer.current) {
          window.clearTimeout(leaveTimer.current);
          leaveTimer.current = 0;
        }
        if (key === null) {
          leaveTimer.current = window.setTimeout(() => {
            leaveTimer.current = 0;
            setHover(null);
          }, 120);
          return;
        }
        hoveredAnchorRef.current = target;
        setHover(key);
      }, []);
      React.useEffect(() => () => {
        if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      }, []);



      // All derived figures come from one place; see deriveStatusFacts.
      const derived = deriveStatusFacts({
        billing, sessionId, modelSelection, sessionStats, contextTimeline, locale, t, prefs,
        projectedUsage: usage, pressure, breakdown,
        statFacts: stats, latestFacts: latest,
      });
      const {
        facts, promoBadge, promoRate, promoStatus, promoRateValue,
        creditChipFor, creditToday, sessionToday, creditSession, hasCredits,
        bal, balTotal, balText, hasBalance, modelTitle, selModel, selProvider,
        sessionTotal, sessionCacheHit,
        contextPct, contextUsed, contextWindow,
        ctxSystem, ctxTools, ctxMessages, ctxTotal, ctxHasBreakdown,
        decodeMs, decodeTokens, speed,
        T, creditChip, timelineTiming,
        activeMs, activeTime, averageTtftMs, averageTtft, overviewSpeed,
        officialCost, costSplit, timingItems, hasPeriodPricing,
        headline, stack, legend,
        tlCurrent, outputTokens, promptTotal, chartFacts, tokenChartItems,
      } = derived;
      const sessionRows = [];
      if (sessionCacheHit !== null) sessionRows.push([T('tip.cacheHit'), sessionCacheHit + '%']);
      if (officialCost !== null) sessionRows.push([T(officialCost.partial ? 'summary.estimatePartial' : 'summary.estimate'), fmtCny(officialCost.cny)]);
      // Peak / off-peak split of the same billed total — only when the model really charges
      // two rates. A flat-priced model would show a distinction with no monetary effect.
      // When the split could not be measured it is an estimate, and the label says so.
      if (costSplit !== null && derived.hasPeriodPricing) {
        const periodSuffix = costSplit.estimated === true ? ' (' + T('promo.estimated') + ')' : '';
        // Both rows always appear: a period with no traffic is 0, not a missing line. A reader learns
        // more from "高峰 0" than from the row silently vanishing.
        sessionRows.push([T('split.peak') + periodSuffix, fmtTokens(costSplit.byPeriod.peak.total, locale)]);
        sessionRows.push([T('split.off') + periodSuffix, fmtTokens(costSplit.byPeriod.off.total, locale)]);
      }
      // The session's own credit spend, beside the fee estimate: the same conversation, two units.
      // The weighted share is preferred over the raw ledger figure: the ledger credits one conversation
      // with balance drops that may belong to another, while the share is apportioned by priced cost.
      // 积分消耗 is drawn in the chart grid above, not as a detail row.
      // Tool figures sit last: the rows above all describe what the session cost,
      // while these describe what it actually did.
      if (stats.toolCalls > 0) {
        sessionRows.push([T('tip.calls'), String(stats.toolCalls)]);
        sessionRows.push([T('tip.errors'), String(stats.toolErrors)]);
      }

      // One combined card for 本轮用量 / 本会话 / 积分消耗. Each part keeps exactly the head, chart
      // and rows it had as a standalone card; they are gathered under `sections` so hovering any of
      // the three chips shows the same panel.
      let combinedTip = null;

      /**
       * Build one grid row.
       *
       * Both sections go through this, so their markup and styling cannot drift apart. A caller decides
       * only what goes in each slot; the slots themselves are fixed by the shared renderer.
       *
       * @param {string} key - stable row identity.
       * @param {string} label - the row's name.
       * @param {string} percent - the emphasised figure on the right.
       * @param {string} [detail] - the secondary line under the name.
       * @param {string} [swatch] - colour of the leading square.
       * @returns {object}
       */
      const timingRow = (key, label, percent, detail, swatch) => ({
        key,
        label,
        color: swatch || TOKEN_COLORS.input,
        percent,
        detail: detail || '',
      });

      const creditModelRow = (cost, credits, index, palette) => {
                  const periods = [];
                  if (modelHasPeriodPricing(cost.model) && cost.peakTokens > 0) periods.push(T('split.peak') + ' ' + fmtTokens(cost.peakTokens, locale));
                  if (modelHasPeriodPricing(cost.model) && cost.offTokens > 0) periods.push(T('split.off') + ' ' + fmtTokens(cost.offTokens, locale));
                  return {
                    key: 'model-' + cost.model, label: modelLabel(cost.model), color: palette[index % palette.length],
                    credits: credits, tokens: fmtTokens(cost.tokens, locale),
                    unitPrice: cost.tokens > 0 && Number.isFinite(cost.cny) ? (cost.cny / (cost.tokens / 1e8)).toFixed(2) : null,
                    unitPriceNote: Number.isFinite(cost.cny) ? null : T('credit.priceUnavailable'),
                    unitPriceUnit: T('unit.cnyPerYiToken'),
                    periodText: periods.length > 0 ? periods.join(' / ') : null,
                  };
      };

      const tips = {
        speed: { head: T('summary.speed'), speed: overviewSpeed === null ? '—' : overviewSpeed + ' tok/s', timing: timingItems, overview: true },
        turn: {
          head: T('prefs.turn'),
          overview: true,
          // Same eight categories as the session card, restricted to the latest
          // turn's own model calls. `requests[].turn` identifies the turn, so both
          // the headline and the ring measure that same spread.
          // The latest turn has no category spread of its own in the projection,
          // so this card keeps its four billed buckets — a real per-turn figure.
          // The headline is `latest.total`, which is input + cacheRead +
          // cacheWrite + output. The ring therefore has to chart all four
          // buckets, otherwise its slices add up to less than the figure above
          // them. (Each turn resends the growing history, so cache reads are the
          // bulk of a turn's volume — dropping them hid most of the total.)
          speed: fmtTokens(latest !== null ? latest.total : 0, locale) + ' tokens',
          timing: (() => {
            if (latest === null) return [];
            const buckets = [
              ['input', latest.input, 'tip.input', TOKEN_COLORS.input],
              ['cacheRead', latest.cacheRead, 'tip.cacheRead', TOKEN_COLORS.cacheRead],
              ['cacheWrite', latest.cacheWrite, 'tip.cacheWrite', TOKEN_COLORS.cacheWrite],
              ['output', latest.output, 'tip.output', TOKEN_COLORS.output],
            ].filter(([, value]) => Number.isFinite(value) && value > 0);
            const total = buckets.reduce((sum, [, value]) => sum + value, 0);
            const items = buckets.map(([key, value, labelKey, color]) => timingRow(
              key,
              T(labelKey),
              total > 0 ? (value / total * 100).toFixed(2) + '%' : '—',
              fmtTokens(value, locale),
              color,
            ));
            // The fee is the fourth item the card reports. It is a price, not a
            // token count, so it carries no share of the ring — its `percent` slot
            // shows the amount instead, and the bar itself stays a token spread.
            const turnModels = billing.get()?.bySession?.[sessionId]?.coverage?.turns?.[latest.turn]?.models;
            const fee = referenceCostOfRows(turnModels ? Object.values(turnModels) : null);
            if (fee !== null) {
              items.push(timingRow(
                'cost',
                T(fee.partial ? 'summary.estimatePartial' : 'tip.turnCost'),
                fmtCny(fee.cny),
                '',
                TOKEN_COLORS.cost,
              ));
            }
            return items;
          })(),
          rows: [
            [T('tip.cacheHit'), latest !== null && latest.cacheHit !== null ? latest.cacheHit + '%' : null],
            [T('tip.requests'), latest !== null && latest.requests > 0 ? String(latest.requests) : null],
            [T('tip.ttft'), latest !== null && fmtSeconds(latest.lastTtft) !== null ? fmtSeconds(latest.lastTtft) : null],
          ].filter((row) => row[1] !== null && row[1] !== undefined),
        },
        session: {
          head: T('summary.session'),
          overview: true,
          // The headline is the billed session total; the eight slices are
          // apportioned onto exactly this figure.
          speed: fmtTokens(sessionTotal !== null ? sessionTotal : latest ? latest.total : 0, locale) + ' tokens',
          // Marks figures served from the disk cache.
          cached: billing.get() && billing.get().fromCache === true,
          ratioText: priceRatioText(billing.get(), T),
          ratioTitle: T('tip.ratioHint'),
          // The credit group's own heading and the conversation total beside it. The models below are the
          // breakdown of this figure, not siblings of it.
          timing: (() => {
            const items = tokenChartItems.map((item, index) => {
              const total = tokenChartItems.reduce((sum, part) => sum + part.value, 0);
              return { key: String(index), label: item.label, color: item.color, percent: total > 0 ? (item.value / total * 100).toFixed(2) + '%' : '—', detail: fmtTokens(item.value, locale) };
            });
            // 积分消耗 rides in the same grid as the token slices. Its figure is credits, not tokens, so
            // its share slot carries the amount and its detail line carries the unit price.
            // C: pro-rate the credits to this session's own cost, so all three figures — tokens,
            // credits and unit price — describe the same span. The ledger total is all-time; the
            // attribution covers today only; neither alone matches an own-only token headline.
            // Derived, not read from the ledger: the balance sampler cannot tell which conversation
            // spent a credit, so per-session ledger figures were measured both too high and too low.
            // Own fee × the account-level ratio keeps this figure consistent with the fee beside it.
            // The session's real cost is the SUM of per-model costs, each priced at its own rate. Pricing
            // the whole session at the selected model would mischarge every reply produced by another one.
            return items;
          })(),
          rows: sessionRows,
          // Per-model credit split for this conversation, as its own group beneath the token breakdown.
          // It belongs to the session, not to one turn: the conversation may switch models between
          // replies, and their prices differ by an order of magnitude.
        },
        context: {
          overview: true,
          headline,
          stack,
          legend,
          metrics: [
            { label: T('summary.averageSpeed'), value: overviewSpeed === null ? null : overviewSpeed + ' tok/s' },
            { label: T('summary.activeTime'), value: activeTime },
            { label: T('summary.avgTtft'), value: averageTtft },
          ].filter((metric) => metric.value !== null),
          modelLine: [modelTitle, prefs.promo ? promoRate : null, prefs.promo ? promoBadge : null].filter(Boolean).join(' · ') || null,
        },
        promo: {
          head: ({ trae: 'Trae', 'trae-enterprise': 'Trae Enterprise', 'trae-global': 'Trae Global', workbuddy: 'WorkBuddy' }[selProvider] || '') + ' ' + T('chart.rate'),
          // The promotion's own name, shown beside the heading instead of repeating it as a row.
          speed: promoBadge || null,
          chart: promoRateValue === null
            ? { type: 'status', title: T('chart.promo'), active: true, activeLabel: T('chart.active'), inactiveLabel: T('chart.inactive') }
            : {
                type: 'rate',
                title: T('chart.rate'),
                value: promoRateValue,
                valueLabel: promoRateValue === 0 ? '免费 · ×0' : promoRate,
                standardLabel: T('chart.standard'),
              },
          rows: [
            [T('tip.model'), modelTitle || null],
            [T('promo.window'), promoWindowText(facts, promoBadge, T)],
            ...(Array.isArray(facts?.promoDetails) ? facts.promoDetails.map(detail => Array.isArray(detail) ? detail : [T('chart.promo'), detail]) : []),
          ].filter((row) => row[1] !== null),
        },
        credits: {
          // Top-level title names the scope (本会话消耗 / 今日消耗 / 剩余积分); the group heading below names
          // what the breakdown is. Repeating one string twice would waste the first line.
          head: creditChip ? creditChip.title : T('chart.sessionCredits'),
          cached: billing.get() && billing.get().fromCache === true,
          // The conversation total sits beside the group heading, the models below are its breakdown.
          modelHead: T('chart.sessionCredits'),
          modelHeadTotal: (() => {

          if (billing.get()?.creditMode === "exact-v2") return creditSession === null ? null : fmtCredit(creditSession);
          const rows = modelSplitsFor(billing.get(), sessionId);
          if (rows.length === 0) return null;
          const cny = rows.reduce((sum, row) => sum + (Number(row.cny) || 0), 0);
          const attribution = billing.get() && billing.get().attribution;
          const ratio = attribution && typeof attribution.ratio === 'number' ? attribution.ratio : null;
          return ratio === null || cny <= 0 ? null : fmtCredit(cny * ratio);
          })(),
          rows: [
            [T('chart.todayCredits'), sessionToday === null ? null : fmtCredit(sessionToday), T('credit.unit'), 'today'],
            [T('tip.balance'), balTotal === null ? null : fmtCredit(balTotal), T('credit.unit'), 'balance'],
          ].filter((row) => row[1] !== null),
            modelRows: (() => {

              const splits = modelSplitsFor(billing.get(), sessionId);
              if (splits.length === 0) return [];
              const totalCny = splits.reduce((sum, row) => sum + (Number(row.cny) || 0), 0);
              const palette = [TOKEN_COLORS.cacheWrite, TOKEN_COLORS.output, TOKEN_COLORS.input, TOKEN_COLORS.cost];
              const attribution = billing.get() && billing.get().attribution;
              const ratio = attribution && typeof attribution.ratio === 'number' ? attribution.ratio : null;
              const totalCredits = ratio === null ? null : totalCny * ratio;
              if (billing.get()?.creditMode === 'exact-v2') {
                const models = billing.get()?.bySession?.[sessionId]?.coverage?.models || {};
                return Object.entries(models).map(([model, actual], index) => creditModelRow(
                  { ...actual, model }, creditSummaryText(fmtCredit(actual.displayCredits), [actual]), index, palette));
              }
              const rows = splits.map((row, index) => ({
                key: 'model-' + index,
                label: modelLabel(row.model),
                color: palette[index % palette.length],
                credits: !Number.isFinite(row.cny) || totalCredits === null || totalCny <= 0
                  ? '—'
                  : fmtCredit(totalCredits * (row.cny / totalCny)),
                tokens: fmtTokens(row.tokens, locale),
                // Its own rate, so the rows can be compared at a glance.
                unitPrice: row.tokens > 0 && Number.isFinite(row.cny) ? (row.cny / (row.tokens / 1e8)).toFixed(2) : null,
                unitPriceNote: Number.isFinite(row.cny) ? null : T('credit.priceUnavailable'),
                // One line naming the period(s) and their sizes. A model that ran in only one period still
                // says which one, so the rate beside it is never unattributed.
                periodText: (() => {
                  if (!modelHasPeriodPricing(row.model)) return null;
                  const peakTokens = Number(row.peakTokens) || 0;
                  const offTokens = Number(row.offTokens) || 0;
                  const parts = [];
                  if (peakTokens > 0) parts.push(T('split.peak') + ' ' + fmtTokens(peakTokens, locale));
                  if (offTokens > 0) parts.push(T('split.off') + ' ' + fmtTokens(offTokens, locale));
                  if (parts.length === 0) return null;
                  return parts.join(' / ');
                })(),
              }));

              return rows;
            })(),
        },
      };

      // Reuse the same model list for session totals and the session's Beijing-day totals.
      const sessionCreditSection = {
        head: T('chart.creditStatistics'),
        speed: creditSummaryText(tips.credits.modelHeadTotal, billing.get()?.bySession?.[sessionId]?.coverage?.models),
        foot: billing.get()?.bySession?.[sessionId]?.coverage?.unresolved ? T('credit.pendingDetail') : undefined,
        modelRows: tips.credits.modelRows,
        rows: [[T('tip.balance'), balTotal === null ? '—' : fmtCredit(balTotal), T('credit.unit'), 'balance']],
      };
      const todayModels = billing.get()?.bySession?.[sessionId]?.coverage?.todayModels || {};
      const todayPalette = [TOKEN_COLORS.cacheWrite, TOKEN_COLORS.output, TOKEN_COLORS.input, TOKEN_COLORS.cost];
      tips.credits = {
        head: T('chart.sessionTodayCredits'),
        modelHead: T('chart.sessionTodayCredits'),
        speed: creditSummaryText(sessionToday === null ? '—' : fmtCredit(sessionToday), todayModels),
        modelHeadTotal: creditSummaryText(sessionToday === null ? '—' : fmtCredit(sessionToday), todayModels),
        cached: billing.get()?.fromCache === true,
        modelRows: Object.entries(todayModels).map(([model, row], index) => creditModelRow({...row, model}, creditSummaryText(fmtCredit(row.credits), [row]), index, todayPalette)),
        rows: [],
        foot: Object.values(todayModels).some(row => row.unresolved) ? T('credit.pendingDetail') : undefined,
      };

      const turnCredits = latest ? billing.get()?.bySession?.[sessionId]?.coverage?.turns?.[latest.turn] : null;
      const turnCreditSection = {
        head: T('chart.turnCredits'),
        foot: Object.values(turnCredits?.models || {}).some(row => row.unresolved) ? T('credit.pendingDetail') : undefined,
        speed: creditSummaryText(turnCredits ? fmtCredit(turnCredits.total) : '—', turnCredits?.models),
        modelRows: Object.entries(turnCredits?.models || {}).map(([model, row], index) => creditModelRow({...row, model}, creditSummaryText(fmtCredit(row.credits), [row]), index, todayPalette)),
        rows: [],
      };

      // Assemble the combined card. Sections follow the order the chips appear in the bar.
      const sectionOf = (tip) => ({
        head: tip.head,
        // The token breakdown lives in `timing` on the session card and the headline in `speed`;
        // copying only chart/rows dropped the entire 8-category statistics from the merged card.
        speed: tip.speed,
        timing: tip.timing,
        chart: tip.chart,
        rows: tip.rows,
        foot: tip.foot,
      });
      // Two sections: the turn's token breakdown, then a credit panel titled with the model actually in
      // use so the figures are unambiguous when several models are configured.
      const turnSection = sectionOf(tips.turn);
      tips.session.sections = [sectionOf(tips.session), sessionCreditSection];
      // Titled for what the figures are, not for whichever model happens to be selected: a conversation
      // can switch models mid-way, so its spend is not one model's.
      const creditHeading = T('chart.sessionCredits');

      combinedTip = {
        head: T('summary.combined'),
        sections: [
          { ...turnSection },
          turnCreditSection
        ],
      };
      // Reachable through the same lookup the other cards use.
      tips.combined = combinedTip;

      /**
       * Turn every tip into the one shape the renderer understands.
       *
       * A tip already holds everything a group needs — a heading, a timing grid, metrics, a chart, model
       * rows. This maps those fields onto a groups array so the card body has a single input format
       * regardless of which card it is drawing.
       *
       * @param {object} tip
       * @returns {Array<object>}
       */
      const groupsOf = (tip) => {
        if (tip === null || typeof tip !== 'object') return [];
        // Only a tip that declares its own groups passes through. The generated ones are tagged, so
        // they are never mistaken for hand-written input.
        if (tip.groupsDeclared === true && Array.isArray(tip.groups) && tip.groups.length > 0) return tip.groups;
        const group = {
          // A card without a heading still needs one, or it renders as a floating panel.
          head: tip.head || '',
          // The context card's heading is its own shape (label + large percentage + used), rendered by
          // the body rather than flattened into a title string.
          headline: tip.headline || null,
          headTotal: tip.speed || null,
          cached: tip.cached === true,
          timing: Array.isArray(tip.timing) ? tip.timing : null,
          chart: tip.chart || null,
          // The proportion bar and its legend belong to this group, above the figures.
          stack: Array.isArray(tip.stack) ? tip.stack : null,
          legend: Array.isArray(tip.legend) ? tip.legend : null,
          rows: Array.isArray(tip.rows) ? tip.rows
            : (Array.isArray(tip.metrics) ? tip.metrics.map((metric) => [metric.label, metric.value]) : null),
          modelLine: tip.modelLine || null,
          foot: tip.foot || null,
        };
        // A session card carries a second group: the credit total with its per-model breakdown. Without
        // this, the models and their credits disappear entirely.
        const hasModels = Array.isArray(tip.modelRows) && tip.modelRows.length > 0;
        if (!hasModels) return [group];
        // ONE group: the breakdown heading carries the total, the model rows are its detail, and the
        // scope rows (今日消耗 / 剩余积分) sit underneath in the same panel. A second group made the scope
        // figures look like a separate topic.
        return [
          {
            key: 'credits',
            head: tip.modelHead || '',
            headTotal: tip.modelHeadTotal || null,
            cached: tip.cached === true,
            headline: null,
            timing: null,
            chart: null,
            stack: null,
            legend: null,
            modelRows: tip.modelRows,
            rows: Array.isArray(tip.rows) && tip.rows.length > 0 ? tip.rows : null,
            modelLine: null,
            foot: null,
          },
        ];
      };

      for (const key of Object.keys(tips)) {
        const tip = tips[key];
        if (tip === null || typeof tip !== 'object') continue;
        // A combined card already carries its parts as sections; each section becomes one group.
        tip.groups = Array.isArray(tip.sections) && tip.sections.length > 0
          ? tip.sections.map((section, index) => ({
              key: 'section-' + index,
              head: section.head,
              headTotal: section.speed || null,
              timing: Array.isArray(section.timing) ? section.timing : null,
              chart: section.chart || null,
              rows: Array.isArray(section.rows) && section.rows.length > 0 ? section.rows : null,
              modelRows: Array.isArray(section.modelRows) ? section.modelRows : null,
            }))
          : groupsOf(tip);
        // Record that these groups were generated, so a subsequent pass rebuilds rather than trusting them.
        tip.groupsDeclared = false;
      }

      // Nothing to say yet — keep the dock empty. Placed here, after every
      // field it reads has been initialised: `promoStatus`, `creditChip`,
      // `hasCredits` and `hasBalance` are declared above, so evaluating this
      // before them would hit the temporal dead zone and throw.
      const hasAny =
        (prefs.speed && speed !== null) || (prefs.turn && latest !== null) || (prefs.session && sessionTotal !== null) ||
        (prefs.context && contextPct !== null) ||
        (prefs.promo && promoStatus !== null) || (prefs.credits && (hasCredits || hasBalance));
      if (!hasAny && !open) return null;

      const parts = [];

      if (prefs.speed && speed !== null) {        parts.push(h(
          Segment,
          { key: 'speed', segKey: 'speed', tipKey: 'speed', onHover, group: 'usage' },
          h('span', { className: 'tsb-strong ' + speedClass(speed) }, String(speed)),
          h('span', { className: 'tsb-dim' }, 'tok/s'),
        ));
      }

      // `turn` and `session` are separate segments, in the same order the prefs
      // panel lists them, so each switch maps to exactly one bar slot and a `|`
      // falls between every pair.
      // 本轮 and 消耗 share one chip and one card — they answer "what is happening now".
      const usageChips = [];
      if (prefs.turn && latest !== null) {
        usageChips.push(h('span', { key: 'tok', className: 'tsb-strong' }, fmtTokens(latest.total, locale)));
        if (latest.requests > 0) usageChips.push(h('span', { key: 'req', className: 'tsb-dim' }, latest.requests + T('unit.requests')));
      }
      if (usageChips.length > 0) {
        parts.push(h(Segment, { key: 'usage', segKey: 'usage', tipKey: 'combined', onHover, group: 'usage' }, usageChips));
      }

        // Credits answer "what does this cost", which is a different question from "what did this turn
        // use". It keeps its own segment and opens its own card.
        if (prefs.credits && creditChip !== null) {
          parts.push(h(Segment, { key: 'credits', segKey: 'credits', tipKey: 'credits', onHover, group: 'usage' },
            h('span', { key: 'chip', className: 'tsb-strong' }, creditChip.head),
            h('span', { key: 'unit', className: 'tsb-dim' }, creditChip.unit),
          ));
        }

      // The session total keeps its own chip and its own card: its eight-category token breakdown is
      // a different question ("where did the whole session's tokens go") and stays untouched.
      // Rendered as soon as anything about the session is known. The headline figure may still be
      // waiting for the Host's measured split, in which case it shows as a placeholder rather than the
      // chip disappearing and the bar rearranging itself a moment later.
      if (prefs.session && (sessionTotal !== null || stats.turns > 0 || stats.steps > 0)) {
        const schips = [];
        schips.push(h('span', { key: 'total', className: 'tsb-strong' }, sessionTotal !== null ? fmtTokens(sessionTotal, locale) : '—'));
        if (sessionCacheHit !== null) schips.push(h('span', { key: 'hit', className: 'tsb-dim' }, sessionCacheHit + '%'));
        if (stats.turns > 0) schips.push(h('span', { key: 'turns', className: 'tsb-dim' }, stats.turns + T('unit.turns')));
        if (stats.steps > 0) schips.push(h('span', { key: 'steps', className: 'tsb-dim' }, stats.steps + T('unit.requests')));
        parts.push(h(Segment, { key: 'session', segKey: 'session', tipKey: 'session', onHover, group: 'usage' }, schips));
      }

      if (prefs.context && contextPct !== null) {
        parts.push(
          h(
            Segment,
            { key: 'context', segKey: 'context', tipKey: 'context', onHover, group: 'context' },
            h(ContextRing, { pct: contextPct, size: 14 }),
            h('span', { className: 'tsb-strong ' + ctxClass(Math.round(contextPct)) }, Math.round(contextPct) + '%'),
          ),
        );
      }

      if (prefs.promo && promoStatus !== null) {
        // The glyph mirrors what the label says: a gift for a free window, a moon for
        // an off-peak discount, a star for a subscription tier, and a sun for peak
        // pricing (the period when the off-peak discount is not in force).
        const glyph = /免费|限免/.test(promoStatus) ? '🎁'
          : /折/.test(promoStatus) ? '🌙'
            : /优先/.test(promoStatus) ? '✦'
              : /高峰/.test(promoStatus) ? '☀'
                : null;
        parts.push(
          h(
            Segment,
            { key: 'promo', segKey: 'promo', tipKey: 'promo', onHover, group: 'offer' },
            h('span', { className: 'tsb-promo' },
              glyph ? h('span', { className: 'tsb-ico', 'aria-hidden': true }, glyph) : null,
              promoStatus),
          ),
        );
      }


      const children = [];
      // Every segment is rendered; CSS hides the ones that do not fit, keyed by
      // the segKey attribute. Keeping the markup complete means the browser alone
      // decides visibility, so there is no JavaScript state to oscillate.
      const visibleParts = parts;
      visibleParts.forEach((node, index) => {
        if (index > 0) {
          // A wider gap marks a group boundary; a thin separator keeps a group together. The group
          // lives on the element's props, which is where the segment list records it.
          const groupOf = (element) => {
            if (element === null || element === undefined) return undefined;
            const props = element.props;
            return props !== undefined && props !== null ? props.group : undefined;
          };
          const prevGroup = groupOf(parts[index - 1]);
          const thisGroup = groupOf(node);
          const acrossGroups = prevGroup !== undefined && thisGroup !== undefined && prevGroup !== thisGroup;
          children.push(h(Divider, { key: 'divider-' + index, wide: acrossGroups }));
        }
        children.push(node);
      });

      // The gear is always present so a fully-collapsed bar can be reopened.
      if (visibleParts.length > 0) children.push(h(Divider, { key: 'gear-divider' }));
      children.push(
        h(
          'button',
          {
            key: 'gear',
            type: 'button',
            className: 'tsb-gear',
            ref: gearRef,
            'aria-label': t('prefs.title'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: () => setOpen((v) => !v),
            title: t('prefs.title'),
          },
          '⚙',
        ),
      );

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'tsb-wrap' },
          h('span', { className: 'tsb-root', 'data-token-statusbar': '' }, children),
          hover !== null && tips[hover]
            ? h(HoverCard, { tip: tips[hover], t, anchorRef: hoveredAnchorRef })
            : null,
        ),
        open ? h(PrefsPanel, { prefs, onToggle: toggle, t, anchorRef: gearRef, onClose: closePanel }) : null,
      );
    }

    // ---- model-picker label: model name + rate chip + promo badge -----------

    function ModelLabel(props) {
      const { provider, model, t, billing } = props;
      // Re-render when the shared billing snapshot refreshes.
      const [, setTick] = React.useState(0);
      React.useEffect(() => billing.subscribe(() => setTick((n) => n + 1)), [billing]);
      const facts = billingFor(billing.get(), provider && provider.id, model && model.id);
      const rate = rateLabel(facts);
      const badge = badgeOf(facts);
      const name = model && model.name ? String(model.name) : '';
      return h(
        'span',
        { className: 'tsb-mlabel' },
        h('span', { className: 'tsb-mlabelText' }, name),
        rate !== null
          ? h('span', { className: 'tsb-mrate', 'data-free': facts && facts.free ? '1' : '0', title: t('tip.rate') }, rate)
          : null,
        badge !== null ? h('span', { className: 'tsb-mbadge' }, badge) : null,
      );
    }

    // ---- locale store (so formatting can follow the active locale) ---------

    function createLocaleStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set: (next) => {
          if (next === value) return;
          value = next;
          for (const listener of listeners) listener();
        },
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-token-statusbar-workbuddy: copy');
        const t = ctx.locale.bind(NS);

        const localeStore = createLocaleStore(ctx.locale.getLocale().active);
        ctx.effect(() => {
          const handler = () => localeStore.set(ctx.locale.getLocale().active);
          const dispose = ctx.on('locale/change', handler);
          return typeof dispose === 'function' ? dispose : undefined;
        }, 'dsh-token-statusbar-workbuddy: locale mirror');

        // Shared billing accessor handed to both consumers as a plain prop.
        const billing = {
          get: getBilling,
          getCredits,
        /**
         * Host-measured peak / off-peak split for one session.
         *
         * The browser cannot derive this: the projection view it receives carries an empty
         * requests array, so every timestamp is missing. The host computes it from the
         * append-only session log and ships it beside the credit totals.
         *
         * @param {string} sessionId
         * @returns {object|undefined}
         */
        getPeriodSplit: (sessionId) => {
          if (typeof sessionId !== 'string' || sessionId === '') return undefined;
          const fromBilling = BILLING.periodSplit && typeof BILLING.periodSplit === 'object'
            ? BILLING.periodSplit[sessionId]
            : undefined;
          return fromBilling !== undefined ? fromBilling : PERIOD_SPLIT_BY_SESSION.get(sessionId);
        },
          subscribe: subscribeBilling,
          noteSelectedModel,
          noteSession,
          forgetSession,
        };

        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'dsh-token-statusbar-workbuddy',
              order: 5,
              locale: NS,
              // `sessionId` is a standard session-scope prop; forward it so the
              // Host can scope the credit ledger to this conversation.
              inject: (slotSessionId) => ({ hooks: { statusLocale: localeStore }, billing, sessionId: slotSessionId }),
            },
            StatusBar,
          ),
        );

        // Rate chip + promotion badge beside every model in the picker. This is
        // the official per-row extension point (inline single slot).
        //
        // DISABLED 2026-10-26 15:44: the shipped client already registers
        // `conversation.input.model.label` at priority 0, so this second
        // registration throws
        //   single slot "conversation.input.model.label" already has a
        //   registration at priority 0 (registered by Gb)
        // and takes the whole renderer down. Re-enable only after switching to
        // a non-conflicting priority. That attempt is not kept in this package.
        if (false) ctx.slots.inject('conversation.input.model.label', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.model.label',
              id: 'dsh-token-statusbar-workbuddy',
              locale: NS,
              inject: () => ({ billing }),
            },
            ModelLabel,
          ),
        );
      },
    };
  },
});

