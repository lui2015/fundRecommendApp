/**
 * 基金详情补充数据 —— 从天天基金 pingzhongdata 接口拉取
 * 提供：基金规模、基金经理、前十大持仓、资产配置等
 */
const https = require('https');
const http = require('http');

const PZD_URL = 'http://fund.eastmoney.com/pingzhongdata/';
const FUND_GZ_URL = 'https://fundgz.1234567.com.cn/js/';

function fetchJSON(url, timeoutMs = 10000) {
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
 * 解析天天基金 pingzhongdata 的 JS 变量格式
 * 返回结构化对象
 */
function parsePzdData(jsText) {
  // 提取 var xxx = [...]; 格式的数据
  const result = {};

  // 基金规模（StockCodes 里包含规模信息，或从 Data_netWorthTrend 推断）
  // Data_netWorthTrend: [[时间, 单位净值, 日涨跌, 购买状态]]
  const netWorthMatch = jsText.match(/var\s+Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  if (netWorthMatch) {
    try { result.netWorthTrend = JSON.parse(netWorthMatch[1]); } catch {}
  }

  // Data_currentFundCodeSharesAdd: 持仓变动
  const sharesAddMatch = jsText.match(/var\s+Data_currentFundCodeSharesAdd\s*=\s*(\[[\s\S]*?\]);/);
  if (sharesAddMatch) {
    try { result.sharesChange = JSON.parse(sharesAddMatch[1]); } catch {}
  }

  // fS_code: 基金代码
  const codeMatch = jsText.match(/var\s+fS_code\s*=\s*"(\d+)"/);
  if (codeMatch) result.code = codeMatch[1];

  // fS_name: 基金名称
  const nameMatch = jsText.match(/var\s+fS_name\s*=\s*"([^"]+)"/);
  if (nameMatch) result.name = decodeURIComponent(nameMatch[1]);

  // fund_type: 基金类型
  const typeMatch = jsText.match(/var\s+fund_type\s*=\s*"([^"]*)"/);
  if (typeMatch) result.fundType = typeMatch[1];

  // 基金经理
  const managerMatch = jsText.match(/var\s+Data_FundManagerInfo\s*=\s*(\[[\s\S]*?\]);/);
  if (managerMatch) {
    try {
      const managers = JSON.parse(managerMatch[1]);
      result.managers = managers.map(m => ({
        name: m.MANAGERNAME || '',
        startDate: m.STARTDATE || '',
        experience: m.EXPERIENCE || '',
        totalFundCount: m.FUNDCOUNT || '',
        returnInOffice: m.RETURNINOFFICE || '',
      }));
    } catch {}
  }

  // 前十大持仓
  const holdMatch = jsText.match(/var\s+Data_HoldDateRanks_.*?=\s*(\[[\s\S]*?\]);/);
  if (!holdMatch) {
    // 尝试另一种格式
    const holdMatch2 = jsText.match(/Data_stockCodes\.netvalue\s*=\s*(\[[\s\S]*?\]);/);
    if (holdMatch2) {
      try {
        const raw = JSON.parse(holdMatch2[2]);
        result.topHoldings = raw.slice(0, 10).map(item => ({
          name: item.NAME || item.name || '',
          code: item.CODE || item.code || '',
          percent: item.PERCENT || item.percent || item.RATIO || '',
        }));
      } catch {}
    }
  }

  // 资产配置 - 从 Data_assetAllocation 获取
  const assetMatch = jsText.match(/var\s+Data_assetAllocation\s*=\s*(\[[\s\S]*?\]);/);
  if (assetMatch) {
    try {
      const assets = JSON.parse(assetMatch[1]);
      result.assetAllocation = assets.map(a => ({
        type: a.ASSTYPE || a.type || '',
        percent: a.PERCENT || a.percent || '',
        value: a.MKVOL || a.value || '',
      }));
    } catch {}
  }

  // 基金规模 - 从 Data_scaleTrend 或类似字段获取
  const scaleMatch = jsText.match(/var\s+Data_scaleTrend\s*=\s*(\[[\s\S]*?\]);/);
  if (scaleMatch) {
    try {
      const scales = JSON.parse(scaleMatch[1]);
      // 取最新一条的规模
      if (scales.length > 0) {
        const latest = scales[scales.length - 1];
        result.fundScale = latest.FSRQ ? `${latest.FSRQ} 规模: ${latest.ZZ_E || '--'} 亿` : null;
        result.scaleHistory = scales.slice(-8).map(s => ({
          date: s.FSRQ,
          scale: s.ZZ_E,
          totalShare: s.TOTALSHARE,
        }));
      }
    } catch {}
  }

  // 行业配置
  const industryMatch = jsText.match(/var\s+Data_industryAllo\s*=\s*(\[[\s\S]*?\]);/);
  if (industryMatch) {
    try {
      result.industryAllocation = JSON.parse(industryMatch[1]).map(i => ({
        name: i.INDUSTRYNAME || i.name || '',
        percent: i.PERCENT || i.percent || '',
      }));
    } catch {}
  }

  // 债券持仓（债券型基金）
  const bondHoldMatch = jsText.match(/var\s+Data_bondHolding\s*=\s*(\[[\s\S]*?\]);/);
  if (bondHoldMatch) {
    try {
      result.bondHoldings = JSON.parse(bondHoldMatch[1]).slice(0, 10).map(b => ({
        name: b.BOND_NAME || b.name || '',
        code: b.BOND_CODE || b.code || '',
        percent: b.NET_ASSET_RATIO || b.percent || '',
      }));
    } catch {}
  }

  return result;
}

/**
 * 获取基金详情补充数据
 * @param {string} code - 6位基金代码
 * @returns {Promise<Object>} 详情数据
 */
async function getFundDetail(code) {
  if (!code || !/^\d{6}$/.test(code)) {
    throw new Error('无效基金代码');
  }

  // 并行请求两个接口
  const [pzdText, gzText] = await Promise.allSettled([
    fetchJSON(`${PZD_URL}${code}.js`, 12000),
    fetchJSON(`${FUND_GZ_URL}${code}.js`, 8000),
  ]);

  const detail = { code };

  // 解析 pingzhongdata
  if (pzdText.status === 'fulfilled' && pzdText.value) {
    Object.assign(detail, parsePzdData(pzdText.value));
  }

  // 解析 fundgz 实时数据（含最新净值日期、涨跌幅）
  if (gzText.status === 'fulfilled' && gzText.value) {
    const gzMatch = gzText.value.match(/jsonpgz\((\{[\s\S]*?\})\)/);
    if (gzMatch) {
      try {
        const gz = JSON.parse(gzMatch[1]);
        detail.realtimeNav = gz.dwjz;       // 单位净值
        detail.realtimeLjjz = gz.ljjz;       // 累计净值
        detail.realtimeDate = gz.jzrq;       // 净值日期
        detail.realtimeChange = gz.gszzl;    // 估算涨跌幅
        detail.realtimeName = gz.name;       // 名称(可能有更新)
        detail.guzhiTime = gz.gztime;        // 估值时间
      } catch {}
    }
  }

  // 标记数据来源
  detail.fetchedAt = new Date().toISOString();
  detail.hasDetail = !!(detail.managers || detail.topHoldings || detail.assetAllocation);

  return detail;
}

module.exports = { getFundDetail };
