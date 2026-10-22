/* ============================================
   求一鸡 · 鸡的体检报告（分析 + 图表 + 补充数据）
   数据来源：sessionStorage('fundDetailData') + /api/fund-detail/:code
   ============================================ */

const $ = (sel) => document.querySelector(sel);

/* ---- 游戏化：按近3年收益给这只鸡评稀有度 ---- */
function getChickenRarity(r3y) {
  const v = Number(r3y);
  if (!Number.isFinite(v)) return { key: 'n', label: '土鸡 · N', emoji: '🐣' };
  if (v >= 80) return { key: 'ssr', label: '金鸡 · SSR', emoji: '🐔' };
  if (v >= 30) return { key: 'sr', label: '银鸡 · SR', emoji: '🐓' };
  if (v >= 5) return { key: 'r', label: '铜鸡 · R', emoji: '🐤' };
  return { key: 'n', label: '土鸡 · N', emoji: '🐣' };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(v, suffix = '%') {
  return (v === null || v === undefined || v === '') ? '--' : `${v}${suffix}`;
}

function listHtml(arr, fb) {
  if (!Array.isArray(arr) || !arr.length) return `<li>${esc(fb || '暂无')}</li>`;
  return arr.map((x) => `<li>${esc(x)}</li>`).join('');
}

/* ---- SVG 收益条形图 ---- */
function buildChart(metrics) {
  const rows = [
    ['近1月', metrics.r1m], ['近3月', metrics.r3m], ['近6月', metrics.r6m],
    ['近1年', metrics.r1y], ['近2年', metrics.r2y], ['近3年', metrics.r3y], ['今年来', metrics.rytd],
  ].filter(([, v]) => v !== null && v !== undefined);
  if (!rows.length) return '<p style="color:var(--text3);font-size:13px">暂无收益数据</p>';

  const max = Math.max(...rows.map(([, v]) => Math.abs(v)), 1);
  const w = 520, barH = 24, gap = 10, labelW = 64;
  const h = rows.length * (barH + gap) + 12;
  const zeroX = labelW + (w - labelW) / 2;
  let bars = '';
  rows.forEach(([label, v], i) => {
    const y = 6 + i * (barH + gap);
    const len = (Math.abs(v) / max) * ((w - labelW) / 2 - 14);
    const color = v >= 0 ? '#f2703c' : '#3fa96b';
    const x = v >= 0 ? zeroX - len : zeroX;
    bars += `<text x="0" y="${y + barH / 2 + 4}" font-size="12" fill="#a2937c">${label}</text>`;
    bars += `<rect x="${x}" y="${y}" width="${Math.max(len, 2)}" height="${barH}" rx="4" fill="${color}" opacity=".88"/>`;
    bars += `<text x="${v >= 0 ? x - 6 : x + len + 6}" y="${y + barH / 2 + 4}" font-size="12" fill="${color}" text-anchor="${v >= 0 ? 'end' : 'start'}">${v}%</text>`;
  });
  bars += `<line x1="${zeroX}" y1="2" x2="${zeroX}" y2="${h - 4}" stroke="#e6d7b8" stroke-width="1" stroke-dasharray="3,3"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="业绩走势" style="max-height:${h}px">${bars}</svg>`;
}

/* ---- 补充详情区块渲染 ---- */
function renderExtraInfo(extra) {
  const container = $('#extraInfo');
  if (!container || !extra) return;

  let html = '';
  let num = 4; // 编号从④开始

  // 实时估值（如果有）
  if (extra.realtimeNav !== undefined) {
    const rtChange = extra.realtimeChange !== undefined ? Number(extra.realtimeChange) : null;
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 实时估值
          <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px">
            ${extra.guzhiTime ? esc(extra.guzitiTime || extra.guzhiTime) : ''}
          </span>
        </div>
        <table class="metrics-table">
          <tr><td>单位净值（${esc(extra.realtimeDate || '--')}）</td>
            <td>${fmt(extra.realtimeNav, '')}</td></tr>
          <tr><td>估算涨跌幅</td>
            <td class="${rtChange >= 0 ? 'val-pos' : 'val-neg'}">${rtChange != null ? fmt(rtChange) : '--'}</td></tr>
          ${extra.realtimeLjjz ? `<tr><td>累计净值</td><td>${fmt(extra.realtimeLjjz, '')}</td></tr>` : ''}
        </table>
      </div>`;
  }

  // 基金规模变动
  if (extra.scaleHistory && extra.scaleHistory.length) {
    const latest = extra.scaleHistory[extra.scaleHistory.length - 1];
    const rows = extra.scaleHistory.slice().reverse().map(s =>
      `<tr><td>${esc(s.date)}</td><td>${s.scale != null ? s.scale + ' 亿' : '--'}</td>${s.mom ? `<td style="color:var(--text3)">${esc(s.mom)}</td>` : ''}</tr>`
    ).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 基金规模</div>
        <table class="metrics-table">
          <tr><td>最新规模（${esc(latest.date)}）</td>
            <td class="val-pos">${latest.scale != null ? latest.scale + ' 亿元' : '--'}</td>
            ${latest.mom ? `<td style="color:var(--text3)">环比 ${esc(latest.mom)}</td>` : ''}</tr>
        </table>
        <div style="margin-top:10px;font-size:12px;color:var(--text3)">历史规模走势</div>
        <table class="metrics-table" style="margin-top:4px">
          <thead><tr><th>日期</th><th>规模(亿)</th><th>环比</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // 基金经理
  if (extra.managers && extra.managers.length) {
    const mgrHtml = extra.managers.map(mgr => `
      <div class="mgr-card">
        <div class="mgr-name">${esc(mgr.name)} ${'★'.repeat(Math.min(mgr.star || 0, 5))}</div>
        <div class="mgr-meta">
          从业年限：${esc(mgr.experience || '--')}
          ${mgr.fundSize ? ` · 管理规模：${esc(mgr.fundSize)}` : ''}
        </div>
        <div class="mgr-meta">
          综合评分：${mgr.score != null ? '<b class="val-pos">' + esc(mgr.score) + '</b>' : '--'}
          ${mgr.profitSeries?.[0]?.data?.[0]?.y != null ? ` · 任期收益：<b class="val-pos">${esc(String(mgr.profitSeries[0].data[0].y))}%</b>` : ''}
        </div>
      </div>`).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 基金经理（${extra.managers.length}人）</div>
        <div class="mgr-list">${mgrHtml}</div>
      </div>`;
  }

  // 资产配置 — 多期数据，取最新一期
  if (extra.assetAllocation && extra.assetAllocation.length && extra.assetCategories) {
    const latestIdx = extra.assetCategories.length - 1;
    const maxVal = Math.max(...extra.assetAllocation.map(a => parseFloat(a.percents?.[latestIdx]) || 0), 1);
    const assetHtml = extra.assetAllocation.map(a => {
      const pct = parseFloat(a.percents?.[latestIdx]) || 0;
      const barW = Math.max(pct / maxVal * 100, pct > 0 ? 4 : 0);
      return `
        <div class="asset-row">
          <span class="asset-label">${esc(a.type)}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar" style="width:${barW}%"></div>
          </div>
          <span class="asset-pct">${fmt(pct)}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 资产配置（截至${esc(extra.assetCategories[latestIdx] || '--')}）</div>
        <div class="asset-list">${assetHtml}</div>
      </div>`;
  }

  // 持有人结构
  if (extra.holderStructure && extra.holderStructure.length && extra.holderCategories) {
    const latestIdx = extra.holderCategories.length - 1;
    const holderHtml = extra.holderStructure.map(h => {
      const val = h.data?.[latestIdx];
      const barW = Math.max((val || 0) * 1.5, val > 0 ? 4 : 0);
      return `
        <div class="asset-row">
          <span class="asset-label" style="width:84px">${esc(h.name)}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar ind-bar" style="width:${Math.min(barW, 100)}%"></div>
          </div>
          <span class="asset-pct">${val != null ? fmt(val, '%') : '--'}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 持有人结构（截至${esc(extra.holderCategories[latestIdx] || '--')}）</div>
        <div class="asset-list">${holderHtml}</div>
      </div>`;
  }

  // 股票仓位走势
  if (extra.positionTrend && extra.positionTrend.length) {
    const recent = extra.positionTrend.slice(-6);
    const maxPos = Math.max(...recent.map(p => p.percent || 0), 1);
    const posHtml = recent.map(p => {
      const barW = Math.max((p.percent || 0) / maxPos * 100, 4);
      const d = new Date(p.timestamp);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return `
        <div class="asset-row">
          <span class="asset-label">${dateStr}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar" style="width:${barW}%;background:linear-gradient(90deg,#ffab3d,#f2703c)"></div>
          </div>
          <span class="asset-pct">${p.percent != null ? p.percent + '%' : '--'}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 股票仓位走势</div>
        <div class="asset-list">${posHtml}</div>
      </div>`;
  }

  // 持仓股票代码（原始列表）
  if (extra.stockCodes && extra.stockCodes.length) {
    const codeList = extra.stockCodes.slice(0, 10).map(c => {
      // 格式可能是 "3005020" -> "300502"
      const cleanCode = c.replace(/\d$/, '');
      return `<span class="hold-code-tag">${esc(cleanCode)}</span>`;
    }).join(' ');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 重仓股票代码（前${Math.min(extra.stockCodes.length, 10)}只）</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0">${codeList}</div>
      </div>`;
  }

  // 业绩评价雷达
  if (extra.performanceEvaluation && extra.performanceEvaluation.data) {
    const pe = extra.performanceEvaluation;
    const maxScore = 100;
    const peHtml = (pe.categories || []).map((cat, i) => {
      const score = pe.data[i] || 0;
      const barW = Math.max(score / maxScore * 100, 4);
      return `
        <div class="asset-row">
          <span class="asset-label" style="width:72px">${esc(cat)}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar ind-bar" style="width:${barW}%"></div>
          </div>
          <span class="asset-pct">${score}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">${num++}</span> 业绩评价（综合${pe.avr || '--'}分）</div>
        <div class="asset-list">${peHtml}</div>
      </div>`;
  }

  if (html) container.innerHTML = html;
  else container.innerHTML = '';
}

/* ---- 主渲染 ---- */
let currentMetrics = {};
function renderDetail(data) {
  const wrap = $('#detailContent');
  const navTitle = $('#navTitle');
  if (!data || !data.fund) {
    wrap.innerHTML = '<div class="no-data">这只鸡跑丢了，请回鸡场重新抓一只</div>';
    return;
  }

  const f = data.fund;
  const m = data.metrics || {};
  currentMetrics = m;
  const r = (data.reason && data.reason.structured) ? data.reason.structured : null;
  const raw = data.reason ? data.reason.raw : '';

  navTitle.textContent = (f.name || '基金详情');

  // 稀有度（游戏化）
  const rarity = getChickenRarity(m.r3y);

  // 标签
  const tags = [
    `<span class="dh-tag dh-tag-rarity ${rarity.key}">${rarity.label}</span>`,
    `<span class="dh-tag dh-tag-blind">随机抓鸡</span>`,
    `<span class="dh-tag dh-tag-type">${esc(f.type || '--')}</span>`,
  ];
  if (data.usedDefaults && Object.keys(data.usedDefaults).length) {
    tags.push(`<span class="dh-tag dh-tag-warn">使用默认约束</span>`);
  }
  if (data.isMock) {
    tags.push(`<span class="dh-tag dh-tag-warn">示例数据</span>`);
  }

  // 分析文案块
  let reasonHtml = '';
  if (r) {
    reasonHtml = `
      <div class="reason-block"><h3>为什么是它</h3><ul>${listHtml(r.whyThis)}</ul></div>
      <div class="reason-block"><h3>为什么不是收益榜首</h3><ul>${listHtml(r.notOthers, '这只鸡是从鸡舍里随机抓的，并非单纯押注收益榜首。')}</ul></div>
      <div class="reason-block"><h3>这只基金的短板</h3><ul>${listHtml(r.shortBoard, '任何基金均有波动风险，历史业绩不代表未来。')}</ul></div>
      <div class="reason-block">
        <h3>适合谁 / 不适合谁</h3>
        <p><b>适合：</b>${esc(r.suitableFor || '—')}</p>
        <p><b>不适合：</b>${esc(r.notSuitableFor || '—')}</p>
      </div>
      <div class="reason-block">
        <h3>买入方式建议</h3>
        <p>${esc(r.buyAdvice || '建议小额试水、分批买入，单只仓位设上限。')}</p>
        <p class="reason-label">风险提示：${esc(r.riskNote || '基金有风险，投资需谨慎。')}</p>
      </div>`;
  } else if (raw) {
    reasonHtml = `<div class="reason-block"><h3>推荐说明</h3><p>${esc(raw)}</p></div>`;
  }

  wrap.innerHTML = `
    <!-- 基金头部 -->
    <div class="detail-header">
      <div class="dh-chicken">${rarity.emoji}</div>
      <div class="dh-tags">${tags.join('')}</div>
      <div class="dh-name">${esc(f.name || '未知基金')}</div>
      <div class="dh-code">${esc(f.code || '')} · 数据源：${esc(data.dataSource || '未知')}</div>
      ${r ? `<div class="dh-opening">🐣 ${esc(r.opening)}</div>` : ''}
      ${r ? `<div class="dh-oneliner">${esc(r.oneLiner)}</div>` : ''}
    </div>

    <!-- 关键指标 -->
    <div class="detail-section">
      <div class="section-title"><span class="num">①</span> 关键指标</div>
      <table class="metrics-table">
        <tr><td>单位净值（${esc(m.nav_date || '--')}）</td><td>${fmt(m.nav, '')}</td></tr>
        <tr><td>近1年收益率</td><td class="${Number(m.r1y) >= 0 ? 'val-pos' : 'val-neg'}">${fmt(m.r1y)}</td></tr>
        <tr><td>近3年收益率</td><td class="${Number(m.r3y) >= 0 ? 'val-pos' : 'val-neg'}">${fmt(m.r3y)}</td></tr>
        <tr><td>近3年年化</td><td>${fmt(m.cagr3y)}</td></tr>
        <tr><td>当前费率</td><td>${fmt(m.fee)}</td></tr>
        <tr><td>成立日期 / 年限</td><td>${esc(m.found || '--')} / ${m.years != null ? m.years : '--'} 年</td></tr>
        <tr><td>近期是否哑火（近1年为负）</td><td>${m.recent_drag ? '是' : '否'}</td></tr>
      </table>

      <div class="section-title" style="margin-top:18px"><span class="num">②</span> 数据看图说话</div>
      <div class="chart-wrap">${buildChart(m)}</div>
    </div>

    <!-- 补充详情占位（异步加载后填充） -->
    <div id="extraInfo"></div>

    <!-- 分析文案 -->
    <div class="detail-section">
      <div class="section-title"><span class="num">③</span> AI 深度分析</div>
      ${reasonHtml}
    </div>

    <!-- 操作栏 -->
    <div class="detail-actions">
      <button class="d-action-btn d-action-ghost" id="backBtnBottom">← 返回鸡场</button>
      <button class="d-action-btn d-action-primary" id="redrawBtn">🐔 再抓一只</button>
    </div>

    <!-- 免责声明 -->
    <div class="disclaimer">
      本报告由「求一鸡」根据公开数据快照与 AI 模型生成，
      仅供娱乐与研究参考，<b>不构成任何投资建议</b>。
      基金过往业绩不代表未来表现，养鸡有风险，投资需谨慎。
    </div>
  `;

  // 绑定事件
  $('#backBtn').onclick = goBack;
  const backBtnBottom = $('#backBtnBottom');
  if (backBtnBottom) backBtnBottom.onclick = goBack;
  const redrawBtn = $('#redrawBtn');
  if (redrawBtn) redrawBtn.onclick = () => { window.history.back(); };

  // 异步拉取补充详情
  if (f.code) {
    fetch(`api/fund-detail/${f.code}`)
      .then(res => res.json())
      .then(resp => {
        if (resp.ok && resp.data) renderExtraInfo(resp.data);
      })
      .catch(err => console.warn('fund-detail fetch failed:', err));
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = './';
  }
}

/* ---- 初始化 ---- */
(function init() {
  try {
    const raw = sessionStorage.getItem('fundDetailData');
    const data = raw ? JSON.parse(raw) : null;
    renderDetail(data);
    sessionStorage.removeItem('fundDetailData');
  } catch (e) {
    console.error('detail init error:', e);
    $('#detailContent').innerHTML = '<div class="no-data">数据解析失败，请回鸡场重新抓一只</div>';
  }
})();
