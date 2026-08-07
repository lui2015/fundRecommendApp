/**
 * 基金详情补充数据 —— 从天天基金 pingzhongdata 接口拉取
 * 提供：基金规模、基金经理、持仓信息、资产配置等
 */
const https = require('https');
const http = require('http');

const PZD_URL = 'https://fund.eastmoney.com/pingzhongdata/';
const FUND_GZ_URL = 'https://fundgz.1234567.com.cn/js/';

function fetchJSON(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
        'Accept': '*/*',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.setTimeout(timeoutMs);
  });
}

/**
 * 从 JS 文本中提取 var xxx = value; 格式的数据
 */
function extractVar(text, varName) {
  // 匹配 var name = ...; （支持对象、数组、字符串）
  // 注意：值可能包含分号（如URL），所以用更宽松的匹配
  const patterns = [
    new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;`, 'i'),
    new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;`, 'i'),
    new RegExp(`var\\s+${varName}\\s*=\\"([^"]*)\\"\\s*;`, 'i'),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try { return JSON.parse(m[1]); } catch {}
    }
  }
  return null;
}

/**
 * 解析天天基金 pingzhongdata 的实际数据格式
 */
function parsePzdData(jsText) {
  const result = {};

  // 基本信息
  const codeMatch = jsText.match(/var\s+fS_code\s*=\s*"(\d+)"/);
  if (codeMatch) result.code = codeMatch[1];

  const nameMatch = jsText.match(/var\s+fS_name\s*="([^"]+)"/);
  if (nameMatch) result.name = decodeURIComponent(nameMatch[1]);

  // 费率
  const rateMatch = jsText.match(/var\s+fund_Rate\s*="([^"]*)"/);
  if (rateMatch) result.fundRate = rateMatch[1];
  const srcRateMatch = jsText.match(/var\s+fund_sourceRate\s*="([^"]*)"/);
  if (srcRateMatch) result.sourceRate = srcRateMatch[1];

  // 收益率（补充）
  ['1n', '6y', '3y', '1y'].forEach(k => {
    const m = jsText.match(new RegExp(`var\\s+syl_${k}\\s*=\\s*"([^"]*)"`));
    if (m) result[`syl_${k}`] = m[1];
  });

  // 持仓股票代码
  const stockCodesMatch = jsText.match(/var\s+stockCodes\s*=\s*\[([^\]]*)\]/);
  if (stockCodesMatch) {
    try {
      result.stockCodes = stockCodesMatch[1].split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean);
    } catch {}
  }

  // 基金经理 — 实际格式: [{id,pic,name,star,workTime,fundSize,power:{avr,categories,dsc,data},profit:{...}}]
  try {
    const mgrRaw = extractVar(jsText, 'Data_currentFundManager');
    if (mgrRaw && Array.isArray(mgrRaw)) {
      result.managers = mgrRaw.map(m => ({
        name: m.name || '',
        pic: m.pic || '',
        experience: m.workTime || '',
        star: m.star || 0,
        fundSize: m.fundSize || '',
        score: m.power ? m.power.avr : null,
        profitSeries: m.profit ? m.profit.series : null,
      }));
    }
  } catch {}

  // 资产配置 — 实际格式: {series:[{name,type,data}], categories:[...]}
  try {
    const assetRaw = extractVar(jsText, 'Data_assetAllocation');
    if (assetRaw && assetRaw.series) {
      result.assetAllocation = assetRaw.series.map(s => ({
        type: s.name || '',
        percents: s.data || [],
      }));
      result.assetCategories = assetRaw.categories || [];
    }
  } catch {}

  // 规模变动 — 实际格式: {categories:[dates], series:[{y,mom}]}
  try {
    const scaleRaw = extractVar(jsText, 'Data_fluctuationScale');
    if (scaleRaw && scaleRaw.categories) {
      result.scaleHistory = scaleRaw.categories.map((date, i) => ({
        date: date,
        scale: scaleRaw.series[i] ? scaleRaw.series[i].y : null,
        mom: scaleRaw.series[i] ? scaleRaw.series[i].mom : null,
      }));
    }
  } catch {}

  // 持有人结构 — 实际格式: {series:[{name,data}], categories:[...]}
  try {
    const holderRaw = extractVar(jsText, 'Data_holderStructure');
    if (holderRaw && holderRaw.series) {
      result.holderStructure = holderRaw.series.map(s => ({
        name: s.name || '',
        data: s.data || [],
      }));
      result.holderCategories = holderRaw.categories || [];
    }
  } catch {}

  // 业绩评价
  try {
    const perfRaw = extractVar(jsText, 'Data_performanceEvaluation');
    if (perfRaw) {
      result.performanceEvaluation = perfRaw;
    }
  } catch {}

  // 股票仓位走势
  try {
    const posRaw = extractVar(jsText, 'Data_fundSharesPositions');
    if (posRaw && Array.isArray(posRaw)) {
      result.positionTrend = posRaw.map(p => ({
        timestamp: p[0],
        percent: p[1],
      }));
    }
  } catch {}

  // 净值走势（已有，但确认一下）
  try {
    const nwtRaw = extractVar(jsText, 'Data_netWorthTrend');
    if (nwtRaw) result.netWorthTrend = nwtRaw;
  } catch {}

  return result;
}

/**
 * 获取基金详情补充数据
 */
async function getFundDetail(code) {
  if (!code || !/^\d{6}$/.test(code)) {
    throw new Error('无效基金代码');
  }

  const [pzdText, gzText] = await Promise.allSettled([
    fetchJSON(`${PZD_URL}${code}.js`, 15000),
    fetchJSON(`${FUND_GZ_URL}${code}.js`, 10000),
  ]);

  const detail = { code };

  // 解析 pingzhongdata
  if (pzdText.status === 'fulfilled' && pzdText.value) {
    Object.assign(detail, parsePzdData(pzdText.value));
  }

  // 解析 fundgz 实时数据
  if (gzText.status === 'fulfilled' && gzText.value) {
    const gzMatch = gzText.value.match(/jsonpgz\((\{[\s\S]*?\})\)/);
    if (gzMatch) {
      try {
        const gz = JSON.parse(gzMatch[1]);
        detail.realtimeNav = gz.dwjz;
        detail.realtimeLjjz = gz.ljjz;
        detail.realtimeDate = gz.jzrq;
        detail.realtimeChange = gz.gszzl;
        detail.guzhiTime = gz.gztime;
      } catch {}
    }
  }

  detail.fetchedAt = new Date().toISOString();
  detail.hasDetail = !!(detail.managers?.length || detail.assetAllocation?.length || detail.scaleHistory?.length);

  return detail;
}

module.exports = { getFundDetail };
