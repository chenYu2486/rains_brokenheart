'use strict';

/**
 * ShelterAI Proxy — Alibaba Cloud Function Compute
 *
 * Routes chat completions to DashScope with per-IP daily quota.
 *
 * Runtime: Node.js 16
 * Handler: index.handler
 * Trigger: HTTP
 *
 * Environment:
 *   DASHSCOPE_API_KEY    — your DashScope API key
 */

const https = require('https');

const DASHSCOPE_HOST = 'dashscope.aliyuncs.com';
const DASHSCOPE_PATH = '/compatible-mode/v1/chat/completions';
const QUOTA_DAILY = 30;
const QUOTA_WARN_AT = 27;

const quotaMap = new Map();

exports.handler = function (event, context, callback) {
  handleRequest(event).then(r => callback(null, r)).catch(err => {
    callback(null, sendJSON(500, { error: 'proxy_error', message: err.message || '代理转发失败' }));
  });
};

async function handleRequest(event) {
  const httpReq = JSON.parse(event);
  const method = httpReq.method || httpReq.httpMethod || 'POST';
  if (method === 'OPTIONS') return sendJSON(204, {});
  if (method !== 'POST') return sendJSON(405, { error: 'Method not allowed' });
  if (!process.env.DASHSCOPE_API_KEY) {
    return sendJSON(500, {
      error: { code: 'missing_api_key', message: '代理服务未配置 DASHSCOPE_API_KEY' },
      message: '代理服务未配置 DASHSCOPE_API_KEY',
    });
  }

  const body = JSON.parse(httpReq.body || '{}');
  const { model, messages, temperature, stream, enable_thinking } = body;
  if (!model || !messages) return sendJSON(400, { error: 'Missing model or messages' });

  const clientIP = (httpReq.headers?.['x-forwarded-for'] || '')
    .split(',')[0]?.trim() || httpReq.headers?.['x-real-ip'] || 'unknown';

  // ── Quota ──
  const used = getQuota(clientIP);
  const remaining = Math.max(0, QUOTA_DAILY - used);
  if (used >= QUOTA_DAILY) {
    return sendJSON(402, {
      error: { code: 'quota_exhausted', message: '今日免费试用次数已用完' },
      message: '今日免费试用次数已用完',
      quota_remaining: 0, quota_used: used, quota_limit: QUOTA_DAILY,
    });
  }

  // ── Hint ──
  let augmentedMessages = [...messages];
  if (used >= QUOTA_WARN_AT) {
    augmentedMessages = [
      { role: 'system', content: `【系统提示】这是用户第 ${used + 1}/${QUOTA_DAILY} 次免费试用回复，还剩 ${remaining - 1} 次。请在本次回复末尾，用一句自然、温和的话告诉用户：免费试用快要结束了，如果觉得有帮助，可以配置自己的 API Key 继续使用。语气要轻，不要像广告，就像朋友随口提醒那样。` },
      ...augmentedMessages,
    ];
  }

  // ── Forward ──
  const dashBody = JSON.stringify({
    model,
    messages: augmentedMessages,
    temperature: temperature ?? 0.7,
    stream: stream === true,
    ...(typeof enable_thinking === 'boolean' && { enable_thinking }),
  });

  const dashResult = await httpsRequest({
    hostname: DASHSCOPE_HOST,
    path: DASHSCOPE_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
  }, dashBody);

  const isSSE = (dashResult.headers['content-type'] || '').toLowerCase().includes('text/event-stream');

  if (isSSE) {
    incrementQuota(clientIP);
    return {
      statusCode: 200,
      isBase64Encoded: false,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-Quota-Remaining': String(remaining - 1),
        'X-Quota-Used': String(used + 1),
        'X-Quota-Limit': String(QUOTA_DAILY),
      },
      body: dashResult.body,
    };
  }

  let dashJson;
  try { dashJson = JSON.parse(dashResult.body); } catch { dashJson = { output: { text: dashResult.body } }; }

  if ((dashResult.statusCode || 200) < 400) incrementQuota(clientIP);

  return sendJSON(dashResult.statusCode || 200, {
    ...dashJson,
    quota_remaining: remaining - 1,
    quota_used: used + 1,
    quota_limit: QUOTA_DAILY,
  });
}

// ── HTTP ──

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let data = '';
      const headers = {};
      for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v;
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendJSON(status, data) {
  return {
    statusCode: status,
    isBase64Encoded: false,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: status === 204 ? '' : JSON.stringify(data),
  };
}

// ── In-memory quota ──

function getQuota(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = quotaMap.get(ip);
  if (!entry || entry.date !== today) return 0;
  return entry.used;
}

function incrementQuota(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = quotaMap.get(ip);
  if (!entry || entry.date !== today) quotaMap.set(ip, { used: 1, date: today });
  else entry.used += 1;
}
