/* ============================================================
   选基攻略 · 策略化推荐编排
   流程：入参白名单校验 → 按策略需要的类型并行拉取候选池
        → 构造策略提示词 → 混元生成结构化方案 → 校验标的真实性
   ============================================================ */

const { runSkill, getFallback } = require('./skill');
const { callHunyuan, extractJson } = require('./hunyuan');
const { getStrategy, COMMON_FIELDS } = require('./strategies');
const { TYPE_LABEL } = require('./prompt');

const MAX_NOTE_LEN = 200;

function fmt(v, suffix = '%') {
  return (v === null || v === undefined || v === '') ? '⚠️缺失' : `${v}${suffix}`;
}

/** 依据字段定义做白名单校验：select 必须命中 options，text 截断 */
function sanitizeByFields(fields, input) {
  const out = {};
  const src = (input && typeof input === 'object') ? input : {};
  for (const f of fields) {
    const raw = src[f.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (f.type === 'select') {
      const v = String(raw);
      if (Array.isArray(f.options) && f.options.includes(v)) out[f.key] = v;
    } else {
      const limit = f.maxLength || MAX_NOTE_LEN;
      out[f.key] = String(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit).trim();
    }
  }
  return out;
}

/** 汇总候选池文本（限量，控制 token） */
function buildPoolText(pool) {
  return pool.slice(0, 36).map((f, i) => {
    const parts = [
      `${i + 1}. [${f._typeLabel}] ${f.name}（${f.code}）`,
      `净值 ${fmt(f.nav, '')}`,
      `近1年 ${fmt(f.r1y)}`,
      `近2年 ${fmt(f.r2y)}`,
      `近3年 ${fmt(f.r3y)}`,
      `近3年年化 ${fmt(f.cagr3y)}`,
      `费率 ${fmt(f.fee)}`,
      `成立 ${f.years != null ? f.years + ' 年' : '⚠️缺失'}`,
      `近1年为负：${f.recent_drag ? '是' : '否'}`,
    ];
    return parts.join(' | ');
  }).join('\n');
}

function buildSystemPrompt() {
  return `你是一名严谨的基金投资研究助手，服务于「求一基」工具的「选基攻略」模块。用户已经选定一套经典选基策略，你要把这套策略落地成一份可执行的配置方案。

【硬性红线，必须遵守】
1. 标的只能从下文「候选基金池」中挑选，严禁编造任何基金代码或名称。池中没有合适标的时，picks 留空或只给品类方向，并在 allocation 中说明原因。
2. 所有数字必须来自候选池给出的数据；候选池没给的指标（如夏普比率、最大回撤、基金经理姓名、估值分位、规模）一律不得臆造，需写成 ⚠️缺失并放进 checklist 让用户自行核实。
3. 不预测收益、不预测涨跌、不给买卖时点、不给目标价位。只给「方式类」建议：份额 A/C 选择、分批节奏、仓位上限、再平衡与止盈规则。
4. 必须诚实揭短：明确指出该策略与所选标的的短板、失效场景。
5. 内容仅供投资者教育与研究参考，不构成投资建议。

【输出要求】只输出一个严格 JSON 对象（不要任何额外文字、不要 Markdown 代码块），结构如下：
{
  "opening": "一句有仪式感的开场（≤30字）",
  "strategyEcho": "你如何理解并落地这套策略（≤60字）",
  "picks": [
    {
      "code": "必须来自候选池的基金代码",
      "name": "必须来自候选池的基金名称",
      "role": "该标的在方案中的角色，如 核心仓/卫星仓/债券底仓/定投主力",
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

function buildUserPrompt({ strategy, common, extra, pool, poolNote }) {
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

【用户基本情况】
${commonText}

【用户补充的策略参数】
${extraText}

【候选基金池】（来源：${poolNote}，已通过价值初筛；picks 只能从这里选）
${buildPoolText(pool)}

请把这套策略落地为一份贴合上述用户情况的方案，输出规定结构的 JSON。`;
}

/** 校验模型给出的标的是否真实存在于候选池 */
function validatePicks(picks, pool) {
  if (!Array.isArray(picks)) return { picks: [], dropped: 0 };
  const byCode = new Map(pool.map((f) => [String(f.code), f]));
  const byName = new Map(pool.map((f) => [String(f.name), f]));
  const out = [];
  let dropped = 0;
  for (const p of picks.slice(0, 6)) {
    if (!p || typeof p !== 'object') { dropped++; continue; }
    const hit = byCode.get(String(p.code || '')) || byName.get(String(p.name || ''));
    if (!hit) { dropped++; continue; }
    out.push({
      code: hit.code,
      name: hit.name,
      type: hit._typeLabel,
      role: typeof p.role === 'string' ? p.role.slice(0, 20) : '',
      weight: typeof p.weight === 'string' ? p.weight.slice(0, 12) : '',
      why: Array.isArray(p.why) ? p.why.slice(0, 4).map((x) => String(x).slice(0, 160)) : [],
      watch: typeof p.watch === 'string' ? p.watch.slice(0, 120) : '',
      metrics: {
        r1y: hit.r1y, r3y: hit.r3y, cagr3y: hit.cagr3y,
        fee: hit.fee, years: hit.years, nav: hit.nav, nav_date: hit.nav_date,
      },
    });
  }
  return { picks: out, dropped };
}

function makeFallbackPlan(strategy, pool) {
  const top = pool.slice(0, Math.min(2, pool.length));
  return {
    opening: '🧭 AI 暂时开小差，先给你一份策略骨架',
    strategyEcho: `按「${strategy.name}」的标准流程落地，标的仅取自初筛候选池。`,
    picks: top.map((f, i) => ({
      code: f.code, name: f.name, type: f._typeLabel,
      role: i === 0 ? '主要仓位' : '辅助仓位',
      weight: top.length > 1 ? (i === 0 ? '60%' : '40%') : '100%',
      why: [
        `近3年 ${fmt(f.r3y)}，近3年年化 ${fmt(f.cagr3y)}，已通过价值初筛。`,
        `成立 ${f.years != null ? f.years + ' 年' : '⚠️缺失'}，费率 ${fmt(f.fee)}。`,
      ],
      watch: '基金经理是否变更、规模是否骤增。',
      metrics: { r1y: f.r1y, r3y: f.r3y, cagr3y: f.cagr3y, fee: f.fee, years: f.years, nav: f.nav, nav_date: f.nav_date },
    })),
    allocation: '建议分3-4 批建仓，每批间隔不少于两周，单只基金仓位设上限。',
    executionSteps: (strategy.steps || []).slice(0, 5),
    rebalance: '每年或偏离目标比例 ±5% 时做一次再平衡；达到既定收益目标分批止盈。',
    checklist: ['核实基金经理是否变更', '核实最新规模与费率', '核实同类排名区间口径', '核实自己的资金使用期限'],
    shortBoard: (strategy.cons || []).slice(0, 3),
    notSuitable: strategy.notSuitable || '资金短期内需要使用的投资者。',
    riskNote: '基金有风险，投资需谨慎；本方案仅供研究参考，不构成投资建议。',
  };
}

async function recommendByStrategy({ strategyId, common, extra, sort }) {
  const strategy = getStrategy(strategyId);
  if (!strategy) {
    const err = new Error('未知的策略标识');
    err.status = 400;
    throw err;
  }

  const safeCommon = sanitizeByFields(COMMON_FIELDS, common);
  const safeExtra = sanitizeByFields(strategy.fields || [], extra);
  const safeSort = ['1y', '2y', '3y', '5y'].includes(sort) ? sort : '3y';

  // 1) 按策略需要的类型并行初筛
  const types = (strategy.suggestTypes && strategy.suggestTypes.length) ? strategy.suggestTypes.slice(0, 3) : ['mix'];
  const results = await Promise.all(types.map((t) => runSkill({ type: t, sort: safeSort, top: 12 })));

  const pool = [];
  let liveCount = 0;
  types.forEach((t, i) => {
    const r = results[i];
    const label = TYPE_LABEL[t] || t;
    if (r.ok && r.data && Array.isArray(r.data.candidates) && r.data.candidates.length) {
      liveCount++;
      r.data.candidates.forEach((f) => pool.push({ ...f, _typeLabel: label }));
    } else {
      getFallback(t).forEach((f) => pool.push({ ...f, _typeLabel: label, _mock: true }));
    }
  });

  const isMock = liveCount === 0;
  const partialMock = !isMock && liveCount < types.length;
  const dataSource = isMock
    ? '内置示例(数据源暂不可用)'
    : (partialMock ? '天天基金(实时) + 部分内置示例' : '天天基金(实时)');

  // 2) 混元生成结构化方案
  let plan = null;
  let fallback = false;
  let raw = '';
  let modelError = null;
  try {
    raw = await callHunyuan(
      buildUserPrompt({ strategy, common: safeCommon, extra: safeExtra, pool, poolNote: dataSource }),
      buildSystemPrompt(),
    );
    const structured = extractJson(raw);
    if (structured && (structured.allocation || Array.isArray(structured.picks))) {
      plan = structured;
    } else {
      plan = makeFallbackPlan(strategy, pool);
      fallback = true;
      modelError = '模型未返回可解析的结构化方案';
    }
  } catch (e) {
    plan = makeFallbackPlan(strategy, pool);
    fallback = true;
    modelError = String(e.message || e);
  }

  // 3) 标的真实性校验（防止编造代码）
  const { picks, dropped } = validatePicks(plan.picks, pool);

  const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const clipList = (v, n, len) => (Array.isArray(v) ? v.slice(0, n).map((x) => String(x).slice(0, len)) : []);

  return {
    strategy: {
      id: strategy.id, name: strategy.name, alias: strategy.alias,
      category: strategy.category, level: strategy.level, horizon: strategy.horizon,
    },
    userInput: { common: safeCommon, extra: safeExtra, sort: safeSort },
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
