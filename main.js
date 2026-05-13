(() => {
    const Config = window.AppConfig;
    const Api = window.AppApi;
    const Rag = window.AppRag;
    const UI = window.AppUI;

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const toInt = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    };
    const toFloat = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    // ═══════════════════════════════════════════════
    //  Canvas 城市夜景 + 雨丝动画
    // ═══════════════════════════════════════════════
    let rainController = null;

    function startRain(canvasId, opts = {}) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        let drops = [];
        let buildings = [];
        let winLights = [];
        let opacity = 1;
        let animId = null;
        let running = true;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (opts.city) generateCity();
        }

        function generateCity() {
            buildings = [];
            winLights = [];
            const w = canvas.width;
            const h = canvas.height;
            const groundY = h * 0.92;
            const skyH = h * 0.35;
            const maxBh = groundY - skyH;
            let x = 0;
            while (x < w + 20) {
                const bw = 50 + Math.random() * 100;
                const bh = 40 + Math.random() * maxBh;
                const bColor = 215 + Math.random() * 20;
                const bLight = 8 + Math.random() * 10;
                buildings.push({ x, width: bw, height: bh, color: `hsl(${bColor}, 12%, ${bLight}%)` });

                const cols = Math.max(1, Math.floor((bw - 8) / 20));
                const rows = Math.max(1, Math.floor((bh - 10) / 22));
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (Math.random() > 0.4) {
                            winLights.push({
                                x: x + 6 + c * 20,
                                y: groundY - bh + 6 + r * 22,
                                w: 5 + Math.random() * 6,
                                h: 7 + Math.random() * 6,
                                on: Math.random() > 0.35,
                                phase: Math.random() * Math.PI * 2,
                                warm: 25 + Math.random() * 20
                            });
                        }
                    }
                }
                x += bw + 2 + Math.random() * 8;
            }
        }

        function createDrops(count) {
            drops = [];
            const fine = opts.fine !== false; // 默认极细雨丝
            for (let i = 0; i < count; i++) {
                drops.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height * -1,
                    length: fine ? 18 + Math.random() * 20 : 14 + Math.random() * 24,
                    speed: fine ? 6 + Math.random() * 8 : 7 + Math.random() * 13,
                    dropOpacity: fine ? 0.12 + Math.random() * 0.25 : 0.3 + Math.random() * 0.5,
                    width: fine ? 0.3 + Math.random() * 0.7 : 1.0 + Math.random() * 1.5,
                    wind: fine ? 0.6 + Math.random() * 0.5 : 0.8 + Math.random() * 0.6
                });
            }
        }

        function drawCity() {
            const w = canvas.width;
            const h = canvas.height;
            const groundY = h * 0.92;
            const skyH = h * 0.35;

            // 夜空渐变（顶部 skyH 范围）
            const grad = ctx.createLinearGradient(0, 0, 0, skyH);
            grad.addColorStop(0, '#010308');
            grad.addColorStop(0.5, '#050b16');
            grad.addColorStop(1, '#0b1422');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, skyH);

            // 城市背景（建筑后面的深色区域）
            ctx.fillStyle = '#080c14';
            ctx.fillRect(0, skyH, w, groundY - skyH);

            // 地面（最底部细条）
            ctx.fillStyle = '#05080e';
            ctx.fillRect(0, groundY, w, h - groundY);

            // 建筑
            for (const b of buildings) {
                ctx.fillStyle = b.color;
                ctx.fillRect(b.x, groundY - b.height, b.width, b.height);
                ctx.fillStyle = 'rgba(255,255,255,0.015)';
                ctx.fillRect(b.x, groundY - b.height, 1, b.height);
            }

            // 窗户灯光（带呼吸闪烁）
            const now = Date.now() / 3000;
            ctx.shadowColor = 'rgba(255, 200, 130, 0.12)';
            ctx.shadowBlur = 6;
            for (const wl of winLights) {
                if (!wl.on) continue;
                const pulse = 0.55 + 0.45 * Math.sin(now + wl.phase);
                const alpha = pulse * 0.85;
                ctx.fillStyle = `rgba(255, ${220 - wl.warm * 0.4}, ${150 - wl.warm * 0.3}, ${alpha})`;
                ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
            }
            ctx.shadowBlur = 0;

            // 随机开关灯
            if (Math.random() < 0.015) {
                const idx = Math.floor(Math.random() * winLights.length);
                if (winLights[idx]) winLights[idx].on = !winLights[idx].on;
            }
        }

        function draw() {
            if (!running) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 城市背景
            if (opts.city) drawCity();

            // 雨丝
            ctx.lineCap = 'round';
            for (const d of drops) {
                const alpha = opacity * d.dropOpacity;
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + d.wind * 2.5, d.y + d.length);
                ctx.strokeStyle = `hsla(215, 50%, 80%, ${alpha})`;
                ctx.lineWidth = d.width;
                ctx.stroke();
                d.y += d.speed;
                d.x += d.wind;
                if (d.y - d.length > canvas.height) { d.y = -d.length; d.x = Math.random() * canvas.width; }
                if (d.x > canvas.width + 20) d.x = -20;
                if (d.x < -20) d.x = canvas.width + 20;
            }
            animId = requestAnimationFrame(draw);
        }

        function fadeOut(duration = 1200) {
            const start = performance.now();
            function step(now) {
                if (!running) return;
                const t = Math.min((now - start) / duration, 1);
                opacity = 1 - t;
                if (t >= 1) {
                    running = false;
                    cancelAnimationFrame(animId);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    canvas.style.display = 'none';
                    return;
                }
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        function destroy() { running = false; cancelAnimationFrame(animId); }

        function zoomToWindow(duration = 2000, onComplete) {
            // 选一个亮着的窗户作为焦点
            const litWindows = winLights.filter(w => w.on);
            if (litWindows.length === 0) { if (onComplete) onComplete(); return; }
            const target = litWindows[Math.floor(Math.random() * litWindows.length)];
            const cx = target.x + target.w / 2;
            const cy = target.y + target.h / 2;
            const startTime = performance.now();

            // 停止普通动画循环
            running = false;
            if (animId) cancelAnimationFrame(animId);

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            canvas.style.opacity = 1;
            canvas.style.display = '';

            function step(now) {
                const t = Math.min((now - startTime) / duration, 1);
                // ease-out cubic: 快起慢收
                const ease = 1 - Math.pow(1 - t, 3);
                const scale = 1 + ease * 28;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(scale, scale);
                ctx.translate(-cx, -cy);

                drawCity();

                // 雨丝慢慢消失
                ctx.globalAlpha = Math.max(0, 1 - ease * 1.8);
                ctx.lineCap = 'round';
                for (const d of drops) {
                    const alpha = ctx.globalAlpha * d.dropOpacity;
                    ctx.beginPath();
                    ctx.moveTo(d.x, d.y);
                    ctx.lineTo(d.x + d.wind * 2.5, d.y + d.length);
                    ctx.strokeStyle = `hsla(215, 50%, 80%, ${alpha})`;
                    ctx.lineWidth = d.width;
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.restore();

                // 暖光覆盖层——窗户光晕慢慢填满屏幕
                if (ease > 0.15) {
                    const glow = Math.min((ease - 0.15) / 0.6, 1) * 0.7;
                    ctx.fillStyle = `rgba(255, 200, 130, ${glow})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                // 最末段再叠加柔白淡入
                if (t > 0.75) {
                    const whiteFade = (t - 0.75) / 0.25;
                    ctx.fillStyle = `rgba(255, 248, 240, ${whiteFade * 0.5})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                // canvas 整体淡出
                if (t > 0.65) {
                    canvas.style.opacity = Math.max(0, 1 - (t - 0.65) / 0.35);
                }

                if (t >= 1) {
                    canvas.style.display = 'none';
                    if (onComplete) onComplete();
                    return;
                }
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        resize();
        createDrops(opts.dropCount || 180);
        draw();
        window.addEventListener('resize', resize);
        return { fadeOut, destroy, resize, createDrops, zoomToWindow };
    }

    const featureLabelMap = {
        gentle: '温柔追问',
        review: '动态复评画像',
        knowledge: '知识库辅助',
        journal: '情绪记录建议',
        safety: '安全优先模式'
    };

    const defaultFeatureIds = (settings = Config.defaults) => [
        'gentle',
        'review',
        ...(settings.ragEnabled ? ['knowledge'] : [])
    ];

    const createSessionState = (settings = Config.defaults) => ({
        phase: 'idle',
        onboardingStep: 'warmup',
        warmupProfile: {
            mood: '',
            concern: '',
            body: '',
            preference: '温柔接住，慢慢澄清',
            hope: ''
        },
        selectedFeatureIds: defaultFeatureIds(settings),
        selectedTagIds: [],
        history: [],
        displayMessages: [],
        reports: [],
        latestReport: null,
        intakeTurnsCompleted: 0,
        totalUserTurns: 0,
        therapyTurnsSinceReview: 0,
        activeArchiveId: null,
        isBusy: false
    });

    const initialSettings = loadSettings();
    const State = {
        ...createSessionState(initialSettings),
        settings: initialSettings
    };

    function loadSettings() {
        const raw = localStorage.getItem(Config.storageKeys.settings);
        const saved = raw ? JSON.parse(raw) : {};
        const legacyApiKey = localStorage.getItem(Config.storageKeys.legacyApiKey) || '';

        return {
            apiBase: saved.apiBase || Config.defaults.apiBase,
            apiKey: saved.apiKey || legacyApiKey || '',
            assessModel: saved.assessModel || Config.defaults.assessModel,
            therapyModel: saved.therapyModel || Config.defaults.therapyModel,
            assessEnableThinking: typeof saved.assessEnableThinking === 'boolean'
                ? saved.assessEnableThinking
                : Config.defaults.assessEnableThinking,
            therapyEnableThinking: typeof saved.therapyEnableThinking === 'boolean'
                ? saved.therapyEnableThinking
                : Config.defaults.therapyEnableThinking,
            intakeTurns: clamp(toInt(saved.intakeTurns, Config.defaults.intakeTurns), 2, 8),
            reassessEvery: clamp(toInt(saved.reassessEvery, Config.defaults.reassessEvery), 3, 12),
            ragEnabled: typeof saved.ragEnabled === 'boolean' ? saved.ragEnabled : Config.defaults.ragEnabled,
            ragKnowledgeBaseId: saved.ragKnowledgeBaseId || Config.defaults.ragKnowledgeBaseId,
            ragKnowledgeBasePath: saved.ragKnowledgeBasePath || Config.defaults.ragKnowledgeBasePath,
            ragTopK: clamp(toInt(saved.ragTopK, Config.defaults.ragTopK), 1, 6),
            ragMinScore: clamp(toFloat(saved.ragMinScore, Config.defaults.ragMinScore), 0, 1),
            enableMusic: typeof saved.enableMusic === 'boolean' ? saved.enableMusic : Config.defaults.enableMusic
        };
    }

    function persistSettings() {
        localStorage.setItem(Config.storageKeys.settings, JSON.stringify(State.settings));
        localStorage.setItem(Config.storageKeys.legacyApiKey, State.settings.apiKey || '');
    }

    function applyFeatureSettings() {
        State.settings = {
            ...State.settings,
            ragEnabled: State.selectedFeatureIds.includes('knowledge'),
            intakeTurns: State.selectedFeatureIds.includes('gentle')
                ? Math.max(4, State.settings.intakeTurns)
                : State.settings.intakeTurns,
            reassessEvery: State.selectedFeatureIds.includes('review')
                ? Math.min(State.settings.reassessEvery, 6)
                : 12
        };
        persistSettings();
        UI.writeSettings(State.settings);
    }

    function getSelectedTags() {
        return Config.tags.filter((tag) => State.selectedTagIds.includes(tag.id));
    }

    function getSelectedTagLabels() {
        return getSelectedTags().map((tag) => tag.label);
    }

    function getSelectedFeatureLabels() {
        return State.selectedFeatureIds
            .map((id) => featureLabelMap[id])
            .filter(Boolean);
    }

    function buildOnboardingPromptContext() {
        const profile = State.warmupProfile || {};
        const lines = [
            profile.mood ? `用户自述当前状态：${profile.mood}` : '',
            profile.concern ? `用户最想先被听见的事：${profile.concern}` : '',
            profile.body ? `身体或生活受影响：${profile.body}` : '',
            profile.preference ? `期待的对话方式：${profile.preference}` : '',
            profile.hope ? `本次对话期待获得：${profile.hope}` : '',
            getSelectedFeatureLabels().length ? `用户选择的功能偏好：${getSelectedFeatureLabels().join('、')}` : ''
        ].filter(Boolean);

        if (!lines.length) return '';

        return [
            '【前置引导信息】',
            ...lines,
            '请把这些信息当作开场背景，而不是逐条复述给用户。'
        ].join('\n');
    }

    function syncProfileSummary() {
        UI.renderProfileSummary({
            profile: State.warmupProfile,
            tags: getSelectedTagLabels(),
            features: getSelectedFeatureLabels()
        });
    }

    function phaseLabel(phase = State.phase) {
        if (phase === 'intake') return '建档中';
        if (phase === 'therapy') return '陪伴中';
        return '未开始';
    }

    function normalizeWarningLevel(level, risk) {
        const normalized = String(level || '').toLowerCase();
        if (['low', 'medium', 'high', 'critical'].includes(normalized)) return normalized;
        if (risk >= 85) return 'critical';
        if (risk >= 65) return 'high';
        if (risk >= 40) return 'medium';
        return 'low';
    }

    function normalizeList(value, fallback) {
        if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 4);
        if (typeof value === 'string' && value.trim()) return [value.trim()];
        return fallback;
    }

    function normalizeReport(raw, checkpointIndex, reportPhase) {
        const risk = clamp(toInt(raw.risk, 20), 0, 100);
        const report = {
            checkpointIndex,
            phase: reportPhase,
            createdAt: Date.now(),
            stage: String(raw.stage || (reportPhase === 'initial' ? '首次建档' : '持续追踪')).trim(),
            stress: clamp(toInt(raw.stress, 50), 0, 100),
            friction: clamp(toInt(raw.friction, 50), 0, 100),
            risk,
            resilience: clamp(toInt(raw.resilience, 50), 0, 100),
            warningLevel: normalizeWarningLevel(raw.warningLevel, risk),
            coreIssue: String(raw.coreIssue || '当前核心困扰仍需继续梳理').trim(),
            cognitivePattern: String(raw.cognitivePattern || '认知模式仍在观察中').trim(),
            supportFocus: String(raw.supportFocus || '先稳定感受，再逐步澄清触发点').trim(),
            recommendedStyle: String(raw.recommendedStyle || '温柔、结构化、少评判').trim(),
            summary: String(raw.summary || raw.coreIssue || '暂无总结').trim(),
            nextSteps: normalizeList(raw.nextSteps, ['先把情绪和身体状态稳下来', '继续澄清触发点', '建立一个可执行的小动作']),
            crisisSignals: normalizeList(raw.crisisSignals, []),
            trend: String(raw.trend || (reportPhase === 'initial' ? '首次建档' : '波动')).trim(),
            followUp: String(raw.followUp || '继续追踪情绪强度、功能受损和支持系统').trim()
        };

        if (report.warningLevel === 'critical' && !report.crisisSignals.length) {
            report.crisisSignals = ['存在迫切的安全风险，需要先确认现实中的支持与保护'];
        }

        return report;
    }

    function parseReport(rawText, reportPhase) {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('评估模型没有返回合法 JSON');
        const parsed = JSON.parse(match[0]);
        return normalizeReport(parsed, State.reports.length + 1, reportPhase);
    }

    function summarizeReportsForPrompt() {
        return State.reports.slice(-3).map((report) => [
            `第${report.checkpointIndex}次评估`,
            `时间:${new Date(report.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
            `阶段:${report.stage}`,
            `总结:${report.summary}`,
            `风险:${report.warningLevel}`,
            `下次关注:${report.followUp}`
        ].join('；')).join('\n');
    }

    function visibleAssistantError(error, fallbackPrefix) {
        return `${fallbackPrefix}: ${error.message || '链路暂时中断'}`;
    }

    function createAssistantMeta({ model, role, stage, stageLabel, sources = [], failed = false }) {
        return {
            model: model || '',
            role: role || 'assistant',
            stage: stage || 'reply',
            stageLabel: stageLabel || '普通回复',
            sourceCount: Array.isArray(sources) ? sources.length : 0,
            failed: Boolean(failed)
        };
    }

    function updateStatusFromState(customText) {
        if (State.phase === 'idle') {
            UI.updateStatus(customText || '等待完成引导...', 'idle');
            return;
        }

        if (State.phase === 'intake') {
            UI.updateStatus(customText || `[${State.settings.assessModel}] 初评建档中`, 'assess');
            return;
        }

        const warning = ['high', 'critical'].includes(State.latestReport?.warningLevel);
        UI.updateStatus(
            customText || `[${State.settings.therapyModel}] 持续陪伴中`,
            warning ? 'warning' : 'therapy'
        );
    }

    function setBusy(flag) {
        State.isBusy = flag;
        const locked = State.phase === 'idle';
        UI.els.input.disabled = flag || locked;
        UI.els.sendBtn.disabled = flag || locked;
    }

    function addDisplayMessage(text, role, isSystem = false, extra = {}) {
        const message = { text, role, isSystem, ...extra };
        State.displayMessages.push(message);
        UI.appendMessage(message);
    }

    function resetSession() {
        Object.assign(State, createSessionState(State.settings), { settings: State.settings });
    }

    function baseConversation() {
        return State.history.filter((item) => item.role !== 'system');
    }

    function setSystemPrompt(content) {
        State.history = [{ role: 'system', content }, ...baseConversation()];
    }

    function insertSystemMessage(messages, content) {
        if (!content) return messages;
        if (messages[0]?.role === 'system') {
            return [messages[0], { role: 'system', content }, ...messages.slice(1)];
        }
        return [{ role: 'system', content }, ...messages];
    }

    function ensureApiReady() {
        if (State.settings.apiKey) return true;
        alert('请先在引导中配置 API Key。');
        return false;
    }

    function syncKeywordUI() {
        UI.renderTags(State.selectedTagIds, State.phase);
    }

    function currentArchiveTitle() {
        const lastUserText = [...State.displayMessages].reverse().find((message) => message.role === 'user')?.text;
        if (lastUserText) return lastUserText.slice(0, 18);
        const labels = getSelectedTagLabels();
        return labels.length ? labels.join(' / ').slice(0, 18) : '未命名对话';
    }

    const Archive = {
        getAll() {
            const raw = localStorage.getItem(Config.storageKeys.archives);
            const archives = raw ? JSON.parse(raw) : [];
            return archives.sort((a, b) => b.savedAt - a.savedAt);
        },

        saveAll(archives) {
            localStorage.setItem(Config.storageKeys.archives, JSON.stringify(archives));
        },

        createSnapshot() {
            return {
                id: `archive_${Date.now()}`,
                savedAt: Date.now(),
                title: currentArchiveTitle(),
                meta: new Date().toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                phaseLabel: phaseLabel(),
                keywords: getSelectedTagLabels().join('、'),
                state: {
                    phase: State.phase,
                    onboardingStep: State.onboardingStep,
                    warmupProfile: clone(State.warmupProfile),
                    selectedFeatureIds: clone(State.selectedFeatureIds),
                    selectedTagIds: clone(State.selectedTagIds),
                    history: clone(State.history),
                    displayMessages: clone(State.displayMessages),
                    reports: clone(State.reports),
                    latestReport: clone(State.latestReport),
                    intakeTurnsCompleted: State.intakeTurnsCompleted,
                    totalUserTurns: State.totalUserTurns,
                    therapyTurnsSinceReview: State.therapyTurnsSinceReview
                }
            };
        },

        saveCurrent() {
            if (!State.displayMessages.length && !State.selectedTagIds.length) {
                alert('当前还没有可存档的内容。');
                return false;
            }

            const archives = this.getAll().filter((item) => item.id !== State.activeArchiveId);
            const snapshot = this.createSnapshot();
            archives.unshift(snapshot);
            this.saveAll(archives.slice(0, Config.limits.archiveLimit));
            State.activeArchiveId = snapshot.id;
            return true;
        },

        remove(id) {
            const archives = this.getAll().filter((item) => item.id !== id);
            this.saveAll(archives);
            if (State.activeArchiveId === id) State.activeArchiveId = null;
        },

        find(id) {
            return this.getAll().find((item) => item.id === id);
        }
    };

    async function refreshRagStatus() {
        if (!UI.updateRagStatus) return null;

        if (!State.settings.ragEnabled) {
            UI.updateRagStatus('RAG 已关闭，本轮不会检索本地知识库。', 'muted');
            return null;
        }

        if (!Rag) {
            UI.updateRagStatus('RAG 模块未加载，无法使用本地知识库。', 'error');
            return null;
        }

        try {
            const info = await Rag.warmup(State.settings);
            UI.updateRagStatus(`已加载知识库：${info.title} · ${info.chunkCount} 段 / ${info.pageCount} 页`, 'ready');
            return info;
        } catch (error) {
            console.error(error);
            UI.updateRagStatus(`知识库加载失败：${error.message || '无法读取知识库'}`, 'error');
            return null;
        }
    }

    function toCitationSources(results = []) {
        return results.map((item) => ({
            chunkId: item.chunk_id,
            title: item.title,
            pageStart: item.page_start,
            pageEnd: item.page_end,
            pageLabel: item.page_label,
            textPreview: item.text_preview,
            score: item.score,
            sourcePath: item.source_path
        }));
    }

    async function buildRagAugmentedMessages({ messages, userQuery }) {
        if (!State.settings.ragEnabled || !userQuery?.trim() || !Rag) {
            return { messages, sources: [] };
        }

        try {
            const { knowledgeBase, results } = await Rag.search({
                query: userQuery,
                settings: State.settings
            });

            if (!results.length) {
                UI.updateRagStatus('本轮没有命中足够相关的知识片段，已按普通对话继续。', 'muted');
                return { messages, sources: [] };
            }

            UI.updateRagStatus(`本轮命中 ${results.length} 条知识片段 · ${knowledgeBase?.title || '本地知识库'}`, 'ready');
            return {
                messages: insertSystemMessage(
                    messages,
                    Config.prompts.buildRagContextPrompt({
                        query: userQuery,
                        knowledgeBase,
                        results
                    })
                ),
                sources: toCitationSources(results)
            };
        } catch (error) {
            console.error(error);
            UI.updateRagStatus(`知识库检索失败：${error.message || '暂时无法检索'}`, 'error');
            return { messages, sources: [] };
        }
    }

    async function streamAssistantReply({
        model,
        messages,
        temperature,
        errorPrefix,
        userQuery = '',
        messageMeta = {},
        enableThinking
    }) {
        const { messages: requestMessages, sources } = await buildRagAugmentedMessages({ messages, userQuery });
        const handle = UI.beginAssistantStream();

        try {
            const fullText = await Api.streamChat({
                apiBase: State.settings.apiBase,
                apiKey: State.settings.apiKey,
                model,
                messages: requestMessages,
                temperature,
                enableThinking,
                onChunk: (text) => UI.updateAssistantStream(handle, text)
            });

            if (!fullText || !fullText.trim()) throw new Error('模型没有返回内容');

            const meta = createAssistantMeta({
                model,
                sources,
                ...messageMeta
            });

            UI.finishAssistantStream(handle, fullText, sources, meta);
            State.displayMessages.push({ text: fullText, role: 'assistant', isSystem: false, sources, meta });
            State.history.push({ role: 'assistant', content: fullText });
            return fullText;
        } catch (error) {
            const message = visibleAssistantError(error, errorPrefix);
            const meta = createAssistantMeta({
                model,
                sources: [],
                failed: true,
                ...messageMeta
            });

            UI.finishAssistantStream(handle, message, [], meta);
            State.displayMessages.push({ text: message, role: 'assistant', isSystem: false, meta });
            return null;
        }
    }

    async function generateAssessment(reportPhase) {
        UI.addTyping();
        updateStatusFromState(`[${State.settings.assessModel}] ${reportPhase === 'initial' ? '生成初评画像...' : '更新追踪画像...'}`);

        try {
            const raw = await Api.chat({
                apiBase: State.settings.apiBase,
                apiKey: State.settings.apiKey,
                model: State.settings.assessModel,
                enableThinking: State.settings.assessEnableThinking,
                messages: [
                    ...State.history,
                    {
                        role: 'user',
                        content: [
                            Config.prompts.buildAssessmentJsonPrompt({
                                tags: getSelectedTagLabels(),
                                checkpointIndex: State.reports.length + 1,
                                phaseLabel: reportPhase === 'initial' ? '首轮建档' : '持续追踪',
                                totalUserTurns: State.totalUserTurns,
                                previousReportsSummary: summarizeReportsForPrompt()
                            }),
                            buildOnboardingPromptContext()
                        ].filter(Boolean).join('\n\n')
                    }
                ],
                temperature: Config.defaults.assessTemperature
            });

            const report = parseReport(raw, reportPhase);
            report.meta = {
                model: State.settings.assessModel,
                role: 'assessment',
                stage: reportPhase === 'initial' ? 'assessment-initial' : 'assessment-followup',
                stageLabel: reportPhase === 'initial' ? '首次评估画像' : '追踪评估画像'
            };
            State.latestReport = report;
            State.reports.push(report);
            State.therapyTurnsSinceReview = 0;
            UI.showReport(report, State.reports);
            return report;
        } finally {
            UI.removeTyping();
        }
    }

    function rebuildTherapyContext() {
        if (!State.latestReport) return;
        setSystemPrompt([
            Config.prompts.buildTherapySystem({
                tags: getSelectedTagLabels(),
                latestReport: State.latestReport,
                previousReportsSummary: summarizeReportsForPrompt()
            }),
            buildOnboardingPromptContext()
        ].filter(Boolean).join('\n\n'));
    }

    async function startIntakeFlow() {
        State.phase = 'intake';
        const onboardingContext = buildOnboardingPromptContext();
        State.history = [{
            role: 'system',
            content: [
                Config.prompts.buildAssessSystem({
                    tags: getSelectedTagLabels(),
                    intakeTurns: State.settings.intakeTurns
                }),
                onboardingContext
            ].filter(Boolean).join('\n\n')
        }];

        UI.showChatWorkspace();
        UI.unlockChat();
        syncKeywordUI();
        syncProfileSummary();
        updateStatusFromState();

        await streamAssistantReply({
            model: State.settings.assessModel,
            enableThinking: State.settings.assessEnableThinking,
            messages: [
                ...State.history,
                {
                    role: 'user',
                    content: [
                        Config.prompts.buildKickoffPrompt({
                            tags: getSelectedTagLabels()
                        }),
                        onboardingContext ? '请结合前置引导信息，先问一个最自然、最温和的问题。' : ''
                    ].filter(Boolean).join('\n\n')
                }
            ],
            temperature: Config.defaults.assessTemperature,
            errorPrefix: '建档模型唤醒失败',
            messageMeta: {
                role: 'assessment',
                stage: 'intake-kickoff',
                stageLabel: '建档开场提问'
            }
        });
    }

    async function finishInitialAssessment() {
        const report = await generateAssessment('initial');
        addDisplayMessage('初始建档完成，已切换到持续陪伴模式。', 'system', true);

        // ── 切换到疗愈模式布局：医生在左，对话在右 ──
        document.querySelector('.main-layout')?.classList.remove('layout-intake');
        document.getElementById('bgImage')?.classList.add('sharp');

        State.phase = 'therapy';
        rebuildTherapyContext();
        updateStatusFromState();

        if (['high', 'critical'].includes(report.warningLevel)) {
            addDisplayMessage('检测到较高风险信号，接下来会优先稳定情绪、确认安全，并提醒使用现实中的支持资源。', 'system', true);
        }

        await streamAssistantReply({
            model: State.settings.therapyModel,
            enableThinking: State.settings.therapyEnableThinking,
            messages: State.history,
            temperature: Config.defaults.therapyTemperature,
            errorPrefix: '疗愈模型连接失败',
            messageMeta: {
                role: 'therapy',
                stage: 'therapy-handoff',
                stageLabel: '进入陪伴模式'
            }
        });
    }

    async function maybeReassessBeforeTherapyReply() {
        if (State.therapyTurnsSinceReview < State.settings.reassessEvery) return;

        const report = await generateAssessment('followup');
        rebuildTherapyContext();
        addDisplayMessage(`已完成第 ${report.checkpointIndex} 次追踪评估，陪伴策略已更新。`, 'system', true);

        if (['high', 'critical'].includes(report.warningLevel)) {
            addDisplayMessage('当前评估提示风险在上升，后续会优先确认你现在是否安全，以及你身边能联系到谁。', 'system', true);
        }
    }

    function restoreSession(snapshot) {
        const phaseMap = { 0: 'idle', 1: 'intake', 2: 'therapy' };
        const loadedPhase = phaseMap[snapshot.phase] || snapshot.phase || 'idle';
        const selectedTagIds = Array.isArray(snapshot.selectedTagIds)
            ? snapshot.selectedTagIds
            : (snapshot.selectedTag ? Config.tags.filter((tag) => tag.label === snapshot.selectedTag).map((tag) => tag.id) : []);
        const displayMessages = snapshot.displayMessages || snapshot.messages || [];
        const reports = snapshot.reports || (snapshot.latestReport || snapshot.report ? [snapshot.latestReport || snapshot.report] : []);
        const latestReport = snapshot.latestReport || snapshot.report || reports[reports.length - 1] || null;

        Object.assign(State, createSessionState(State.settings), {
            settings: State.settings,
            phase: loadedPhase,
            onboardingStep: snapshot.onboardingStep || (loadedPhase === 'idle' ? 'focus' : 'features'),
            warmupProfile: clone(snapshot.warmupProfile || createSessionState(State.settings).warmupProfile),
            selectedFeatureIds: Array.isArray(snapshot.selectedFeatureIds)
                ? clone(snapshot.selectedFeatureIds)
                : defaultFeatureIds(State.settings),
            selectedTagIds,
            history: clone(snapshot.history || []),
            displayMessages: clone(displayMessages),
            reports: clone(reports),
            latestReport: clone(latestReport),
            intakeTurnsCompleted: toInt(snapshot.intakeTurnsCompleted ?? snapshot.assessTurns, 0),
            totalUserTurns: toInt(snapshot.totalUserTurns, 0),
            therapyTurnsSinceReview: toInt(snapshot.therapyTurnsSinceReview, 0)
        });
    }

    const App = {
        init() {
            UI.init();
            UI.bindHandlers({
                onToggleTag: (tagId) => this.toggleTag(tagId),
                onOpenSettings: () => UI.toggleModal('settingsModal', true),
                onCloseSettings: () => UI.toggleModal('settingsModal', false),
                onSaveSettings: () => this.saveSettings(),
                onIntroNext: () => this.completeApiStep(),
                onWarmupBack: () => this.goToOnboardingStep('warmup'),
                onWarmupNext: () => this.completeWarmupStep(),
                onFocusBack: () => this.goToOnboardingStep('warmup'),
                onFocusNext: () => this.completeFocusStep(),
                onFeatureBack: () => this.goToOnboardingStep('focus'),
                onEditOnboarding: () => this.editOnboarding(),
                onSetMood: (mood) => this.setMood(mood),
                onToggleFeature: (featureId) => this.toggleFeature(featureId),
                onStartAssessment: () => this.startAssessment(),
                onSend: () => this.handleChat(),
                onSaveArchive: () => this.saveArchive(),
                onNewChat: () => this.newChat(),
                onLoadArchive: (id) => this.loadArchive(id),
                onDeleteArchive: (id) => this.deleteArchive(id)
            });

            UI.writeSettings(State.settings);
            UI.writeWarmupProfile(State.warmupProfile);
            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncKeywordUI();
            syncProfileSummary();
            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            UI.showOnboarding('warmup');
            UI.lockChat();
            updateStatusFromState();
            refreshRagStatus();
        },

        goToOnboardingStep(step) {
            State.onboardingStep = step;
            UI.setOnboardingStep(step);
        },

        completeApiStep() {
            const next = UI.readSetupSettings();
            State.settings = {
                ...State.settings,
                apiBase: next.apiBase || Config.defaults.apiBase,
                apiKey: next.apiKey || '',
                assessModel: next.assessModel || Config.defaults.assessModel,
                therapyModel: next.therapyModel || Config.defaults.therapyModel,
                ragEnabled: Boolean(next.ragEnabled)
            };

            State.selectedFeatureIds = State.settings.ragEnabled
                ? Array.from(new Set([...State.selectedFeatureIds, 'knowledge']))
                : State.selectedFeatureIds.filter((id) => id !== 'knowledge');

            persistSettings();
            UI.writeSettings(State.settings);
            UI.renderFeatureSelection(State.selectedFeatureIds);
            UI.setSetupStatus(State.settings.apiKey ? '连接信息已保存。' : '可以继续预览流程，进入聊天前仍需要 API Key。', State.settings.apiKey ? 'ready' : 'warning');
            refreshRagStatus();
            this.startAssessment();
        },

        setMood(mood) {
            State.warmupProfile = {
                ...State.warmupProfile,
                mood
            };
            UI.setWarmupMood(mood);
        },

        completeWarmupStep() {
            State.warmupProfile = UI.readWarmupProfile();
            syncProfileSummary();
            this.goToOnboardingStep('focus');
        },

        completeFocusStep() {
            if (State.selectedTagIds.length < Config.limits.minTags) {
                alert(`请至少选择 ${Config.limits.minTags} 个谈话焦点。`);
                return;
            }
            syncProfileSummary();
            this.goToOnboardingStep('features');
        },

        toggleFeature(featureId) {
            if (!featureId) return;
            if (State.selectedFeatureIds.includes(featureId)) {
                State.selectedFeatureIds = State.selectedFeatureIds.filter((id) => id !== featureId);
            } else {
                State.selectedFeatureIds = [...State.selectedFeatureIds, featureId];
            }

            if (featureId === 'knowledge') {
                State.settings = {
                    ...State.settings,
                    ragEnabled: State.selectedFeatureIds.includes('knowledge')
                };
                persistSettings();
                UI.writeSettings(State.settings);
                refreshRagStatus();
            }

            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncProfileSummary();
        },

        editOnboarding() {
            if (State.phase !== 'idle') return;
            UI.showOnboarding(State.onboardingStep || 'warmup');
        },

        toggleTag(tagId) {
            if (State.phase !== 'idle') return;

            if (State.selectedTagIds.includes(tagId)) {
                State.selectedTagIds = State.selectedTagIds.filter((id) => id !== tagId);
            } else {
                if (State.selectedTagIds.length >= Config.limits.maxTags) {
                    alert(`最多选择 ${Config.limits.maxTags} 个关键词。`);
                    return;
                }
                State.selectedTagIds = [...State.selectedTagIds, tagId];
            }

            syncKeywordUI();
            syncProfileSummary();
        },

        saveSettings() {
            const next = UI.readSettings();
            State.settings = {
                apiBase: next.apiBase || Config.defaults.apiBase,
                apiKey: next.apiKey || '',
                assessModel: next.assessModel || Config.defaults.assessModel,
                therapyModel: next.therapyModel || Config.defaults.therapyModel,
                assessEnableThinking: Boolean(next.assessEnableThinking),
                therapyEnableThinking: Boolean(next.therapyEnableThinking),
                intakeTurns: clamp(toInt(next.intakeTurns, Config.defaults.intakeTurns), 2, 8),
                reassessEvery: clamp(toInt(next.reassessEvery, Config.defaults.reassessEvery), 3, 12),
                ragEnabled: Boolean(next.ragEnabled),
                ragKnowledgeBaseId: next.ragKnowledgeBaseId || Config.defaults.ragKnowledgeBaseId,
                ragKnowledgeBasePath: next.ragKnowledgeBasePath || Config.defaults.ragKnowledgeBasePath,
                ragTopK: clamp(toInt(next.ragTopK, Config.defaults.ragTopK), 1, 6),
                ragMinScore: clamp(toFloat(next.ragMinScore, Config.defaults.ragMinScore), 0, 1)
            };
            State.selectedFeatureIds = State.settings.ragEnabled
                ? Array.from(new Set([...State.selectedFeatureIds, 'knowledge']))
                : State.selectedFeatureIds.filter((id) => id !== 'knowledge');
            persistSettings();
            UI.writeSettings(State.settings);
            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncProfileSummary();
            UI.toggleModal('settingsModal', false);
            updateStatusFromState();
            refreshRagStatus();
        },

        async startAssessment() {
            if (State.isBusy || State.phase !== 'idle') return;
            if (State.selectedTagIds.length < Config.limits.minTags) return;
            if (!ensureApiReady()) return;
            State.warmupProfile = UI.readWarmupProfile();
            State.onboardingStep = 'features';
            applyFeatureSettings();
            syncProfileSummary();
            UI.showChatWorkspace();
            UI.lockChat('正在准备建档开场...');
            setBusy(true);
            try { await startIntakeFlow(); } finally { setBusy(false); }
        },

        async startDirect() {
            if (State.isBusy || State.phase !== 'idle') return;
            if (!ensureApiReady()) return;
            State.warmupProfile = UI.readWarmupProfile();
            applyFeatureSettings();
            syncProfileSummary();
            UI.showChatWorkspace();
            UI.lockChat('正在准备建档开场...');
            setBusy(true);
            try { await startIntakeFlow(); } finally { setBusy(false); }
        },

        async handleChat() {
            if (State.isBusy || State.phase === 'idle') return;
            const text = UI.els.input.value.trim();
            if (!text) return;

            UI.els.input.value = '';
            addDisplayMessage(text, 'user');
            State.history.push({ role: 'user', content: text });
            State.totalUserTurns += 1;

            setBusy(true);
            try {
                if (State.phase === 'intake') {
                    State.intakeTurnsCompleted += 1;
                    updateStatusFromState();

                    if (State.intakeTurnsCompleted >= State.settings.intakeTurns) {
                        await finishInitialAssessment();
                    } else {
                        await streamAssistantReply({
                            model: State.settings.assessModel,
                            enableThinking: State.settings.assessEnableThinking,
                            messages: State.history,
                            temperature: Config.defaults.assessTemperature,
                            errorPrefix: '建档评估中断',
                            userQuery: text,
                            messageMeta: {
                                role: 'assessment',
                                stage: 'intake-followup',
                                stageLabel: '建档追问'
                            }
                        });
                    }
                } else if (State.phase === 'therapy') {
                    State.therapyTurnsSinceReview += 1;
                    await maybeReassessBeforeTherapyReply();
                    rebuildTherapyContext();
                    updateStatusFromState();

                    await streamAssistantReply({
                        model: State.settings.therapyModel,
                        enableThinking: State.settings.therapyEnableThinking,
                        messages: State.history,
                        temperature: Config.defaults.therapyTemperature,
                        errorPrefix: '疗愈对话中断',
                        userQuery: text,
                        messageMeta: {
                            role: 'therapy',
                            stage: 'therapy-reply',
                            stageLabel: '陪伴回复'
                        }
                    });
                }
            } finally {
                setBusy(false);
                updateStatusFromState();
            }
        },

        saveArchive() {
            if (Archive.saveCurrent()) {
                UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            }
        },

        loadArchive(id) {
            const archive = Archive.find(id);
            if (!archive) return;

            restoreSession(archive.state);
            State.activeArchiveId = archive.id;

            // ── 恢复存档时的布局模式 ──
            const mainLayout = document.querySelector('.main-layout');
            mainLayout?.classList.remove('layout-intake', 'layout-conversation');
            if (State.phase === 'idle') {
                mainLayout?.classList.add('layout-intake');
                document.getElementById('bgImage')?.classList.remove('sharp');
            } else {
                mainLayout?.classList.add('layout-conversation');
                document.getElementById('bgImage')?.classList.add('sharp');
            }

            UI.writeWarmupProfile(State.warmupProfile);
            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncKeywordUI();
            syncProfileSummary();
            UI.renderMessages(State.displayMessages);

            if (State.latestReport) UI.showReport(State.latestReport, State.reports);
            else UI.hideReport();

            if (State.phase === 'idle') {
                UI.showOnboarding(State.onboardingStep || 'focus');
                UI.lockChat();
            } else {
                UI.showChatWorkspace();
                UI.unlockChat();
            }

            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            updateStatusFromState();
        },

        deleteArchive(id) {
            Archive.remove(id);
            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
        },

        newChat() {
            resetSession();

            // ── 切换回建档模式布局：医生居中，底部对话 ──
            document.querySelector('.main-layout')?.classList.remove('layout-conversation');
            document.querySelector('.main-layout')?.classList.add('layout-intake');
            document.getElementById('bgImage')?.classList.remove('sharp');

            UI.writeWarmupProfile(State.warmupProfile);
            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncKeywordUI();
            syncProfileSummary();
            UI.clearMessages();
            UI.hideReport();
            UI.showOnboarding('api');
            UI.lockChat();

            // 重启 VN 引导
            UI.unlockChat();
            startVnSequence();

            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            updateStatusFromState();
        }
    };

    window.App = App;

    // ═══════════════════════════════════════════════
    //  Visual Novel 步骤引擎（建档前引导）
    // ═══════════════════════════════════════════════

    const vnSteps = [
        // ── 开场问候 ──
        { type: 'say', text: '晚上好。外面还在下雨呢。' },
        { type: 'say', text: '我是林知微，这里是「避雨檐」。' },
        { type: 'say', text: '一个安全、安静、不被打扰的地方。' },
        { type: 'say', text: '今晚，我会在这里陪着你。' },
        { type: 'say', text: '我们先不急着开始——先花几分钟，把连接理好。' },

        // ── API Key ──
        { type: 'say', text: '第一步，把电源钥匙——API Key——放好。' },
        { type: 'say', text: '它只存在你的浏览器里，不会被别人看到。' },
        { type: 'choice', text: '我已经帮你准备了一个密钥。你想直接用，还是自己换一个？',
            choices: [
                { label: '就用这个', desc: '密钥已就绪', value: 'api_prefill' },
                { label: '我自己填', desc: '手动输入新密钥', value: 'api_custom' }
            ]
        },
        { type: 'input', text: '请把 API Key 贴在这里。', placeholder: 'sk-...', cond: (d) => d.apiKey === 'custom' },

        { type: 'say', text: '好。电源接上了。' },

        // ── 接口地址 ──
        { type: 'say', text: '第二步，请求地址。用默认服务就可以。' },
        { type: 'choice', text: '用默认还是自定义？',
            choices: [
                { label: '用默认', desc: 'DashScope 服务', value: 'base_default' },
                { label: '自定义', desc: '输入代理地址', value: 'base_custom' }
            ]
        },
        { type: 'input', text: '请填入你的接口地址。', placeholder: 'https://...', cond: (d) => d.baseUrl === 'custom' },

        // ── 模型选择 ──
        { type: 'say', text: '第三步，选一个模型来陪你对话。' },
        { type: 'choice', text: '你倾向哪一种？',
            choices: [
                { label: '轻快均衡', desc: 'qwen-turbo-latest，日常陪伴够用', value: 'model_turbo' },
                { label: '深度细腻', desc: 'qwen3-max-preview，深入梳理更稳', value: 'model_max' }
            ]
        },

        // ── 陪伴偏好 ──
        { type: 'say', text: '最后，我想知道——你希望我怎么陪你。' },
        { type: 'choice', text: '你现在更想要哪一种？',
            choices: [
                { label: '温柔一点，慢慢聊', desc: '先被接住，再慢慢理清楚', value: 'style_gentle' },
                { label: '帮我理清楚问题', desc: '分析一下，给些小步骤', value: 'style_structured' },
                { label: '少讲道理，多陪我', desc: '不需要建议，就是想被听见', value: 'style_companion' }
            ]
        },

        // ── 结束 ──
        { type: 'say', text: '好，我都记住了。' },
        { type: 'say', text: '谢谢你信任我。' },
        { type: 'say', text: '闭上眼睛，深呼吸一下——然后我们开始。' },
    ];

    let vnIdx = -1;
    const vnData = { apiKey: 'prefill', baseUrl: 'default', model: 'turbo', style: 'gentle' };

    // ── 打字机效果 ──
    function typeText(el, text, speed, onDone) {
        let i = 0;
        let timer = null;
        el.textContent = '';
        function tick() {
            if (i < text.length) {
                el.textContent = text.slice(0, i + 1);
                i++;
                timer = setTimeout(tick, speed);
            } else if (onDone) onDone();
        }
        tick();
        return function skip() {
            if (timer) clearTimeout(timer);
            el.textContent = text;
            if (onDone) onDone();
        };
    }

    function startVnSequence() {
        vnIdx = -1;
        Object.assign(vnData, { apiKey: 'prefill', baseUrl: 'default', model: 'turbo', style: 'gentle' });
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        box.onclick = null;
        // 输入框在 VN 期间禁用
        UI.els.input.disabled = true;
        if (UI.els.sendBtn) UI.els.sendBtn.disabled = true;
        renderVnStep();
    }

    function renderVnStep() {
        vnIdx++;

        // 跳过有未满足条件的步骤
        while (vnIdx < vnSteps.length) {
            const s = vnSteps[vnIdx];
            if (s.cond && !s.cond(vnData)) { vnIdx++; continue; }
            break;
        }

        if (vnIdx >= vnSteps.length) { finishVnOnboarding(); return; }

        const step = vnSteps[vnIdx];
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        box.onclick = null;

        if (step.type === 'say') {
            const div = document.createElement('div');
            div.className = 'vn-text';
            box.appendChild(div);

            // 根据字数自动调速，总时长控制在 1~3 秒
            const len = step.text.length;
            const t = Math.min(Math.max((len - 5) / 95, 0), 1); // 5字→0, 100字→1
            const totalMs = 1000 + t * 2000; // 1000ms ~ 3000ms
            const speed = len > 0 ? Math.floor(totalMs / len) : 50;

            typeText(div, step.text, speed, () => {
                // 打字完毕等一会再自动推进下一句
                setTimeout(() => renderVnStep(), 1200);
            });

        } else if (step.type === 'choice') {
            if (step.text) {
                const div = document.createElement('div');
                div.className = 'vn-text';
                div.textContent = step.text;
                div.style.marginBottom = '16px';
                box.appendChild(div);
            }
            const wrap = document.createElement('div');
            wrap.className = 'vn-choices';
            step.choices.forEach((c) => {
                const el = document.createElement('button');
                el.className = 'vn-choice-item';
                el.textContent = c.label;
                el.onclick = () => {
                    const map = {
                        api_prefill: () => vnData.apiKey = 'prefill',
                        api_custom: () => vnData.apiKey = 'custom',
                        base_default: () => vnData.baseUrl = 'default',
                        base_custom: () => vnData.baseUrl = 'custom',
                        model_turbo: () => vnData.model = 'turbo',
                        model_max: () => vnData.model = 'max',
                        style_gentle: () => vnData.style = 'gentle',
                        style_structured: () => vnData.style = 'structured',
                        style_companion: () => vnData.style = 'companion',
                    };
                    map[c.value]?.();
                    renderVnStep();
                };
                wrap.appendChild(el);
            });
            box.appendChild(wrap);

        } else if (step.type === 'input') {
            if (step.text) {
                const div = document.createElement('div');
                div.className = 'vn-text';
                div.textContent = step.text;
                div.style.marginBottom = '12px';
                box.appendChild(div);
            }
            const input = document.createElement('input');
            input.className = 'vn-input';
            input.placeholder = step.placeholder || '';
            box.appendChild(input);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = input.value.trim() || '';
                    if (step.placeholder.includes('sk-')) {
                        State.settings.apiKey = val || State.settings.apiKey;
                    } else if (step.placeholder.includes('https')) {
                        State.settings.apiBase = val || Config.defaults.apiBase;
                    }
                    renderVnStep();
                }
            });
            setTimeout(() => input.focus(), 200);
        }
    }

    function finishVnOnboarding() {
        // ── 应用 VN 选择到设置 ──
        if (vnData.model === 'max') {
            State.settings.therapyModel = 'qwen3-max-preview';
        } else {
            State.settings.therapyModel = 'qwen-turbo-latest';
        }
        State.settings.assessModel = Config.defaults.assessModel;

        const styleMap = {
            gentle: '温柔接住，慢慢澄清',
            structured: '结构化分析，给出小步骤',
            companion: '少评价，多陪伴'
        };
        State.warmupProfile.preference = styleMap[vnData.style] || '温柔接住，慢慢澄清';
        const prefEl = document.getElementById('warmupPreference');
        if (prefEl) prefEl.value = State.warmupProfile.preference;

        // 初始表情为微笑
        document.querySelectorAll('.conv-avatar, #docPhoto').forEach(el => { if (el) el.src = './smile.png'; });

        persistSettings();

        // ── 自然过渡：VN 淡出 → 对话界面淡入 ──
        const ml = document.querySelector('.main-layout');
        const chatBox = document.getElementById('chatBox');

        // 先淡出当前 VN 内容
        chatBox.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
        chatBox.style.opacity = '0';
        chatBox.style.transform = 'translateY(-8px)';

        setTimeout(() => {
            // 切换布局
            ml.classList.remove('layout-intake');
            ml.classList.add('layout-conversation');

            // conv-view 从透明淡入
            const convView = document.querySelector('.conv-view');
            if (convView) {
                convView.style.opacity = '0';
                convView.style.transition = 'opacity 0.6s ease';
                requestAnimationFrame(() => { convView.style.opacity = '1'; });
            }

            // ── 绑定对话输入 ──
            const convInput = document.getElementById('convInput');
            const convSendBtn = document.getElementById('convSendBtn');
            convInput.disabled = true;
            if (convSendBtn) { convSendBtn.disabled = true; convSendBtn.onclick = handlePostVnSend; }
            convInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostVnSend(); }
            });
            document.getElementById('userLine').onclick = () => {
                const inp = document.getElementById('convInput');
                const txt = inp.value.trim();
                if (!txt || isShowingLines) return;
                inp.value = '';
                const el = document.getElementById('userLine');
                el.textContent = txt;
                el.style.color = '#f1c36b';
                el.style.animation = 'none';
                void el.offsetWidth;
                el.style.animation = 'vnFadeIn 0.4s ease forwards';
                setTimeout(() => handlePostVnSend(txt), 400);
            };

            // ── 绑定历史/报告按钮 ──
            document.getElementById('btnConvHistory').onclick = () => {
                renderHistory();
                document.getElementById('historyOverlay').classList.add('open');
            };
            document.getElementById('btnHistoryClose').onclick = () => {
                document.getElementById('historyOverlay').classList.remove('open');
            };
            document.getElementById('historyOverlay').addEventListener('click', (e) => {
                if (e.target === document.getElementById('historyOverlay')) {
                    document.getElementById('historyOverlay').classList.remove('open');
                }
            });
            document.getElementById('btnConvReport').onclick = () => UI.togglePanel();

            // ── 启动 AI 对话 ──
            startPostVnFlow();
        }, 500);
    }

    // ═══════════════════════════════════════════════
    //  Post-VN 对话系统（单行浮现 · 无色块 · 表情切换）
    // ═══════════════════════════════════════════════

    let lineQueue = [];
    let isShowingLines = false;
    let convHistory = [];

    function setExpression(type) {
        const src = type === 'thinking' ? './thinking.png' : type === 'happy' ? './happy.png' : './smile.png';
        document.querySelectorAll('.conv-avatar, #docPhoto').forEach(el => { if (el) el.src = src; });
    }

    function playAiVoice() {
        try {
            const audio = document.getElementById('voiceEn') || document.getElementById('voiceThink');
            if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
        } catch (_) {}
    }

    async function postVnChatRequest(messages, options = {}) {
        const { model, temperature, userQuery } = options;
        const { messages: requestMessages } = await buildRagAugmentedMessages({ messages, userQuery });
        return await Api.chat({
            apiBase: State.settings.apiBase,
            apiKey: State.settings.apiKey,
            model,
            messages: requestMessages,
            temperature: temperature ?? 0.7
        });
    }

    function displayAiLines(fullText) {
        if (!fullText) { enableVnInput(); return; }

        let text = fullText.trim();

        // 解析表情指令
        const expMatch = text.match(/\[(smile|thinking|happy)\]/);
        if (expMatch) {
            setExpression(expMatch[1]);
            text = text.replace(expMatch[0], '').trim();
            // happy 表情自动触发开心的音效
            if (expMatch[1] === 'happy') {
                try {
                    const h = document.getElementById('voiceHappy');
                    if (h) { h.currentTime = 0; h.play().catch(() => {}); }
                } catch (_) {}
            }
        }

        // 解析发声指令
        if (/\[voice\]/i.test(text)) {
            playAiVoice();
            text = text.replace(/\[voice\]/gi, '').trim();
        }

        // 分割为短句
        lineQueue = text
            .replace(/\n{3,}/g, '\n\n')
            .split(/(?<=[。！？\n])/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (lineQueue.length === 0) lineQueue = [text];

        isShowingLines = true;
        showNextAiLine();
    }

    function showNextAiLine() {
        if (lineQueue.length === 0) {
            isShowingLines = false;
            enableVnInput();
            return;
        }

        const line = lineQueue.shift();
        convHistory.push({ role: 'ai', text: line, time: Date.now() });
        const el = document.getElementById('aiLine');

        const len = line.length;
        const t = Math.min(Math.max((len - 5) / 95, 0), 1);
        const totalMs = 1000 + t * 2000;
        const speed = len > 0 ? Math.floor(totalMs / len) : 50;

        typeText(el, line, speed, () => {
            setTimeout(() => showNextAiLine(), 800);
        });
    }

    function displayUserLine(text) {
        document.getElementById('aiLine').textContent = '';
        document.getElementById('aiLine').onclick = null;
        const el = document.getElementById('userLine');
        el.textContent = text;
        el.style.color = '#5ee0b7';
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'vnFadeIn 0.4s ease forwards';
    }

    function renderHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;
        if (!convHistory.length) {
            list.innerHTML = '<div style="padding:20px 0;text-align:center;color:rgba(246,247,241,0.3);font-size:13px;">还没有对话记录。</div>';
            return;
        }
        list.innerHTML = convHistory.map((entry) => `
            <div class="history-entry">
                <div class="history-speaker ${entry.role}">${entry.role === 'ai' ? '林知微' : '我'}</div>
                <div class="history-text">${escapeHtml(entry.text)}</div>
            </div>
        `).join('');
        list.scrollTop = list.scrollHeight;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function enableVnInput() {
        const input = document.getElementById('convInput');
        const btn = document.getElementById('convSendBtn');
        if (input) input.disabled = false;
        if (btn) btn.disabled = false;
        if (input) setTimeout(() => input.focus(), 100);
    }

    async function handlePostVnSend(pendingText) {
        const input = document.getElementById('convInput');
        const text = pendingText || input.value.trim();
        if (!text || isShowingLines) return;

        input.value = '';
        input.disabled = true;
        const sendBtn = document.getElementById('convSendBtn');
        if (sendBtn) sendBtn.disabled = true;

        displayUserLine(text);
        convHistory.push({ role: 'user', text, time: Date.now() });
        State.history.push({ role: 'user', content: text });
        State.totalUserTurns += 1;

        try {
            if (State.phase === 'intake') {
                State.intakeTurnsCompleted += 1;
                if (State.intakeTurnsCompleted >= State.settings.intakeTurns) {
                    await finishPostVnAssessment();
                } else {
                    const reply = await postVnChatRequest(State.history, {
                        model: State.settings.assessModel,
                        temperature: Config.defaults.assessTemperature,
                        userQuery: text
                    });
                    State.displayMessages.push({ text: reply, role: 'assistant', isSystem: false, meta: { role: 'assessment' } });
                    State.history.push({ role: 'assistant', content: reply });
                    displayAiLines(reply);
                }
            } else if (State.phase === 'therapy') {
                State.therapyTurnsSinceReview += 1;
                const reply = await postVnChatRequest(State.history, {
                    model: State.settings.therapyModel,
                    temperature: Config.defaults.therapyTemperature,
                    userQuery: text
                });
                State.displayMessages.push({ text: reply, role: 'assistant', isSystem: false, meta: { role: 'therapy' } });
                State.history.push({ role: 'assistant', content: reply });
                displayAiLines(reply);
            }
        } catch (error) {
            console.error(error);
            displayAiLines('[smile] 嗯，好像走神了一下……能再说一次吗？');
        }
    }

    async function finishPostVnAssessment() {
        const report = await generateAssessment('initial');
        State.phase = 'therapy';
        rebuildTherapyContext();

        const therapyReply = await postVnChatRequest(State.history, {
            model: State.settings.therapyModel,
            temperature: Config.defaults.therapyTemperature
        });
        State.displayMessages.push({ text: therapyReply, role: 'assistant', isSystem: false, meta: { role: 'therapy', stage: 'therapy-handoff' } });
        State.history.push({ role: 'assistant', content: therapyReply });
        displayAiLines(therapyReply);
    }

    async function startPostVnFlow() {
        State.phase = 'intake';
        State.history = [{
            role: 'system',
            content: Config.prompts.buildAssessSystem({
                tags: getSelectedTagLabels(),
                intakeTurns: State.settings.intakeTurns
            })
        }];

        try {
            const kickoffText = await postVnChatRequest([
                ...State.history,
                { role: 'user', content: Config.prompts.buildKickoffPrompt({ tags: getSelectedTagLabels() }) }
            ], {
                model: State.settings.assessModel,
                temperature: Config.defaults.assessTemperature
            });

            State.displayMessages.push({ text: kickoffText, role: 'assistant', isSystem: false, meta: { role: 'assessment', stage: 'intake-kickoff' } });
            State.history.push({ role: 'assistant', content: kickoffText });

            setExpression('thinking');
            displayAiLines(kickoffText);
        } catch (error) {
            console.error(error);
            displayAiLines('[smile] 晚上好。外面还在下雨呢。今晚我会在这里陪着你。想从哪里开始聊呢？');
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const docPhoto = document.getElementById('docPhoto');
        const docName = document.getElementById('docName');

        // ── 用户点击闪屏后才会播放音乐（见 splash.onclick） ──

        // ── 雨声开关 ──
        document.getElementById('btnToggleRain').onclick = () => {
            const playing = UI.toggleRain();
            const icon = document.querySelector('#btnToggleRain i');
            const btn = document.getElementById('btnToggleRain');
            if (icon) icon.className = playing ? 'fas fa-cloud-rain' : 'fas fa-sun';
            if (btn) btn.title = playing ? '雨声开关' : '已切换为晴天';
        };

        // ── 音乐开关 ──
        document.getElementById('btnToggleMusic').onclick = () => {
            const playing = UI.toggleMusic();
            State.settings.enableMusic = playing;
            persistSettings();
        };

        // ── 设置弹窗 ──
        const settingsOverlay = document.getElementById('settingsOverlay');
        document.getElementById('btnSettings').onclick = () => settingsOverlay.classList.add('open');
        document.getElementById('btnSettingsClose').onclick = () => settingsOverlay.classList.remove('open');
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
        });

        // ── 自定义音乐 ──
        document.getElementById('settingsMusicUrl').addEventListener('change', (e) => {
            const url = e.target.value.trim();
            if (url) UI.setMusicSrc(url);
        });
        document.getElementById('settingsMusicFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) UI.setMusicSrc(URL.createObjectURL(file));
        });

        // ── 自定义雨声 ──
        document.getElementById('settingsRainUrl').addEventListener('change', (e) => {
            const url = e.target.value.trim();
            if (url) UI.setRainSrc(url);
        });
        document.getElementById('settingsRainFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) UI.setRainSrc(URL.createObjectURL(file));
        });

        // ── 自定义背景 ──
        document.getElementById('settingsBgUrl').addEventListener('change', (e) => {
            const url = e.target.value.trim();
            if (url) UI.setBgImage(url);
        });
        document.getElementById('settingsBgFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) UI.setBgImage(URL.createObjectURL(file));
        });

        // ── 自定义用户头像 ──
        document.getElementById('settingsUserAvatarUrl').addEventListener('change', (e) => {
            const url = e.target.value.trim();
            if (url) UI.setUserAvatar(url);
        });
        document.getElementById('settingsUserAvatarFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) UI.setUserAvatar(URL.createObjectURL(file));
        });

        App.init();

        // ── 开场：城市闪屏 + 细雨 + 点击进入 ──
        // 极细雨丝（画在城市图片上层）
        rainController = startRain('canvasBg', { dropCount: 120 });

        const splash = document.getElementById('splashScreen');
        splash.onclick = () => {
            // 用户手势触发音乐（完美解决自动播放限制）
            UI.playMusic();
            UI.playRain();

            // 闪屏淡出
            splash.classList.add('hidden');

            // canvas 雨丝淡出
            if (rainController) rainController.fadeOut(1200);

            // 林出现
            setTimeout(() => {
                docPhoto.classList.add('visible');
                docName.classList.add('visible');
                splash.style.display = 'none';
            }, 1200);

            // VN 开始
            setTimeout(() => {
                UI.playVoice();
                UI.unlockChat();
                startVnSequence();
            }, 2200);
        };
    });
})();
