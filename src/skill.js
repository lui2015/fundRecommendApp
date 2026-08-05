const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { TYPE_LABEL } = require('./prompt');

const TYPE_MAP = { mix: 'mix', stock: 'stock', bond: 'bond', index: 'index' };
const SORT_MAP = { '1y': '1y', '2y': '2y', '3y': '3y', '5y': '5y' };

// 调用荐基 Skill 的 screen_candidates.py --json
function runSkill({ type = 'mix', sort = '3y', top = 15 }) {
  return new Promise((resolve) => {
    const skillType = TYPE_MAP[type] || 'mix';
    const skillSort = SORT_MAP[sort] || '3y';
    const script = path.join(config.skillDir, 'scripts', 'screen_candidates.py');
    if (!fs.existsSync(script)) {
      return resolve({ ok: false, error: `skill 脚本不存在: ${script}` });
    }
    const args = ['--type', skillType, '--sort', skillSort, '--top', String(top), '--json'];
    let out = '';
    let err = '';
    let p;
    try {
      p = spawn(config.pythonBin, [script, ...args], { timeout: 60000 });
    } catch (e) {
      return resolve({ ok: false, error: String(e) });
    }
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ ok: false, error: String(e) }));
    p.on('close', (code) => {
      if (code !== 0) {
        return resolve({ ok: false, error: (err || `exit ${code}`).slice(0, 300) });
      }
      try {
        const json = JSON.parse(out);
        if (!json.candidates || !json.candidates.length) {
          return resolve({ ok: false, error: 'skill 返回空候选池' });
        }
        resolve({ ok: true, data: json });
      } catch (e) {
        resolve({ ok: false, error: 'json 解析失败: ' + out.slice(0, 200) });
      }
    });
  });
}

// 内置兜底候选池（仅当 skill/网络不可用时使用，界面会明确标注为示例数据）
const FALLBACK = {
  mix: [
    { code: '519196', name: '万家新兴蓝筹混合A', nav: 3.21, nav_date: '2026-08-04', r1m: 4.2, r3m: 8.1, r6m: 12.5, r1y: 18.3, r2y: 35.6, r3y: 62.4, rytd: 9.1, rsince: 210.5, found: '2017-03-01', fee: 1.5, years: 9.4, cagr3y: 17.5, recent_drag: false },
    { code: '519772', name: '华夏行业景气混合A', nav: 2.88, nav_date: '2026-08-04', r1m: 3.1, r3m: 6.4, r6m: 10.2, r1y: 15.0, r2y: 30.1, r3y: 55.8, rytd: 7.7, rsince: 188.0, found: '2018-05-12', fee: 1.5, years: 8.2, cagr3y: 15.9, recent_drag: false },
    { code: '001856', name: '前海开源国家比较优势混合A', nav: 2.45, nav_date: '2026-08-04', r1m: 2.0, r3m: 4.5, r6m: 8.0, r1y: 12.4, r2y: 25.0, r3y: 48.2, rytd: 6.0, rsince: 145.0, found: '2015-09-10', fee: 1.5, years: 10.9, cagr3y: 14.0, recent_drag: false },
  ],
  stock: [
    { code: '001714', name: '易方达新常态混合', nav: 1.95, nav_date: '2026-08-04', r1m: 5.0, r3m: 9.0, r6m: 14.0, r1y: 22.0, r2y: 40.0, r3y: 70.0, rytd: 11.0, rsince: 95.0, found: '2015-04-30', fee: 1.5, years: 11.3, cagr3y: 19.3, recent_drag: false },
    { code: '161725', name: '招商中证白酒指数', nav: 1.12, nav_date: '2026-08-04', r1m: -1.2, r3m: 2.0, r6m: 5.0, r1y: 8.0, r2y: 15.0, r3y: 30.0, rytd: 3.0, rsince: 12.0, found: '2017-08-22', fee: 1.2, years: 8.9, cagr3y: 9.1, recent_drag: true },
  ],
  bond: [
    { code: '003376', name: '广发聚鑫债券A', nav: 1.62, nav_date: '2026-08-04', r1m: 0.6, r3m: 1.5, r6m: 3.0, r1y: 6.0, r2y: 12.0, r3y: 20.0, rytd: 3.2, rsince: 62.0, found: '2016-11-18', fee: 0.8, years: 9.7, cagr3y: 6.3, recent_drag: false },
    { code: '000286', name: '银华信用季季红债券A', nav: 1.31, nav_date: '2026-08-04', r1m: 0.4, r3m: 1.1, r6m: 2.2, r1y: 4.5, r2y: 9.0, r3y: 16.0, rytd: 2.4, rsince: 48.0, found: '2014-03-05', fee: 0.6, years: 12.4, cagr3y: 5.1, recent_drag: false },
  ],
  index: [
    { code: '110020', name: '易方达沪深300ETF联接A', nav: 1.78, nav_date: '2026-08-04', r1m: 1.0, r3m: 2.5, r6m: 6.0, r1y: 10.0, r2y: 18.0, r3y: 28.0, rytd: 5.0, rsince: 78.0, found: '2014-05-20', fee: 1.2, years: 12.2, cagr3y: 8.6, recent_drag: false },
    { code: '011609', name: '国泰中证全指证券公司ETF联接A', nav: 0.95, nav_date: '2026-08-04', r1m: -2.0, r3m: 1.0, r6m: 4.0, r1y: 7.0, r2y: 14.0, r3y: 22.0, rytd: 2.0, rsince: -5.0, found: '2021-03-01', fee: 1.2, years: 5.4, cagr3y: 6.8, recent_drag: true },
  ],
};

function getFallback(type) {
  const key = FALLBACK[type] ? type : 'mix';
  return FALLBACK[key].map((f) => ({ ...f }));
}

module.exports = { runSkill, getFallback, TYPE_LABEL };
