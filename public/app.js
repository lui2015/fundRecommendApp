/* ============================================
   求一基 · 前端交互逻辑
   老虎机数字滚动 + 筛选 + 结果渲染 + 保存/历史
   ============================================ */

const state = {
  type: 'mix', risk: '中', horizon: '中', sort: '3y',
  lastResult: null, isDrawing: false
};

// ---- DOM 引用 ----
const $ = (sel) => document.querySelector(sel);
const drawBtn = $('#drawBtn');
const saveBtn = $('#saveBtn');
const wishPanel = $('#wishPanel');
const wishText = $('#wishText');
const slotStatus = $('#slotStatus');
const statusMsg = $('#statusMsg');
const digitRow = $('#digitRow');
const resultPanel = $('#resultPanel');
const resultSummary = $('#resultSummary');
const summaryFundName = $('#summaryFundName');
const summaryOneliner = $('#summaryOneliner');
const historyList = $('#historyList');
const toastEl = $('#toast');
const drawer = $('#drawer');
const drawerOverlay = $('#drawerOverlay');

// ---- Toast ----
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

// ---- 筛选绑定 ----
$('#selType').addEventListener('change', (e) => { state.type = e.target.value || 'mix'; });
$('#selRisk').addEventListener('change', (e) => { state.risk = e.target.value || '中'; });
$('#selHorizon').addEventListener('change', (e) => { state.horizon = e.target.value || '中'; });
$('#selSort').addEventListener('change', (e) => { state.sort = e.target.value || '3y'; });

// ---- 老虎机数字滚动动画 ----
let spinTimers = [];

function resetDigits() {
  digitRow.querySelectorAll('.digit-box').forEach((box) => {
    box.className = 'digit-box';
    box.querySelector('.digit').className = 'digit';
    box.querySelector('.digit').textContent = '-';
  });
}

function startSpin() {
  resetDigits();
  // 显示等待摇奖
  wishText.classList.add('hidden');
  slotStatus.classList.remove('hidden');
  statusMsg.textContent = '等待摇奖…';

  const boxes = digitRow.querySelectorAll('.digit-box');
  boxes.forEach((box) => box.classList.add('rolling'));

  // 每个格子独立滚动
  boxes.forEach((box, idx) => {
    const digitEl = box.querySelector('.digit');
    digitEl.classList.add('spinning');
    const delay = idx * 80; // 从左到右依次启动
    const timer = setInterval(() => {
      digitEl.textContent = Math.floor(Math.random() * 10);
    }, 60 + idx * 15);
    spinTimers.push({ timer, box, digitEl, idx, started: Date.now(), delay });
  });
}

function revealDigits(codeStr) {
  // 逐个停止，从左到右
  spinTimers.forEach(({ timer, box, digitEl, idx, started, delay }) => {
    const elapsed = Date.now() - started;
    const baseStop = 800 + idx * 200; // 基础滚动时长
    const remaining = Math.max(50, baseStop - elapsed);

    setTimeout(() => {
      clearInterval(timer);
      digitEl.classList.remove('spinning');
      digitEl.textContent = codeStr[idx] || '-';
      box.classList.remove('rolling');
      box.classList.add('revealed');

      // 最后一个停止后切换状态
      if (idx === codeStr.length - 1) {
        setTimeout(() => {
          slotStatus.classList.add('hidden');
          // 不再默认显示"心 想 事 成"，等 renderResult 后才展示提炼卡片
          wishText.classList.add('hidden');
          // LED 全亮
          document.querySelectorAll('.led-bar .dot').forEach((d, i) => {
            setTimeout(() => d.classList.add('active'), i * 40);
          });
        }, 300);
      }
    }, remaining);
  });
  spinTimers = [];
}

function stopSpin(codeStr) {
  // 如果还没开始滚动就直接显示
  if (!spinTimers.length) {
    resetDigits();
    const boxes = digitRow.querySelectorAll('.digit-box');
    codeStr.split('').forEach((ch, i) => {
      if (boxes[i]) {
        boxes[i].querySelector('.digit').textContent = ch;
        boxes[i].classList.add('revealed');
      }
    });
    slotStatus.classList.add('hidden');
    wishText.classList.add('hidden'); // 等 renderResult 填充提炼卡片
    return;
  }
  revealDigits(codeStr);
}

// ---- 工具函数 ----
function fmt(v, s = '%') {
  return (v === null || v === undefined) ? '--' : `${v}${s}`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function listHtml(arr, fb) {
  if (!Array.isArray(arr) || !arr.length) return `<li class="reason-label">${fb || '暂无'}</li>`;
  return arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
}

// ---- 抽签主流程 ----
async function doDraw() {
  if (state.isDrawing) return;
  state.isDrawing = true;
  drawBtn.disabled = true;
  resultPanel.classList.add('hidden');
  saveBtn.disabled = true;
  // 重置提炼卡片
  resultSummary.classList.add('hidden');
  wishText.classList.remove('hidden');
  wishText.textContent = '心 想 事 成';
  wishPanel.classList.remove('has-result');
  wishPanel.onclick = null;

  startSpin();

  try {
    const resp = await fetch('api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: state.type,
        risk: state.risk,
        horizon: state.horizon,
        sort: state.sort
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '抽签失败');

    state.lastResult = data;

    // 老虎机停转显示基金代码
    const code = (data.fund && data.fund.code) || '------';
    stopSpin(code);

    // 稍等动画完成后渲染结果
    setTimeout(() => renderResult(data), 600);

  } catch (e) {
    spinTimers.forEach(t => clearInterval(t.timer));
    spinTimers = [];
    resetDigits();
    slotStatus.classList.add('hidden');
    wishText.classList.remove('hidden');
    wishText.textContent = '心 想 事 成';
    resultSummary.classList.add('hidden');
    wishPanel.classList.remove('has-result');
    wishPanel.onclick = null;
    showToast('抽签失败：' + e.message);
    state.isDrawing = false;
    drawBtn.disabled = false;
  }
}

// ---- 渲染结果 ----
function renderResult(data) {
  const f = data.fund;
  const m = data.metrics || {};
  const r = (data.reason && data.reason.structured) ? data.reason.structured : null;
  const raw = data.reason ? data.reason.raw : '';

  const defaultsNote = data.usedDefaults && Object.keys(data.usedDefaults).length
    ? `<span class="tag tag-warn">使用了默认约束：${Object.entries(data.usedDefaults).map(([k, v]) => `${k}=${v}`).join('；')}</span>`
    : '';
  const mockNote = data.isMock
    ? `<span class="tag tag-warn">当前为内置示例数据（真实数据源暂不可用）</span>`
    : '';

  let reasonHtml = '';
  if (r) {
    reasonHtml = `
      <div class="reason-block"><h3>为什么是它</h3><ul>${listHtml(r.whyThis)}</ul></div>
      <div class="reason-block"><h3>为什么不是收益榜首</h3><ul>${listHtml(r.notOthers, '盲盒在初筛池中随机会摇出，并非单纯押注收益榜首。')}</ul></div>
      <div class="reason-block"><h3>这只基金的短板</h3><ul>${listHtml(r.shortBoard, '任何基金均有波动风险，历史业绩不代表未来。')}</ul></div>
      <div class="reason-block">
        <h3>适合谁 / 不适合谁</h3>
        <p><b>适合：</b>${escapeHtml(r.suitableFor || '—')}</p>
        <p><b>不适合：</b>${escapeHtml(r.notSuitableFor || '—')}</p>
      </div>
      <div class="reason-block">
        <h3>买入方式建议</h3>
        <p>${escapeHtml(r.buyAdvice || '建议小额试水、分批买入，单只仓位设上限。')}</p>
        <p class="reason-label">风险提示：${escapeHtml(r.riskNote || '基金有风险，投资需谨慎。')}</p>
      </div>`;
  } else if (raw) {
    reasonHtml = `<div class="reason-block"><h3>推荐说明</h3><p>${escapeHtml(raw)}</p></div>`;
  }

  // 填充提炼卡片（在 wishPanel 区域）
  const oneLiner = r ? (r.oneLiner || '') : (raw ? raw : '');
  summaryFundName.textContent = f.name || '未知基金';
  summaryOneliner.textContent = oneLiner || (f.type || '') + '型基金';
  resultSummary.classList.remove('hidden');
  wishText.classList.add('hidden');
  wishPanel.classList.add('has-result');

  // 点击提炼卡片 → 展开/收起详情面板
  wishPanel.onclick = () => {
    if (resultPanel.classList.contains('hidden')) {
      resultPanel.classList.remove('hidden');
      // 滚动到详情面板可见区域
      setTimeout(() => resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } else {
      resultPanel.classList.add('hidden');
    }
  };

  // 详情面板内容（完整数据）
  resultPanel.innerHTML = `
    <div class="res-header">
      <div class="res-tags">
        <span class="tag tag-blind">盲盒抽取</span>
        <span class="tag tag-type">${escapeHtml(f.type || '')}</span>
        ${defaultsNote}${mockNote}
      </div>
      <div class="res-fund-name">${escapeHtml(f.name || '未知基金')}</div>
      <div class="res-code">${escapeHtml(f.code || '')} · 数据源：${escapeHtml(data.dataSource || '未知')}</div>
    </div>
    ${r ? `<div class="res-opening">${escapeHtml(r.opening)}</div><div class="res-oneliner">${escapeHtml(r.oneLiner)}</div>` : ''}
    <table class="metrics-table">
      <tr><td>单位净值（${escapeHtml(m.nav_date || '--')}）</td><td>${fmt(m.nav, '')}</td></tr>
      <tr><td>近1年收益率</td><td class="${Number(m.r1y) >= 0 ? 'pos' : 'neg'}">${fmt(m.r1y)}</td></tr>
      <tr><td>近3年收益率</td><td class="${Number(m.r3y) >= 0 ? 'pos' : 'neg'}">${fmt(m.r3y)}</td></tr>
      <tr><td>近3年年化</td><td>${fmt(m.cagr3y)}</td></tr>
      <tr><td>当前费率</td><td>${fmt(m.fee)}</td></tr>
      <tr><td>成立 / 年限</td><td>${escapeHtml(m.found || '--')} / ${m.years != null ? m.years : '--'} 年</td></tr>
    </table>
    ${reasonHtml}
    <div class="res-actions">
      <button class="res-btn res-btn-ghost" id="againBtn">&#8635; 再求一次</button>
      <button class="res-btn res-btn-primary" id="detailBtn">&#128270; 查看详情报告</button>
    </div>`;

  resultPanel.classList.remove('hidden');
  saveBtn.disabled = false;

  // 绑定事件
  $('#againBtn').addEventListener('click', doDraw);
  $('#detailBtn').addEventListener('click', () => {
    if (data._savedId) window.open('api/reports/' + data._savedId, '_blank');
    else saveResult(data, true);
  });

  state.isDrawing = false;
  drawBtn.disabled = false;
}

// ---- 保存 ----
async function saveResult(data, thenOpen) {
  try {
    const payload = {
      fund: data.fund,
      metrics: data.metrics,
      reason: data.reason,
      seed: data.seed,
      usedDefaults: data.usedDefaults,
      dataSource: data.dataSource,
      userConstraints: data.userConstraints,
    };
    const resp = await fetch('api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await resp.json();
    if (!resp.ok) throw new Error(out.error || '保存失败');
    data._savedId = out.id;
    showToast('已收入盲盒记录 #' + out.id);
    saveBtn.disabled = true;
    if (thenOpen) window.open('api/reports/' + out.id, '_blank');
    loadHistory();
  } catch (e) {
    showToast('保存失败：' + e.message);
  }
}

// ---- 历史 ----
async function loadHistory() {
  try {
    const resp = await fetch('api/history?limit=20');
    const data = await resp.json();
    if (!data.rows.length) {
      historyList.innerHTML = '<li class="empty-state">还没有抽签记录，快去求一基吧～</li>';
      return;
    }
    historyList.innerHTML = data.rows.map((r) => `
      <li>
        <div class="h-info">
          <div class="h-name">#${r.id} ${escapeHtml(r.fund_name || '')}</div>
          <div class="h-meta">${escapeHtml(r.fund_code || '')} · ${escapeHtml(r.fund_type || '')} · ${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div class="h-actions">
          <button class="mini-btn" data-act="open" data-id="${r.id}">详情</button>
          <button class="mini-btn del" data-act="del" data-id="${r.id}">删除</button>
        </div>
      </li>`).join('');

    historyList.querySelectorAll('button[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (b.dataset.act === 'open') window.open('api/reports/' + id, '_blank');
        else delHistory(id);
      });
    });
  } catch (e) {
    historyList.innerHTML = '<li class="empty-state">历史加载失败</li>';
  }
}

async function delHistory(id) {
  if (!confirm('确定删除该抽签记录？')) return;
  try {
    const resp = await fetch('api/history/' + id, { method: 'DELETE' });
    if (resp.ok) { showToast('已删除'); loadHistory(); }
    else showToast('删除失败');
  } catch (e) { showToast('删除失败'); }
}

// ---- 侧边栏（更多菜单） ----
function openDrawer() {
  drawer.classList.add('open');
  drawerOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  // 打开时加载历史
  loadHistory();
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawerOverlay.classList.remove('show');
  document.body.style.overflow = '';
}
$('#menuBtn').addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
// ESC 关闭
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

// ---- 事件绑定 ----
drawBtn.addEventListener('click', doDraw);
saveBtn.addEventListener('click', () => {
  if (state.lastResult) saveResult(state.lastResult, false);
});
$('#refreshHistory').addEventListener('click', loadHistory);

// ---- 初始化 ----
loadHistory();
