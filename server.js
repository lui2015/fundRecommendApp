const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./src/config');
const db = require('./src/db');
const { draw } = require('./src/draw');
const { generateReport } = require('./src/report');
const { CATEGORIES, COMMON_FIELDS, listStrategies } = require('./src/strategies');
const { recommendByStrategy } = require('./src/strategyRecommend');

const app = express();
app.use(express.json());

// 限流（按 IP 内存滑动窗口）
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip) || { minute: [], day: [] };
  rec.minute = rec.minute.filter((t) => now - t < 60000);
  rec.day = rec.day.filter((t) => now - t < 86400000);
  if (rec.minute.length >= config.rateLimit.perMinute || rec.day.length >= config.rateLimit.perDay) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试（每分钟/每天有限额）。' });
  }
  rec.minute.push(now);
  rec.day.push(now);
  hits.set(ip, rec);
  next();
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'fund',
    hunyuan: config.hunyuan.key ? 'configured' : 'missing-key',
    skillDir: config.skillDir,
    time: new Date().toISOString(),
  });
});

app.post('/api/draw', rateLimit, async (req, res) => {
  try {
    const { type, risk, horizon, sort } = req.body || {};
    const result = await draw({ type, risk, horizon, sort });
    res.json(result);
  } catch (e) {
    console.error('draw error:', e);
    res.status(500).json({ error: '抽签失败：' + (e.message || e) });
  }
});

// 选基攻略：策略盘点清单
app.get('/api/strategies', (req, res) => {
  res.json({
    categories: CATEGORIES,
    commonFields: COMMON_FIELDS,
    strategies: listStrategies(),
  });
});

// 选基攻略：按选定策略 + 补充信息生成推荐方案
app.post('/api/strategy/recommend', rateLimit, async (req, res) => {
  try {
    const { strategyId, common, extra, sort } = req.body || {};
    const result = await recommendByStrategy({ strategyId, common, extra, sort });
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('strategy recommend error:', e);
    res.status(status).json({ error: (status === 400 ? '' : '生成方案失败：') + (e.message || e) });
  }
});

// 保存本次推荐
app.post('/api/save', rateLimit, (req, res) => {
  try {
    const b = req.body || {};
    if (!b.fund || !b.fund.code) {
      return res.status(400).json({ error: '缺少基金数据，无法保存。' });
    }
    const createdAt = new Date().toISOString();
    const reason = b.reason || {};
    const stmt = db.prepare(`INSERT INTO recommendations
      (created_at, type, risk, horizon, sort, fund_code, fund_name, fund_type,
       reason, score, metrics, report_path, seed, used_defaults, data_source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const info = stmt.run(
      createdAt,
      (b.userConstraints && b.userConstraints.type) || null,
      (b.userConstraints && b.userConstraints.risk) || null,
      (b.userConstraints && b.userConstraints.horizon) || null,
      (b.userConstraints && b.userConstraints.sort) || null,
      b.fund.code,
      b.fund.name || null,
      b.fund.type || null,
      JSON.stringify(reason),
      b.metrics && b.metrics.r3y != null ? null : null, // 评分由混元/六维框架给出，此处留空
      JSON.stringify(b.metrics || {}),
      null, // report_path 稍后回填
      b.seed || null,
      JSON.stringify(b.usedDefaults || {}),
      b.dataSource || null,
    );
    const id = info.lastInsertRowid;

    // 生成自包含 HTML 报告并落盘
    const reportHtml = generateReport({
      id,
      createdAt,
      fund: b.fund,
      fundType: b.fund.type,
      metrics: b.metrics || {},
      reason,
      userConstraints: b.userConstraints,
      usedDefaults: b.usedDefaults,
      dataSource: b.dataSource,
    });
    const reportPath = path.join(config.dataDir, 'reports', `${id}.html`);
    fs.writeFileSync(reportPath, reportHtml, 'utf8');
    db.prepare('UPDATE recommendations SET report_path=? WHERE id=?').run(reportPath, id);

    res.json({ id, reportUrl: `api/reports/${id}` });
  } catch (e) {
    console.error('save error:', e);
    res.status(500).json({ error: '保存失败：' + (e.message || e) });
  }
});

app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const rows = db.prepare(
    `SELECT id, created_at, fund_code, fund_name, fund_type, data_source, seed
     FROM recommendations ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS c FROM recommendations').get().c;
  res.json({ total, rows });
});

app.get('/api/history/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recommendations WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该记录' });
  res.json(row);
});

app.delete('/api/history/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recommendations WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '未找到该记录' });
  if (row.report_path && fs.existsSync(row.report_path)) {
    try { fs.unlinkSync(row.report_path); } catch (e) { /* ignore */ }
  }
  db.prepare('DELETE FROM recommendations WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 详情报告（自包含 HTML）
app.get('/api/reports/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recommendations WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).send('未找到该报告');
  if (row.report_path && fs.existsSync(row.report_path)) {
    res.type('html').send(fs.readFileSync(row.report_path, 'utf8'));
  } else {
    res.status(410).send('报告文件已失效');
  }
});

// 静态前端（相对路径，配合 nginx 去前缀反代）
app.use(express.static(path.join(__dirname, 'public')));

app.listen(config.port, () => {
  console.log(`求一基 running on http://127.0.0.1:${config.port}`);
});
