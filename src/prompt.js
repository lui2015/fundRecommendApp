// 标签映射与混元提示词构造

const TYPE_LABEL = { mix: '混合型', stock: '股票型', bond: '债券型', index: '指数型' };
const RISK_LABEL = { 低: '低风险偏好', 中: '中等风险偏好', 高: '高风险偏好' };
const HORIZON_LABEL = { 短: '短期（1 年以内）', 中: '中期（1-3 年）', 长: '长期（3 年以上）' };
const SORT_LABEL = { '1y': '近一年', '2y': '近二年', '3y': '近三年', '5y': '近五年' };

function fmt(v, suffix = '%') {
  return (v === null || v === undefined) ? '⚠️缺失' : `${v}${suffix}`;
}

function buildSystemPrompt() {
  return `你是一名严谨又风趣的基金推荐助手，服务于「求一基」趣味抽签工具。

【硬性原则（红线，务必遵守）】
1. 数据真实：所有数字必须以上文「真实基金数据」为准，缺失请标注 ⚠️，绝不编造任何数据或收益。
2. 不预测收益、不给买卖时点、不给目标价；可给份额选择(A/C)、分批、仓位上限等"方式建议"。
3. 常驻免责：内容仅供娱乐与研究参考，不构成投资建议。
4. 必须诚实揭短：主动说明该基金的短板与风险，不得只说好话。
5. 反排行榜思维：不因为"涨最多"就推荐，要解释它凭什么可持续（选股/配置能力）而非赛道 Beta。

【输出要求】只输出一个严格 JSON 对象（不要任何额外文字、不要 Markdown 代码块），结构如下：
{
  "opening": "一句趣味开盲盒文案（≤30字，活泼、有仪式感）",
  "oneLiner": "一句话推荐理由（≤40字）",
  "whyThis": ["为什么是它（带真实数据，3-5条）"],
  "notOthers": ["为什么不是排行榜其它基金（2-3条，体现反排行榜）"],
  "shortBoard": ["这只基金的短板/风险（2-3条，必须诚实）"],
  "suitableFor": "适合哪类投资者（结合风险/持有期）",
  "notSuitableFor": "不适合哪类投资者",
  "buyAdvice": "买入方式建议（份额A/C、分批、仓位上限；不预测、不给指令）",
  "riskNote": "一句话风险提示"
}`;
}

function buildUserPrompt({ fund, type, risk, horizon, sort, candidatesSummary, usedDefaults }) {
  const t = TYPE_LABEL[type] || '混合型';
  const r = RISK_LABEL[risk] || '中等风险偏好';
  const h = HORIZON_LABEL[horizon] || '中期（1-3 年）';
  const s = SORT_LABEL[sort] || '近三年';

  const defaultsNote = usedDefaults && Object.keys(usedDefaults).length
    ? `\n（以下约束使用了默认值，需向用户声明：${Object.entries(usedDefaults).map(([k, v]) => `${k}=${v}`).join('；')}）`
    : '';

  return `【用户前置约束】
- 基金类型：${t}
- 风险偏好：${r}
- 持有期：${h}
- 排序维度：${s}${defaultsNote}

【真实基金数据】（来源：天天基金公开数据快照，已通过价值初筛）
- 名称：${fund.name}（代码 ${fund.code}）
- 类型：${t}
- 单位净值：${fmt(fund.nav)}（日期 ${fund.nav_date || '⚠️缺失'}）
- 近1月：${fmt(fund.r1m)}　近3月：${fmt(fund.r3m)}　近6月：${fmt(fund.r6m)}
- 近1年：${fmt(fund.r1y)}　近2年：${fmt(fund.r2y)}　近3年：${fmt(fund.r3y)}　今年来：${fmt(fund.rytd)}
- 成立以来：${fmt(fund.rsince)}　成立日期：${fund.found || '⚠️缺失'}
- 当前费率：${fmt(fund.fee)}　成立年限：${fund.years ?? '⚠️缺失'} 年　近3年年化：${fmt(fund.cagr3y)}
- 近期是否哑火（近1年为负）：${fund.recent_drag ? '是' : '否'}

【抽签上下文】
${candidatesSummary}
本次为"盲盒随机抽取"（在满足初筛的候选池中随机摇出），并非收益排名最高者。

请基于以上真实数据，输出规定结构的 JSON。`;
}

module.exports = { buildSystemPrompt, buildUserPrompt, TYPE_LABEL, RISK_LABEL, HORIZON_LABEL, SORT_LABEL };
