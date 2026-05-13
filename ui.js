(() => {
    const { tags, limits } = window.AppConfig;
    const ARCHIVE_PANEL_STORAGE_KEY = 'shelter_archive_panel_collapsed';

    const formatDateTime = (timestamp) => {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const normalizeRole = (role) => role === 'ai' ? 'assistant' : role;
    const formatPageLabel = (source) => {
        const start = Number(source?.pageStart ?? source?.page_start) || 0;
        const end = Number(source?.pageEnd ?? source?.page_end) || start;
        if (!start && !end) return '页码未知';
        if (start === end) return `第 ${start} 页`;
        return `第 ${start}-${end} 页`;
    };
    const formatScoreLabel = (score) => {
        if (!Number.isFinite(Number(score))) return '';
        return `匹配 ${(Number(score) * 100).toFixed(0)}%`;
    };
    const formatModelRole = (role) => {
        if (role === 'assessment') return '评估模型';
        if (role === 'therapy') return '陪伴模型';
        return '模型';
    };

    const riskClassMap = {
        low: 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/25',
        medium: 'bg-amber-500/12 text-amber-200 border border-amber-500/25',
        high: 'bg-orange-500/12 text-orange-200 border border-orange-500/25',
        critical: 'bg-red-500/12 text-red-200 border border-red-500/25'
    };

    const metricClassMap = {
        stress: 'from-amber-300 to-rose-400',
        friction: 'from-sky-300 to-violet-300',
        risk: 'from-orange-300 to-red-400',
        resilience: 'from-emerald-300 to-teal-300'
    };

    const UI = {
        els: {},
        handlers: {},

        init() {
            this.cacheEls();
            if (this.els.btnToggleArchive && !this.els.btnToggleArchive.dataset.bound) {
                this.els.btnToggleArchive.addEventListener('click', () => this.toggleArchiveCollapsed());
                this.els.btnToggleArchive.dataset.bound = '1';
            }
            this.setArchiveCollapsed(this.readArchiveCollapsed(), { persist: false });
        },

        cacheEls() {
            this.els = {
                onboardingView: document.getElementById('onboardingView'),
                chatWorkspace: document.getElementById('chatWorkspace'),
                onboardingSteps: Array.from(document.querySelectorAll('[data-onboarding-step]')),
                stepPills: Array.from(document.querySelectorAll('[data-step-pill]')),
                setupBase: document.getElementById('setupBase'),
                setupKey: document.getElementById('setupKey'),
                setupAssess: document.getElementById('setupAssess'),
                setupTherapy: document.getElementById('setupTherapy'),
                setupRagEnabled: document.getElementById('setupRagEnabled'),
                setupStatus: document.getElementById('setupStatus'),
                btnIntroNext: document.getElementById('btnIntroNext'),
                btnWarmupBack: document.getElementById('btnWarmupBack'),
                btnWarmupNext: document.getElementById('btnWarmupNext'),
                btnFocusBack: document.getElementById('btnFocusBack'),
                btnFocusNext: document.getElementById('btnFocusNext'),
                btnFeatureBack: document.getElementById('btnFeatureBack'),
                warmupMoodOptions: Array.from(document.querySelectorAll('[data-mood]')),
                warmupConcern: document.getElementById('warmupConcern'),
                warmupBody: document.getElementById('warmupBody'),
                warmupPreference: document.getElementById('warmupPreference'),
                warmupHope: document.getElementById('warmupHope'),
                featureOptions: Array.from(document.querySelectorAll('[data-feature]')),
                sideIntakePanel: document.getElementById('sideIntakePanel'),
                profileSummary: document.getElementById('profileSummary'),
                btnEditOnboarding: document.getElementById('btnEditOnboarding'),
                tagContainer: document.getElementById('tagContainer'),
                tagCounter: document.getElementById('tagCounter'),
                tagPreview: document.getElementById('selectedTagPreview'),
                panelKeywords: document.getElementById('panelKeywords'),
                panelReport: document.getElementById('panelReport'),
                chatBox: document.getElementById('chatBox'),
                input: document.getElementById('userInput'),
                sendBtn: document.getElementById('sendBtn'),
                statusLabel: document.getElementById('statusLabel'),
                statusDot: document.getElementById('statusDot'),
                chatOverlay: document.getElementById('chatOverlay'),
                overlayText: document.getElementById('overlayText'),
                btnStartAssess: document.getElementById('btnStartAssess') || document.createElement('button'),
                btnSaveArchive: document.getElementById('btnSaveArchive'),
                btnNewChat: document.getElementById('btnNewChat'),
                archiveList: document.getElementById('archiveList'),
                archivePanel: document.getElementById('archivePanel'),
                archivePanelBody: document.getElementById('archivePanelBody'),
                archivePanelHint: document.getElementById('archivePanelHint'),
                btnToggleArchive: document.getElementById('btnToggleArchive'),
                archiveToggleIcon: document.getElementById('archiveToggleIcon'),
                archiveToggleText: document.getElementById('archiveToggleText'),
                btnOpenSettings: document.getElementById('btnOpenSettings'),
                btnCloseSettings: document.getElementById('btnCloseSettings'),
                btnSaveSettings: document.getElementById('btnSaveSettings'),
                cfgBase: document.getElementById('cfgBase'),
                cfgKey: document.getElementById('cfgKey'),
                cfgAssess: document.getElementById('cfgAssess'),
                cfgTherapy: document.getElementById('cfgTherapy'),
                cfgAssessThinking: document.getElementById('cfgAssessThinking'),
                cfgTherapyThinking: document.getElementById('cfgTherapyThinking'),
                cfgIntakeTurns: document.getElementById('cfgIntakeTurns'),
                cfgReassessEvery: document.getElementById('cfgReassessEvery'),
                cfgRagEnabled: document.getElementById('cfgRagEnabled'),
                cfgKbId: document.getElementById('cfgKbId'),
                cfgKbPath: document.getElementById('cfgKbPath'),
                cfgRagTopK: document.getElementById('cfgRagTopK'),
                cfgRagMinScore: document.getElementById('cfgRagMinScore'),
                cfgRagStatus: document.getElementById('cfgRagStatus'),
                reportStage: document.getElementById('reportStage'),
                reportUpdatedAt: document.getElementById('reportUpdatedAt'),
                reportModel: document.getElementById('reportModel'),
                riskBadge: document.getElementById('riskBadge'),
                riskAlert: document.getElementById('riskAlert'),
                scoreStress: document.getElementById('scoreStress'),
                scoreFriction: document.getElementById('scoreFriction'),
                scoreRisk: document.getElementById('scoreRisk'),
                scoreResilience: document.getElementById('scoreResilience'),
                barStress: document.getElementById('barStress'),
                barFriction: document.getElementById('barFriction'),
                barRisk: document.getElementById('barRisk'),
                barResilience: document.getElementById('barResilience'),
                txtSummary: document.getElementById('txtSummary'),
                txtCore: document.getElementById('txtCore'),
                txtCognitive: document.getElementById('txtCognitive'),
                txtSupportFocus: document.getElementById('txtSupportFocus'),
                txtStyle: document.getElementById('txtStyle'),
                txtFollowUp: document.getElementById('txtFollowUp'),
                listNextSteps: document.getElementById('listNextSteps'),
                reportHistoryList: document.getElementById('reportHistoryList')
            };
        },

        bindHandlers(handlers) {
            this.handlers = handlers;
            const safe = (el, cb) => { if (el) cb(el); };
            safe(this.els.sendBtn, el => el.onclick = handlers.onSend);
            safe(this.els.input, el => el.onkeypress = (event) => {
                if (event.key === 'Enter') handlers.onSend();
            });
            safe(this.els.btnSaveArchive, el => el.onclick = handlers.onSaveArchive);
            safe(this.els.btnNewChat, el => el.onclick = handlers.onNewChat);
            safe(this.els.btnToggleArchive, el => { if (!el.dataset.bound) { el.addEventListener('click', () => this.toggleArchiveCollapsed()); el.dataset.bound = '1'; } });
            safe(document.getElementById('btnTogglePanel'), el => el.onclick = () => this.togglePanel());
            safe(document.getElementById('btnClosePanel'), el => el.onclick = () => this.togglePanel(false));
        },

        toggleModal(id, force) {
            const modal = document.getElementById(id);
            if (!modal) return;
            if (typeof force === 'boolean') {
                modal.classList.toggle('active', force);
                return;
            }
            modal.classList.toggle('active');
        },

        readArchiveCollapsed() {
            return localStorage.getItem(ARCHIVE_PANEL_STORAGE_KEY) === '1';
        },

        setArchiveCollapsed(collapsed, { persist = true } = {}) {
            const isCollapsed = Boolean(collapsed);
            const {
                archivePanel,
                archivePanelBody,
                archivePanelHint,
                archiveToggleIcon,
                archiveToggleText,
                btnToggleArchive
            } = this.els;

            if (archivePanel) {
                archivePanel.classList.toggle('pb-3', isCollapsed);
                archivePanel.classList.toggle('p-4', !isCollapsed);
                archivePanel.classList.toggle('overflow-hidden', isCollapsed);
                archivePanel.dataset.collapsed = isCollapsed ? '1' : '0';
            }

            if (archivePanelBody) {
                archivePanelBody.hidden = isCollapsed;
                archivePanelBody.style.display = isCollapsed ? 'none' : '';
            }

            if (archivePanelHint) {
                archivePanelHint.textContent = isCollapsed
                    ? '存档区已收起，点击右侧按钮展开。'
                    : '对话可随时暂停存档，下次继续、删除，或开启新的会话。';
            }

            if (archiveToggleIcon) {
                archiveToggleIcon.classList.toggle('rotate-180', isCollapsed);
            }

            if (archiveToggleText) {
                archiveToggleText.textContent = isCollapsed ? '展开' : '收起';
            }

            if (btnToggleArchive) {
                btnToggleArchive.setAttribute('aria-expanded', String(!isCollapsed));
                btnToggleArchive.setAttribute('title', isCollapsed ? '展开会话存档' : '收起会话存档');
            }

            if (persist) {
                localStorage.setItem(ARCHIVE_PANEL_STORAGE_KEY, isCollapsed ? '1' : '0');
            }
        },

        toggleArchiveCollapsed() {
            this.setArchiveCollapsed(!this.readArchiveCollapsed());
        },

        setOnboardingStep(step) {
            if (this.els.onboardingSteps) {
                this.els.onboardingSteps.forEach((section) => {
                    section.classList.toggle('active', section.dataset.onboardingStep === step);
                });
            }
            if (this.els.stepPills) {
                this.els.stepPills.forEach((pill) => {
                    pill.classList.toggle('active', pill.dataset.stepPill === step);
                });
            }
        },

        showOnboarding() {
            // Galgame 统一视图，始终显示
        },

        showChatWorkspace() {
            // Galgame 统一视图，直接解锁聊天
            this.unlockChat();
        },

        writeSetupSettings(settings) {
            const s = (el, cb) => { if (el) cb(el); };
            s(this.els.setupBase, el => el.value = settings.apiBase || '');
            s(this.els.setupKey, el => el.value = settings.apiKey || '');
            s(this.els.setupAssess, el => el.value = settings.assessModel || '');
            s(this.els.setupTherapy, el => el.value = settings.therapyModel || '');
            s(this.els.setupRagEnabled, el => el.checked = Boolean(settings.ragEnabled));
        },

        readSetupSettings() {
            const g = (el, fallback) => el ? el.value : fallback;
            const gc = (el) => el ? el.checked : false;
            return {
                apiBase: g(this.els.setupBase, '').trim(),
                apiKey: g(this.els.setupKey, '').trim(),
                assessModel: g(this.els.setupAssess, '').trim(),
                therapyModel: g(this.els.setupTherapy, '').trim(),
                ragEnabled: gc(this.els.setupRagEnabled)
            };
        },

        setSetupStatus(text, tone = 'muted') {
            if (!this.els.setupStatus) { console?.warn?.('setupStatus element missing'); return; }
            const toneClass = {
                muted: 'text-white/42',
                ready: 'text-emerald-200/90',
                warning: 'text-amber-200/90',
                error: 'text-red-200/90'
            };
            this.els.setupStatus.className = `min-h-[18px] text-xs ${toneClass[tone] || toneClass.muted}`;
            this.els.setupStatus.textContent = text || '';
        },

        setWarmupMood(mood) {
            if (!this.els.warmupMoodOptions) return;
            this.els.warmupMoodOptions.forEach((button) => {
                button.classList.toggle('active', button.dataset.mood === mood);
            });
        },

        writeWarmupProfile(profile = {}) {
            if (this.els.warmupMoodOptions) this.setWarmupMood(profile.mood || '');
            if (this.els.warmupConcern) this.els.warmupConcern.value = profile.concern || '';
            if (this.els.warmupBody) this.els.warmupBody.value = profile.body || '';
            if (this.els.warmupPreference) this.els.warmupPreference.value = profile.preference || '倾听与承接';
            if (this.els.warmupHope) this.els.warmupHope.value = profile.hope || '';
        },

        readWarmupProfile() {
            return {
                mood: document.getElementById('warmupMoodVal')?.value || '',
                concern: this.els.warmupConcern?.value?.trim() || '',
                body: this.els.warmupBody?.value?.trim() || '',
                preference: this.els.warmupPreference?.value || '倾听与承接',
                hope: this.els.warmupHope?.value?.trim() || ''
            };
        },

        renderFeatureSelection(featureIds = []) {
            if (!this.els.featureOptions) return;
            this.els.featureOptions.forEach((button) => {
                button.classList.toggle('active', featureIds.includes(button.dataset.feature));
            });
        },

        renderProfileSummary({ profile = {}, tags: selectedTags = [], features = [] } = {}) {
            const row = (label, value) => `
                <div class="glass-soft p-3">
                    <div class="text-white/42">${label}</div>
                    <div class="mt-1 text-white/78">${value || '暂未填写'}</div>
                </div>
            `;

            const featureText = features.length ? features.join(' / ') : '温柔追问 / 动态复评';
            this.els.profileSummary.innerHTML = [
                row('此刻状态', profile.mood),
                row('想先谈的事', profile.concern),
                row('对话偏好', profile.preference),
                row('焦点', selectedTags.length ? selectedTags.join(' / ') : ''),
                row('功能', featureText)
            ].join('');
        },

        renderTags(selectedTagIds, phase) {
            if (!this.els.tagContainer) return;
            const locked = phase !== 'idle';
            this.els.tagContainer.innerHTML = '';

            const groups = [
                { label: '情绪状态', ids: ['anxious', 'depressed', 'sleep', 'information'] },
                { label: '关系与自我', ids: ['family', 'intimacy', 'attachment', 'boundaries', 'selfworth', 'peoplepleasing', 'perfectionism', 'social'] },
                { label: '压力与处境', ids: ['career', 'existential', 'procrastination', 'trauma', 'bodyimage', 'study', 'money', 'breakup'] }
            ];

            groups.forEach(({ label, ids }) => {
                const groupLabel = document.createElement('div');
                groupLabel.className = 'tag-group-label col-span-2';
                groupLabel.textContent = label;
                this.els.tagContainer.appendChild(groupLabel);

                ids.forEach((id) => {
                    const tag = tags.find(t => t.id === id);
                    if (!tag) return;
                    const selected = selectedTagIds.includes(tag.id);
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = [
                        'tag-btn text-left rounded-xl p-3',
                        selected ? 'tag-active' : '',
                        locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    ].join(' ').trim();
                    button.innerHTML = `
                        <div class="text-sm font-semibold text-white/90">${tag.label}</div>
                        <div class="mt-1 text-xs leading-5 text-white/45">${tag.desc}</div>
                    `;
                    if (!locked) button.onclick = () => this.handlers.onToggleTag?.(tag.id);
                    this.els.tagContainer.appendChild(button);
                });
            });

            this.updateSelectionSummary(selectedTagIds);
            this.setStartButtonState(selectedTagIds.length, phase);
        },

        updateSelectionSummary(selectedTagIds) {
            if (!this.els.tagCounter || !this.els.tagPreview) return;
            const selectedLabels = tags
                .filter((tag) => selectedTagIds.includes(tag.id))
                .map((tag) => tag.label);

            this.els.tagCounter.textContent = `已选 ${selectedTagIds.length}/${limits.maxTags}`;
            this.els.tagPreview.textContent = selectedLabels.length
                ? `当前谈话焦点：${selectedLabels.join(' / ')}`
                : `至少选择 ${limits.minTags} 个焦点，再继续到功能选择。`;
        },

        setStartButtonState(selectedCount, phase) {
            if (!this.els.btnStartAssess) return;
            const idle = phase === 'idle';
            const enabled = idle && selectedCount >= limits.minTags;
            this.els.btnStartAssess.disabled = !enabled;
            this.els.btnStartAssess.className = enabled
                ? 'solid-button px-5 py-3 text-sm font-semibold'
                : 'solid-button px-5 py-3 text-sm font-semibold opacity-45 cursor-not-allowed';

            if (!idle) {
                this.els.btnStartAssess.textContent = phase === 'intake' ? '建档进行中' : '已进入聊天';
                return;
            }

            this.els.btnStartAssess.textContent = selectedCount >= limits.minTags
                ? '进入聊天'
                : `请先选择 ${limits.minTags} 个焦点`;
        },

        clearMessages() {
            this.els.chatBox.innerHTML = '';
        },

        renderMessages(messages) {
            this.clearMessages();
            messages.forEach((message) => this.appendMessage(message));
        },

        appendMessage({ text, role, isSystem = false, sources = [], meta = null }) {
            const normalizedRole = normalizeRole(role);
            const wrap = document.createElement('div');
            wrap.className = `msg-row ${isSystem ? 'system' : (normalizedRole === 'user' ? 'user' : 'doctor')}`;

            if (isSystem) {
                const line = document.createElement('div');
                line.className = 'msg-bubble system';
                line.textContent = text;
                wrap.appendChild(line);
            } else {
                const column = document.createElement('div');
                column.className = 'max-w-[88%] space-y-3';

                const bubble = document.createElement('div');
                bubble.className = `msg-bubble ${normalizedRole === 'user' ? 'user' : 'doctor'}`;
                bubble.textContent = text;
                const assistantMeta = normalizedRole === 'assistant' ? this.buildAssistantMetaBlock(meta) : null;
                if (assistantMeta) column.appendChild(assistantMeta);
                column.appendChild(bubble);

                if (normalizedRole === 'assistant') {
                    const citations = this.buildCitationBlock(sources);
                    if (citations) column.appendChild(citations);
                }

                wrap.appendChild(column);
            }

            this.els.chatBox.appendChild(wrap);
            this.scrollChatToBottom();
            return wrap;
        },

        beginAssistantStream() {
            const wrap = document.createElement('div');
            wrap.className = 'msg-row doctor';

            const column = document.createElement('div');
            column.className = 'max-w-[88%] space-y-3';

            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble doctor';
            bubble.textContent = '...';

            column.appendChild(bubble);
            wrap.appendChild(column);
            this.els.chatBox.appendChild(wrap);
            this.scrollChatToBottom();
            return { wrap, column, bubble };
        },

        updateAssistantStream(handle, text) {
            handle.bubble.textContent = text || '...';
            this.scrollChatToBottom();
        },

        finishAssistantStream(handle, text, sources = [], meta = null) {
            handle.bubble.textContent = text || '我还在这里。';
            if (handle.metaBlock) {
                handle.metaBlock.remove();
                handle.metaBlock = null;
            }
            const assistantMeta = this.buildAssistantMetaBlock(meta);
            if (assistantMeta) {
                handle.column.insertBefore(assistantMeta, handle.bubble);
                handle.metaBlock = assistantMeta;
            }
            if (handle.citationBlock) {
                handle.citationBlock.remove();
                handle.citationBlock = null;
            }
            const citationBlock = this.buildCitationBlock(sources);
            if (citationBlock) {
                handle.column.appendChild(citationBlock);
                handle.citationBlock = citationBlock;
            }
            this.scrollChatToBottom();
        },

        buildAssistantMetaBlock(meta) {
            if (!meta || (!meta.model && !meta.stageLabel)) return null;

            const block = document.createElement('div');
            block.className = 'flex items-center gap-2 px-1';

            const primary = document.createElement('span');
            primary.className = meta.failed
                ? 'inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-100/85'
                : 'inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-white/55';
            primary.textContent = `${formatModelRole(meta.role)} · ${meta.stageLabel || '回复'}`;
            block.appendChild(primary);

            if (meta.model) {
                const model = document.createElement('span');
                model.className = 'text-xs text-white/35';
                model.textContent = meta.model;
                block.appendChild(model);
            }

            return block;
        },

        buildCitationBlock(sources = []) {
            if (!Array.isArray(sources) || !sources.length) return null;

            const container = document.createElement('div');
            container.className = 'space-y-2';

            const heading = document.createElement('div');
            heading.className = 'px-1 text-xs text-amber-100/70';
            heading.textContent = '知识库引用';
            container.appendChild(heading);

            sources.forEach((source, index) => {
                const card = document.createElement('div');
                card.className = 'rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] px-3 py-3';

                const top = document.createElement('div');
                top.className = 'flex items-start justify-between gap-3';

                const title = document.createElement('div');
                title.className = 'text-xs font-semibold text-amber-100/90';
                title.textContent = source.title || `引用 ${index + 1}`;

                const meta = document.createElement('div');
                meta.className = 'shrink-0 text-right text-xs text-white/45';
                meta.textContent = [formatPageLabel(source), formatScoreLabel(source.score)].filter(Boolean).join(' · ');

                top.appendChild(title);
                top.appendChild(meta);
                card.appendChild(top);

                const preview = document.createElement('div');
                preview.className = 'mt-2 text-xs leading-5 text-white/65';
                preview.textContent = source.textPreview || source.text_preview || '';
                card.appendChild(preview);

                container.appendChild(card);
            });

            return container;
        },

        addTyping() {
            this.removeTyping();
            const wrap = document.createElement('div');
            wrap.className = 'msg-row doctor';
            wrap.dataset.typing = 'true';
            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble doctor';
            bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            wrap.appendChild(bubble);
            this.els.chatBox.appendChild(wrap);
            this.scrollChatToBottom();
        },

        removeTyping() {
            const typing = this.els.chatBox.querySelector('[data-typing="true"]');
            if (typing) typing.remove();
        },

        updateStatus(text, type = 'idle') {
            const colors = {
                idle: 'bg-gray-500 shadow-none',
                assess: 'bg-amber-300 shadow-[0_0_8px_rgba(241,195,107,0.7)] animate-pulse',
                therapy: 'bg-emerald-300 shadow-[0_0_8px_rgba(94,224,183,0.7)]',
                warning: 'bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse'
            };
            if (this.els.statusLabel) this.els.statusLabel.textContent = text;
            if (this.els.statusDot) this.els.statusDot.className = `w-1.5 h-1.5 rounded-full mr-2 ${colors[type] || colors.idle}`;
        },

        lockChat(message = '咨询准备中，请稍候。') {
            if (!this.els.chatOverlay) return;
            this.els.chatOverlay.classList.remove('hidden');
            if (this.els.overlayText) this.els.overlayText.textContent = message;
            this.els.input.disabled = true;
            if (this.els.sendBtn) this.els.sendBtn.disabled = true;
        },

        unlockChat() {
            if (!this.els.chatOverlay) return;
            this.els.chatOverlay.classList.add('hidden');
            this.els.input.disabled = false;
            if (this.els.sendBtn) this.els.sendBtn.disabled = false;
            this.els.input.focus();
        },

        showReport(report, reportHistory) {
            this.setArchiveCollapsed(true);
            if (this.els.panelKeywords) this.els.panelKeywords.classList.add('hidden');
            this.els.sideIntakePanel?.classList.add('hidden');
            if (this.els.panelReport) this.els.panelReport.classList.remove('hidden');

            requestAnimationFrame(() => {
                this.els.panelReport.classList.remove('opacity-0');
                this.els.reportStage.textContent = report.stage || '状态追踪';
                this.els.reportUpdatedAt.textContent = formatDateTime(report.createdAt);
                if (this.els.reportModel) {
                    this.els.reportModel.textContent = report.meta?.model
                        ? `${formatModelRole(report.meta?.role)} · ${report.meta?.stageLabel || '评估'} · ${report.meta?.model}`
                        : '评估模型来源未记录';
                }

                this.els.riskBadge.className = `rounded-full px-3 py-1 text-xs ${riskClassMap[report.warningLevel] || riskClassMap.low}`;
                this.els.riskBadge.textContent = `风险 ${report.warningLevel || 'low'}`;

                if (Array.isArray(report.crisisSignals) && report.crisisSignals.length) {
                    this.els.riskAlert.classList.remove('hidden');
                    this.els.riskAlert.textContent = `需要额外留意：${report.crisisSignals.join('；')}`;
                } else {
                    this.els.riskAlert.classList.add('hidden');
                    this.els.riskAlert.textContent = '';
                }

                this.paintMetric('stress', report.stress);
                this.paintMetric('friction', report.friction);
                this.paintMetric('risk', report.risk);
                this.paintMetric('resilience', report.resilience);

                this.els.txtSummary.textContent = report.summary || '评估中...';
                this.els.txtCore.textContent = report.coreIssue || '评估中...';
                this.els.txtCognitive.textContent = report.cognitivePattern || '评估中...';
                this.els.txtSupportFocus.textContent = report.supportFocus || '评估中...';
                this.els.txtStyle.textContent = report.recommendedStyle || '评估中...';
                this.els.txtFollowUp.textContent = report.followUp || '评估中...';

                this.els.listNextSteps.innerHTML = '';
                (report.nextSteps || []).forEach((item) => {
                    const chip = document.createElement('div');
                    chip.className = 'focus-chip';
                    chip.textContent = item;
                    this.els.listNextSteps.appendChild(chip);
                });

                this.els.reportHistoryList.innerHTML = '';
                reportHistory.slice(-limits.visibleReportHistory).reverse().forEach((item, index) => {
                    const row = document.createElement('div');
                    row.className = 'track-row';
                    row.innerHTML = `
                        <div class="flex justify-between gap-3">
                            <div class="text-xs text-white/80">第 ${reportHistory.length - index} 次评估 · ${item.trend || '追踪中'}</div>
                            <div class="shrink-0 text-xs text-white/35">${formatDateTime(item.createdAt)}</div>
                        </div>
                        <div class="mt-1 text-xs text-white/45">${item.summary || item.coreIssue || ''}</div>
                    `;
                    this.els.reportHistoryList.appendChild(row);
                });
            });
        },

        hideReport() {
            if (this.els.panelReport) this.els.panelReport.classList.add('hidden', 'opacity-0');
            if (this.els.panelKeywords) this.els.panelKeywords.classList.remove('hidden');
            this.els.sideIntakePanel?.classList.remove('hidden');
            if (this.els.reportModel) this.els.reportModel.textContent = '评估模型来源未记录';
        },

        paintMetric(metricKey, value) {
            const score = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : 0;
            const bar = this.els[`bar${metricKey.charAt(0).toUpperCase()}${metricKey.slice(1)}`];
            const label = this.els[`score${metricKey.charAt(0).toUpperCase()}${metricKey.slice(1)}`];
            if (bar) {
                bar.style.width = `${score}%`;
                bar.className = `h-full progress-bar bg-gradient-to-r ${metricClassMap[metricKey] || metricClassMap.stress}`;
            }
            if (label) label.textContent = `${score}/100`;
        },

        renderArchives(archives, activeArchiveId) {
            if (!archives.length) {
                this.els.archiveList.innerHTML = '<div class="px-1 py-2 text-xs text-white/35">还没有存档。</div>';
                return;
            }

            this.els.archiveList.innerHTML = '';
            archives.forEach((archive) => {
                const item = document.createElement('div');
                item.className = `archive-card rounded-xl p-3 ${activeArchiveId === archive.id ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="truncate text-xs font-semibold text-white/85">${archive.title}</div>
                            <div class="mt-1 text-xs text-white/35">${archive.meta}</div>
                        </div>
                        <div class="shrink-0 text-xs text-white/30">${archive.phaseLabel}</div>
                    </div>
                    <div class="line-clamp-2 mt-2 text-xs text-white/40">${archive.keywords || ''}</div>
                    <div class="flex gap-2 mt-3">
                        <button data-action="load" data-id="${archive.id}" class="flex-1 rounded-lg border border-white/10 bg-white/[0.07] py-2 text-xs text-white/80 transition-colors hover:bg-white/[0.12]">继续</button>
                        <button data-action="delete" data-id="${archive.id}" class="rounded-lg border border-red-300/10 bg-red-500/12 px-3 py-2 text-xs text-red-200 transition-colors hover:bg-red-500/18">删除</button>
                    </div>
                `;
                this.els.archiveList.appendChild(item);
            });

            this.els.archiveList.querySelectorAll('button').forEach((button) => {
                button.onclick = () => {
                    const { action, id } = button.dataset;
                    if (action === 'load') this.handlers.onLoadArchive?.(id);
                    if (action === 'delete') this.handlers.onDeleteArchive?.(id);
                };
            });
        },

        setModeUI(mode) {
            document.querySelectorAll('.cfg-mode-btn').forEach((btn) => {
                const isActive = btn.dataset.mode === mode;
                btn.classList.toggle('mode-active', isActive);
                btn.style.background = isActive ? 'rgba(94,224,183,0.1)' : 'rgba(255,255,255,0.04)';
                btn.style.color = isActive ? 'var(--sage-strong)' : 'rgba(246,247,241,0.5)';
                btn.style.borderColor = isActive ? 'rgba(180,210,200,0.12)' : 'rgba(180,210,200,0.08)';
            });
            const keyGroup = document.getElementById('cfgApiKeyGroup');
            if (keyGroup) keyGroup.style.display = mode === 'direct' ? '' : 'none';
        },

        writeSettings(settings, useMode) {
            const mode = useMode || settings.useMode || 'proxy';
            const modeDisplay = document.getElementById('cfgModeDisplay');
            if (modeDisplay) {
                if (mode === 'proxy') {
                    modeDisplay.innerHTML = '<span style="color:var(--sage-strong);">免费试用</span>（通过代理转发，无需 API Key）';
                } else {
                    modeDisplay.innerHTML = '<span style="color:var(--amber);">自带 Key</span>（直接调用 DashScope API）';
                }
            }
            this.setModeUI(mode);
            this.refreshSettingsQuota();

            const s = (el, cb) => { if (el) cb(el); };
            s(this.els.cfgBase, el => el.value = settings.apiBase || '');
            s(this.els.cfgKey, el => el.value = settings.apiKey || '');
            s(this.els.cfgAssess, el => el.value = settings.assessModel || '');
            s(this.els.cfgTherapy, el => el.value = settings.therapyModel || '');
            s(this.els.cfgAssessThinking, el => el.checked = Boolean(settings.assessEnableThinking));
            s(this.els.cfgTherapyThinking, el => el.checked = Boolean(settings.therapyEnableThinking));
            s(this.els.cfgIntakeTurns, el => el.value = settings.intakeTurns || '');
            s(this.els.cfgReassessEvery, el => el.value = settings.reassessEvery || '');
            s(this.els.cfgRagEnabled, el => el.checked = Boolean(settings.ragEnabled));
            s(this.els.cfgKbId, el => el.value = settings.ragKnowledgeBaseId || '');
            s(this.els.cfgKbPath, el => el.value = settings.ragKnowledgeBasePath || '');
            s(this.els.cfgRagTopK, el => el.value = settings.ragTopK || '');
            s(this.els.cfgRagMinScore, el => el.value = settings.ragMinScore ?? '');
            this.writeSetupSettings(settings);
        },

        readMode() {
            const active = document.querySelector('.cfg-mode-btn.mode-active');
            return active ? active.dataset.mode || 'proxy' : 'proxy';
        },

        refreshSettingsQuota() {
            const quotaEl = document.getElementById('cfgQuotaDisplay');
            if (!quotaEl) return;
            quotaEl.textContent = '免费试用（通过代理转发）';
        },

        readSettings() {
            const g = (el, fallback) => el ? el.value : fallback;
            const gc = (el) => el ? el.checked : false;
            return {
                apiBase: g(this.els.cfgBase, '').trim(),
                apiKey: g(this.els.cfgKey, '').trim(),
                assessModel: g(this.els.cfgAssess, '').trim(),
                therapyModel: g(this.els.cfgTherapy, '').trim(),
                assessEnableThinking: gc(this.els.cfgAssessThinking),
                therapyEnableThinking: gc(this.els.cfgTherapyThinking),
                intakeTurns: Number(g(this.els.cfgIntakeTurns, '')),
                reassessEvery: Number(g(this.els.cfgReassessEvery, '')),
                ragEnabled: gc(this.els.cfgRagEnabled),
                ragKnowledgeBaseId: g(this.els.cfgKbId, '').trim(),
                ragKnowledgeBasePath: g(this.els.cfgKbPath, '').trim(),
                ragTopK: Number(g(this.els.cfgRagTopK, '')),
                ragMinScore: Number(g(this.els.cfgRagMinScore, ''))
            };
        },

        updateRagStatus(text, tone = 'muted') {
            const toneClass = {
                muted: 'text-white/35',
                ready: 'text-emerald-300/80',
                error: 'text-red-300/85'
            };
            if (this.els.cfgRagStatus) {
                this.els.cfgRagStatus.className = `text-xs ${toneClass[tone] || toneClass.muted}`;
                this.els.cfgRagStatus.textContent = text;
            }
            this.setSetupStatus(text, tone === 'ready' ? 'ready' : (tone === 'error' ? 'error' : 'muted'));
        },

        scrollChatToBottom() {
            this.els.chatBox.scrollTop = this.els.chatBox.scrollHeight;
        },

        initCanvasBg() {
            // background canvas removed — green theme only
        },

        // ── 侧边面板 ──
        togglePanel(force) {
            const panel = document.getElementById('sidePanel');
            if (!panel) return;
            if (typeof force === 'boolean') {
                panel.classList.toggle('open', force);
            } else {
                panel.classList.toggle('open');
            }
        },

        // ── 音效 ──
        playVoice() {
            const v = document.getElementById('voiceEn') || document.getElementById('voiceThink');
            if (v) { v.volume = 0.3; v.currentTime = 0; v.play().catch(() => {}); }
        },

        playRain() {
            const r = document.getElementById('bgRain');
            if (r && r.paused) { r.volume = 0.65; r.play().catch(() => {}); }
        },

        playMusic() {
            const m = document.getElementById('bgMusic');
            if (m && m.paused) { m.volume = 0.18; m.play().catch(() => {}); }
        },

        toggleMusic() {
            const m = document.getElementById('bgMusic');
            if (!m) return;
            if (m.paused) { m.volume = 0.18; m.play().catch(() => {}); return true; }
            else { m.pause(); return false; }
        },

        toggleRain() {
            const r = document.getElementById('bgRain');
            if (!r) return;
            if (r.paused) { r.volume = 0.65; r.play().catch(() => {}); return true; }
            else { r.pause(); return false; }
        },

        setMusicSrc(src) {
            const m = document.getElementById('bgMusic');
            if (!m) return;
            const wasPlaying = !m.paused;
            m.src = src;
            m.load();
            if (wasPlaying) m.play().catch(() => {});
        },

        setRainSrc(src) {
            const r = document.getElementById('bgRain');
            if (!r) return;
            const wasPlaying = !r.paused;
            r.src = src;
            r.load();
            if (wasPlaying) r.play().catch(() => {});
        },

        setBgImage(src) {
            const img = document.getElementById('bgImage');
            if (img) img.src = src;
        },

        setUserAvatar(src) {
            const img = document.getElementById('userAvatar');
            const wrap = document.getElementById('userAvatarWrap');
            if (img) {
                img.src = src || '';
                img.style.display = src ? '' : 'none';
            }
            if (wrap) wrap.style.display = src ? 'flex' : 'none';
        }
    };

    window.AppUI = UI;
})();
