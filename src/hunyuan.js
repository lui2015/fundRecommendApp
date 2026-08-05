const config = require('./config');
const { buildSystemPrompt, buildUserPrompt } = require('./prompt');

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(t);
  } catch (e) { /* fall through */ }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch (e2) { /* fall through */ }
  }
  return null;
}

async function callHunyuan(userPrompt, systemPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.hunyuan.timeoutMs);
  try {
    const resp = await fetch(config.hunyuan.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.hunyuan.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.hunyuan.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Hunyuan HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

// 生成推荐理由；混元不可用时返回兜底结构化文本
async function generateReason(ctx) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(ctx);
  try {
    const raw = await callHunyuan(user, system);
    const structured = extractJson(raw);
    if (structured && structured.oneLiner) {
      return { ok: true, structured, raw, fallback: false };
    }
    // 返回了文字但不是合规 JSON：包装成单字段
    return {
      ok: true,
      structured: null,
      raw,
      fallback: false,
      plain: true,
    };
  } catch (e) {
    return {
      ok: false,
      structured: makeFallbackReason(ctx),
      raw: '',
      fallback: true,
      error: String(e.message || e),
    };
  }
}

function makeFallbackReason(ctx) {
  const f = ctx.fund;
  const r3y = (f.r3y != null) ? f.r3y : '⚠️缺失';
  return {
    opening: '🎉 盲盒开启！为你摇出一只基金',
    oneLiner: `${f.name}：近3年 ${r3y}%，已通过价值初筛。`,
    whyThis: [
      `近3年收益 ${r3y}%，长期业绩为正，穿越过完整周期。`,
      `成立 ${f.years ?? '⚠️'} 年，运作时间较长，数据具备参考性。`,
      `当前费率 ${f.fee != null ? f.fee + '%' : '⚠️缺失'}，处于合理区间。`,
    ],
    notOthers: ['盲盒在通过初筛的候选池中随机会摇出，并非单纯押注收益榜首。'],
    shortBoard: ['任何基金均有波动风险，历史业绩不代表未来表现。', '缺少深度持仓/经理分析，建议进一步研究。'],
    suitableFor: `风险偏好${ctx.risk || '中'}、持有期${ctx.horizon || '中'}的投资者可关注。`,
    notSuitableFor: '追求短期暴利或无法承受净值波动者不宜重仓。',
    buyAdvice: '建议小额试水、分批买入，单只仓位设上限；不预测收益、不给买卖点。',
    riskNote: '基金有风险，投资需谨慎，本结果仅供娱乐与研究参考。',
  };
}

module.exports = { callHunyuan, generateReason, extractJson, makeFallbackReason };
