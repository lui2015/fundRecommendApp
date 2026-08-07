/* ============================================
   求一基 · 选基攻略模块
   策略盘点 → 信息补充 → 调用大模型生成选基方案
   依赖 app.js 中的 showToast / escapeHtml
   ============================================ */
(function () {
  const q = (sel) => document.querySelector(sel);

  const stgOverlay = q('#stgOverlay');
  const stgModal = q('#stgModal');
  const stgClose = q('#stgClose');
  const stgBack = q('#stgBack');
  const stgTitle = q('#stgTitle');
  const stgSub = q('#stgSub');
  const stgTabs = q('#stgTabs');
  const stgList = q('#stgList');
  const stgForm = q('#stgForm');
  const stgFormName = q('#stgFormName');
  const stgFormTip = q('#stgFormTip');
  const stgResult = q('#stgResult');
  const stgLoadingText = q('#stgLoadingText');
  const stgLoadingSteps = q('#stgLoadingSteps');
  const steps = {
    list: q('#stgStepList'),
    form: q('#stgStepForm'),
    loading: q('#stgStepLoading'),
    result: q('#stgStepResult'),
  };

  const esc = (s) => (typeof escapeHtml === 'function'
    ? escapeHtml(s == null ? '' : s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const tip = (m) => (typeof showToast === 'function' ? showToast(m) : console.log(m));

  const st = {
    loaded: false,
    categories: [],
    commonFields: [],
    strategies: [],
    activeCat: 'all',
    current: null,
    lastPlan: null,
    busy: false,
    timer: null,
  };

  const CAT_ICON = { select: '&#127919;', allocate: '&#128202;', timing: '&#9202;', risk: '&#128737;' };
  const LEVEL_CLASS = { '入门': 'lv-easy', '进阶': 'lv-mid', '高阶': 'lv-hard' };

  /* ---------- 弹框显隐 ---------- */
  function showStep(name) {
    Object.keys(steps).forEach((k) => steps[k].classList.toggle('hidden', k !== name));
    stgBack.classList.toggle('hidden', name === 'list');
    if (name === 'list') {
      stgTitle.textContent = '选基攻略';
      stgSub.textContent = '经典策略盘点 · 选一套，AI 帮你落地';
    }
    stgModal.scrollTop = 0;
    const body = stgModal.querySelector('.stg-step:not(.hidden)');
    if (body) body.scrollTop = 0;
  }

  async function openStrategy() {
    stgOverlay.classList.add('show');
    stgModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!st.loaded) await loadStrategies();
    showStep('list');
  }

  function closeStrategy() {
    stgOverlay.classList.remove('show');
    stgModal.classList.remove('open');
    document.body.style.overflow = '';
    clearInterval(st.timer);
  }

  /* ---------- 数据加载 ---------- */
  async function loadStrategies() {
    stgList.innerHTML = '<div class="stg-empty">正在加载策略库…</div>';
    try {
      const resp = await fetch('api/strategies');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '加载失败');
      st.categories = data.categories || [];
      st.commonFields = data.commonFields || [];
      st.strategies = data.strategies || [];
      st.loaded = true;
      renderTabs();
      renderList();
    } catch (e) {
      stgList.innerHTML = '<div class="stg-empty">策略库加载失败：' + esc(e.message) + '</div>';
    }
  }

  /* ---------- 分类 Tab ---------- */
  function renderTabs() {
    const all = [{ key: 'all', name: '全部', desc: '市面上经典且主流的选基策略盘点' }].concat(st.categories);
    stgTabs.innerHTML = all.map((c) => {
      const n = c.key === 'all' ? st.strategies.length : st.strategies.filter((s) => s.category === c.key).length;
      return `<button class="stg-tab${c.key === st.activeCat ? ' active' : ''}" data-cat="${esc(c.key)}">${esc(c.name)}<i>${n}</i></button>`;
    }).join('');
    stgTabs.querySelectorAll('.stg-tab').forEach((b) => {
      b.addEventListener('click', () => {
        st.activeCat = b.dataset.cat;
        renderTabs();
        renderList();
      });
    });
  }

  /* ---------- 策略卡片列表 ---------- */
  function renderList() {
    const list = st.activeCat === 'all'
      ? st.strategies
      : st.strategies.filter((s) => s.category === st.activeCat);
    const catDesc = st.activeCat === 'all'
      ? '共' + st.strategies.length + ' 套经典策略，点开看逻辑，选一套让 AI 帮你落地'
      : (st.categories.find((c) => c.key === st.activeCat) || {}).desc || '';

    stgList.innerHTML = `<div class="stg-cat-desc">${esc(catDesc)}</div>` + list.map((s) => `
      <article class="stg-card" data-id="${esc(s.id)}">
        <div class="stg-card-head">
          <span class="stg-card-icon">${CAT_ICON[s.category] || '&#128200;'}</span>
          <div class="stg-card-titles">
            <div class="stg-card-name">${esc(s.name)}<span class="stg-level ${LEVEL_CLASS[s.level] || ''}">${esc(s.level)}</span></div>
            <div class="stg-card-alias">${esc(s.alias)} · ${esc(s.horizon)}</div>
          </div>
          <span class="stg-card-arrow">&#9662;</span>
        </div>
        <div class="stg-card-tagline">${esc(s.tagline)}</div>
        <div class="stg-card-detail">
          <div class="stg-sec"><h4>核心逻辑</h4><p>${esc(s.keyIdea)}</p></div>
          <div class="stg-sec"><h4>操作步骤</h4><ol>${(s.steps || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
          <div class="stg-sec"><h4>关键指标</h4><div class="stg-chips">${(s.metrics || []).map((x) => `<span class="stg-chip">${esc(x)}</span>`).join('')}</div></div>
          <div class="stg-pncols">
            <div class="stg-pn stg-pn-pro"><h4>优点</h4><ul>${(s.pros || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
            <div class="stg-pn stg-pn-con"><h4>短板</h4><ul>${(s.cons || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          </div>
          <div class="stg-sec"><h4>适合谁</h4><p>${esc(s.suitable)}</p></div>
          <div class="stg-sec"><h4>不适合谁</h4><p>${esc(s.notSuitable)}</p></div>
          ${s.tips ? `<div class="stg-tips">&#128161; ${esc(s.tips)}</div>` : ''}
          <button class="stg-use-btn" data-use="${esc(s.id)}">&#10024; 用这套策略帮我选基</button>
        </div>
      </article>`).join('');

    stgList.querySelectorAll('.stg-card-head').forEach((h) => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
    });
    stgList.querySelectorAll('.stg-card-tagline').forEach((t) => {
      t.addEventListener('click', () => t.parentElement.classList.toggle('open'));
    });
    stgList.querySelectorAll('[data-use]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        gotoForm(b.dataset.use);
      });
    });
  }

  /* ---------- 信息补充表单 ---------- */
  function fieldHtml(f, group) {
    const name = group + ':' + f.key;
    if (f.type === 'select') {
      return `<label class="stg-field">
        <span class="stg-field-label">${esc(f.label)}</span>
        <select class="cyber-select" name="${esc(name)}">
          <option value="">不限/ 由 AI 建议</option>
          ${(f.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
        </select>
      </label>`;
    }
    return `<label class="stg-field stg-field-wide">
      <span class="stg-field-label">${esc(f.label)}</span>
      <textarea class="cyber-input" name="${esc(name)}" rows="2" maxlength="${f.maxLength || 200}"
        placeholder="${esc(f.placeholder || '')}"></textarea>
    </label>`;
  }

  function gotoForm(id) {
    const s = st.strategies.find((x) => x.id === id);
    if (!s) return;
    st.current = s;
    stgTitle.textContent = s.name;
    stgSub.textContent = '补充信息，AI 按此策略给你落地方案';
    stgFormName.innerHTML = `${CAT_ICON[s.category] || ''} ${esc(s.name)}<span class="stg-level ${LEVEL_CLASS[s.level] || ''}">${esc(s.level)}</span>`;
    stgFormTip.textContent = s.tagline;

    const extraFields = s.fields || [];
    stgForm.innerHTML = `
      ${extraFields.length ? `<div class="stg-form-group"><div class="stg-group-title">策略参数</div><div class="stg-grid">${extraFields.map((f) => fieldHtml(f, 'extra')).join('')}</div></div>` : ''}
      <div class="stg-form-group">
        <div class="stg-group-title">你的情况（可选，填得越细方案越贴合）</div>
        <div class="stg-grid">${st.commonFields.map((f) => fieldHtml(f, 'common')).join('')}</div>
      </div>`;
    showStep('form');
  }

  function collectForm() {
    const common = {}; const extra = {};
    stgForm.querySelectorAll('[name]').forEach((el) => {
      const [group, key] = el.name.split(':');
      const v = (el.value || '').trim();
      if (!v) return;
      if (group === 'common') common[key] = v;
      else extra[key] = v;
    });
    return { common, extra };
  }

  /* ---------- 提交生成 ---------- */
  const LOADING_PHASES = [
    '按策略拉取真实基金数据…',
    '价值初筛，剔除不合规候选…',
    'AI 正在理解你的策略与约束…',
    'AI 正在编排仓位与执行步骤…',
    '校验标的真实性，防止张冠李戴…',
    '仍在处理中，请稍候…',
  ];

  async function submitStrategy() {
    if (st.busy || !st.current) return;
    st.busy = true;
    const { common, extra } = collectForm();
    showStep('loading');
    stgTitle.textContent = st.current.name;
    stgSub.textContent = '正在生成方案…';

    let sec = 0;
    stgLoadingSteps.innerHTML = LOADING_PHASES.map((p, i) => `<div class="stg-lstep" data-i="${i}">${esc(p)}</div>`).join('');
    const markPhase = (i) => {
      stgLoadingSteps.querySelectorAll('.stg-lstep').forEach((el) => {
        const idx = Number(el.dataset.i);
        el.classList.toggle('done', idx < i);
        el.classList.toggle('doing', idx === i);
      });
    };
    markPhase(0);
    st.timer = setInterval(() => {
      sec++;
      const i = Math.min(Math.floor(sec / 7), LOADING_PHASES.length - 1);
      markPhase(i);
      stgLoadingText.textContent = LOADING_PHASES[i] + ' (' + sec + 's)';
    }, 1000);

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 100000);
    try {
      const resp = await fetch('api/strategy/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: st.current.id, common, extra }),
        signal: ctrl.signal,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '生成失败');
      st.lastPlan = data;
      renderPlan(data);
      showStep('result');
      if (typeof launchFireworks === 'function') launchFireworks();
    } catch (e) {
      showStep('form');
      tip(e.name === 'AbortError' ? '生成超时，请稍后重试' : ('生成失败：' + e.message));
    } finally {
      clearTimeout(to);
      clearInterval(st.timer);
      st.busy = false;
    }
  }

  /* ---------- 方案渲染 ---------- */
  function fmtNum(v, s) {
    return (v === null || v === undefined || v === '') ? '--' : v + (s || '');
  }

  function renderPlan(data) {
    const p = data.plan || {};
    stgTitle.textContent = data.strategy.name + ' · 方案';
    stgSub.textContent = '数据源：' + data.dataSource +' · 候选池 ' + data.candidatesCount + ' 只';

    const notes = [];
    if (data.isMock) notes.push('<span class="tag tag-warn">当前为内置示例数据（真实数据源暂不可用）</span>');
    if (data.fallback) notes.push('<span class="tag tag-warn">AI 服务异常，已降级为策略骨架方案</span>');
    if (data.droppedPicks) notes.push(`<span class="tag tag-warn">已剔除 ${data.droppedPicks} 个不在候选池中的标的</span>`);

    const picksHtml = (p.picks || []).length
      ? p.picks.map((k) => `
        <div class="stg-pick">
          <div class="stg-pick-top">
            <div class="stg-pick-role">${esc(k.role || '建议标的')}</div>
            <div class="stg-pick-weight">${esc(k.weight || '')}</div>
          </div>
          <div class="stg-pick-name">${esc(k.name)}</div>
          <div class="stg-pick-code">${esc(k.code)} · ${esc(k.type || '')}</div>
          <div class="stg-pick-metrics">
            <span>近1年 <b class="${Number(k.metrics.r1y) < 0 ? 'neg' : 'pos'}">${fmtNum(k.metrics.r1y, '%')}</b></span>
            <span>近3年 <b class="${Number(k.metrics.r3y) < 0 ? 'neg' : 'pos'}">${fmtNum(k.metrics.r3y, '%')}</b></span>
            <span>年化 <b>${fmtNum(k.metrics.cagr3y, '%')}</b></span>
            <span>费率 <b>${fmtNum(k.metrics.fee, '%')}</b></span>
            <span>成立 <b>${fmtNum(k.metrics.years, ' 年')}</b></span>
          </div>
          ${(k.why || []).length ? `<ul class="stg-pick-why">${k.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
          ${k.watch ? `<div class="stg-pick-watch">&#128065; 盯住：${esc(k.watch)}</div>` : ''}
        </div>`).join('')
      : '<div class="stg-empty">候选池中暂无完全契合该策略的标的，请参考下方配置方向与执行步骤。</div>';

    stgResult.innerHTML = `
      ${notes.length ? `<div class="res-tags">${notes.join('')}</div>` : ''}
      ${p.opening ? `<div class="res-opening">${esc(p.opening)}</div>` : ''}
      ${p.strategyEcho ? `<div class="res-oneliner">${esc(p.strategyEcho)}</div>` : ''}

      <div class="stg-rsec"><h3>&#127919; 建议标的与权重</h3>${picksHtml}</div>

      ${p.allocation ? `<div class="stg-rsec"><h3>&#128202; 仓位与建仓节奏</h3><p>${esc(p.allocation)}</p></div>` : ''}

      ${(p.executionSteps || []).length ? `<div class="stg-rsec"><h3>&#128296; 执行步骤</h3><ol class="stg-steps">${p.executionSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}

      ${p.rebalance ? `<div class="stg-rsec"><h3>&#9878; 再平衡 / 止盈规则</h3><p>${esc(p.rebalance)}</p></div>` : ''}

      ${(p.checklist || []).length ? `<div class="stg-rsec stg-rsec-check"><h3>&#9989; 下单前请自行核实</h3><ul>${p.checklist.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

      ${(p.shortBoard || []).length ? `<div class="stg-rsec stg-rsec-warn"><h3>&#9888; 方案短板与失效场景</h3><ul>${p.shortBoard.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

      ${p.notSuitable ? `<div class="stg-rsec"><h3>&#128683; 不适合谁</h3><p>${esc(p.notSuitable)}</p></div>` : ''}

      <div class="stg-risk">${esc(p.riskNote || '基金有风险，投资需谨慎。')}</div>

      <div class="stg-actions">
        <button class="res-btn res-btn-ghost" type="button" id="stgRedo">&#8635; 改条件重来</button>
        <button class="res-btn res-btn-primary" type="button" id="stgOther">&#128218; 换个策略</button>
      </div>`;

    const redo = q('#stgRedo');
    const other = q('#stgOther');
    if (redo) redo.addEventListener('click', () => {
      stgTitle.textContent = st.current.name;
      stgSub.textContent = '补充信息，AI 按此策略给你落地方案';
      showStep('form');
    });
    if (other) other.addEventListener('click', () => showStep('list'));
  }

  /* ---------- 事件绑定 ---------- */
  const menuStrategy = q('#menuStrategy');
  if (menuStrategy) {
    menuStrategy.addEventListener('click', (e) => {
      e.preventDefault();
      const dr = q('#drawer'); const ov = q('#drawerOverlay');
      if (dr) dr.classList.remove('open');
      if (ov) ov.classList.remove('show');
      openStrategy();
    });
  }
  stgClose.addEventListener('click', closeStrategy);
  stgOverlay.addEventListener('click', closeStrategy);
  stgBack.addEventListener('click', () => {
    if (!steps.result.classList.contains('hidden')) showStep('form');
    else showStep('list');
  });
  q('#stgFormBack').addEventListener('click', () => showStep('list'));
  q('#stgSubmit').addEventListener('click', submitStrategy);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stgModal.classList.contains('open')) closeStrategy();
  });
})();
