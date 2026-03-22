(() => {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const extractText = (payload) => {
        if (typeof payload === 'string') return payload;
        if (Array.isArray(payload)) {
            return payload.map(item => item?.text || item?.content || '').join('');
        }
        return '';
    };

    const makeError = async (response) => {
        let message = `请求失败 (${response.status})`;
        try {
            const data = await response.json();
            message = data?.error?.message || data?.message || message;
        } catch (_) {
            try {
                const text = await response.text();
                if (text) message = text;
            } catch (__ ) {
                // ignore secondary parse errors
            }
        }
        const error = new Error(message);
        error.retryable = response.status === 429 || response.status >= 500;
        return error;
    };

    const shouldRetry = (error, attempt, maxRetries) => {
        if (attempt >= maxRetries) return false;
        if (error?.name === 'AbortError') return true;
        if (error?.retryable) return true;
        return error instanceof TypeError;
    };

    const streamRequest = async ({ apiBase, apiKey, model, messages, temperature, timeoutMs, onChunk }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(apiBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!response.ok) throw await makeError(response);

            if (!response.body) {
                const fallback = await response.json();
                return extractText(fallback?.choices?.[0]?.message?.content);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                lines.forEach((line) => {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) return;
                    const data = trimmed.slice(5).trim();
                    if (!data || data === '[DONE]') return;

                    try {
                        const json = JSON.parse(data);
                        const delta = extractText(json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content);
                        if (!delta) return;
                        fullText += delta;
                        if (typeof onChunk === 'function') onChunk(fullText, delta);
                    } catch (_) {
                        // ignore partial SSE frames
                    }
                });
            }

            return fullText;
        } finally {
            clearTimeout(timer);
        }
    };

    const nonStreamRequest = async ({ apiBase, apiKey, model, messages, temperature, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(apiBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature
                }),
                signal: controller.signal
            });

            if (!response.ok) throw await makeError(response);

            const data = await response.json();
            const content = extractText(data?.choices?.[0]?.message?.content);
            if (!content) throw new Error('模型没有返回内容');
            return content;
        } finally {
            clearTimeout(timer);
        }
    };

    const AppApi = {
        async chat({
            apiBase,
            apiKey,
            model,
            messages,
            temperature = 0.7,
            timeoutMs = 60000,
            maxRetries = 2
        }) {
            if (!apiKey) throw new Error('请先配置 API Key。');

            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                try {
                    return await nonStreamRequest({ apiBase, apiKey, model, messages, temperature, timeoutMs });
                } catch (error) {
                    lastError = error;
                    if (!shouldRetry(error, attempt, maxRetries)) break;
                    await wait(700 * (attempt + 1));
                }
            }

            throw lastError || new Error('请求失败');
        },

        async streamChat({
            apiBase,
            apiKey,
            model,
            messages,
            temperature = 0.7,
            timeoutMs = 60000,
            maxRetries = 1,
            onChunk
        }) {
            if (!apiKey) throw new Error('请先配置 API Key。');

            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                try {
                    const text = await streamRequest({
                        apiBase,
                        apiKey,
                        model,
                        messages,
                        temperature,
                        timeoutMs,
                        onChunk
                    });

                    if (text) return text;
                    return await this.chat({ apiBase, apiKey, model, messages, temperature, timeoutMs, maxRetries: 0 });
                } catch (error) {
                    lastError = error;
                    if (!shouldRetry(error, attempt, maxRetries)) break;
                    await wait(700 * (attempt + 1));
                }
            }

            throw lastError || new Error('流式请求失败');
        }
    };

    window.AppApi = AppApi;
})();
