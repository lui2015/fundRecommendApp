require('dotenv').config();
const path = require('path');

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

module.exports = {
  port: intEnv('PORT', 3220),
  hunyuan: {
    url: process.env.HUNYUAN_API_URL || 'https://tokenhub.tencentmaas.com/v1/chat/completions',
    key: process.env.HUNYUAN_API_KEY || '',
    model: process.env.HUNYUAN_MODEL || 'hy3',
    timeoutMs: intEnv('HUNYUAN_TIMEOUT_MS', 45000),
  },
  rateLimit: {
    perMinute: intEnv('RATE_LIMIT_PER_MINUTE', 5),
    perDay: intEnv('RATE_LIMIT_PER_DAY', 30),
  },
  skillDir: process.env.SKILL_DIR || path.join(__dirname, '..', 'vendor', 'FUND-RECOMMEND-SKILL'),
  pythonBin: process.env.PYTHON_BIN || 'python3',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
};
