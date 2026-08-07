/* ============================================================
   选基攻略 · 策略化推荐编排
   流程：入参白名单校验 → 按策略/用户限定的类型拉取候选池
        → 自定义条件硬过滤（过严则逐级放宽）
        → 构造策略提示词 → 混元生成结构化方案 → 校验标的真实性
   ============================================================ */

const { runSkill, getFallback } = require('./skill');
const { callHunyuan, extractJson } = require('./hunyuan');
const { getStrategy, COMMON_FIELDS, CONSTRAINT_FIELDS } = require('./strategies');
const { TYPE_LABEL } = require('./prompt');

const MAX_TEXT_LEN = 300;
const TYPE_BY_LABEL = { '混合型': 'mix', '股票型': 'stock', '债券型': 'bond', '指数型': 'index' };

function fmt(v, suffix = '%') {
  return (v === null || v === undefined || v === '') ? '⚠️缺失' : `${v}${suffix}`;
}

function cleanText(v, limit) {
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, limit).trim();
}

/**
 * 依据字段定义做白名单/范围校验。
 * select → 必须命中 options；multi → 数组内每项命中 options；
 * number → 有限数值并clamp 到 [min,max]；tags → 逗号分隔、逐项清洗与数量限制；
 * text → 去控制字符并截断。
 */
function sanitizeFields(fields, input) {
  const out = {};
  const src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  for (const f of fields) {
    const raw = src[f.key];
    if (raw === undefined || raw === null || raw === '') continue;

    if (f.type === 'select') {
      const v = String(raw);
      if (Array.isArray(f.options) && f.options.includes(v)) out[f.key] = v;
    } else if (f.type === 'multi') {
      const arr = Array.isArray(raw) ? raw : String(raw).split(',');
      const picked = [];
      for (const item of arr) {
        const v = cleanText(item, 20);
        if (Array.isArray(f.options) && f.options.includes(v) && !picked.includes(v)) picked.push(v);
        if (picked.length >= (f.options || []).length) break;
      }
      if (picked.length) out[f.key] = picked;
    } else if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const min = Number.isFinite(f.min) ? f.min : -1e6;
      const max = Number.isFinite(f.max) ? f.max : 1e6;
      out[f.key] = Math.min(max, Math.max(min, Math.round(n * 100) / 100));
    } else if (f.type === 'tags') {
      const arr = Array.isArray(raw) ? raw : String(raw).split(/[,，;；\s]+/);
      const maxItems = f.maxItems || 6;
      const picked = [];
      for (const item of arr) {
        let v = cleanText(item, 16);
        if (!v) continue;
        if (f.pattern === 'code') {
          if (!/^\d{6}$/.test(v)) continue;
        } else {
          v = v.replace(/[^\p{L}\p{N}\-·+]/gu, '');
          if (v.length < 1 || v.length > 12) continue;
        }
        if (!picked.includes(v)) picked.push(v);
        if (picked.length >= maxItems) break;
      }
      if (picked.length) out[f.key] = picked;
    } else {
      out[f.key] = cleanText(raw, f.maxLength || MAX_TEXT_LEN);
    }
  }
  return out;
}

/* ---------------- 候选池硬过滤 ---------------- */

/** 单条规则集合：每项{ key, label, test } */
function buildRules(c) {
  const rules = [];
  if (Number.isFinite(c.maxFee)) {
    rules.push({
      key: 'maxFee', label: `费率 ≤ ${c.maxFee}%`,
      test: (f) => f.fee === null || f.fee === undefined || Number(f.fee) <= c.maxFee,
    });
  }
  if (Number.isFinite(c.minYears)) {
    rules.push({
      key: 'minYears', label: `成立≥ ${c.minYears} 年`,
      test: (f) => Number.isFinite(Number(f.years)) && Number(f.years) >= c.minYears,
    });
  }
  if (Number.isFinite(c.minR3y)) {
    rules.push({
      key: 'minR3y', label: `近3年 ≥ ${c.minR3y}%`,
      test: (f) => Number.isFinite(Number(f.r3y)) && Number(f.r3y) >= c.minR3y,
    });
  }
  if (Number.isFinite(c.maxR3y)) {
    rules.push({
      key: 'maxR3y', label: `近3年 ≤ ${c.maxR3y}%`,
      test: (f) => Number.isFinite(Number(f.r3y)) && Number(f.r3y) <= c.maxR3y,
    });
  }
  if (c.excludeNegative === '是，剔除近1年亏损') {
    rules.push({
      key: 'excludeNegative', label: '剔除近1年亏损',
      test: (f) => !f.recent_drag && !(Number.isFinite(Number(f.r1y)) && Number(f.r1y) < 0),
    });
  }
  if (Array.isArray(c.excludeKeywords) && c.excludeKeywords.length) {
    rules.push({
      key: 'excludeKeywords', label: `排除含「${c.excludeKeywords.join('/')}」`,
      test: (f) => !c.excludeKeywords.some((k) => String(f.name || '').includes(k)),
    });
  }
  if (Array.isArray(c.includeKeywords) && c.includeKeywords.length) {
    rules.push({
      key: 'includeKeywords', label: `仅含「${c.includeKeywords.join('/')}」`,
      test: (f) => c.includeKeywords.some((k) => String(f.name || '').includes(k)),
    });
  }
  if (Array.isArray(c.excludeCodes) && c.excludeCodes.length) {
    rules.push({
      key: 'excludeCodes', label: `排除已持有 ${c.excludeCodes.length} 只`,
      test: (f) => !c.excludeCodes.includes(String(f.code)),
    });
  }
  return rules;
}

/**
 * 应用硬过滤。若结果不足 minKeep，则按「后加入的规则先放宽」逐级回退，
 * 保证候选池不为空，并把放宽情况回传给用户（透明可见）。
 */
function applyConstraints(pool, constraints, minKeep = 3) {
  const rules = buildRules(constraints);
  if (!rules.length) return { pool, applied: [], relaxed: [], removed: 0 };

  let active = rules.slice();
  const relaxed = [];
  let filtered = pool.filter((f) => active.every((r) => r.test(f)));

  while (filtered.length < minKeep && active.length) {
    const dropped = active.pop();
    relaxed.push(dropped.label);
    filtered = active.length ? pool.filter((f) => active.every((r) => r.test(f))) : pool.slice();
  }

  return {
    pool: filtered,
    applied: active.map((r) => r.label),
    relaxed,
    removed: pool.length - filtered.length,
  };
}

/*---------------- 提示词 ---------------- */

function buildPoolText(pool) {
  return pool.slice(0, 36).map((f, i) => [
    `${i + 1}. [${f._typeLabel}] ${f.name}（${f.code}）`,
    `净值 ${fmt(f.nav, '')}`,
    `近1年 ${fmt(f.r1y)}`,
    `近2年 ${fmt(f.r2y)}`,
    `近3年 ${fmt(f.r3y)}`,
    `近3年年化 ${fmt(f.cagr3y)}`,
    `费率 ${fmt(f.fee)}`,
    `成立 ${f.years != null ? f.years + ' 年' : '⚠️缺失'}`,
    `近1年为负：${f.recent_drag ? '是' : '否'}`,
  ].join(' | ')).join('\n');
}

function buildSystemPrompt() {
  return `你是一名严谨的基金投资研究助手，服务于「求一基」工具的「选基攻略」模块。用户已经选定一套经典选基策略，你要把这套策略落地成一份可执行的配置方案。

【硬性红线，必须遵守】
1. 标的只能从下文「候选基金池」中挑选，严禁编造任何基金代码或名称。池中没有合适标的时，picks 留空或只给品类方向，并在 allocation 中说明原因。
2. 所有数字必须来自候选池给出的数据；候选池没给的指标（如夏普比率、最大回撤、基金经理姓名、估值分位、规模）一律不得臆造，需写成 ⚠️缺失并放进 checklist 让用户自行核实。
3. 必须严格遵守用户的「自定义条件限制」。若某条限制无法满足（如份额类型、规模等候选池未提供的信息），必须在 constraintNote 中明确说清哪一条无法确认，并写入 checklist 让用户自行核实，绝不假装满足。
4. 不预测收益、不预测涨跌、不给买卖时点、不给目标价位。只给「方式类」建议：份额 A/C 选择、分批节奏、仓位上限、再平衡与止盈规则。
5. 必须诚实揭短：明确指出该策略与所选标的的短板、失效场景。
6. 内容仅供投资者教育与研究参考，不构成投资建议。

【输出要求】只输出一个严格 JSON 对象（不要任何额外文字、不要 Markdown 代码块），结构如下：
{
  "opening": "一句有仪式感的开场（≤30字）",
  "strategyEcho": "你如何理解并落地这套策略（≤60字）",
  "constraintNote": "逐条回应用户的自定义限制：哪些已满足、哪些无法从数据确认（≤120字）",
  "picks": [
    {
      "code": "必须来自候选池的基金代码",
      "name": "必须来自候选池的基金名称",
      "role": "该标的在方案中的角色，如核心仓/卫星仓/债券底仓/定投主力",
      "weight": "建议权重，如 60%",
      "why": ["选它的理由，带候选池中的真实数据，2-3 条"],
      "watch": "持有期间需要盯住的一件事"
    }
  ],
  "allocation": "整体仓位与建仓节奏建议（结合用户可投资金与投入方式）",
  "executionSteps": ["可立即执行的步骤，3-6 条，第一条应是需要先核实的事"],
  "rebalance": "再平衡 / 止盈 / 止损 的具体规则",
  "checklist": ["下单前必须自行核实的事项，3-5 条"],
  "shortBoard": ["本方案与所选策略的短板、失效场景，2-3 条"],
  "notSuitable": "这套方案不适合哪类投资者",
  "riskNote": "一句话风险提示"
}
picks 的 weight 之和应为 100%（若只给方向未选标的可为空数组）。`;
}

function describeConstraints(constraints, applied, relaxed) {
  const lines = [];
  for (const f of CONSTRAINT_FIELDS) {
    const v = constraints[f.key];
    if (v === undefined || v === null || v === '') continue;
    const text = Array.isArray(v) ? v.join('、') : (f.type === 'number' ? `${v}${f.unit || ''}` : v);
    lines.push(`- ${f.label}：${text}${f.hard ? '（已对候选池强制过滤）' : ''}`);
  }
  if (!lines.length) lines.push('- 用户未设置额外限制');
  if (applied.length) lines.push(`- 实际生效的过滤条件：${applied.join('；')}`);
  if (relaxed.length) {
    lines.push(`- ⚠️ 以下条件因过严导致候选池为空，已自动放宽，必须在 constraintNote 中如实告知用户：${relaxed.join('；')}`);
  }
  return lines.join('\n');
}

function buildUserPrompt({ strategy, common, extra, constraints, applied, relaxed, pool, poolNote }) {
  const commonText = COMMON_FIELDS
    .filter((f) => common[f.key])
    .map((f) => `- ${f.label}：${common[f.key]}`)
    .join('\n') || '- 用户未补充（请按通用稳健假设处理，并在方案中说明该假设）';

  const extraText = (strategy.fields || [])
    .filter((f) => extra[f.key])
    .map((f) => `- ${f.label}：${extra[f.key]}`)
    .join('\n') || '- 用户未补充策略参数（请给出该策略的常用默认参数并说明）';

  return `【用户选定的策略】
- 策略名称：${strategy.name}（${strategy.alias}）
- 策略定位：${strategy.category === 'select' ? '基金优选' : strategy.category === 'allocate' ? '资产配置' : strategy.category === 'timing' ? '节奏择时' : '风控纪律'} / 难度 ${strategy.level} / 适用周期 ${strategy.horizon}
- 核心逻辑：${strategy.keyIdea}
- 标准步骤：${(strategy.steps || []).join(' → ')}
- 关键指标：${(strategy.metrics || []).join('、')}
- 已知短板：${(strategy.cons || []).join('；')}

【本次落地要点（务必遵守）】
${strategy.promptHint}

【用户自定义条件限制（最高优先级，必须逐条回应）】
${describeConstraints(constraints, applied, relaxed)}

【用户基本情况】
${commonText}

【用户补充的策略参数】
${extraText}

【候选基金池】（来源：${poolNote}，已通过价值初筛与上述硬性过滤；picks 只能从这里选）
${buildPoolText(pool)}

请把这套策略落地为一份贴合上述用户情况与限制的方案，输出规定结构的 JSON。`;
}

/* ---------------- 结果校验 ---------------- */

function validatePicks(picks, pool, limit) {
  if (!Array.isArray(picks)) return { picks: [], dropped: 0 };
  const byCode = new Map(pool.map((f) => [String(f.code), f]));
  const byName = new Map(pool.map((f) => [String(f.name), f]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const p of picks.slice(0, 8)) {
    if (!p || typeof p !== 'object') { dropped++; continue; }
    const hit = byCode.get(String(p.code || '')) || byName.get(String(p.name || ''));
    if (!hit || seen.has(hit.code)) { dropped++; continue; }
    if (out.length >= limit) { dropped++; continue; }
    seen.add(hit.code);
    out.push({
      code: hit.code,
      name: hit.name,
      type: hit._typeLabel,
      role: typeof p.role === 'string' ? cleanText(p.role, 20) : '',
      weight: typeof p.weight === 'string' ? cleanText(p.weight, 12) : '',
      why: Array.isArray(p.why) ? p.why.slice(0, 4).map((x) => cleanText(x, 160)) : [],
      watch: typeof p.watch === 'string' ? cleanText(p.watch, 120) : '',
      metrics: {
        r1y: hit.r1y, r3y: hit.r3y, cagr3y: hit.cagr3y,
        fee: hit.fee, years: hit.years, nav: hit.nav, nav_date: hit.nav_date,
      },
    });
  }
  return { picks: out, dropped };
}

function makeFallbackPlan(strategy, pool, wantCount) {
  const top = pool.slice(0, Math.max(1, Math.min(wantCount, 2, pool.length)));
  return {
    opening: '🧭 AI 暂时开小差，先给你一份策略骨架',
    strategyEcho: `按「${strategy.name}」的标准流程落地，标的仅取自已过滤的候选池。`,
    constraintNote: '你的硬性条件已在候选池过滤阶段生效；份额类型、规模等需自行核实。',
    picks: top.map((f, i) => ({
      code: f.code, name: f.name,
      role: i === 0 ? '主要仓位' : '辅助仓位',
      weight: top.length > 1 ? (i === 0 ? '60%' : '40%') : '100%',
      why: [
        `近3年 ${fmt(f.r3y)}，近3年年化 ${fmt(f.cagr3y)}，已通过价值初筛与你的过滤条件。`,
        `成立 ${f.years != null ? f.years + ' 年' : '⚠️缺失'}，费率 ${fmt(f.fee)}。`,
      ],
      watch: '基金经理是否变更、规模是否骤增。',
    })),
    allocation: '建议分 3-4 批建仓，每批间隔不少于两周，单只基金仓位设上限。',
    executionSteps: (strategy.steps || []).slice(0, 5),
    rebalance: '每年或偏离目标比例 ±5% 时做一次再平衡；达到既定收益目标分批止盈。',
    checklist: ['核实基金经理是否变更', '核实最新规模与费率', '核实份额类型 A/C 与申赎费用', '核实自己的资金使用期限'],
    shortBoard: (strategy.cons || []).slice(0, 3),
    notSuitable: strategy.notSuitable || '资金短期内需要使用的投资者。',
    riskNote: '基金有风险，投资需谨慎；本方案仅供研究参考，不构成投资建议。',
  };
}

/* ---------------- 主流程 ---------------- */

async function recommendByStrategy({ strategyId, common, extra, constraints, sort }) {
  const strategy = getStrategy(strategyId);
  if (!strategy) {
    const err = new Error('未知的策略标识');
    err.status = 400;
    throw err;
  }

  const safeCommon = sanitizeFields(COMMON_FIELDS, common);
  const safeExtra = sanitizeFields(strategy.fields || [], extra);
  const safeConstraints = sanitizeFields(CONSTRAINT_FIELDS, constraints);
  const safeSort = ['1y', '2y', '3y', '5y'].includes(sort) ? sort : '3y';

  // 1) 候选类型：用户限定优先，否则用策略默认
  const userTypes = (safeConstraints.fundTypes || [])
    .map((label) => TYPE_BY_LABEL[label])
    .filter(Boolean);
  const types = (userTypes.length ? userTypes : (strategy.suggestTypes || ['mix'])).slice(0, 4);

  const results = await Promise.all(types.map((t) => runSkill({ type: t, sort: safeSort, top: 12 })));

  const rawPool = [];
  let liveCount = 0;
  types.forEach((t, i) => {
    const r = results[i];
    const label = TYPE_LABEL[t] || t;
    if (r.ok && r.data && Array.isArray(r.data.candidates) && r.data.candidates.length) {
      liveCount++;
      r.data.candidates.forEach((f) => rawPool.push({ ...f, _typeLabel: label }));
    } else {
      getFallback(t).forEach((f) => rawPool.push({ ...f, _typeLabel: label, _mock: true }));
    }
  });

  const isMock = liveCount === 0;
  const partialMock = !isMock && liveCount < types.length;
  const dataSource = isMock
    ? '内置示例(数据源暂不可用)'
    : (partialMock ? '天天基金(实时) + 部分内置示例' : '天天基金(实时)');

  // 2) 自定义条件硬过滤（过严自动放宽并如实上报）
  const { pool, applied, relaxed, removed } = applyConstraints(rawPool, safeConstraints, 3);

  // 3) 期望标的数量
  const countMap = { '1 只': 1, '2 只': 2, '3 只': 3, '4 只': 4 };
  const wantCount = countMap[safeConstraints.pickCount] || 4;

  // 4) 大模型生成方案
  let plan = null;
  let fallback = false;
  let modelError = null;
  try {
    const raw = await callHunyuan(
      buildUserPrompt({
        strategy, common: safeCommon, extra: safeExtra,
        constraints: safeConstraints, applied, relaxed,
        pool, poolNote: dataSource,
      }),
      buildSystemPrompt(),
    );
    const structured = extractJson(raw);
    if (structured && (structured.allocation || Array.isArray(structured.picks))) {
      plan = structured;
    } else {
      plan = makeFallbackPlan(strategy, pool, wantCount);
      fallback = true;
      modelError = '模型未返回可解析的结构化方案';
    }
  } catch (e) {
    plan = makeFallbackPlan(strategy, pool, wantCount);
    fallback = true;
    modelError = String(e.message || e);
  }

  // 5) 标的真实性校验（防止编造代码）
  const { picks, dropped } = validatePicks(plan.picks, pool, wantCount);

  const clip = (v, n) => (typeof v === 'string' ? cleanText(v, n) : '');
  const clipList = (v, n, len) => (Array.isArray(v) ? v.slice(0, n).map((x) => cleanText(x, len)) : []);

  return {
    strategy: {
      id: strategy.id, name: strategy.name, alias: strategy.alias,
      category: strategy.category, level: strategy.level, horizon: strategy.horizon,
    },
    userInput: { common: safeCommon, extra: safeExtra, constraints: safeConstraints, sort: safeSort },
    constraintResult: { applied, relaxed, removed, poolBefore: rawPool.length, poolAfter: pool.length },
    dataSource,
    isMock,
    candidatesCount: pool.length,
    poolTypes: types.map((t) => TYPE_LABEL[t] || t),
    fallback,
    modelError,
    droppedPicks: dropped,
    plan: {
      opening: clip(plan.opening, 60),
      strategyEcho: clip(plan.strategyEcho, 160),
      constraintNote: clip(plan.constraintNote, 300),
      picks,
      allocation: clip(plan.allocation, 600),
      executionSteps: clipList(plan.executionSteps, 8, 220),
      rebalance: clip(plan.rebalance, 400),
      checklist: clipList(plan.checklist, 6, 160),
      shortBoard: clipList(plan.shortBoard, 4, 200),
      notSuitable: clip(plan.notSuitable, 240),
      riskNote: clip(plan.riskNote, 240) || '基金有风险，投资需谨慎；本方案仅供研究参考，不构成投资建议。',
    },
  };
}

module.exports = { recommendByStrategy };
