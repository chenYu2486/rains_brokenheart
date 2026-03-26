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

    const createSessionState = () => ({
        phase: 'idle',
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

    const State = {
        ...createSessionState(),
        settings: loadSettings()
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
            ragMinScore: clamp(toFloat(saved.ragMinScore, Config.defaults.ragMinScore), 0, 1)
        };
    }

    function persistSettings() {
        localStorage.setItem(Config.storageKeys.settings, JSON.stringify(State.settings));
        localStorage.setItem(Config.storageKeys.legacyApiKey, State.settings.apiKey || '');
    }

    function getSelectedTags() {
        return Config.tags.filter((tag) => State.selectedTagIds.includes(tag.id));
    }

    function getSelectedTagLabels() {
        return getSelectedTags().map((tag) => tag.label);
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
            UI.updateStatus(customText || '等待选择建档方向...', 'idle');
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
        Object.assign(State, createSessionState(), { settings: State.settings });
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
        alert('请先在设置中配置 API Key。');
        UI.toggleModal('settingsModal', true);
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
                        content: Config.prompts.buildAssessmentJsonPrompt({
                            tags: getSelectedTagLabels(),
                            checkpointIndex: State.reports.length + 1,
                            phaseLabel: reportPhase === 'initial' ? '首轮建档' : '持续追踪',
                            totalUserTurns: State.totalUserTurns,
                            previousReportsSummary: summarizeReportsForPrompt()
                        })
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
        setSystemPrompt(Config.prompts.buildTherapySystem({
            tags: getSelectedTagLabels(),
            latestReport: State.latestReport,
            previousReportsSummary: summarizeReportsForPrompt()
        }));
    }

    async function startIntakeFlow() {
        State.phase = 'intake';
        State.history = [{
            role: 'system',
            content: Config.prompts.buildAssessSystem({
                tags: getSelectedTagLabels(),
                intakeTurns: State.settings.intakeTurns
            })
        }];

        UI.unlockChat();
        syncKeywordUI();
        updateStatusFromState();

        await streamAssistantReply({
            model: State.settings.assessModel,
            enableThinking: State.settings.assessEnableThinking,
            messages: [
                ...State.history,
                {
                    role: 'user',
                    content: Config.prompts.buildKickoffPrompt({
                        tags: getSelectedTagLabels()
                    })
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

        Object.assign(State, createSessionState(), {
            settings: State.settings,
            phase: loadedPhase,
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
                onStartAssessment: () => this.startAssessment(),
                onSend: () => this.handleChat(),
                onSaveArchive: () => this.saveArchive(),
                onNewChat: () => this.newChat(),
                onLoadArchive: (id) => this.loadArchive(id),
                onDeleteArchive: (id) => this.deleteArchive(id)
            });

            UI.writeSettings(State.settings);
            syncKeywordUI();
            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            UI.lockChat();
            updateStatusFromState();
            refreshRagStatus();
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
            persistSettings();
            UI.writeSettings(State.settings);
            UI.toggleModal('settingsModal', false);
            updateStatusFromState();
            refreshRagStatus();
        },

        async startAssessment() {
            if (State.isBusy || State.phase !== 'idle') return;
            if (State.selectedTagIds.length < Config.limits.minTags) return;
            if (!ensureApiReady()) return;

            setBusy(true);
            try {
                await startIntakeFlow();
            } finally {
                setBusy(false);
            }
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

            syncKeywordUI();
            UI.renderMessages(State.displayMessages);

            if (State.latestReport) UI.showReport(State.latestReport, State.reports);
            else UI.hideReport();

            if (State.phase === 'idle') UI.lockChat();
            else UI.unlockChat();

            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            updateStatusFromState();
        },

        deleteArchive(id) {
            Archive.remove(id);
            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
        },

        newChat() {
            resetSession();
            syncKeywordUI();
            UI.clearMessages();
            UI.hideReport();
            UI.lockChat();
            UI.renderArchives(Archive.getAll(), State.activeArchiveId);
            updateStatusFromState();
        }
    };

    window.App = App;
    window.addEventListener('DOMContentLoaded', () => App.init());
})();
