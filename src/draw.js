// 抽签编排：荐基 Skill 初筛 → 盲盒抽取 → 混元生成理由
const { runSkill, getFallback, TYPE_LABEL } = require('./skill');
const { generateReason } = require('./hunyuan');

function extractMetrics(fund) {
  return {
    nav: fund.nav, nav_date: fund.nav_date,
    r1m: fund.r1m, r3m: fund.r3m, r6m: fund.r6m,
    r1y: fund.r1y, r2y: fund.r2y, r3y: fund.r3y, rytd: fund.rytd, rsince: fund.rsince,
    fee: fund.fee, years: fund.years, cagr3y: fund.cagr3y, recent_drag: !!fund.recent_drag,
    found: fund.found,
  };
}

async function draw({ type, risk, horizon, sort }) {
  const usedDefaults = {};
  if (!type || !['mix', 'stock', 'bond', 'index'].includes(type)) { type = 'mix'; usedDefaults.type = '混合型(默认)'; }
  if (!sort || !['1y', '2y', '3y', '5y'].includes(sort)) { sort = '3y'; usedDefaults.sort = '近三年(默认)'; }
  if (!risk || !['低', '中', '高'].includes(risk)) { risk = '中'; usedDefaults.risk = '中等(默认)'; }
  if (!horizon || !['短', '中', '长'].includes(horizon)) { horizon = '中'; usedDefaults.horizon = '中期(默认)'; }

  // 1) 荐基 Skill 初筛
  const skillRes = await runSkill({ type, sort, top: 15 });
  let candidates, dataSource, isMock, fundType;
  if (skillRes.ok && skillRes.data.candidates && skillRes.data.candidates.length) {
    candidates = skillRes.data.candidates;
    dataSource = '天天基金(实时)';
    isMock = false;
    fundType = skillRes.data.meta && skillRes.data.meta.type ? skillRes.data.meta.type : TYPE_LABEL[type];
  } else {
    candidates = getFallback(type);
    dataSource = '内置示例(数据源暂不可用)';
    isMock = true;
    fundType = TYPE_LABEL[type];
  }

  // 2) 盲盒随机：在通过初筛的候选池中随机摇出一只
  const idx = Math.floor(Math.random() * candidates.length);
  const fund = candidates[idx];
  const seed = `${Date.now()}-${idx}`;
  const candidatesSummary = `候选池共 ${candidates.length} 只通过价值初筛；本次盲盒为池中第 ${idx + 1} 只（随机抽取，非收益榜首）。`;

  // 3) 混元生成推荐理由
  const reason = await generateReason({
    fund, type, risk, horizon, sort, candidatesSummary, usedDefaults,
  });

  return {
    dataSource,
    isMock,
    meta: skillRes.ok ? skillRes.data.meta : { type: TYPE_LABEL[type], sort },
    fund: {
      code: fund.code,
      name: fund.name,
      type: fundType,
    },
    metrics: extractMetrics(fund),
    reason,
    candidatesCount: candidates.length,
    drawIndex: idx,
    seed,
    usedDefaults,
    userConstraints: { type, risk, horizon, sort },
  };
}

module.exports = { draw };
