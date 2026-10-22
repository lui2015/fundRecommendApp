/* ============================================
   求一鸡 · 前端交互逻辑（养鸡场版）
   开笼抓鸡 + 养殖偏好 + 结果渲染 + 收进鸡栏
   ============================================ */

const state = {
  type: 'mix', risk: '中', horizon: '中', sort: '3y',
  lastResult: null, isDrawing: false
};

// ---- 自选基金（localStorage） ----
const FAV_KEY = 'fund_fav_v1';
function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
function saveFavs(arr) { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }
function isFav(code) { return getFavs().some(f => f.code === code); }
function toggleFav(fund, metrics) {
  const favs = getFavs();
  const idx = favs.findIndex(f => f.code === fund.code);
  if (idx >= 0) { favs.splice(idx, 1); showToast('已放归野外'); }
  else {
    if (favs.length >= 20) { showToast('自选最多 20 只，请先移除一些'); return false; }
    favs.unshift({ code: fund.code, name: fund.name, type: fund.type, fee: (metrics || {}).fee, r3y: (metrics || {}).r3y, years: (metrics || {}).years, addedAt: Date.now() });
    showToast('已住进鸡窝 &#9733;');
  }
  saveFavs(favs); renderFavBtn(fund.code); renderFavList(); return true;
}
function renderFavBtn(code) {
  const btn = $('#favBtn');
  if (!btn) return;
  const active = isFav(code);
  btn.textContent = active ? '★' : '☆';
  btn.classList.toggle('on', active);
  btn.title = active ? '放归野外' : '放进鸡窝';
}
function renderFavList() {
  const list = $('#favList');
  const countEl = $('#favCount');
  if (!list) return;
  const favs = getFavs();
  if (countEl) countEl.textContent = favs.length;
  if (!favs.length) { list.innerHTML = '<li class="empty-state">鸡窝还空着，抓到的鸡点 &#9734; 就能住进来</li>'; return; }
  list.innerHTML = favs.map((f) => `
    <li class="fav-item">
      <div class="fav-info">
        <div class="fav-name">${escapeHtml(f.name || '')}</div>
        <div class="fav-meta">${escapeHtml(f.code || '')} · ${escapeHtml(f.type || '')}${f.fee != null ? ' · 费率' + fmt(f.fee) : ''}</div>
      </div>
      <button class="mini-btn del" data-fav-del="${escapeHtml(f.code)}">移除</button>
    </li>`).join('');
  list.querySelectorAll('[data-fav-del]').forEach(b => {
    b.addEventListener('click', () => {
      const code = b.dataset.favDel;
      const favs = getFavs().filter(f => f.code !== code);
      saveFavs(favs);
      renderFavBtn(code);
      renderFavList();
      showToast('已放归野外');
    });
  });
}

// ---- DOM 引用 ----
const $ = (sel) => document.querySelector(sel);
const drawBtn = $('#drawBtn');
const saveBtn = $('#saveBtn');
const wishPanel = $('#wishPanel');
const wishText = $('#wishText');
const slotStatus = $('#slotStatus');
const statusMsg = $('#statusMsg');
const digitRow = $('#digitRow');
const modalOverlay = $('#modalOverlay');
const resultPanel = $('#resultPanel');
const modalClose = $('#modalClose');
const modalBody = $('#modalBody');
const resultSummary = $('#resultSummary');
const summaryFundName = $('#summaryFundName');
const summaryCode = $('#summaryCode');
const summaryTags = $('#summaryTags');
const summaryMetrics = $('#summaryMetrics');
const summaryOneliner = $('#summaryOneliner');
const summaryChicken = $('#summaryChicken');
const historyList = $('#historyList');
const toastEl = $('#toast');
const favBtn = $('#favBtn');
const favList = $('#favList');
const drawer = $('#drawer');
const drawerOverlay = $('#drawerOverlay');
const slogan = document.querySelector('.slogan');
const particlesEl = $('#particles');
const chickenEl = $('#chicken');

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
  // 显示抓鸡中（鸡舍开门态）
  wishText.classList.add('hidden');
  slotStatus.classList.remove('hidden');
  wishPanel.classList.add('loading');
  statusMsg.textContent = '鸡舍开门中…';
  spawnLoadingParticles();

  // 触发 LED 跑马灯动效
  document.querySelector('.slot-machine').classList.add('rolling');

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

      // 闪光冲击波
      const flash = document.createElement('div');
      flash.className = 'reveal-flash';
      box.appendChild(flash);
      setTimeout(() => flash.remove(), 650);

      // 最后一个停止后切换状态
      if (idx === codeStr.length - 1) {
        setTimeout(() => {
          slotStatus.classList.add('hidden');
          wishPanel.classList.remove('loading');
          clearLoadingParticles();
          // 不再默认显示"心 想 事 成"，等 renderResult 后才展示提炼卡片
          wishText.classList.add('hidden');
          // 移除摇奖中动效，LED 全亮
          document.querySelector('.slot-machine').classList.remove('rolling');
          document.querySelectorAll('.led-bar .dot').forEach((d, i) => {
            setTimeout(() => d.classList.add('active'), i * 40);
          });
          // 移除蓄能动效
          drawBtn.classList.remove('charging');
          if (slogan) slogan.classList.remove('flash');
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
function resetUI() {
  spinTimers.forEach(t => clearInterval(t.timer));
  spinTimers = [];
  resetDigits();
  closeModal(); // 关闭弹框
  slotStatus.classList.add('hidden');
  wishPanel.classList.remove('loading');
  clearLoadingParticles();
  wishText.classList.remove('hidden');
  wishText.innerHTML = '<span class="char">等</span><span class="char">待</span><span class="char">开</span><span class="char">笼</span>';
  resultSummary.classList.add('hidden');
  wishPanel.classList.remove('has-result');
  wishPanel.onclick = null;
  drawBtn.classList.remove('charging');
  if (slogan) slogan.classList.remove('flash');
  state.isDrawing = false;
  drawBtn.disabled = false;
  saveBtn.disabled = true;
  if (chickenEl) chickenEl.textContent = '🐔';
  if (summaryChicken) summaryChicken.textContent = '🐔';
}
// ---- 游戏化：按近3年收益给这只鸡评稀有度 ----
function getChickenRarity(r3y) {
  const v = Number(r3y);
  if (!Number.isFinite(v)) return { key: 'n', label: '土鸡 · N', emoji: '🐣' };
  if (v >= 80) return { key: 'ssr', label: '金鸡 · SSR', emoji: '🐔' };
  if (v >= 30) return { key: 'sr', label: '银鸡 · SR', emoji: '🐓' };
  if (v >= 5) return { key: 'r', label: '铜鸡 · R', emoji: '🐤' };
  return { key: 'n', label: '土鸡 · N', emoji: '🐣' };
}

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
let drawTimer = null; // 请求倒计时
async function doDraw() {
  if (state.isDrawing) return;
  state.isDrawing = true;
  drawBtn.disabled = true;
  closeModal();
  saveBtn.disabled = true;
  // 重置提炼卡片
  resultSummary.classList.add('hidden');
  wishText.classList.remove('hidden');
  wishText.innerHTML = '<span class="char">等</span><span class="char">待</span><span class="char">开</span><span class="char">笼</span>';
  wishPanel.classList.remove('has-result');
  wishPanel.onclick = null;

  startSpin();

  // 超时保护：60s 后自动取消
  const ctrl = new AbortController();
  let timer = null;

  try {
    drawBtn.classList.add('charging');
    if (slogan) slogan.classList.add('flash');

    // 请求中：显示已等待时间
    let elapsed = 0;
    const statusEl = $('#statusMsg');
    if (statusEl) statusEl.textContent = '鸡舍里正在挑鸡…';
    drawTimer = setInterval(() => {
      elapsed++;
      if (!statusEl) return;
      if (elapsed <= 5) {
        statusEl.textContent = '鸡舍里正在挑鸡' + '.'.repeat(elapsed % 4);
      } else if (elapsed <= 20) {
        statusEl.textContent = '正在给这只鸡写体检报告 (' + elapsed + 's)';
      } else {
        statusEl.textContent = '鸡还在笼里跑，再等等 (' + elapsed + 's)';
      }
    }, 1000);

    timer = setTimeout(() => ctrl.abort(), 60000);

    const resp = await fetch('api/draw?v=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: state.type,
        risk: state.risk,
        horizon: state.horizon,
        sort: state.sort
      }),
      signal: ctrl.signal,
    });
    clearInterval(drawTimer); drawTimer = null;
    clearTimeout(timer);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '抽签失败');

    state.lastResult = data;

    // 老虎机停转显示基金代码
    const code = (data.fund && data.fund.code) || '------';
    stopSpin(code);

    // 动画完成后渲染结果（缩短延迟，因为 API 已够慢）
    setTimeout(() => {
      try { renderResult(data); } catch (err) {
        console.error('renderResult error:', err);
        showToast('结果渲染异常，请重试');
        resetUI();
      }
    }, 400);

  } catch (e) {
    clearInterval(drawTimer); drawTimer = null;
    clearTimeout(timer);
    resetUI();
    const msg = e.name === 'AbortError'
      ? '鸡跑太久没抓到（>60s），请再开一次笼试试'
      : ('抓鸡失败：' + e.message);
    showToast(msg);
  }
}

// ---- 渲染结果 ----
function renderResult(data) {
  try {
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
      <div class="reason-block"><h3>为什么不是收益榜首</h3><ul>${listHtml(r.notOthers, '这只鸡是从鸡舍里随机抓的，并非单纯押注收益榜首。')}</ul></div>
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
  summaryCode.textContent = f.code || '';
  // ---- 游戏化：根据近3年收益评一只鸡的稀有度 ----
  const rarity = getChickenRarity(m.r3y);
  if (summaryChicken) summaryChicken.textContent = rarity.emoji;
  if (chickenEl) chickenEl.textContent = rarity.emoji;

  // 标签：稀有度 + 类型 + 数据源
  const tagHtml = [
    `<span class="summary-tag summary-tag-rarity ${rarity.key}">${rarity.label}</span>`,
    `<span class="summary-tag summary-tag-type">${escapeHtml(f.type || '--')}</span>`,
    data.isMock
      ? `<span class="summary-tag summary-tag-mock">示例数据</span>`
      : `<span class="summary-tag summary-tag-source">${escapeHtml(data.dataSource || '实时')}</span>`,
  ].join('');
  summaryTags.innerHTML = tagHtml;
  // 关键指标行：近3年收益 / 费率 / 成立年限
  const r3yVal = m.r3y;
  const r3yClass = Number(r3yVal) >= 0 ? 'pos' : (Number(r3yVal) < 0 ? 'neg' : '');
  summaryMetrics.innerHTML = `
    <div class="summary-metric">
      <div class="summary-metric-value ${r3yClass}">${fmt(r3yVal)}</div>
      <div class="summary-metric-label">近3年收益</div>
    </div>
    <div class="summary-metric">
      <div class="summary-metric-value">${fmt(m.fee)}</div>
      <div class="summary-metric-label">费率</div>
    </div>
    <div class="summary-metric">
      <div class="summary-metric-value">${m.years != null ? m.years : '--'}<small style="font-size:10px;color:var(--text3)">年</small></div>
      <div class="summary-metric-label">成立年限</div>
    </div>`;
  summaryOneliner.textContent = oneLiner || (f.type || '') + '型基金';
  resultSummary.classList.remove('hidden');
  wishText.classList.add('hidden');
  wishPanel.classList.add('has-result');

  // 点击提炼卡片 → 跳转详情页（整合弹窗分析+图表）
  wishPanel.onclick = () => openDetail(data);

  // 自选按钮状态
  renderFavBtn(f.code);
  if (favBtn) {
    favBtn.onclick = () => { toggleFav(f, m); };
  }

  // 烟花绽放庆祝
  launchFireworks();

  // 详情弹框内容（完整数据）
  const detailHtml = `
    <div class="res-header">
      <div class="res-tags">
        <span class="tag tag-blind">随机抓鸡</span>
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
      <button class="res-btn res-btn-ghost" id="againBtn">&#8635; 再抓一只</button>
      <button class="res-btn res-btn-primary" id="detailBtn">&#128270; 鸡的体检报告</button>
    </div>`;

  modalBody.innerHTML = detailHtml;

  saveBtn.disabled = false;

  // 绑定事件（弹框内按钮）
  document.querySelectorAll('#againBtn').forEach(b => b.addEventListener('click', doDraw));
  document.querySelectorAll('#detailBtn').forEach(b => b.addEventListener('click', () => {
    openDetail(data);
  }));

  state.isDrawing = false;
  drawBtn.disabled = false;
  } catch (err) {
    console.error('renderResult inner error:', err);
    showToast('结果渲染异常，请重试');
    resetUI();
  }
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
    showToast('已收进鸡栏 #' + out.id);
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
      historyList.innerHTML = '<li class="empty-state">还没有抓鸡记录，快去开笼吧～</li>';
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
        if (b.dataset.act === 'open') {
          // 跳转详情页：先拉取记录数据
          fetch('api/history/' + id)
            .then(r => r.json())
            .then(row => {
              try {
                const detailData = {
                  fund: { code: row.fund_code, name: row.fund_name, type: row.fund_type },
                  metrics: JSON.parse(row.metrics || '{}'),
                  reason: JSON.parse(row.reason || '{}'),
                  dataSource: row.data_source,
                  usedDefaults: JSON.parse(row.used_defaults || '{}'),
                  isMock: false,
                };
                sessionStorage.setItem('fundDetailData', JSON.stringify(detailData));
                window.location.href = 'detail.html';
              } catch (e) {
                window.open('api/reports/' + id, '_blank');
              }
            })
            .catch(() => window.open('api/reports/' + id, '_blank'));
        } else delHistory(id);
      });
    });
  } catch (e) {
    historyList.innerHTML = '<li class="empty-state">历史加载失败</li>';
  }
}

async function delHistory(id) {
  if (!confirm('确定把这只鸡从记录里删掉？')) return;
  try {
    const resp = await fetch('api/history/' + id, { method: 'DELETE' });
    if (resp.ok) { showToast('已删除'); loadHistory(); }
    else showToast('删除失败');
  } catch (e) { showToast('删除失败'); }
}

// ---- 跳转详情页（整合弹窗+报告） ----
function openDetail(data) {
  try {
    sessionStorage.setItem('fundDetailData', JSON.stringify(data));
    window.location.href = 'detail.html';
  } catch (e) {
    // sessionStorage 可能满，降级为弹窗
    console.warn('sessionStorage full, fallback to modal:', e);
    openModal();
  }
}

// ---- 详情弹框（Modal）—— 保留作为降级方案 ----
let isModalOpen = false;
function openModal() {
  if (isModalOpen) return;
  isModalOpen = true;
  modalOverlay.classList.add('show');
  resultPanel.classList.add('open');
}
function closeModal() {
  if (!isModalOpen) return;
  isModalOpen = false;
  modalOverlay.classList.remove('show');
  resultPanel.classList.remove('open');
}
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

// ---- 侧边栏（更多菜单） ----
function openDrawer() {
  drawer.classList.add('open');
  drawerOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawerOverlay.classList.remove('show');
  document.body.style.overflow = '';
}
$('#menuBtn').addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

// 抽签记录懒加载：展开时才请求
const historySection = $('#drawerHistorySection');
if (historySection) {
  historySection.addEventListener('toggle', () => {
    if (historySection.open) loadHistory();
  });
}

// 自选列表懒加载
const favSection = $('#drawerFavSection');
if (favSection) {
  favSection.addEventListener('toggle', () => {
    if (favSection.open) renderFavList();
  });
}
// ESC 关闭（优先弹框 > 抽屉）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isModalOpen) closeModal();
    else closeDrawer();
  }
});

// ---- 事件绑定 ----
drawBtn.addEventListener('click', doDraw);
saveBtn.addEventListener('click', () => {
  if (state.lastResult) saveResult(state.lastResult, false);
});
$('#refreshHistory').addEventListener('click', loadHistory);

// ---- 加载态浮动粒子 ----
const loadingParticlesEl = document.getElementById('loadingParticles');
function spawnLoadingParticles() {
  if (!loadingParticlesEl) return;
  clearLoadingParticles();
  const frag = document.createDocumentFragment();
  const colors = ['#f6b73c', '#f2703c', '#8ed081', '#fff8e6'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'loading-particle';
    p.style.left = (10 + Math.random() * 80) + '%';
    p.style.bottom = (5 + Math.random() * 30) + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (1.2 + Math.random() * 1.5) + 's';
    p.style.animationDelay = (Math.random() * 2) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    frag.appendChild(p);
  }
  loadingParticlesEl.appendChild(frag);
}
function clearLoadingParticles() {
  if (loadingParticlesEl) loadingParticlesEl.innerHTML = '';
}

// ---- 漂浮粒子（背景）----
function initParticles() {
  if (!particlesEl) return;
  const N = 26;
  const colors = ['rgba(246,183,60,', 'rgba(242,112,60,', 'rgba(255,255,255,'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < N; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 1.5 + Math.random() * 3;
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color + '0.9)';
    p.style.boxShadow = '0 0 ' + (size * 2) + 'px ' + color + '0.8)';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (-Math.random() * 12) + 's';
    frag.appendChild(p);
  }
  particlesEl.appendChild(frag);
}

// ---- 烟花绽放效果（发光版 · 不卡顿）----
const fwCanvas = document.getElementById('fireworks');
let fwCtx = null, fwRaf = null, fwParticles = [], fwFlashes = [], fwRunning = false;
const FW_COLORS = ['#f6b73c', '#f2703c', '#8ed081', '#ffd28a', '#3fa96b', '#ffffff'];

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function resizeFw() {
  if (!fwCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  fwCanvas.width = window.innerWidth * dpr;
  fwCanvas.height = window.innerHeight * dpr;
  fwCtx = fwCanvas.getContext('2d');
  fwCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnBurst(cx, cy) {
  const color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
  const n = 30;
  const power = 2.4 + Math.random() * 1.8;
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.3;
    const sp = power * (0.4 + Math.random() * 0.9);
    fwParticles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 0.5,
      life: 1,
      decay: 0.010 + Math.random() * 0.007,  // 更慢衰减 → 持续更久
      color: Math.random() > 0.5 ? FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)] : color,
      size: 1.8 + Math.random() * 2.6,
    });
  }
  // 爆心闪光
  fwFlashes.push({ x: cx, y: cy, life: 1, color });
}

function fwLoop() {
  if (!fwCtx) return;
  fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height);
  fwCtx.globalCompositeOperation = 'lighter'; // 叠加发光（无 shadowBlur，性能可控）
  // 爆心闪光
  for (let i = fwFlashes.length - 1; i >= 0; i--) {
    const f = fwFlashes[i];
    f.life -= 0.06;
    if (f.life <= 0) { fwFlashes.splice(i, 1); continue; }
    const r = 14 + 70 * (1 - f.life);
    const g = fwCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, hexA(f.color, f.life));
    g.addColorStop(1, hexA(f.color, 0));
    fwCtx.fillStyle = g;
    fwCtx.beginPath();
    fwCtx.arc(f.x, f.y, r, 0, Math.PI * 2);
    fwCtx.fill();
  }
  // 粒子
  for (let i = fwParticles.length - 1; i >= 0; i--) {
    const p = fwParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.05;
    p.vx *= 0.985; p.vy *= 0.985;
    p.life -= p.decay;
    if (p.life <= 0) { fwParticles.splice(i, 1); continue; }
    fwCtx.globalAlpha = Math.min(1, p.life * 1.3);
    fwCtx.fillStyle = p.color;
    fwCtx.beginPath();
    fwCtx.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life), 0, Math.PI * 2);
    fwCtx.fill();
  }
  fwCtx.globalAlpha = 1;
  fwCtx.globalCompositeOperation = 'source-over';
  if (fwParticles.length > 0 || fwFlashes.length > 0 || fwRunning) {
    fwRaf = requestAnimationFrame(fwLoop);
  } else {
    fwCanvas.classList.remove('active');
    cancelAnimationFrame(fwRaf);
  }
}

function launchFireworks() {
  if (!fwCanvas) return;
  if (!fwCtx) resizeFw();
  fwCanvas.classList.add('active');
  // 4 次连放，整体更亮更久
  const bursts = [
    { t: 0,    x: 0.28, y: 0.34 },
    { t: 250,  x: 0.72, y: 0.28 },
    { t: 520,  x: 0.50, y: 0.18 },
    { t: 780,  x: 0.40, y: 0.44 },
  ];
  let started = false;
  bursts.forEach(b => {
    setTimeout(() => {
      spawnBurst(window.innerWidth * b.x, window.innerHeight * b.y);
      if (!started) { started = true; fwRunning = true; fwLoop(); }
    }, b.t);
  });
  // 收尾清理
  setTimeout(() => {
    fwRunning = false;
    if (fwParticles.length === 0 && fwFlashes.length === 0) fwCanvas.classList.remove('active');
  }, 2400);
}

window.addEventListener('resize', () => { if (fwCtx) resizeFw(); });

// ---- 初始化 ----
initParticles();
renderFavList(); // 渲染自选计数（列表懒加载）
