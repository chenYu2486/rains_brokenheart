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


    const cleanString = (value) => String(value || '').trim();

    function savedApiKey() {
        return cleanString(State.settings.apiKey);
    }

    function buildApiParams(params) {
        if (State.useMode !== 'proxy') {
            return {
                ...params,
                apiBase: cleanString(State.settings.apiBase) || Config.defaults.apiBase,
                apiKey: savedApiKey()
            };
        }
        return {
            ...params,
            apiBase: cleanString(State.settings.proxyBase) || Config.defaults.proxyBase,
            apiKey: ''
        };
    }

    function buildDirectApiParams(params, overrides = {}) {
        return {
            ...params,
            ...overrides,
            apiBase: cleanString(overrides.apiBase) || Config.defaults.apiBase,
            apiKey: savedApiKey()
        };
    }

    function buildApiAttempts(params) {
        const attempts = [];
        const seen = new Set();
        const fallbackModel = Config.defaults.assessModel || 'qwen-turbo-latest';
        const key = savedApiKey();
        const primary = buildApiParams(params);

        const push = (label, apiParams) => {
            const id = [
                cleanString(apiParams.apiBase),
                apiParams.apiKey ? 'key' : 'no-key',
                cleanString(apiParams.model),
                String(apiParams.enableThinking)
            ].join('|');
            if (seen.has(id)) return;
            seen.add(id);
            attempts.push({ label, params: apiParams });
        };

        push(State.useMode === 'proxy' ? 'proxy' : 'direct', primary);

        if (State.useMode === 'proxy' && key) {
            push('direct-with-saved-key', buildDirectApiParams(params));
        }

        if (State.useMode !== 'proxy' && key && cleanString(State.settings.apiBase) !== Config.defaults.apiBase) {
            push('direct-default-base', buildDirectApiParams(params));
        }

        if (cleanString(params.model) !== fallbackModel) {
            const modelFallback = { model: fallbackModel, enableThinking: false };
            push(`${State.useMode === 'proxy' ? 'proxy' : 'direct'}-public-model`, {
                ...primary,
                ...modelFallback
            });
            if (key) {
                push('direct-public-model', buildDirectApiParams(params, modelFallback));
            }
        }

        return attempts;
    }

    function rememberApiRecovery(label, error) {
        const message = error?.message ? `: ${error.message}` : '';
        console.warn(`API attempt failed (${label})${message}`);
    }

    async function apiChatWithFallback(params) {
        let lastError;
        for (const attempt of buildApiAttempts(params)) {
            try {
                return await Api.chat(attempt.params);
            } catch (error) {
                lastError = error;
                rememberApiRecovery(attempt.label, error);
            }
        }
        throw lastError || new Error('API request failed');
    }

    async function apiStreamWithFallback(params, onChunk) {
        let lastError;
        for (const attempt of buildApiAttempts(params)) {
            let sawChunk = false;
            try {
                return await Api.streamChat({
                    ...attempt.params,
                    onChunk: (text, delta) => {
                        if (text || delta) sawChunk = true;
                        if (typeof onChunk === 'function') onChunk(text, delta);
                    }
                });
            } catch (error) {
                lastError = error;
                rememberApiRecovery(attempt.label, error);
                if (sawChunk) break;
            }
        }
        throw lastError || new Error('API stream request failed');
    }

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
        useMode: settings.useMode || 'proxy',
        activeConversationId: null,    // Supabase 会话 ID
        onboardingStep: 'warmup',
        warmupProfile: {
            mood: '',
            concern: '',
            body: '',
            preference: '倾听与承接',
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
            useMode: saved.useMode || Config.defaults.useMode,
            proxyBase: saved.proxyBase || Config.defaults.proxyBase,
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
        UI.writeSettings(State.settings, State.useMode);
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
            UI.updateStatus(customText || `初评建档中`, 'assess');
            return;
        }

        const warning = ['high', 'critical'].includes(State.latestReport?.warningLevel);
        UI.updateStatus(
            customText || '持续陪伴中',
            warning ? 'warning' : 'therapy'
        );
    }

    function setBusy(flag) {
        State.isBusy = flag;
        const locked = State.phase === 'idle';
        UI.els.input.disabled = flag || locked;
        UI.els.sendBtn.disabled = flag || locked;
    }

    /** Show an overlay card prompting user to bring their own API key */
    function showQuotaUpgradeUI() {
        const overlay = document.getElementById('chatOverlay');
        const overlayText = document.getElementById('overlayText');
        if (!overlay || !overlayText) return;

        overlay.classList.remove('hidden');
        overlay.innerHTML = `
            <div class="overlay-card" style="text-align:center;max-width:360px;">
                <i class="fas fa-cloud-rain" style="font-size:36px;color:rgba(154,199,183,0.3);margin-bottom:16px;display:block;"></i>
                <h3 style="font-size:18px;color:rgba(246,247,241,0.9);margin:0 0 8px;">今日免费次数已用完</h3>
                <p style="font-size:14px;color:rgba(246,247,241,0.55);line-height:1.6;margin:0 0 20px;">
                    你可以换上自己的 API Key 继续和知微聊天。
                    <br>所有数据只存在你的浏览器里。
                </p>
                <div style="display:flex;gap:10px;justify-content:center;">
                    <button id="btnUpgradeNow" style="padding:10px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--sage-strong),var(--amber));color:#10201d;font-weight:600;cursor:pointer;font-size:13px;">配置我的 Key</button>
                    <button id="btnUpgradeLater" style="padding:10px 20px;border-radius:12px;border:1px solid rgba(180,210,200,0.15);background:rgba(255,255,255,0.06);color:rgba(246,247,241,0.6);cursor:pointer;font-size:13px;">下次再说</button>
                </div>
            </div>
        `;

        document.getElementById('btnUpgradeNow').onclick = () => {
            // Switch to direct mode
            State.useMode = 'direct';
            State.settings.useMode = 'direct';
            State.settings.apiBase = Config.defaults.apiBase;
            persistSettings();
            UI.writeSettings(State.settings, State.useMode);
            overlay.classList.add('hidden');
            document.getElementById('settingsOverlay')?.classList.add('open');
        };

        document.getElementById('btnUpgradeLater').onclick = () => {
            overlay.classList.add('hidden');
            // Reset to idle state so user can restart
            newChat();
        };
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
        if (State.useMode === 'proxy') return true;
        if (State.settings.apiKey) return true;
        alert('请先配置 API Key。\n点击右上角设置 → 填入你的 DashScope API Key。');
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
                    useMode: State.useMode,
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
            const fullText = await apiStreamWithFallback({
                model,
                messages: requestMessages,
                temperature,
                enableThinking
            }, (text) => UI.updateAssistantStream(handle, text));

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
            // ── 配额用尽处理 ──
            if (error.message?.includes('免费试用') || error.message?.includes('quota_exhausted')) {
                UI.finishAssistantStream(handle, '', [], { failed: false });
                addDisplayMessage('今日免费试用次数已用完。你可以换上自己的 API Key 继续和知微聊天。', 'system', true);
                showQuotaUpgradeUI();
                return null;
            }

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
            const raw = await apiChatWithFallback({
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
            // 双写：保存报告到 Supabase
            if (State.activeConversationId && window.AppStorage?.ready) {
                AppStorage.saveReport(State.activeConversationId, report).catch(() => {});
            }
            return report;
        } finally {
            UI.removeTyping();
        }
    }

    function rebuildTherapyContext() {
        if (!State.latestReport) return;
        // 先设 system prompt（不含记忆），异步加载记忆后追加
        setSystemPrompt([
            Config.prompts.buildTherapySystem({
                tags: getSelectedTagLabels(),
                latestReport: State.latestReport,
                previousReportsSummary: summarizeReportsForPrompt()
            }),
            buildOnboardingPromptContext()
        ].filter(Boolean).join('\n\n'));
        if (!window.AppStorage?.ready) return;
        AppStorage.loadMemories().then((memories) => {
            if (!memories?.length) return;
            const ctx = AppStorage.buildMemoryContext(memories);
            if (!ctx) return;
            const sys = State.history[0];
            if (sys?.role === 'system') sys.content += '\n\n' + ctx;
        }).catch(() => {});
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

        // 首次切到陪伴模式时，让模型先感谢用户信任
        const sysMsg = State.history[0];
        if (sysMsg?.role === 'system') {
            sysMsg.content += '\n\n这是你切换为陪伴模式后的第一次回复。请先为用户的信任表达真诚的感谢，再温柔地开启陪伴对话。';
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
            useMode: snapshot.useMode || State.settings.useMode || 'proxy',
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

            UI.writeSettings(State.settings, State.useMode);
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
            const nextApiKey = cleanString(next.apiKey);
            State.settings = {
                ...State.settings,
                apiBase: cleanString(next.apiBase) || State.settings.apiBase || Config.defaults.apiBase,
                apiKey: nextApiKey || savedApiKey(),
                assessModel: next.assessModel || Config.defaults.assessModel,
                therapyModel: next.therapyModel || Config.defaults.therapyModel,
                ragEnabled: Boolean(next.ragEnabled)
            };

            State.selectedFeatureIds = State.settings.ragEnabled
                ? Array.from(new Set([...State.selectedFeatureIds, 'knowledge']))
                : State.selectedFeatureIds.filter((id) => id !== 'knowledge');

            persistSettings();
            UI.writeSettings(State.settings, State.useMode);
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
                UI.writeSettings(State.settings, State.useMode);
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

        setMode(mode) {
            if (mode !== 'proxy' && mode !== 'direct') return;
            State.useMode = mode;
            State.settings.useMode = mode;
            if (mode === 'proxy') {
                State.settings.apiBase = State.settings.proxyBase || Config.defaults.proxyBase;
            } else {
                State.settings.apiBase = Config.defaults.apiBase;
            }
            persistSettings();
            UI.writeSettings(State.settings, State.useMode);
            UI.refreshSettingsQuota();
            updateStatusFromState();
        },

        saveSettings() {
            const next = UI.readSettings();
            const mode = State.useMode;
            const nextApiKey = cleanString(next.apiKey);
            State.settings = {
                useMode: mode,
                proxyBase: State.settings.proxyBase || Config.defaults.proxyBase,
                apiBase: mode === 'proxy'
                    ? (State.settings.proxyBase || Config.defaults.proxyBase)
                    : (next.apiBase || Config.defaults.apiBase),
                apiKey: mode === 'proxy' ? savedApiKey() : nextApiKey,
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
            // 双写：同步设置到 Supabase
            if (window.AppStorage?.ready) {
                AppStorage.saveSettings({
                    use_mode: State.settings.useMode,
                    api_base: State.settings.apiBase,
                    assess_model: State.settings.assessModel,
                    therapy_model: State.settings.therapyModel,
                    rag_enabled: State.settings.ragEnabled,
                    enable_music: State.settings.enableMusic,
                    enable_thinking: State.settings.assessEnableThinking || State.settings.therapyEnableThinking,
                }).catch(() => {});
            }
            UI.writeSettings(State.settings, State.useMode);
            UI.refreshSettingsQuota();
            UI.renderFeatureSelection(State.selectedFeatureIds);
            syncProfileSummary();
            document.getElementById('settingsOverlay').classList.remove('open');
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
        // ═══ 新用户：欢迎 + 询问姓名（skipSetup=false 时展示） ═══
        { type: 'say', text: '[voice:你好呀] 欢迎来到避雨檐', cond: (d) => !d.skipSetup },
        { type: 'say', text: '这里很安静', cond: (d) => !d.skipSetup },
        { type: 'say', text: '我是林知微', cond: (d) => !d.skipSetup },
        { type: 'say', text: '叫我知微就好', cond: (d) => !d.skipSetup },
        { type: 'say', text: '可以请问你的名字吗？', cond: (d) => !d.skipSetup },
        { type: 'say', text: '我如何称呼你？', cond: (d) => !d.skipSetup },
        { type: 'input', placeholder: '随便怎么称呼……也可以不填', buttonText: '好了', saveTo: 'userName', cond: (d) => !d.skipSetup },
        // 填了 → 致谢
        { type: 'say', text: '谢谢，我记住了', cond: (d) => d.userName && !d.skipSetup },
        // 没填 → 委婉跳过
        { type: 'say', text: '[voice:嗯] 没关系', cond: (d) => !d.userName && !d.skipSetup },
        { type: 'say', text: '那我们先坐一会儿', cond: (d) => !d.userName && !d.skipSetup },

        // ═══ 老用户：简短欢迎（skipSetup=true 时展示，跳过后续建档） ═══
        { type: 'say', text: '[voice:嗯] 你来啦', cond: (d) => d.skipSetup },
        { type: 'say', text: '[voice:你好呀] 好久不见', cond: (d) => d.skipSetup },

        // ═══ Phase 2: 选择模式（新用户展示） ═══
        {
            type: 'choice',
            text: '想先试试看，还是带上自己的钥匙来？',
            cond: (d) => !d.skipSetup,
            choices: [
                { label: '先免费试试', action: () => { vnData.mode = 'trial'; } },
                { label: '我自备 API Key', action: () => { vnData.mode = 'byok'; } }
            ]
        },
        { type: 'say', text: '先不用想太远', cond: (d) => d.mode === 'trial' && !d.skipSetup },
        { type: 'say', text: '我们慢慢聊就好', cond: (d) => d.mode === 'trial' && !d.skipSetup },
        { type: 'say', text: '哪天够了再换钥匙也行', cond: (d) => d.mode === 'trial' && !d.skipSetup },

        // ═══ Phase 2: API Key (BYOK) ═══
        { type: 'say', text: '[voice:嗯] 需要一把小钥匙', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '只存在你的浏览器里', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'input', label: 'API Key', placeholder: '把你的 Key 粘贴在这里，例如 sk-...', buttonText: '放好了', saveTo: 'apiKey', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'user', text: '已填写 API Key', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '[voice:嗯] 好，收到了', cond: (d) => d.mode === 'byok' && !d.skipSetup },

        // ═══ Phase 2: Base URL (BYOK) ═══
        { type: 'say', text: '请求送到哪里？', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '默认地址已填好', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'input', label: 'Base URL', placeholder: '例如 https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', buttonText: '可以了', saveTo: 'apiBase', defaultValue: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', cond: (d) => d.mode === 'byok' && !d.skipSetup },

        // ═══ Phase 2: 建档模型 (BYOK) ═══
        { type: 'say', text: '[voice:嗯] 选一个整理状态的模型', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '帮我把你心里的话记下来', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '不是诊断，是为了更懂你', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'input', label: '状态整理模型', placeholder: '例如 deepseek-chat', buttonText: '选好了', saveTo: 'assessModel', defaultValue: 'qwen-turbo-latest', cond: (d) => d.mode === 'byok' && !d.skipSetup },

        // ═══ Phase 2: 陪伴模型 (BYOK) ═══
        { type: 'say', text: '再选一个陪你聊天的', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '大部分时间是它在和你说话', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'input', label: '陪伴对话模型', placeholder: '例如 deepseek-chat', buttonText: '继续', saveTo: 'therapyModel', defaultValue: 'qwen3-8b-9c3af956383a', cond: (d) => d.mode === 'byok' && !d.skipSetup },

        // ═══ Phase 2: 知识库开关 (BYOK) ═══
        { type: 'say', text: '还有一个小东西', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'say', text: '手边有些心理学资料', cond: (d) => d.mode === 'byok' && !d.skipSetup },
        { type: 'choice', text: '需要参考它们吗？', cond: (d) => d.mode === 'byok' && !d.skipSetup, choices: [
            { label: '打开吧', action: () => { vnData.ragEnabled = true; } },
            { label: '先不用', action: () => { vnData.ragEnabled = false; } }
        ]},

        // ═══ Phase 2 → 3 过渡 ═══
        { type: 'say', text: '好了', cond: (d) => !d.skipSetup },
        { type: 'say', text: '灯都亮起来了', cond: (d) => !d.skipSetup },

        // ═══ Phase 3: 当前感受（仅新用户） ═══
        { type: 'choice', text: '现在这一刻，你感觉怎么样？', cond: (d) => !d.skipSetup, choices: [
            { label: '心里有点紧', action: () => { vnData.mood = 'anxious'; } },
            { label: '没什么感觉', action: () => { vnData.mood = 'depressed'; } },
            { label: '有点乱乱的', action: () => { vnData.mood = 'confused'; } },
            { label: '说不上来', action: () => { vnData.mood = 'unsure'; } }
        ]},
        { type: 'say', text: '嗯，知道了', cond: (d) => d.mood === 'anxious' && !d.skipSetup },
        { type: 'say', text: '不急着处理它', cond: (d) => d.mood === 'anxious' && !d.skipSetup },
        { type: 'say', text: '不想说也没关系', cond: (d) => d.mood === 'depressed' && !d.skipSetup },
        { type: 'say', text: '我就在这里陪你', cond: (d) => d.mood === 'depressed' && !d.skipSetup },
        { type: 'say', text: '混乱的时候本来就不容易说清', cond: (d) => d.mood === 'confused' && !d.skipSetup },
        { type: 'say', text: '说不清也是一种答案', cond: (d) => d.mood === 'unsure' && !d.skipSetup },

        // ═══ Phase 3: 最近困扰（仅新用户） ═══
        { type: 'say', text: '最近有没有什么事挂在心上？', cond: (d) => !d.skipSetup },
        { type: 'say', text: '一句话几个词都可以', cond: (d) => !d.skipSetup },
        { type: 'input', placeholder: '睡不着、压力大、和某人的关系……', buttonText: '我想说说', saveTo: 'concern', cond: (d) => !d.skipSetup },

        // ═══ Phase 3: 身体/生活影响（仅新用户） ═══
        { type: 'say', text: '谢谢你和我说这些', cond: (d) => !d.skipSetup },
        { type: 'say', text: '这件事更多影响了你哪里？', cond: (d) => !d.skipSetup },
        { type: 'choice', text: '', cond: (d) => !d.skipSetup, choices: [
            { label: '睡眠', action: () => { vnData.body = 'sleep'; } },
            { label: '食欲', action: () => { vnData.body = 'appetite'; } },
            { label: '胸口或呼吸', action: () => { vnData.body = 'chest'; } },
            { label: '头脑停不下来', action: () => { vnData.body = 'mind'; } },
            { label: '学习或工作', action: () => { vnData.body = 'work'; } },
            { label: '人际关系', action: () => { vnData.body = 'social'; } },
            { label: '还说不清', action: () => { vnData.body = 'unsure'; } }
        ]},

        // ═══ Phase 3: 陪伴方式（仅新用户） ═══
        { type: 'say', text: '接下来想确认一件事', cond: (d) => !d.skipSetup },
        { type: 'say', text: '你现在更希望我怎么陪你？', cond: (d) => !d.skipSetup },
        { type: 'choice', text: '', cond: (d) => !d.skipSetup, choices: [
            { label: '听我说说话', action: () => { vnData.preference = 'gentle'; } },
            { label: '给我些建议', action: () => { vnData.preference = 'structured'; } },
            { label: '安静陪着我', action: () => { vnData.preference = 'accompany'; } },
            { label: '先让我安心', action: () => { vnData.preference = 'stabilize'; } }
        ]},

        // ═══ Phase 3: 今日希望（仅新用户） ═══
        { type: 'say', text: '最后一个小问题', cond: (d) => !d.skipSetup },
        { type: 'say', text: '今晚结束时，你希望自己比现在好在哪？', cond: (d) => !d.skipSetup },
        { type: 'input', placeholder: '心里没那么堵、知道该做什么了……', buttonText: '我想好了', saveTo: 'hope', cond: (d) => !d.skipSetup },

        // ═══ 结束（仅新用户） ═══
        { type: 'say', text: '好，我心里有数了', cond: (d) => !d.skipSetup },
        { type: 'say', text: '感谢你信任我', cond: (d) => d.userName && !d.skipSetup },
        { type: 'say', text: '可以闭上眼睛，我们深呼吸一下', cond: (d) => d.userName && !d.skipSetup },
        { type: 'choice', text: '', cond: (d) => !d.skipSetup, choices: [
            { label: '准备好了', action: () => {} }
        ]},
    ];

    let vnIdx = -1;
    const vnData = {};

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
        const isReturning = !!AppAuth.getUserEmail();
        const hasSavedKey = !!State.settings.apiKey;
        Object.assign(vnData, {
            mode: isReturning ? (hasSavedKey ? 'byok' : 'trial') : 'trial',
            apiKey: State.settings.apiKey || '',
            apiBase: State.settings.apiBase || '',
            assessModel: State.settings.assessModel || '',
            therapyModel: State.settings.therapyModel || '',
            ragEnabled: State.settings.ragEnabled !== false,
            mood: '', concern: '', body: '', preference: 'gentle', hope: '',
            userName: '',
            skipSetup: isReturning
        });
        const box = document.getElementById('chatBox');
        box.innerHTML = '';
        box.onclick = null;
        // 清除 finishVnOnboarding 遗留的 inline 透明度样式
        box.style.opacity = '';
        box.style.transform = '';
        box.style.transition = '';
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

            // 剥离 [voice:嗯] 标记，播放对应语气
            let displayText = step.text;
            const voiceMatch = displayText.match(/\[voice:([^\]]+?)\]/);
            if (voiceMatch) {
                playInterjection(voiceMatch[1]);
                displayText = displayText.replace(voiceMatch[0], '').trim();
            }

            // 根据字数自动调速，总时长控制在 1~3 秒
            const len = displayText.length;
            const t = Math.min(Math.max((len - 5) / 95, 0), 1);
            const totalMs = 1000 + t * 4000; // 1000ms ~ 5000ms
            const speed = len > 0 ? Math.floor(totalMs / len) : 50;

            typeText(div, displayText, speed, () => {
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
                    if (c.action) c.action();
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
            if (step.label) {
                const label = document.createElement('div');
                label.style.cssText = 'font-size:12px;color:rgba(246,247,241,0.4);margin-bottom:4px;';
                label.textContent = step.label;
                box.appendChild(label);
            }
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;';
            const input = document.createElement('input');
            input.className = 'vn-input';
            input.style.flex = '1';
            input.placeholder = step.placeholder || '';
            if (step.defaultValue) input.value = step.defaultValue;
            box.appendChild(row);
            row.appendChild(input);
            if (step.buttonText) {
                const btn = document.createElement('button');
                btn.className = 'vn-choice-item';
                btn.textContent = step.buttonText;
                btn.onclick = () => {
                    const val = input.value.trim() || '';
                    if (step.saveTo) vnData[step.saveTo] = val;
                    renderVnStep();
                };
                row.appendChild(btn);
            }
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = input.value.trim() || '';
                    if (step.saveTo) vnData[step.saveTo] = val;
                    renderVnStep();
                }
            });
            setTimeout(() => input.focus(), 200);

        } else if (step.type === 'user') {
            const div = document.createElement('div');
            div.style.cssText = 'text-align:right;padding:8px 12px;margin:8px 0;background:rgba(94,224,183,0.08);border-radius:12px;color:#5ee0b7;font-size:14px;';
            div.textContent = step.text;
            box.appendChild(div);
            setTimeout(() => renderVnStep(), 800);
        }
    }

    function finishVnOnboarding() {
        // ── 写入配置 ──
        const isTrial = vnData.mode === 'trial';
        State.useMode = isTrial ? 'proxy' : 'direct';
        State.settings.useMode = State.useMode;
        if (isTrial) {
            State.settings.apiKey = savedApiKey();
            State.settings.apiBase = State.settings.proxyBase || Config.defaults.proxyBase;
            State.settings.assessModel = Config.defaults.assessModel;
            State.settings.therapyModel = Config.defaults.therapyModel;
            State.settings.ragEnabled = true;
        } else {
            State.settings.apiKey = vnData.apiKey || '';
            State.settings.apiBase = vnData.apiBase || Config.defaults.apiBase;
            State.settings.assessModel = vnData.assessModel || Config.defaults.assessModel;
            State.settings.therapyModel = vnData.therapyModel || Config.defaults.therapyModel;
            State.settings.ragEnabled = vnData.ragEnabled ?? true;
        }

        const moodMap = { anxious: '焦虑紧绷', depressed: '低落麻木', confused: '混乱疲惫', unsure: '还说不清' };
        const bodyMap = { sleep: '睡眠', appetite: '食欲', chest: '胸口或呼吸', mind: '头脑停不下来', work: '学习或工作', social: '人际关系', unsure: '还说不清' };
        const prefMap = { gentle: '倾听与承接', structured: '梳理与建议', accompany: '安静陪伴', stabilize: '情绪安抚' };
        State.warmupProfile.mood = moodMap[vnData.mood] || '';
        State.warmupProfile.concern = vnData.concern || '';
        State.warmupProfile.body = bodyMap[vnData.body] || '';
        State.warmupProfile.preference = prefMap[vnData.preference] || '倾听与承接';
        State.warmupProfile.hope = vnData.hope || '';

        // ── 保存姓名 ──
        if (vnData.userName) {
            try {
                const profile = JSON.parse(localStorage.getItem('shelter_profile') || '{}');
                profile.displayName = vnData.userName;
                localStorage.setItem('shelter_profile', JSON.stringify(profile));
            } catch {}
        }
        State.selectedFeatureIds = State.settings.ragEnabled
            ? Array.from(new Set([...State.selectedFeatureIds, 'knowledge']))
            : State.selectedFeatureIds.filter((id) => id !== 'knowledge');

        document.querySelectorAll('.conv-avatar, #docPhoto').forEach(el => { if (el) el.src = './smile.png'; });

        persistSettings();

        // ── 同步到 Supabase 会话 ──
        if (window.AppStorage?.ready) {
            AppStorage.saveConversation({
                id: State.activeConversationId || undefined,
                title: '',
                phase: State.phase,
                tags: State.selectedTagIds,
                features: State.selectedFeatureIds,
                warmup_profile: State.warmupProfile,
            }).then((conv) => {
                const convData = Array.isArray(conv) ? conv[0] : conv;
                if (convData?.id) State.activeConversationId = convData.id;
            }).catch(() => {});
        }

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

    // ── TTS 语气词缓存（longyan_v3 · CosyVoice）──
    const ttsCache = new Map();
    const COMMON_INTERJECTIONS = [
        '嗯', '嗯？', '嗯嗯', '嗯…',
        '哎', '哎？',
        '哦', '哦？', '哦哦',
        '唔', '唔…', '嗯哼',
        '啊', '呀',
        '诶', '诶？',
        '噢',
        '你好', '好啦', '对', '对呀'
    ];

    function getCurrentTtsKey() {
        return State.settings.apiKey || '';
    }

    async function getTTSAudio(text) {
        if (ttsCache.has(text)) return ttsCache.get(text);
        try {
            const blobUrl = await Api.generateTTS({ text, apiKey: getCurrentTtsKey() });
            ttsCache.set(text, blobUrl);
            return blobUrl;
        } catch (err) {
            console.error('TTS gen failed:', err);
            return null;
        }
    }

    function playInterjection(text) {
        const url = ttsCache.get(text);
        if (!url) return;
        try {
            const audio = new Audio(url);
            audio.volume = 0.8;
            audio.play().catch(() => {});
        } catch (_) {}
    }

    function preloadInterjections() {
        COMMON_INTERJECTIONS.forEach((text, i) => {
            setTimeout(() => getTTSAudio(text).catch(() => {}), i * 2000);
        });
    }

    async function postVnChatRequest(messages, options = {}) {
        const { model, temperature, enableThinking, userQuery } = options;
        const { messages: requestMessages } = await buildRagAugmentedMessages({ messages, userQuery });
        let fullText = '';
        const text = await apiStreamWithFallback({
            model,
            messages: requestMessages,
            temperature: temperature ?? 0.7,
            enableThinking
        }, (full, _delta) => { fullText = full; });
        return text || fullText;
    }

    function displayAiLines(fullText) {
        if (!fullText) { enableVnInput(); return; }

        let text = fullText.trim();

        // 解析表情指令
        const expMatch = text.match(/\[(smile|thinking|happy)\]/);
        if (expMatch) {
            setExpression(expMatch[1]);
            text = text.replace(expMatch[0], '').trim();
        }

        // 解析语气词指令 [voice:嗯] [voice:好啦] ...
        let voiceProcessed = text;
        voiceProcessed = voiceProcessed.replace(/\[voice:([^\]]+?)\]/g, (match, word) => {
            playInterjection(word);
            return '';
        });
        text = voiceProcessed.trim();

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
            scrollConvToBottom();
            setTimeout(() => showNextAiLine(), 800);
        });
    }

    function scrollConvToBottom() {
        const body = document.getElementById('convBody');
        if (body) body.scrollTop = body.scrollHeight;
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
        scrollConvToBottom();
        if (input) setTimeout(() => input.focus(), 100);
    }

    async function handlePostVnSend(pendingText) {
        const input = document.getElementById('convInput');
        const text = pendingText || input.value.trim();
        if (!text || isShowingLines) return;
        const previousPhase = State.phase;
        const previousIntakeTurns = State.intakeTurnsCompleted;
        const previousTherapyTurns = State.therapyTurnsSinceReview;
        const previousTotalUserTurns = State.totalUserTurns;
        const historyLengthBeforeUser = State.history.length;
        const displayLengthBeforeUser = State.displayMessages.length;

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
                        enableThinking: State.settings.assessEnableThinking,
                        userQuery: text
                    });
                    State.displayMessages.push({ text: reply, role: 'assistant', isSystem: false, meta: { role: 'assessment' } });
                    State.history.push({ role: 'assistant', content: reply });
                    displayAiLines(reply);
                    // 双写：保存消息到 Supabase
                    if (State.activeConversationId && window.AppStorage?.ready) {
                        AppStorage.appendMessage(State.activeConversationId, { role: 'user', content: text }).catch(() => {});
                        AppStorage.appendMessage(State.activeConversationId, { role: 'assistant', content: reply, meta: { role: 'assessment' } }).catch(() => {});
                    }
                    extractMemoriesIfNeeded().catch(() => {});
                }
            } else if (State.phase === 'therapy') {
                State.therapyTurnsSinceReview += 1;
                const reply = await postVnChatRequest(State.history, {
                    model: State.settings.therapyModel,
                    temperature: Config.defaults.therapyTemperature,
                    enableThinking: State.settings.therapyEnableThinking,
                    userQuery: text
                });
                State.displayMessages.push({ text: reply, role: 'assistant', isSystem: false, meta: { role: 'therapy' } });
                State.history.push({ role: 'assistant', content: reply });
                displayAiLines(reply);
                // 双写：保存消息到 Supabase
                if (State.activeConversationId && window.AppStorage?.ready) {
                    AppStorage.appendMessage(State.activeConversationId, { role: 'user', content: text }).catch(() => {});
                    AppStorage.appendMessage(State.activeConversationId, { role: 'assistant', content: reply, meta: { role: 'therapy' } }).catch(() => {});
                }
                // 定期提取长期记忆
                extractMemoriesIfNeeded().catch(() => {});
            }
        } catch (error) {
            console.error(error);
            if (error.message?.includes('免费试用') || error.message?.includes('quota_exhausted')) {
                addDisplayMessage('今日免费试用次数已用完。你可以换上自己的 API Key 继续。', 'system', true);
                showQuotaUpgradeUI();
                return;
            }
            try {
                const retryModel = State.phase === 'intake' ? State.settings.assessModel : State.settings.therapyModel;
                const retryTemperature = State.phase === 'intake'
                    ? Config.defaults.assessTemperature
                    : Config.defaults.therapyTemperature;
                const retryReply = await apiChatWithFallback({
                    model: retryModel,
                    messages: State.history,
                    temperature: retryTemperature,
                    enableThinking: false
                });
                if (retryReply) {
                    const retryRole = State.phase === 'intake' ? 'assessment' : 'therapy';
                    State.displayMessages.push({ text: retryReply, role: 'assistant', isSystem: false, meta: { role: retryRole, stage: `${retryRole}-retry` } });
                    State.history.push({ role: 'assistant', content: retryReply });
                    displayAiLines(retryReply);
                    return;
                }
            } catch (retryError) {
                console.error(retryError);
            }
            if (State.phase === previousPhase) {
                State.phase = previousPhase;
                State.intakeTurnsCompleted = previousIntakeTurns;
                State.therapyTurnsSinceReview = previousTherapyTurns;
                State.totalUserTurns = previousTotalUserTurns;
                State.history = State.history.slice(0, historyLengthBeforeUser);
                State.displayMessages = State.displayMessages.slice(0, displayLengthBeforeUser);
            }
            displayAiLines('[smile] 嗯，好像走神了一下……能再说一次吗？');
        }
    }

    async function finishPostVnAssessment() {
        try {
            const report = await generateAssessment('initial');
            State.phase = 'therapy';
            rebuildTherapyContext();

            if (['high', 'critical'].includes(report.warningLevel)) {
                addDisplayMessage('检测到较高风险信号，接下来会优先稳定情绪、确认安全，并提醒使用现实中的支持资源。', 'system', true);
            }

            const therapyReply = await postVnChatRequest(State.history, {
                model: State.settings.therapyModel,
                temperature: Config.defaults.therapyTemperature,
                enableThinking: State.settings.therapyEnableThinking
            });
            State.displayMessages.push({ text: therapyReply, role: 'assistant', isSystem: false, meta: { role: 'therapy', stage: 'therapy-handoff' } });
            State.history.push({ role: 'assistant', content: therapyReply });
            displayAiLines(therapyReply);
        } catch (error) {
            console.error(error);
            if (error.message?.includes('免费试用') || error.message?.includes('quota_exhausted')) {
                addDisplayMessage('今日免费试用次数已用完。你可以换上自己的 API Key 继续。', 'system', true);
                showQuotaUpgradeUI();
                return;
            }
            displayAiLines('[smile] 没事，慢慢来。你还想继续聊一会儿吗？');
        }
    }

    // ── 每 N 轮提取长期记忆（从 therapy 对话中） ──
    const MEMORY_EXTRACT_INTERVAL = 8; // 每 8 轮提取一次

    async function extractMemoriesIfNeeded() {
        if (State.phase !== 'therapy') return;
        if (State.therapyTurnsSinceReview % MEMORY_EXTRACT_INTERVAL !== 0) return;
        if (!window.AppStorage?.ready) return;
        // 已有记忆的类型，避免重复提取相同内容
        const recentMessages = State.history.slice(-6).map((m) => `${m.role}: ${m.content?.slice(0, 200)}`).join('\n');
        if (!recentMessages.trim()) return;

        try {
            const raw = await apiChatWithFallback({
                model: State.settings.assessModel,
                messages: [
                    { role: 'system', content: '你是一个记忆提取器。从最近的对话中提取可复用的用户洞察。只输出 JSON，不要解释。' },
                    { role: 'user', content: [
                        '分析以下最近的对话片段，提取你对这个用户的新了解。',
                        '只提取有把握的、可复用的观察（偏好、困扰、背景、风险信号、支持资源、禁忌表达）。',
                        '如果没什么新发现，返回空数组。',
                        '',
                        recentMessages,
                        '',
                        '输出 JSON 格式：{"new_memories":[{"type":"preference|concern|background|risk|resource|taboo","content":"...","confidence":0.0-1.0}]}'
                    ].join('\n') }
                ],
                temperature: 0.3,
                enableThinking: false
            });

            const parsed = JSON.parse(raw);
            if (parsed?.new_memories?.length) {
                await AppStorage.saveMemories(parsed.new_memories.map((m) => ({
                    ...m,
                    source: 'auto-extract',
                })));
            }
        } catch {}
    }

    async function startPostVnFlow() {
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

        try {
            const kickoffText = await postVnChatRequest([
                ...State.history,
                {
                    role: 'user',
                    content: [
                        Config.prompts.buildKickoffPrompt({ tags: getSelectedTagLabels() }),
                        onboardingContext ? '请结合前置引导信息，先问一个最自然、最温和的问题。' : ''
                    ].filter(Boolean).join('\n\n')
                }
            ], {
                model: State.settings.assessModel,
                temperature: Config.defaults.assessTemperature,
                enableThinking: State.settings.assessEnableThinking
            });

            State.displayMessages.push({ text: kickoffText, role: 'assistant', isSystem: false, meta: { role: 'assessment', stage: 'intake-kickoff' } });
            State.history.push({ role: 'assistant', content: kickoffText });

            setExpression('thinking');
            displayAiLines(kickoffText);
        } catch (error) {
            console.error(error);
            if (error.message?.includes('免费试用') || error.message?.includes('quota_exhausted')) {
                addDisplayMessage('今日免费试用次数已用完。你可以换上自己的 API Key 继续。', 'system', true);
                showQuotaUpgradeUI();
                return;
            }
            displayAiLines('[smile] 晚上好。今晚我会在这里陪着你。想从哪里开始聊呢？');
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

        // ── 播放列表切换 ──
        const MUSIC_PLAYLIST = [
            { file: './826622__xkeril__memories-of-a-sweet-summer-music-loop.wav', name: '夏日回忆' },
            { file: './music_soft_piano.mp3', name: '轻钢琴曲' },
        ];
        let _musicTrackIdx = 0;
        const _trackDisplay = document.getElementById('musicTrackDisplay');

        function updateTrackDisplay() {
            if (_trackDisplay) _trackDisplay.textContent = MUSIC_PLAYLIST[_musicTrackIdx].name;
        }

        function switchMusicTrack(direction) {
            _musicTrackIdx = (_musicTrackIdx + direction + MUSIC_PLAYLIST.length) % MUSIC_PLAYLIST.length;
            const m = document.getElementById('bgMusic');
            if (!m) return;
            const wasPlaying = !m.paused;
            m.src = MUSIC_PLAYLIST[_musicTrackIdx].file;
            m.load();
            if (wasPlaying) m.play().catch(() => {});
            updateTrackDisplay();
        }

        // 点击曲名切换到下一首
        if (_trackDisplay) {
            _trackDisplay.onclick = () => switchMusicTrack(1);
        }

        // 初始化曲名显示
        updateTrackDisplay();

        // ── splash 点击时设置初始曲目 ──
        // 在 startApp 的 splash.onclick 中调用

        // ── 设置弹窗 ──
        const settingsOverlay = document.getElementById('settingsOverlay');
        document.getElementById('btnSettings').onclick = () => {
            UI.refreshSettingsQuota();
            settingsOverlay.classList.add('open');
        };
        document.getElementById('btnSettingsClose').onclick = () => settingsOverlay.classList.remove('open');
        document.getElementById('btnSaveSettings').onclick = () => App.saveSettings();
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
        });

        // ── 存档列表弹窗 ──
        const archivesOverlay = document.getElementById('archivesOverlay');

        function renderArchivesOverlay() {
            const list = document.getElementById('archivesList');
            const archives = Archive.getAll();
            if (!archives.length) {
                list.innerHTML = '<div class="archives-empty">还没有存档。完成对话后点击「暂存」来保存。</div>';
                return;
            }
            list.innerHTML = '';
            archives.forEach((a) => {
                const card = document.createElement('div');
                card.className = 'archives-card' + (State.activeArchiveId === a.id ? ' archives-card-active' : '');
                card.innerHTML = `
                    <div class="archives-card-title">${a.title || '未命名对话'}</div>
                    <div class="archives-card-meta">
                        <span>${a.meta || ''}</span>
                        <span>${a.phaseLabel || ''}</span>
                    </div>
                    <div class="archives-card-actions">
                        <button class="archives-btn-load" data-action="load" data-id="${a.id}">继续</button>
                        <button class="archives-btn-del" data-action="delete" data-id="${a.id}">删除</button>
                    </div>
                `;
                card.querySelector('[data-action="load"]').onclick = (e) => {
                    e.stopPropagation();
                    archivesOverlay.classList.remove('open');
                    App.loadArchive(a.id);
                };
                card.querySelector('[data-action="delete"]').onclick = (e) => {
                    e.stopPropagation();
                    Archive.remove(a.id);
                    renderArchivesOverlay();
                    UI.renderArchives(Archive.getAll(), State.activeArchiveId);
                };
                list.appendChild(card);
            });
        }

        document.getElementById('btnArchives').onclick = () => {
            renderArchivesOverlay();
            archivesOverlay.classList.add('open');
        };
        document.getElementById('btnArchivesClose').onclick = () => {
            archivesOverlay.classList.remove('open');
        };
        archivesOverlay.addEventListener('click', (e) => {
            if (e.target === archivesOverlay) archivesOverlay.classList.remove('open');
        });

        // ── 模式切换 ──
        document.getElementById('cfgModeTrial')?.addEventListener('click', () => App.setMode('proxy'));
        document.getElementById('cfgModeDirect')?.addEventListener('click', () => App.setMode('direct'));

        // ── RAG 开关联动 ──
        const cfgRagEnabled = document.getElementById('cfgRagEnabled');
        const cfgRagFields = document.getElementById('cfgRagFields');
        if (cfgRagEnabled && cfgRagFields) {
            const toggleRag = () => {
                cfgRagFields.style.opacity = cfgRagEnabled.checked ? '1' : '0.35';
                cfgRagFields.querySelectorAll('input').forEach(el => el.disabled = !cfgRagEnabled.checked);
            };
            cfgRagEnabled.addEventListener('change', toggleRag);
            toggleRag();
        }

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

        // ── 个人信息弹窗 ──
        const PROFILE_KEY = 'shelter_profile';

        function loadProfile() {
            try {
                const raw = localStorage.getItem(PROFILE_KEY);
                return raw ? JSON.parse(raw) : { displayName: '', bio: '' };
            } catch { return { displayName: '', bio: '' }; }
        }

        function saveProfileToDisk(data) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        }

        function openProfile() {
            const overlay = document.getElementById('profileOverlay');
            if (!overlay) return;
            const data = loadProfile();
            document.getElementById('profileEmail').textContent = AppAuth.getUserEmail() || '--';
            document.getElementById('profileDisplayName').value = data.displayName || '';
            document.getElementById('profileBio').value = data.bio || '';
            // 同步头像
            const avatarSrc = document.getElementById('userAvatar')?.src || './me.png';
            document.getElementById('profileAvatar').src = avatarSrc;
            overlay.classList.add('open');
        }

        const profileOverlay = document.getElementById('profileOverlay');
        document.getElementById('btnUserProfile')?.addEventListener('click', openProfile);
        document.getElementById('userAvatar')?.addEventListener('click', openProfile);
        document.getElementById('btnProfileClose')?.addEventListener('click', () => {
            profileOverlay?.classList.remove('open');
        });
        if (profileOverlay) {
            profileOverlay.addEventListener('click', (e) => {
                if (e.target === profileOverlay) profileOverlay.classList.remove('open');
            });
        }
        document.getElementById('btnProfileSave')?.addEventListener('click', () => {
            const data = {
                displayName: document.getElementById('profileDisplayName').value.trim(),
                bio: document.getElementById('profileBio').value.trim()
            };
            saveProfileToDisk(data);
            profileOverlay?.classList.remove('open');
            // 双写：同步 profile 到 Supabase
            if (window.AppStorage?.ready) {
                AppStorage.saveProfile({
                    display_name: data.displayName,
                    bio: data.bio,
                }).catch(() => {});
            }
        });

        // ── 新存档：重置为全新体验，保持登录 ──
        document.getElementById('btnProfileNewSave')?.addEventListener('click', () => {
            profileOverlay?.classList.remove('open');
            if (!confirm('重置记忆后，当前对话将清空。\n确定要重置吗？')) return;

            // 清除存档（最多保留 3 个，这里直接清空重置）
            localStorage.removeItem(Config.storageKeys.archives);
            Archive.saveAll([]);

            // 重置所有状态
            resetSession();
            State.activeArchiveId = null;

            // 回到引导布局
            document.querySelector('.main-layout')?.classList.remove('layout-conversation');
            document.querySelector('.main-layout')?.classList.add('layout-intake');
            document.getElementById('bgImage')?.classList.remove('sharp');

            UI.clearMessages();
            UI.lockChat();
            UI.updateStatus('准备就绪', 'idle');

            // 强制重新开始 VN（新用户体验）
            vnIdx = -1;
            Object.assign(vnData, { userName: '', skipSetup: false });
            const box = document.getElementById('chatBox');
            box.innerHTML = '';
            box.onclick = null;
            box.style.opacity = '';
            box.style.transform = '';
            box.style.transition = '';
            UI.els.input.disabled = true;
            if (UI.els.sendBtn) UI.els.sendBtn.disabled = true;
            setTimeout(() => {
                UI.unlockChat();
                renderVnStep();
            }, 600);
        });

        // ── 退出登录 ──
        document.getElementById('btnProfileLogout')?.addEventListener('click', async () => {
            profileOverlay?.classList.remove('open');
            if (!confirm('确定要退出登录吗？')) return;

            await AppAuth.signOut();

            // 完全重置
            resetSession();

            // 重置 UI
            document.querySelector('.main-layout')?.classList.remove('layout-conversation');
            document.querySelector('.main-layout')?.classList.add('layout-intake');
            document.getElementById('bgImage')?.classList.remove('sharp');
            UI.clearMessages();
            UI.hideReport();
            UI.showOnboarding('focus');
            UI.lockChat();

            // 清空聊天框
            const box = document.getElementById('chatBox');
            box.innerHTML = '';
            box.style.opacity = '';
            box.style.transform = '';
            box.style.transition = '';

            // 重新显示认证页
            const splash = document.getElementById('splashScreen');
            if (splash) {
                splash.classList.remove('hidden');
                splash.style.display = '';
                splash.style.opacity = '1';
            }
            const authScreen = document.getElementById('authScreen');
            if (authScreen) {
                authScreen.classList.remove('hidden');
                authScreen.style.display = 'flex';
                authScreen.style.opacity = '1';
                authScreen.classList.add('show');
            }
            authResolved = false;
            setupAuthUI();
        });

        // ── 头像更新时同步到 profile 弹窗 ──
        const _origSetUserAvatar = UI.setUserAvatar;
        UI.setUserAvatar = function(src) {
            _origSetUserAvatar(src);
            document.getElementById('profileAvatar').src = src;
            document.getElementById('headerAvatar').src = src;
        };

        App.init();

        // ── 后台预加载 TTS 语气词缓存 ──
        preloadInterjections();

        // ── 开场：认证检查 + 城市闪屏 + 细雨 ──
        // 极细雨丝（画在城市图片上层）
        rainController = startRain('canvasBg', { dropCount: 120 });

        const splash = document.getElementById('splashScreen');
        const authScreen = document.getElementById('authScreen');
        let authResolved = false;

        function startApp() {
            if (authResolved) return;
            authResolved = true;

            // 隐藏认证页
            if (authScreen) { authScreen.classList.remove('show'); authScreen.style.display = 'none'; }

            splash.onclick = () => {
                // 设置初始曲目
                const bgMusic = document.getElementById('bgMusic');
                if (bgMusic && !bgMusic.src.includes(MUSIC_PLAYLIST[_musicTrackIdx].file.slice(2))) {
                    bgMusic.src = MUSIC_PLAYLIST[_musicTrackIdx].file;
                    bgMusic.load();
                }
                updateTrackDisplay();

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
        }

        // ── 登录后从 Supabase 同步偏好／记忆（后台静默） ──
        async function syncFromRemote() {
            if (!window.AppStorage?.ready) return;
            try {
                const [settings, profile] = await Promise.all([
                    AppStorage.loadSettings(),
                    AppStorage.loadProfile(),
                ]);
                // 合并设置：远程优先，补全本地缺失的字段
                if (settings) {
                    const merged = { ...State.settings };
                    // 只同步非敏感设置（API Key 不存远程）
                    if (settings.use_mode) merged.useMode = settings.use_mode;
                    if (settings.assess_model) merged.assessModel = settings.assess_model;
                    if (settings.therapy_model) merged.therapyModel = settings.therapy_model;
                    if (settings.api_base) merged.apiBase = settings.api_base;
                    if (typeof settings.rag_enabled === 'boolean') merged.ragEnabled = settings.rag_enabled;
                    if (typeof settings.enable_music === 'boolean') merged.enableMusic = settings.enable_music;
                    Object.assign(State.settings, merged);
                    persistSettings();
                }
                // 合并 profile
                if (profile) {
                    const local = JSON.parse(localStorage.getItem('shelter_profile') || '{}');
                    if (profile.display_name && !local.displayName) local.displayName = profile.display_name;
                    if (profile.bio && !local.bio) local.bio = profile.bio;
                    localStorage.setItem('shelter_profile', JSON.stringify(local));
                }
            } catch {}
        }

        // ── 认证流程 ──
        async function checkAuth() {
            if (!window.AppAuth?.ready) {
                // 未配置认证 → 直接进
                if (authScreen) { authScreen.classList.remove('show'); authScreen.style.display = 'none'; }
                startApp();
                return;
            }

            const user = await AppAuth.getSession();
            if (user) {
                // 已有登录态 → 直接进
                authScreen.classList.add('hidden');
                startApp();
                // 后台同步远程数据
                syncFromRemote();
            } else {
                // 显示认证页，设置 UI
                setupAuthUI();
            }
        }

        function setupAuthUI() {
            // 显示认证页
            authScreen.classList.add('show');
            requestAnimationFrame(() => authScreen.classList.remove('hidden'));
            let isRegister = false;
            const emailInput = document.getElementById('authEmail');
            const passInput = document.getElementById('authPassword');
            const confirmInput = document.getElementById('authConfirm');
            const authBtn = document.getElementById('authBtn');
            const authToggle = document.getElementById('authToggle');
            const authError = document.getElementById('authError');
            const authSuccess = document.getElementById('authSuccess');
            const userInfo = document.getElementById('authUserInfo');
            const userEmail = document.getElementById('authUserEmail');
            const signOutBtn = document.getElementById('authSignOutBtn');

            function setError(msg) { authError.textContent = msg; authSuccess.textContent = ''; }
            function setSuccess(msg) { authSuccess.textContent = msg; authError.textContent = ''; }
            function setLoading(loading) {
                authBtn.disabled = loading;
                authBtn.textContent = loading ? (isRegister ? '注册中...' : '登录中...') : (isRegister ? '注册并进入' : '进入避雨檐');
            }

            function switchMode(register) {
                isRegister = register;
                confirmInput.style.display = register ? '' : 'none';
                authBtn.textContent = register ? '注册并进入' : '进入避雨檐';
                authToggle.textContent = register ? '已有账号？去登录' : '没有账号？去注册';
                setError('');
                setSuccess('');
            }

            authToggle.onclick = () => switchMode(!isRegister);

            // 确认页 → 回到登录
            document.getElementById('authBackToLogin').onclick = () => {
                document.getElementById('authConfirmView').style.display = 'none';
                document.getElementById('authForm').style.display = '';
                authToggle.style.display = '';
                switchMode(false);
                emailInput.value = document.getElementById('authConfirmEmail').textContent.trim();
                passInput.focus();
            };

            authBtn.onclick = async () => {
                const email = emailInput.value.trim();
                const password = passInput.value;
                if (!email) { setError('请输入邮箱'); return; }
                if (!password || password.length < 6) { setError('密码至少 6 位'); return; }
                if (isRegister && password !== confirmInput.value) { setError('两次密码不一致'); return; }

                setError('');
                setLoading(true);
                try {
                    if (isRegister) {
                        await AppAuth.signUp(email, password);
                        // 显示确认邮件提示页
                        document.getElementById('authConfirmView').style.display = '';
                        document.getElementById('authConfirmEmail').textContent = ' ' + email;
                        document.getElementById('authForm').style.display = 'none';
                        authToggle.style.display = 'none';
                        setError('');
                        setSuccess('');
                    } else {
                        await AppAuth.signIn(email, password);
                        startApp();
                    }
                } catch (err) {
                    setError(err.message || '操作失败');
                } finally {
                    setLoading(false);
                }
            };

            // 记住登录状态
            document.getElementById('authRemember').onchange = (e) => {
                AppAuth.setPersist(e.target.checked);
            };

            // Enter 键提交
            [emailInput, passInput, confirmInput].forEach(el => {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') authBtn.click();
                });
            });

            // 已登录用户信息
            const currentUser = AppAuth.getUserEmail();
            if (currentUser) {
                userInfo.style.display = 'flex';
                userEmail.textContent = currentUser;
                signOutBtn.onclick = async () => {
                    await AppAuth.signOut();
                    userInfo.style.display = 'none';
                    emailInput.value = currentUser;
                    passInput.value = '';
                    switchMode(false);
                };
            }
        }

        checkAuth();
    });
})();
