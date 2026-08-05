// 生成自包含 HTML 深度详情报告（零外部依赖，内联 CSS/SVG）

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(v, suffix = '%') {
  return (v === null || v === undefined) ? '⚠️缺失' : `${v}${suffix}`;
}

// 简单收益条形图（内联 SVG）
function buildChart(fund) {
  const rows = [
    ['近1月', fund.r1m], ['近3月', fund.r3m], ['近6月', fund.r6m],
    ['近1年', fund.r1y], ['近2年', fund.r2y], ['近3年', fund.r3y], ['今年来', fund.rytd],
  ].filter(([, v]) => v !== null && v !== undefined);
  if (!rows.length) return '<p>⚠️ 暂无收益数据</p>';
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)), 1);
  const w = 520, barH = 22, gap = 10, labelW = 60;
  const h = rows.length * (barH + gap) + 10;
  const zeroX = labelW + (w - labelW) / 2;
  let bars = '';
  rows.forEach(([label, v], i) => {
    const y = 5 + i * (barH + gap);
    const len = (Math.abs(v) / max) * ((w - labelW) / 2 - 10);
    const color = v >= 0 ? '#e63946' : '#2a9d8f';
    const x = v >= 0 ? zeroX - len : zeroX;
    bars += `<text x="0" y="${y + barH / 2 + 4}" font-size="12" fill="#333">${label}</text>`;
    bars += `<rect x="${x}" y="${y}" width="${len}" height="${barH}" rx="3" fill="${color}"/>`;
    bars += `<text x="${v >= 0 ? x - 6 : x + len + 6}" y="${y + barH / 2 + 4}" font-size="12" fill="${color}" text-anchor="${v >= 0 ? 'end' : 'start'}">${v}%</text>`;
  });
  bars += `<line x1="${zeroX}" y1="2" x2="${zeroX}" y2="${h - 4}" stroke="#bbb" stroke-width="1"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="业绩走势">${bars}</svg>`;
}

function listHtml(arr, fallbackText) {
  if (!Array.isArray(arr) || !arr.length) return `<li>${esc(fallbackText || '暂无')}</li>`;
  return arr.map((x) => `<li>${esc(x)}</li>`).join('');
}

function generateReport({ id, createdAt, fund, fundType, metrics, reason, userConstraints, usedDefaults, dataSource }) {
  const r = reason && reason.structured ? reason.structured : null;
  const opening = r ? r.opening : '🎉 为你摇出的基金详情';
  const oneLiner = r ? r.oneLiner : (fund.name || '');
  const whyThis = r ? r.whyThis : [];
  const notOthers = r ? r.notOthers : [];
  const shortBoard = r ? r.shortBoard : [];
  const suitableFor = r ? r.suitableFor : '';
  const notSuitableFor = r ? r.notSuitableFor : '';
  const buyAdvice = r ? r.buyAdvice : '';
  const riskNote = r ? r.riskNote : '';

  const defaultsNote = usedDefaults && Object.keys(usedDefaults).length
    ? `<p class="note">⚠️ 本次使用了默认约束：${Object.entries(usedDefaults).map(([k, v]) => `${k}=${v}`).join('；')}</p>`
    : '';

  const constraintsText = userConstraints
    ? `${userConstraints.type || ''} / ${userConstraints.risk || ''} / ${userConstraints.horizon || ''} / ${userConstraints.sort || ''}`
    : '未限定';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>求一基 · ${esc(fund.name)}（${esc(fund.code)}）推荐详情</title>
<style>
  :root{ --red:#e63946; --green:#2a9d8f; --ink:#222; --muted:#777; --line:#eee; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:#f7f8fa;line-height:1.6}
  .wrap{max-width:720px;margin:0 auto;padding:20px 16px 48px}
  .card{background:#fff;border-radius:14px;padding:18px 18px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.04)}
  h1{font-size:22px;margin:0 0 4px}
  .code{color:var(--muted);font-size:13px}
  .tag{display:inline-block;background:#fff3f3;color:var(--red);border-radius:999px;padding:2px 10px;font-size:12px;margin-right:6px}
  .one{font-size:16px;font-weight:600;margin:10px 0}
  h2{font-size:16px;border-left:4px solid var(--red);padding-left:8px;margin:18px 0 8px}
  ul{margin:6px 0;padding-left:20px}
  li{margin:4px 0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 8px;border-bottom:1px solid var(--line)}
  td:first-child{color:var(--muted);width:42%}
  .pos{color:var(--red)} .neg{color:var(--green)}
  .note{color:#b26a00;font-size:13px;background:#fff8ec;padding:8px 10px;border-radius:8px}
  .disclaimer{font-size:12px;color:var(--muted);border-top:1px dashed var(--line);margin-top:18px;padding-top:10px}
  .meta{font-size:12px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <span class="tag">盲盒抽取</span><span class="tag">${esc(fundType)}</span>
    <h1>${esc(fund.name)}</h1>
    <div class="code">基金代码 ${esc(fund.code)} ｜ 数据来源：${esc(dataSource || '未知')}</div>
    <div class="one">${esc(opening)}</div>
    <div class="one" style="color:var(--red)">${esc(oneLiner)}</div>
    ${defaultsNote}
  </div>

  <div class="card">
    <h2>① 关键指标</h2>
    <table>
      <tr><td>单位净值（${esc(metrics.nav_date || '⚠️缺失')}）</td><td>${fmt(metrics.nav, '')}</td></tr>
      <tr><td>近1年</td><td class="${metrics.r1y >= 0 ? 'pos' : 'neg'}">${fmt(metrics.r1y)}</td></tr>
      <tr><td>近3年</td><td class="${metrics.r3y >= 0 ? 'pos' : 'neg'}">${fmt(metrics.r3y)}</td></tr>
      <tr><td>近3年年化</td><td>${fmt(metrics.cagr3y)}</td></tr>
      <tr><td>当前费率</td><td>${fmt(metrics.fee)}</td></tr>
      <tr><td>成立日期 / 年限</td><td>${esc(metrics.found || '⚠️缺失')} / ${esc(metrics.years ?? '⚠️')} 年</td></tr>
      <tr><td>近期是否哑火（近1年为负）</td><td>${metrics.recent_drag ? '是' : '否'}</td></tr>
    </table>
    <h2>② 数据看图说话</h2>
    ${buildChart(metrics)}
  </div>

  <div class="card">
    <h2>③ 为什么是它</h2>
    <ul>${listHtml(whyThis, '暂无')}</ul>
    <h2>④ 为什么不是别的（反排行榜）</h2>
    <ul>${listHtml(notOthers, '盲盒在初筛池中随机会摇出，并非单纯押注收益榜首。')}</ul>
    <h2>⑤ 这只基金的短板</h2>
    <ul>${listHtml(shortBoard, '任何基金均有波动风险，历史业绩不代表未来。')}</ul>
  </div>

  <div class="card">
    <h2>⑥ 适合谁 / 不适合谁</h2>
    <p><b>适合：</b>${esc(suitableFor || '—')}</p>
    <p><b>不适合：</b>${esc(notSuitableFor || '—')}</p>
    <h2>⑦ 买入方式建议</h2>
    <p>${esc(buyAdvice || '建议小额试水、分批买入，单只仓位设上限。')}</p>
    <p class="note">风险提示：${esc(riskNote || '基金有风险，投资需谨慎。')}</p>
  </div>

  <div class="disclaimer">
    <p>用户约束：${esc(constraintsText)}</p>
    <p>保存编号 #${esc(id)} ｜ 生成时间：${esc(createdAt)} ｜ 数据源：${esc(dataSource || '未知')}</p>
    <p>本页面由「求一基」根据公开数据快照与模型生成，仅供娱乐与研究参考，<b>不构成任何投资建议</b>。基金过往业绩不代表未来表现，投资需谨慎。</p>
  </div>
</div>
</body>
</html>`;
}

module.exports = { generateReport };
