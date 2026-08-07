/* ============================================
   求一基 · 详情页渲染（整合弹窗分析 + 报告图表 + 补充数据）
   数据来源：sessionStorage('fundDetailData') + /api/fund-detail/:code
   ============================================ */

const $ = (sel) => document.querySelector(sel);

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
    const color = v >= 0 ? '#e63946' : '#2ecc71';
    const x = v >= 0 ? zeroX - len : zeroX;
    bars += `<text x="0" y="${y + barH / 2 + 4}" font-size="12" fill="#9999aa">${label}</text>`;
    bars += `<rect x="${x}" y="${y}" width="${Math.max(len, 2)}" height="${barH}" rx="4" fill="${color}" opacity=".88"/>`;
    bars += `<text x="${v >= 0 ? x - 6 : x + len + 6}" y="${y + barH / 2 + 4}" font-size="12" fill="${color}" text-anchor="${v >= 0 ? 'end' : 'start'}">${v}%</text>`;
  });
  bars += `<line x1="${zeroX}" y1="2" x2="${zeroX}" y2="${h - 4}" stroke="#333" stroke-width="1" stroke-dasharray="3,3"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="业绩走势" style="max-height:${h}px">${bars}</svg>`;
}

/* ---- 补充详情区块渲染 ---- */
function renderExtraInfo(extra) {
  const container = $('#extraInfo');
  if (!container || !extra) return;

  let html = '';

  // 基金规模
  if (extra.fundScale || extra.scaleHistory) {
    let scaleRows = '';
    if (extra.scaleHistory && extra.scaleHistory.length) {
      scaleRows = extra.scaleHistory.slice().reverse().map(s =>
        `<tr><td>${esc(s.date)}</td><td>${s.scale != null ? s.scale + ' 亿' : '--'}</td></tr>`
      ).join('');
      // 取最新规模
      const latest = extra.scaleHistory[extra.scaleHistory.length - 1];
      html += `
        <div class="detail-section">
          <div class="section-title"><span class="num">④</span> 基金规模</div>
          <table class="metrics-table">
            <tr><td>最新规模（${esc(latest.date)}）</td>
              <td class="val-pos">${latest.scale != null ? latest.scale + ' 亿元' : '--'}</td></tr>
          </table>
          <div style="margin-top:10px;font-size:12px;color:var(--text3)">历史规模走势</div>
          <table class="metrics-table" style="margin-top:4px">${scaleRows}</table>
        </div>`;
    } else if (extra.fundScale) {
      html += `
        <div class="detail-section">
          <div class="section-title"><span class="num">④</span> 基金规模</div>
          <table class="metrics-table">
            <tr><td>基金规模</td><td>${esc(extra.fundScale)}</td></tr>
          </table>
        </div>`;
    }
  }

  // 基金经理
  if (extra.managers && extra.managers.length) {
    const mgrHtml = extra.managers.map(mgr => `
      <div class="mgr-card">
        <div class="mgr-name">${esc(mgr.name)}</div>
        <div class="mgr-meta">
          任职起：${esc(mgr.startDate)}
          ${mgr.experience ? ` · 从业年限：${esc(mgr.experience)}` : ''}
        </div>
        <div class="mgr-meta">
          管理基金数：${esc(mgr.totalFundCount || '--')}
          ${mgr.returnInOffice ? ` · 任期回报：<b class="val-pos">${esc(mgr.returnInOffice)}</b>` : ''}
        </div>
      </div>`).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">⑤</span> 基金经理（${extra.managers.length}人）</div>
        <div class="mgr-list">${mgrHtml}</div>
      </div>`;
  }

  // 资产配置
  if (extra.assetAllocation && extra.assetAllocation.length) {
    const assetTotal = extra.assetAllocation.reduce((sum, a) => sum + (parseFloat(a.percent) || 0), 0);
    const maxAsset = Math.max(...extra.assetAllocation.map(a => parseFloat(a.percent) || 0), 1);
    const assetHtml = extra.assetAllocation.map(a => {
      const pct = parseFloat(a.percent) || 0;
      const barW = Math.max(pct / maxAsset * 100, pct > 0 ? 4 : 0);
      return `
        <div class="asset-row">
          <span class="asset-label">${esc(a.type)}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar" style="width:${barW}%"></div>
          </div>
          <span class="asset-pct">${fmt(a.percent)}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">⑥</span> 资产配置</div>
        <div class="asset-list">${assetHtml}</div>
      </div>`;
  }

  // 行业配置
  if (extra.industryAllocation && extra.industryAllocation.length) {
    const topIndustries = extra.industryAllocation.slice(0, 8);
    const indMax = Math.max(...topIndustries.map(i => parseFloat(i.percent) || 0), 1);
    const indHtml = topIndustries.map(i => {
      const pct = parseFloat(i.percent) || 0;
      const barW = Math.max(pct / indMax * 100, pct > 0 ? 4 : 0);
      return `
        <div class="asset-row">
          <span class="asset-label">${esc(i.name)}</span>
          <div class="asset-bar-wrap">
            <div class="asset-bar ind-bar" style="width:${barW}%"></div>
          </div>
          <span class="asset-pct">${fmt(i.percent)}</span>
        </div>`;
    }).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">⑦</span> 行业配置（前${topIndustries.length}）</div>
        <div class="asset-list">${indHtml}</div>
      </div>`;
  }

  // 前十大持仓
  if (extra.topHoldings && extra.topHoldings.length) {
    const holdHtml = extra.topHoldings.map(h => `
      <tr>
        <td>${esc(h.name)}</td>
        <td class="hold-code">${esc(h.code)}</td>
        <td class="val-pos">${fmt(h.percent)}</td>
      </tr>`).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">⑧</span> 前十大持仓</div>
        <table class="metrics-table hold-table">
          <thead><tr><th>名称</th><th>代码</th><th>占比</th></tr></thead>
          <tbody>${holdHtml}</tbody>
        </table>
      </div>`;
  }

  // 债券持仓
  if (extra.bondHoldings && extra.bondHoldings.length) {
    const bondHtml = extra.bondHoldings.map(b => `
      <tr>
        <td>${esc(b.name)}</td>
        <td class="hold-code">${esc(b.code)}</td>
        <td class="val-pos">${fmt(b.percent)}</td>
      </tr>`).join('');
    html += `
      <div class="detail-section">
        <div class="section-title"><span class="num">⑨</span> 前五大债券持仓</div>
        <table class="metrics-table hold-table">
          <thead><tr><th>债券名称</th><th>代码</th><th>占比</th></tr></thead>
          <tbody>${bondHtml}</tbody>
        </table>
      </div>`;
  }

  // 实时估值补充
  if (extra.realtimeNav !== undefined) {
    const rtChange = extra.realtimeChange !== undefined ? Number(extra.realtimeChange) : null;
    html = `
      <div class="detail-section" id="realtimeSection">
        <div class="section-title"><span class="num">④</span> 实时估值
          <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px">
            ${extra.guzhiTime ? esc(extra.guzitiTime || extra.guzhiTime) : ''}
          </span>
        </div>
        <table class="metrics-table">
          <tr><td>单位净值（${esc(extra.realtimeDate || m.nav_date || '--')}）</td>
            <td>${fmt(extra.realtimeNav, '')}</td></tr>
          <tr><td>估算涨跌幅</td>
            <td class="${rtChange >= 0 ? 'val-pos' : 'val-neg'}">${rtChange != null ? fmt(rtChange) : '--'}</td></tr>
          ${extra.realtimeLjjz ? `<tr><td>累计净值</td><td>${fmt(extra.realtimeLjjz, '')}</td></tr>` : ''}
        </table>
      </div>` + html;

    // 更新后续编号
    html = html.replace(/<span class="num">④<\/span>/g, '<span class="num">④</span>')
               .replace(/<span class="num">⑤<\/span>/g, '<span class="num">⑤</span>')
               .replace(/<span class="num">⑥<\/span>/g, '<span class="num">⑥</span>')
               .replace(/<span class="num">⑦<\/span>/g, '<span class="num">⑦</span>')
               .replace(/<span class="num">⑧<\/span>/g, '<span class="num">⑧</span>')
               .replace(/<span class="num">⑨<\/span>/g, '<span class="num">⑨</span>');
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
    wrap.innerHTML = '<div class="no-data">数据丢失，请返回重新抽签</div>';
    return;
  }

  const f = data.fund;
  const m = data.metrics || {};
  currentMetrics = m;
  const r = (data.reason && data.reason.structured) ? data.reason.structured : null;
  const raw = data.reason ? data.reason.raw : '';

  navTitle.textContent = (f.name || '基金详情');

  // 标签
  const tags = [
    `<span class="dh-tag dh-tag-blind">盲盒抽取</span>`,
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
      <div class="reason-block"><h3>为什么不是收益榜首</h3><ul>${listHtml(r.notOthers, '盲盒在初筛池中随机会摇出，并非单纯押注收益榜首。')}</ul></div>
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
      <div class="dh-tags">${tags.join('')}</div>
      <div class="dh-name">${esc(f.name || '未知基金')}</div>
      <div class="dh-code">${esc(f.code || '')} · 数据源：${esc(data.dataSource || '未知')}</div>
      ${r ? `<div class="dh-opening">🎯 ${esc(r.opening)}</div>` : ''}
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
      <button class="d-action-btn d-action-ghost" id="backBtnBottom">← 返回抽签</button>
      <button class="d-action-btn d-action-primary" id="redrawBtn">🎰 再求一次</button>
    </div>

    <!-- 免责声明 -->
    <div class="disclaimer">
      本页面由「求一基」根据公开数据快照与 AI 模型生成，
      仅供娱乐与研究参考，<b>不构成任何投资建议</b>。
      基金过往业绩不代表未来表现，投资需谨慎。
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
    $('#detailContent').innerHTML = '<div class="no-data">数据解析失败，请返回重新抽签</div>';
  }
})();
