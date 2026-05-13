(() => {
    const CFG = window.AppConfig?.supabase;
    const SUPABASE_URL = CFG?.url || '';
    const ANON_KEY = CFG?.anonKey || '';
    const MISSING = !SUPABASE_URL || !ANON_KEY;

    // ── 读取当前 JWT（与 auth.js 保持一致） ──
    function _getToken() {
        const store = localStorage.getItem('sb_access_token')
            ? localStorage
            : (sessionStorage.getItem('sb_access_token') ? sessionStorage : null);
        return store?.getItem('sb_access_token') || null;
    }

    function _userId() {
        const token = _getToken();
        if (!token) return null;
        try {
            return JSON.parse(atob(token.split('.')[1])).sub || null;
        } catch { return null; }
    }

    // ── Supabase REST 请求 ──
    async function _request(method, table, opts = {}) {
        const token = _getToken();
        const headers = {
            'apikey': ANON_KEY,
            'Content-Type': 'application/json',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (opts.prefer) headers['Prefer'] = opts.prefer;

        let url = `${SUPABASE_URL}/rest/v1/${table}`;
        if (opts.query) url += `?${opts.query}`;

        const res = await fetch(url, {
            method,
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });

        if (!res.ok && opts.silent) return null;
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
        }
        if (method === 'DELETE' || res.status === 204) return null;
        return res.json();
    }

    // ── localStorage 读写（现有存储键保持兼容） ──
    const LK = window.AppConfig?.storageKeys || {};

    function _ls(key) { try { return localStorage.getItem(key); } catch { return null; } }
    function _lss(key, val) { try { localStorage.setItem(key, val); } catch {} }
    function _lsj(key) { try { return JSON.parse(_ls(key) || 'null'); } catch { return null; } }
    function _lssj(key, val) { _lss(key, JSON.stringify(val)); }
    function _lsrm(key) { try { localStorage.removeItem(key); } catch {} }

    // ── 公开 API ──

    const AppStorage = {
        ready: !MISSING,
        getUserId: _userId,
        getToken: _getToken,

        // ═══════════════════════════════════════
        //  会话 (Conversations)
        // ═══════════════════════════════════════

        /** 拉取当前用户的所有会话（按更新时间倒序） */
        async loadConversations() {
            const uid = _userId();
            if (!uid) return [];
            try {
                return await _request('GET', 'conversations', {
                    query: `user_id=eq.${uid}&order=updated_at.desc`,
                });
            } catch {
                return _lsj(LK.archives) || [];
            }
        },

        /** 创建或更新会话 */
        async saveConversation(data) {
            const uid = _userId();
            if (!uid) return null;
            const body = { ...data, user_id: uid, updated_at: new Date().toISOString() };
            try {
                if (data.id) {
                    return await _request('PATCH', 'conversations', {
                        query: `id=eq.${data.id}&user_id=eq.${uid}`,
                        body: { ...body, id: undefined },
                        prefer: 'return=representation',
                    });
                }
                return await _request('POST', 'conversations', {
                    body,
                    prefer: 'return=representation',
                });
            } catch {
                // 离线 fallback：存到 localStorage
                const archives = _lsj(LK.archives) || [];
                const idx = archives.findIndex((a) => a.id === data.id);
                const entry = { ...data, savedAt: Date.now() };
                if (idx >= 0) archives[idx] = entry;
                else archives.unshift(entry);
                _lssj(LK.archives, archives.slice(0, (window.AppConfig?.limits?.archiveLimit || 3)));
                return entry;
            }
        },

        /** 删除会话 */
        async deleteConversation(id) {
            const uid = _userId();
            if (!uid) return;
            try {
                await _request('DELETE', 'conversations', {
                    query: `id=eq.${id}&user_id=eq.${uid}`,
                });
            } catch {}
            // 同时清理本地
            const archives = _lsj(LK.archives) || [];
            _lssj(LK.archives, archives.filter((a) => a.id !== id));
        },

        // ═══════════════════════════════════════
        //  消息 (Messages)
        // ═══════════════════════════════════════

        /** 拉取某会话的所有消息 */
        async loadMessages(conversationId) {
            if (!conversationId) return [];
            try {
                return await _request('GET', 'messages', {
                    query: `conversation_id=eq.${conversationId}&order=created_at.asc`,
                });
            } catch { return []; }
        },

        /** 批量保存消息 */
        async saveMessages(conversationId, messages) {
            const uid = _userId();
            if (!uid || !conversationId || !messages?.length) return;
            try {
                const rows = messages.map((m) => ({
                    conversation_id: conversationId,
                    user_id: uid,
                    role: m.role || 'user',
                    content: m.content || '',
                    meta: m.meta || {},
                }));
                await _request('POST', 'messages', {
                    body: rows,
                    prefer: 'return=representation',
                    silent: true,
                });
            } catch {}
        },

        /** 追加单条消息 */
        async appendMessage(conversationId, message) {
            return this.saveMessages(conversationId, [message]);
        },

        // ═══════════════════════════════════════
        //  评估报告 (Reports)
        // ═══════════════════════════════════════

        /** 保存评估报告 */
        async saveReport(conversationId, reportData) {
            const uid = _userId();
            if (!uid || !conversationId) return null;
            try {
                return await _request('POST', 'reports', {
                    body: {
                        conversation_id: conversationId,
                        user_id: uid,
                        stage: reportData.stage || '',
                        stress: reportData.stress ?? 0,
                        friction: reportData.friction ?? 0,
                        risk: reportData.risk ?? 0,
                        resilience: reportData.resilience ?? 0,
                        warning_level: reportData.warningLevel || 'low',
                        core_issue: reportData.coreIssue || '',
                        cognitive_pattern: reportData.cognitivePattern || '',
                        support_focus: reportData.supportFocus || '',
                        recommended_style: reportData.recommendedStyle || '',
                        summary: reportData.summary || '',
                        next_steps: reportData.nextSteps || [],
                        crisis_signals: reportData.crisisSignals || [],
                        trend: reportData.trend || '',
                        follow_up: reportData.followUp || '',
                        full_report: reportData,
                    },
                    prefer: 'return=representation',
                });
            } catch { return null; }
        },

        /** 拉取某会话的所有报告 */
        async loadReports(conversationId) {
            if (!conversationId) return [];
            try {
                return await _request('GET', 'reports', {
                    query: `conversation_id=eq.${conversationId}&order=created_at.desc`,
                });
            } catch { return []; }
        },

        // ═══════════════════════════════════════
        //  长期记忆 (Memories)
        // ═══════════════════════════════════════

        /** 拉取当前用户的所有活跃记忆 */
        async loadMemories() {
            const uid = _userId();
            if (!uid) return [];
            try {
                return await _request('GET', 'memories', {
                    query: `user_id=eq.${uid}&is_active=eq.true&order=confidence.desc`,
                });
            } catch { return []; }
        },

        /** 按类型拉取记忆 */
        async loadMemoriesByType(type) {
            const uid = _userId();
            if (!uid) return [];
            try {
                return await _request('GET', 'memories', {
                    query: `user_id=eq.${uid}&type=eq.${type}&is_active=eq.true&order=confidence.desc`,
                });
            } catch { return []; }
        },

        /** 新增记忆 */
        async saveMemory(data) {
            const uid = _userId();
            if (!uid) return null;
            try {
                return await _request('POST', 'memories', {
                    body: {
                        user_id: uid,
                        type: data.type || 'preference',
                        content: data.content || '',
                        confidence: data.confidence ?? 0.5,
                        source: data.source || '',
                    },
                    prefer: 'return=representation',
                });
            } catch { return null; }
        },

        /** 批量保存记忆 */
        async saveMemories(memories) {
            const uid = _userId();
            if (!uid || !memories?.length) return;
            try {
                const rows = memories.map((m) => ({
                    user_id: uid,
                    type: m.type || 'preference',
                    content: m.content || '',
                    confidence: m.confidence ?? 0.5,
                    source: m.source || '',
                }));
                await _request('POST', 'memories', {
                    body: rows,
                    prefer: 'return=representation',
                    silent: true,
                });
            } catch {}
        },

        /** 删除记忆 */
        async deleteMemory(id) {
            const uid = _userId();
            if (!uid) return;
            try {
                await _request('DELETE', 'memories', {
                    query: `id=eq.${id}&user_id=eq.${uid}`,
                });
            } catch {}
        },

        /** 软删除（标记为非活跃） */
        async deactivateMemory(id) {
            const uid = _userId();
            if (!uid) return;
            try {
                await _request('PATCH', 'memories', {
                    query: `id=eq.${id}&user_id=eq.${uid}`,
                    body: { is_active: false },
                });
            } catch {}
        },

        // ═══════════════════════════════════════
        //  用户设置 (Settings)
        // ═══════════════════════════════════════

        /** 拉取用户设置 */
        async loadSettings() {
            const uid = _userId();
            if (!uid) return null;
            try {
                const rows = await _request('GET', 'settings', {
                    query: `user_id=eq.${uid}&limit=1`,
                });
                return rows?.[0] || null;
            } catch { return null; }
        },

        /** 保存用户设置（upsert） */
        async saveSettings(data) {
            const uid = _userId();
            if (!uid) return null;
            try {
                return await _request('POST', 'settings', {
                    query: 'on_conflict=user_id',
                    body: { ...data, user_id: uid },
                    prefer: 'resolution=merge-duplicates,return=representation',
                    silent: true,
                });
            } catch { return null; }
        },

        // ═══════════════════════════════════════
        //  用户资料 (Profiles)
        // ═══════════════════════════════════════

        /** 拉取用户资料 */
        async loadProfile() {
            const uid = _userId();
            if (!uid) return null;
            try {
                const rows = await _request('GET', 'profiles', {
                    query: `id=eq.${uid}&limit=1`,
                });
                return rows?.[0] || null;
            } catch { return null; }
        },

        /** 保存用户资料（upsert） */
        async saveProfile(data) {
            const uid = _userId();
            if (!uid) return null;
            try {
                return await _request('POST', 'profiles', {
                    query: 'on_conflict=id',
                    body: { id: uid, ...data, updated_at: new Date().toISOString() },
                    prefer: 'resolution=merge-duplicates,return=representation',
                });
            } catch { return null; }
        },

        // ═══════════════════════════════════════
        //  实用工具
        // ═══════════════════════════════════════

        /** 构建记忆上下文文本（给 AI 用） */
        buildMemoryContext(memories) {
            if (!memories?.length) return '';
            const groups = {};
            const typeLabels = {
                preference: '用户偏好',
                concern: '长期困扰',
                background: '重要背景',
                risk: '风险信号',
                resource: '支持资源',
                taboo: '禁忌表达',
            };
            memories.forEach((m) => {
                const key = typeLabels[m.type] || m.type;
                if (!groups[key]) groups[key] = [];
                groups[key].push(m.content);
            });
            const lines = Object.entries(groups).map(([label, items]) =>
                `- ${label}：${items.join('；')}`
            );
            return `【关于此用户的长期记忆】\n${lines.join('\n')}\n（以上信息由系统自动提取，用于让陪伴更连续）`;
        },
    };

    window.AppStorage = AppStorage;
})();
