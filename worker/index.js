/**
 * ShelterAI Proxy Worker
 *
 * Routes chat completions to DashScope with per-IP daily quota.
 * - Trial mode: proxied through this worker with quota tracking
 * - BYOK mode: client calls DashScope directly, bypasses this worker
 */

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QUOTA_DAILY = 200;
const QUOTA_WARN_AT = 180; // start hinting when used >= this

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return corsNoContent();
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    if (!env.DASHSCOPE_API_KEY) {
      return json({
        error: { code: 'missing_api_key', message: '代理服务未配置 DASHSCOPE_API_KEY' },
        message: '代理服务未配置 DASHSCOPE_API_KEY'
      }, 500);
    }

    const url = new URL(request.url);

    // Accept any POST path (frontend sends to proxyBase directly)
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const body = await request.json();
    const { model, messages, temperature, stream, enable_thinking } = body;

    if (!model || !messages) {
      return json({ error: 'missing model or messages' }, 400);
    }

    // ── Quota check ──
    const quota = await getQuota(env.QUOTA, clientIP);
    const used = quota.used;
    const remaining = Math.max(0, QUOTA_DAILY - used);

    // Quota exhausted
    if (used >= QUOTA_DAILY) {
      return json({
        error: { code: 'quota_exhausted', message: '今日免费试用次数已用完' },
        message: '今日免费试用次数已用完',
        quota_remaining: 0,
        quota_used: used,
        quota_limit: QUOTA_DAILY
      }, 402);
    }

    // ── Prepare messages ──
    let augmentedMessages = [...messages];

    // If quota is running low, inject a gentle hint
    if (used >= QUOTA_WARN_AT) {
      const hintMsg = `【系统提示】这是用户第 ${used + 1}/${QUOTA_DAILY} 次免费试用回复，还剩 ${remaining - 1} 次。请在本次回复末尾，用一句自然、温和的话告诉用户：免费试用快要结束了，如果觉得有帮助，可以配置自己的 API Key 继续使用。语气要轻，不要像广告，就像朋友随口提醒那样。`;
      augmentedMessages = [
        { role: 'system', content: hintMsg },
        ...augmentedMessages
      ];
    }

    // ── Forward to DashScope ──
    const dashBody = {
      model,
      messages: augmentedMessages,
      temperature: temperature ?? 0.7,
      stream: stream !== false // default true
    };
    if (typeof enable_thinking === 'boolean') dashBody.enable_thinking = enable_thinking;

    try {
      const dashResponse = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`
        },
        body: JSON.stringify(dashBody)
      });

      if (!dashResponse.ok) {
        const errText = await dashResponse.text();
        return json({
          error: 'upstream_error',
          message: `DashScope error: ${dashResponse.status}`,
          detail: errText
        }, dashResponse.status);
      }

      // Streaming response — pipe SSE back
      if (dashResponse.headers.get('content-type')?.includes('text/event-stream')) {
        const { readable, writable } = new TransformStream();

        // Read the upstream stream, forward to client, count on completion
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const reader = dashResponse.body.getReader();
        const decoder = new TextDecoder();

        let fullText = '';

        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              fullText += chunk;
              await writer.write(encoder.encode(chunk));
            }

            // Count this as one usage
            await incrementQuota(env.QUOTA, clientIP, used + 1);
          } catch (e) {
            // Stream was interrupted — don't count if no content delivered
            if (fullText.length > 0) {
              await incrementQuota(env.QUOTA, clientIP, used + 1);
            }
          } finally {
            await writer.close();
          }
        })();

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Quota-Remaining': String(remaining - 1),
            'X-Quota-Used': String(used + 1),
            'X-Quota-Limit': String(QUOTA_DAILY)
          }
        });
      }

      // Non-streaming response
      const dashJson = await dashResponse.json();
      await incrementQuota(env.QUOTA, clientIP, used + 1);

      const responseBody = {
        ...dashJson,
        quota_remaining: remaining - 1,
        quota_used: used + 1,
        quota_limit: QUOTA_DAILY
      };

      return json(responseBody, 200);
    } catch (error) {
      return json({
        error: 'proxy_error',
        message: error.message || '代理转发失败'
      }, 500);
    }
  }
};

// ── KV Quota helpers ──

async function getQuota(kv, ip) {
  try {
    const raw = await kv.get(`quota:${ip}`, 'json');
    if (!raw) return { used: 0, date: today() };

    // Reset if different day
    if (raw.date !== today()) {
      return { used: 0, date: today() };
    }

    return { used: raw.used ?? 0, date: raw.date };
  } catch {
    return { used: 0, date: today() };
  }
}

async function incrementQuota(kv, ip, newUsed) {
  try {
    await kv.put(`quota:${ip}`, JSON.stringify({
      used: newUsed,
      date: today()
    }));
  } catch (e) {
    console.error('Failed to update quota:', e);
  }
}

function today() {
  // Use ISO date (UTC) so quota resets at UTC midnight
  return new Date().toISOString().slice(0, 10);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function corsNoContent() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
