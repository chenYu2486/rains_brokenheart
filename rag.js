(() => {
    const INDEX_DIM = 512;
    const MAX_EXCERPT_CHARS = 720;
    const cache = new Map();

    const normalizeText = (text) => String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const formatPageRange = (pageStart, pageEnd) => {
        const start = Number(pageStart) || 0;
        const end = Number(pageEnd) || start;
        if (!start && !end) return '页码未知';
        if (start === end) return `第 ${start} 页`;
        return `第 ${start}-${end} 页`;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const excerptText = (text, limit = MAX_EXCERPT_CHARS) => {
        const compact = String(text || '').replace(/\s+/g, ' ').trim();
        if (compact.length <= limit) return compact;
        return `${compact.slice(0, limit - 1)}…`;
    };

    const hashToken = (token) => {
        let hash = 2166136261;
        for (let i = 0; i < token.length; i += 1) {
            hash ^= token.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) % INDEX_DIM;
    };

    const tokenize = (text) => {
        const normalized = normalizeText(text);
        if (!normalized) return [];

        const tokens = [];
        const latinTerms = normalized.match(/[a-z0-9][a-z0-9\-_/.:]{1,}/g) || [];
        tokens.push(...latinTerms);

        const cjkRuns = normalized.match(/[\u3400-\u9fff]+/g) || [];
        cjkRuns.forEach((run) => {
            const chars = [...run];

            if (chars.length === 1) {
                tokens.push(chars[0]);
                return;
            }

            for (let i = 0; i < chars.length - 1; i += 1) {
                tokens.push(`${chars[i]}${chars[i + 1]}`);
            }

            for (let i = 0; i < chars.length - 2; i += 1) {
                tokens.push(`${chars[i]}${chars[i + 1]}${chars[i + 2]}`);
            }
        });

        return tokens;
    };

    const vectorize = (tokens) => {
        const vector = new Float32Array(INDEX_DIM);
        if (!tokens.length) return vector;

        tokens.forEach((token) => {
            const idx = hashToken(token);
            const weight = token.length >= 3 ? 1.35 : 1;
            vector[idx] += weight;
        });

        let norm = 0;
        for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
        norm = Math.sqrt(norm);
        if (!norm) return vector;

        for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
        return vector;
    };

    const cosine = (left, right) => {
        let total = 0;
        for (let i = 0; i < left.length; i += 1) total += left[i] * right[i];
        return total;
    };

    const overlapScore = (querySet, chunkSet) => {
        if (!querySet.size || !chunkSet.size) return 0;
        let matches = 0;
        querySet.forEach((token) => {
            if (chunkSet.has(token)) matches += 1;
        });
        return matches / querySet.size;
    };

    const validatePayload = (payload) => {
        if (!payload || typeof payload !== 'object') throw new Error('知识库文件为空。');
        if (!payload.document || !Array.isArray(payload.chunks)) {
            throw new Error('知识库格式不合法，缺少 document/chunks。');
        }
        if (!payload.chunks.length) throw new Error('知识库里没有可检索的 chunk。');
    };

    const buildIndex = (payload) => {
        validatePayload(payload);

        const indexedChunks = payload.chunks.map((chunk) => {
            const searchText = [
                chunk.title,
                chunk.text,
                chunk.text_preview,
                Array.isArray(chunk.citations) ? chunk.citations.map((item) => item?.page).join(' ') : ''
            ].filter(Boolean).join(' ');
            const tokens = tokenize(searchText);
            return {
                ...chunk,
                excerpt: excerptText(chunk.text || chunk.text_preview || ''),
                tokenSet: new Set(tokens),
                vector: vectorize(tokens)
            };
        });

        return {
            document: payload.document,
            chunks: indexedChunks
        };
    };

    const fetchPayload = async (path) => {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw new Error(`知识库读取失败 (${response.status})`);
        return response.json();
    };

    const resolvePayload = async ({ knowledgeBaseId, knowledgeBasePath }) => {
        const builtins = window.AppKnowledgeBases || {};

        if (knowledgeBaseId && builtins[knowledgeBaseId]) {
            return builtins[knowledgeBaseId];
        }

        if (builtins.default) {
            return builtins.default;
        }

        if (knowledgeBasePath) {
            return fetchPayload(knowledgeBasePath);
        }

        throw new Error('没有找到可用的本地知识库，请检查知识库 ID 或路径。');
    };

    const cacheKeyFromSettings = ({ ragKnowledgeBaseId, ragKnowledgeBasePath }) => {
        return `${ragKnowledgeBaseId || 'default'}::${ragKnowledgeBasePath || ''}`;
    };

    const loadKnowledgeBase = async (settings = {}) => {
        const cacheKey = cacheKeyFromSettings(settings);
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        const payload = await resolvePayload({
            knowledgeBaseId: settings.ragKnowledgeBaseId,
            knowledgeBasePath: settings.ragKnowledgeBasePath
        });
        const index = buildIndex(payload);
        cache.set(cacheKey, index);
        return index;
    };

    const toPublicResult = (chunk, score) => ({
        chunk_id: chunk.chunk_id,
        document_id: chunk.document_id,
        title: chunk.title,
        source_path: chunk.source_path,
        source_sha256: chunk.source_sha256,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        chunk_index: chunk.chunk_index,
        text_preview: chunk.text_preview || chunk.excerpt,
        text: excerptText(chunk.text || chunk.text_preview || ''),
        citations: Array.isArray(chunk.citations) ? chunk.citations : [],
        score: Number(score.toFixed(4)),
        page_label: formatPageRange(chunk.page_start, chunk.page_end)
    });

    const AppRag = {
        formatPageRange,

        async warmup(settings = {}) {
            const index = await loadKnowledgeBase(settings);
            return {
                documentId: index.document.document_id,
                title: index.document.title,
                chunkCount: index.document.chunk_count || index.chunks.length,
                pageCount: index.document.page_count || 0
            };
        },

        async search({ query, settings = {} }) {
            if (!settings.ragEnabled) {
                return { knowledgeBase: null, results: [] };
            }

            const normalizedQuery = normalizeText(query);
            if (!normalizedQuery) {
                return { knowledgeBase: null, results: [] };
            }

            const index = await loadKnowledgeBase(settings);
            const queryTokens = tokenize(normalizedQuery);
            if (!queryTokens.length) {
                return {
                    knowledgeBase: index.document,
                    results: []
                };
            }

            const querySet = new Set(queryTokens);
            const queryVector = vectorize(queryTokens);
            const topK = clamp(Number(settings.ragTopK) || 3, 1, 6);
            const minScore = clamp(Number(settings.ragMinScore) || 0, 0, 1);

            const ranked = index.chunks.map((chunk) => {
                const vectorScore = cosine(queryVector, chunk.vector);
                const lexicalScore = overlapScore(querySet, chunk.tokenSet);
                const score = vectorScore * 0.84 + lexicalScore * 0.16;
                return { chunk, score };
            })
                .filter((item) => item.score >= minScore)
                .sort((left, right) => right.score - left.score)
                .slice(0, topK)
                .map((item) => toPublicResult(item.chunk, item.score));

            return {
                knowledgeBase: index.document,
                results: ranked
            };
        }
    };

    window.AppRag = AppRag;
})();
