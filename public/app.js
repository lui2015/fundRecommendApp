const state = { type: 'mix', risk: '中', horizon: '中', sort: '3y', lastResult: null };

// 筛选 chips
document.querySelectorAll('.chips').forEach((group) => {
  const field = group.dataset.field;
  group.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state[field] = chip.dataset.val;
    });
  });
});

const $ = (sel) => document.querySelector(sel);
const drawBtn = $('#drawBtn');
const loading = $('#loading');
const slot = $('#slot');
const resultEl = $('#result');

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// 抽签动效
let slotTimer = null;
function startSlot() {
  const fake = ['🎲 摇一摇…', '🔮 抽签中…', '🎁 开盲盒…', '✨ 马上揭晓…'];
  let i = 0;
  slotTimer = setInterval(() => { slot.textContent = fake[i % fake.length]; i++; }, 140);
}
function stopSlot() { if (slotTimer) { clearInterval(slotTimer); slotTimer = null; } }

function fmt(v, s = '%') { return (v === null || v === undefined) ? '⚠️缺失' : `${v}${s}`; }
function listHtml(arr, fb) {
  if (!Array.isArray(arr) || !arr.length) return `<li>${fb || '暂无'}</li>`;
  return arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function doDraw() {
  drawBtn.disabled = true;
  resultEl.classList.add('hidden');
  loading.classList.remove('hidden');
  startSlot();
  try {
    const resp = await fetch('api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: state.type, risk: state.risk, horizon: state.horizon, sort: state.sort }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '抽签失败');
    state.lastResult = data;
    renderResult(data);
  } catch (e) {
    showToast('抽签失败：' + e.message);
  } finally {
    stopSlot();
    loading.classList.add('hidden');
    drawBtn.disabled = false;
  }
}

function renderResult(data) {
  const f = data.fund;
  const m = data.metrics || {};
  const r = (data.reason && data.reason.structured) ? data.reason.structured : null;
  const raw = data.reason ? data.reason.raw : '';
  const defaultsNote = data.usedDefaults && Object.keys(data.usedDefaults).length
    ? `<div class="note">⚠️ 使用了默认约束：${Object.entries(data.usedDefaults).map(([k, v]) => `${k}=${v}`).join('；')}</div>` : '';
  const mockNote = data.isMock ? `<div class="note">⚠️ 真实数据源暂不可用，当前为内置示例数据，仅供演示。</div>` : '';

  let reasonHtml;
  if (r) {
    reasonHtml = `
      <div class="block"><h3>为什么是它</h3><ul>${listHtml(r.whyThis)}</ul></div>
      <div class="block"><h3>为什么不是别的（反排行榜）</h3><ul>${listHtml(r.notOthers, '盲盒在初筛池中随机会摇出，并非单纯押注收益榜首。')}</ul></div>
      <div class="block"><h3>这只基金的短板</h3><ul>${listHtml(r.shortBoard, '任何基金均有波动风险，历史业绩不代表未来。')}</ul></div>
      <div class="block">
        <h3>适合谁 / 不适合谁</h3>
        <p><b>适合：</b>${escapeHtml(r.suitableFor || '—')}</p>
        <p><b>不适合：</b>${escapeHtml(r.notSuitableFor || '—')}</p>
      </div>
      <div class="block"><h3>买入方式建议</h3><p>${escapeHtml(r.buyAdvice || '建议小额试水、分批买入，单只仓位设上限。')}</p>
        <p class="note">风险提示：${escapeHtml(r.riskNote || '基金有风险，投资需谨慎。')}</p></div>`;
  } else if (raw) {
    reasonHtml = `<div class="block"><h3>推荐说明</h3><p>${escapeHtml(raw)}</p></div>`;
  } else {
    reasonHtml = `<div class="block"><h3>推荐说明</h3><p>暂无生成内容。</p></div>`;
  }

  resultEl.innerHTML = `
    <div class="tagrow"><span class="tag">盲盒抽取</span><span class="tag">${escapeHtml(f.type)}</span></div>
    <h2>${escapeHtml(f.name)}</h2>
    <div class="code">基金代码 ${escapeHtml(f.code)} ｜ 数据源：${escapeHtml(data.dataSource || '未知')}</div>
    ${r ? `<div class="opening">${escapeHtml(r.opening)}</div><div class="oneliner">${escapeHtml(r.oneLiner)}</div>` : ''}
    ${defaultsNote}${mockNote}
    <div class="block"><h3>关键指标</h3>
      <table class="metrics">
        <tr><td>单位净值（${escapeHtml(m.nav_date || '⚠️')}）</td><td>${fmt(m.nav, '')}</td></tr>
        <tr><td>近1年</td><td class="${m.r1y >= 0 ? 'pos' : 'neg'}">${fmt(m.r1y)}</td></tr>
        <tr><td>近3年</td><td class="${m.r3y >= 0 ? 'pos' : 'neg'}">${fmt(m.r3y)}</td></tr>
        <tr><td>近3年年化</td><td>${fmt(m.cagr3y)}</td></tr>
        <tr><td>当前费率</td><td>${fmt(m.fee)}</td></tr>
        <tr><td>成立 / 年限</td><td>${escapeHtml(m.found || '⚠️')} / ${escapeHtml(m.years ?? '⚠️')} 年</td></tr>
      </table>
    </div>
    ${reasonHtml}
    <div class="actions">
      <button class="btn btn-ghost" id="againBtn">🔄 再求一次</button>
      <button class="btn btn-primary" id="saveBtn">💾 保存本次推荐</button>
      <button class="btn btn-ghost" id="detailBtn">🔍 查看详情</button>
    </div>`;
  resultEl.classList.remove('hidden');

  $('#saveBtn').addEventListener('click', () => saveResult(data));
  $('#againBtn').addEventListener('click', doDraw);
  $('#detailBtn').addEventListener('click', () => {
    // 详情依赖保存后的报告；未保存则先保存再打开
    if (data._savedId) { window.open('api/reports/' + data._savedId, '_blank'); }
    else { saveResult(data, true); }
  });
}

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
    if (thenOpen) window.open('api/reports/' + out.id, '_blank');
    loadHistory();
  } catch (e) {
    showToast('保存失败：' + e.message);
  }
}

async function loadHistory() {
  const list = $('#historyList');
  try {
    const resp = await fetch('api/history?limit=20');
    const data = await resp.json();
    if (!data.rows.length) { list.innerHTML = '<div class="empty">还没有抽签记录，快去求一基吧～</div>'; return; }
    list.innerHTML = data.rows.map((r) => `
      <li>
        <div>
          <div class="h-name">#${r.id} ${escapeHtml(r.fund_name || '')}</div>
          <div class="h-meta">${escapeHtml(r.fund_code || '')} · ${escapeHtml(r.fund_type || '')} · ${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div class="h-actions">
          <button class="mini-btn" data-act="open" data-id="${r.id}">详情</button>
          <button class="mini-btn danger" data-act="del" data-id="${r.id}">删除</button>
        </div>
      </li>`).join('');
    list.querySelectorAll('button[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (b.dataset.act === 'open') window.open('api/reports/' + id, '_blank');
        else delHistory(id);
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="empty">历史加载失败</div>';
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

drawBtn.addEventListener('click', doDraw);
$('#refreshHistory').addEventListener('click', loadHistory);
loadHistory();
