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

    const requiresStreamingForThinking = (error) => {
        const message = String(error?.message || '');
        return /enable_thinking/i.test(message) && /non-streaming/i.test(message);
    };

    const streamRequest = async ({
        apiBase,
        apiKey,
        model,
        messages,
        temperature,
        timeoutMs,
        onChunk,
        enableThinking
    }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const payload = {
                model,
                messages,
                temperature,
                stream: true
            };
            if (typeof enableThinking === 'boolean') payload.enable_thinking = enableThinking;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const response = await fetch(apiBase, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) throw await makeError(response);

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json') || contentType.includes('+json')) {
                const fallback = await response.json();
                if (fallback?.error) {
                    const message = fallback.error.message || fallback.message || '模型请求失败';
                    const error = new Error(message);
                    error.code = fallback.error.code;
                    error.type = fallback.error.type;
                    error.retryable = false;
                    throw error;
                }
                return extractText(fallback?.choices?.[0]?.message?.content);
            }

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

    const nonStreamRequest = async ({
        apiBase,
        apiKey,
        model,
        messages,
        temperature,
        timeoutMs,
        enableThinking
    }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const payload = {
                model,
                messages,
                temperature,
                stream: false
            };
            if (typeof enableThinking === 'boolean') payload.enable_thinking = enableThinking;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const response = await fetch(apiBase, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) throw await makeError(response);

            const data = await response.json();
            if (data?.error) {
                const message = data.error.message || data.message || '模型请求失败';
                const error = new Error(message);
                error.code = data.error.code;
                error.type = data.error.type;
                error.retryable = false;
                throw error;
            }
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
            maxRetries = 2,
            enableThinking
        }) {
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                try {
                    return await nonStreamRequest({
                        apiBase,
                        apiKey,
                        model,
                        messages,
                        temperature,
                        timeoutMs,
                        enableThinking
                    });
                } catch (error) {
                    lastError = error;
                    if (requiresStreamingForThinking(error)) {
                        return await streamRequest({
                            apiBase,
                            apiKey,
                            model,
                            messages,
                            temperature,
                            timeoutMs,
                            onChunk: null,
                            enableThinking
                        });
                    }
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
            onChunk,
            enableThinking
        }) {
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
                        onChunk,
                        enableThinking
                    });

                    if (text) return text;
                    return await this.chat({
                        apiBase,
                        apiKey,
                        model,
                        messages,
                        temperature,
                        timeoutMs,
                        maxRetries: 0,
                        enableThinking
                    });
                } catch (error) {
                    lastError = error;
                    if (!shouldRetry(error, attempt, maxRetries)) break;
                    await wait(700 * (attempt + 1));
                }
            }

            throw lastError || new Error('流式请求失败');
        },

        async generateTTS({ text, apiKey }) {
            const url = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: 'cosyvoice-v3-flash',
                    input: { text, voice: 'longyan_v3', format: 'wav', sample_rate: 24000 }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`TTS API error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const audioUrl = data?.output?.audio?.url;
            if (!audioUrl) throw new Error('TTS did not return audio URL');

            const audioResp = await fetch(audioUrl);
            const blob = await audioResp.blob();
            return URL.createObjectURL(blob);
        }
    };

    window.AppApi = AppApi;
})();
