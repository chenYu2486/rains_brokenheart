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
        stress: 'from-amber-500 to-red-500',
        friction: 'from-indigo-500 to-violet-500',
        risk: 'from-orange-500 to-rose-500',
        resilience: 'from-emerald-500 to-teal-400'
    };

    const UI = {
        els: {},
        handlers: {},

        init() {
            this.cacheEls();
            this.initCanvasBg();
            if (this.els.btnToggleArchive && !this.els.btnToggleArchive.dataset.bound) {
                this.els.btnToggleArchive.addEventListener('click', () => this.toggleArchiveCollapsed());
                this.els.btnToggleArchive.dataset.bound = '1';
            }
            this.setArchiveCollapsed(this.readArchiveCollapsed(), { persist: false });
        },

        cacheEls() {
            this.els = {
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
                btnStartAssess: document.getElementById('btnStartAssess'),
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
            this.els.btnOpenSettings.onclick = handlers.onOpenSettings;
            this.els.btnCloseSettings.onclick = handlers.onCloseSettings;
            this.els.btnSaveSettings.onclick = handlers.onSaveSettings;
            this.els.btnStartAssess.onclick = handlers.onStartAssessment;
            this.els.sendBtn.onclick = handlers.onSend;
            this.els.input.onkeypress = (event) => {
                if (event.key === 'Enter') handlers.onSend();
            };
            this.els.btnSaveArchive.onclick = handlers.onSaveArchive;
            this.els.btnNewChat.onclick = handlers.onNewChat;
        },

        toggleModal(id, force) {
            const modal = document.getElementById(id);
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

        renderTags(selectedTagIds, phase) {
            const locked = phase !== 'idle';
            this.els.tagContainer.innerHTML = '';

            tags.forEach((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = [
                    'tag-btn text-left rounded-xl p-3',
                    selected ? 'tag-active' : '',
                    locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                ].join(' ').trim();
                button.innerHTML = `
                    <div class="text-sm font-bold text-white/90">${tag.label}</div>
                    <div class="text-[10px] text-white/40 mt-1">${tag.desc}</div>
                `;
                if (!locked) {
                    button.onclick = () => this.handlers.onToggleTag?.(tag.id);
                }
                this.els.tagContainer.appendChild(button);
            });

            this.updateSelectionSummary(selectedTagIds);
            this.setStartButtonState(selectedTagIds.length, phase);
        },

        updateSelectionSummary(selectedTagIds) {
            const selectedLabels = tags
                .filter((tag) => selectedTagIds.includes(tag.id))
                .map((tag) => tag.label);

            this.els.tagCounter.textContent = `已选 ${selectedTagIds.length}/${limits.maxTags}`;
            this.els.tagPreview.textContent = selectedLabels.length
                ? `当前定制方向：${selectedLabels.join(' / ')}`
                : '建议至少选择 3 个关键词，让建档评估更贴近你的真实处境。';
        },

        setStartButtonState(selectedCount, phase) {
            const idle = phase === 'idle';
            const enabled = idle && selectedCount >= limits.minTags;
            this.els.btnStartAssess.disabled = !enabled;
            this.els.btnStartAssess.className = enabled
                ? 'w-full bg-amber-500 text-slate-900 py-3 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] shadow-lg shadow-amber-500/20 mt-auto'
                : 'w-full bg-white/5 border border-white/10 text-white/30 py-3 rounded-xl text-xs font-bold transition-all cursor-not-allowed mt-auto';

            if (!idle) {
                this.els.btnStartAssess.textContent = phase === 'intake' ? '建档评估进行中' : '已进入持续陪伴';
                return;
            }

            this.els.btnStartAssess.textContent = selectedCount >= limits.minTags
                ? `开始初评建档 (${selectedCount}/${limits.maxTags})`
                : '请选择 1 到 5 个关键词';
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
            wrap.className = `flex ${isSystem ? 'justify-center' : (normalizedRole === 'user' ? 'justify-end' : 'justify-start')} msg-anim`;

            if (isSystem) {
                const line = document.createElement('div');
                line.className = 'text-[10px] text-white/30 tracking-widest uppercase my-4';
                line.textContent = `--- ${text} ---`;
                wrap.appendChild(line);
            } else {
                const column = document.createElement('div');
                column.className = 'max-w-[88%] space-y-3';

                const bubble = document.createElement('div');
                bubble.className = [
                    'p-4 rounded-2xl text-[13px] leading-relaxed shadow-xl whitespace-pre-wrap',
                    normalizedRole === 'user'
                        ? 'bg-white/10 border border-white/20 text-white rounded-tr-none'
                        : 'bg-black/40 border border-amber-500/20 text-white/90 rounded-tl-none'
                ].join(' ');
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
            wrap.className = 'flex justify-start msg-anim';

            const column = document.createElement('div');
            column.className = 'max-w-[88%] space-y-3';

            const bubble = document.createElement('div');
            bubble.className = 'p-4 rounded-2xl rounded-tl-none text-[13px] leading-relaxed shadow-xl whitespace-pre-wrap bg-black/40 border border-amber-500/20 text-white/90';
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
                ? 'inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] tracking-[0.18em] uppercase text-red-100/85'
                : 'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] tracking-[0.18em] uppercase text-white/55';
            primary.textContent = `${formatModelRole(meta.role)} · ${meta.stageLabel || '回复'}`;
            block.appendChild(primary);

            if (meta.model) {
                const model = document.createElement('span');
                model.className = 'text-[10px] text-white/35';
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
            heading.className = 'px-1 text-[10px] tracking-[0.25em] uppercase text-amber-200/70';
            heading.textContent = '知识库引用';
            container.appendChild(heading);

            sources.forEach((source, index) => {
                const card = document.createElement('div');
                card.className = 'rounded-2xl border border-amber-500/15 bg-amber-500/5 px-3 py-3';

                const top = document.createElement('div');
                top.className = 'flex items-start justify-between gap-3';

                const title = document.createElement('div');
                title.className = 'text-[11px] font-bold text-amber-100/90';
                title.textContent = source.title || `引用 ${index + 1}`;

                const meta = document.createElement('div');
                meta.className = 'text-[10px] text-white/45 text-right shrink-0';
                meta.textContent = [formatPageLabel(source), formatScoreLabel(source.score)].filter(Boolean).join(' · ');

                top.appendChild(title);
                top.appendChild(meta);
                card.appendChild(top);

                const preview = document.createElement('div');
                preview.className = 'mt-2 text-[11px] leading-5 text-white/65';
                preview.textContent = source.textPreview || source.text_preview || '';
                card.appendChild(preview);

                container.appendChild(card);
            });

            return container;
        },

        addTyping() {
            this.removeTyping();
            const wrap = document.createElement('div');
            wrap.className = 'flex justify-start msg-anim';
            wrap.dataset.typing = 'true';
            wrap.innerHTML = `
                <div class="p-4 rounded-2xl rounded-tl-none bg-black/40 border border-white/5">
                    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
                </div>
            `;
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
                assess: 'bg-amber-500 shadow-[0_0_8px_#F59E0B] animate-pulse',
                therapy: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
                warning: 'bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse'
            };
            this.els.statusLabel.textContent = text;
            this.els.statusDot.className = `w-1.5 h-1.5 rounded-full mr-2 ${colors[type] || colors.idle}`;
        },

        lockChat(message = '请先在左侧选择你想聚焦的心理关键词') {
            this.els.chatOverlay.classList.remove('hidden');
            this.els.chatOverlay.style.opacity = '1';
            this.els.overlayText.textContent = message;
            this.els.input.disabled = true;
            this.els.sendBtn.disabled = true;
        },

        unlockChat() {
            this.els.chatOverlay.style.opacity = '0';
            setTimeout(() => this.els.chatOverlay.classList.add('hidden'), 250);
            this.els.input.disabled = false;
            this.els.sendBtn.disabled = false;
            this.els.input.focus();
        },

        showReport(report, reportHistory) {
            this.setArchiveCollapsed(true);
            this.els.panelKeywords.classList.add('hidden');
            this.els.panelReport.classList.remove('hidden');

            requestAnimationFrame(() => {
                this.els.panelReport.classList.remove('opacity-0');
                this.els.reportStage.textContent = report.stage || '状态追踪';
                this.els.reportUpdatedAt.textContent = formatDateTime(report.createdAt);
                if (this.els.reportModel) {
                    this.els.reportModel.textContent = report.meta?.model
                        ? `${formatModelRole(report.meta?.role)} · ${report.meta?.stageLabel || '评估'} · ${report.meta?.model}`
                        : '评估模型来源未记录';
                }

                this.els.riskBadge.className = `px-3 py-1 rounded-full text-[10px] tracking-widest uppercase ${riskClassMap[report.warningLevel] || riskClassMap.low}`;
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
                            <div class="text-white/80 text-[11px]">第 ${reportHistory.length - index} 次评估 · ${item.trend || '追踪中'}</div>
                            <div class="text-white/35 text-[10px]">${formatDateTime(item.createdAt)}</div>
                        </div>
                        <div class="text-[10px] text-white/45 mt-1">${item.summary || item.coreIssue || ''}</div>
                    `;
                    this.els.reportHistoryList.appendChild(row);
                });
            });
        },

        hideReport() {
            this.els.panelReport.classList.add('hidden', 'opacity-0');
            this.els.panelKeywords.classList.remove('hidden');
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
                this.els.archiveList.innerHTML = '<div class="text-[11px] text-white/35 px-1 py-2">还没有存档。</div>';
                return;
            }

            this.els.archiveList.innerHTML = '';
            archives.forEach((archive) => {
                const item = document.createElement('div');
                item.className = `archive-card rounded-xl p-3 ${activeArchiveId === archive.id ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="text-[12px] font-bold text-white/85 truncate">${archive.title}</div>
                            <div class="text-[10px] text-white/35 mt-1">${archive.meta}</div>
                        </div>
                        <div class="text-[10px] text-white/30 shrink-0">${archive.phaseLabel}</div>
                    </div>
                    <div class="text-[10px] text-white/40 mt-2 line-clamp-2">${archive.keywords || ''}</div>
                    <div class="flex gap-2 mt-3">
                        <button data-action="load" data-id="${archive.id}" class="flex-1 bg-white/8 hover:bg-white/12 text-white/80 text-[11px] py-2 rounded-lg transition-colors">继续</button>
                        <button data-action="delete" data-id="${archive.id}" class="px-3 bg-red-500/12 hover:bg-red-500/18 text-red-200 text-[11px] py-2 rounded-lg transition-colors">删除</button>
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

        writeSettings(settings) {
            this.els.cfgBase.value = settings.apiBase || '';
            this.els.cfgKey.value = settings.apiKey || '';
            this.els.cfgAssess.value = settings.assessModel || '';
            this.els.cfgTherapy.value = settings.therapyModel || '';
            this.els.cfgAssessThinking.checked = Boolean(settings.assessEnableThinking);
            this.els.cfgTherapyThinking.checked = Boolean(settings.therapyEnableThinking);
            this.els.cfgIntakeTurns.value = settings.intakeTurns || '';
            this.els.cfgReassessEvery.value = settings.reassessEvery || '';
            this.els.cfgRagEnabled.checked = Boolean(settings.ragEnabled);
            this.els.cfgKbId.value = settings.ragKnowledgeBaseId || '';
            this.els.cfgKbPath.value = settings.ragKnowledgeBasePath || '';
            this.els.cfgRagTopK.value = settings.ragTopK || '';
            this.els.cfgRagMinScore.value = settings.ragMinScore ?? '';
        },

        readSettings() {
            return {
                apiBase: this.els.cfgBase.value.trim(),
                apiKey: this.els.cfgKey.value.trim(),
                assessModel: this.els.cfgAssess.value.trim(),
                therapyModel: this.els.cfgTherapy.value.trim(),
                assessEnableThinking: this.els.cfgAssessThinking.checked,
                therapyEnableThinking: this.els.cfgTherapyThinking.checked,
                intakeTurns: Number(this.els.cfgIntakeTurns.value),
                reassessEvery: Number(this.els.cfgReassessEvery.value),
                ragEnabled: this.els.cfgRagEnabled.checked,
                ragKnowledgeBaseId: this.els.cfgKbId.value.trim(),
                ragKnowledgeBasePath: this.els.cfgKbPath.value.trim(),
                ragTopK: Number(this.els.cfgRagTopK.value),
                ragMinScore: Number(this.els.cfgRagMinScore.value)
            };
        },

        updateRagStatus(text, tone = 'muted') {
            if (!this.els.cfgRagStatus) return;
            const toneClass = {
                muted: 'text-white/35',
                ready: 'text-emerald-300/80',
                error: 'text-red-300/85'
            };
            this.els.cfgRagStatus.className = `text-[10px] mt-2 ${toneClass[tone] || toneClass.muted}`;
            this.els.cfgRagStatus.textContent = text;
        },

        scrollChatToBottom() {
            this.els.chatBox.scrollTop = this.els.chatBox.scrollHeight;
        },

        initCanvasBg() {
            const canvas = document.getElementById('canvasBg');
            const ctx = canvas.getContext('2d');
            let width = 0;
            let height = 0;
            let drops = [];
            let skyline = [];

            const buildSkyline = () => {
                width = canvas.width = window.innerWidth;
                height = canvas.height = window.innerHeight;
                skyline = [];
                let x = 0;

                while (x < width) {
                    const buildingWidth = 36 + Math.random() * 86;
                    const buildingHeight = height * 0.12 + Math.random() * height * 0.28;
                    const windows = [];
                    const cols = Math.max(2, Math.floor(buildingWidth / 14));
                    const rows = Math.max(3, Math.floor((buildingHeight - 26) / 16));

                    for (let row = 0; row < rows; row += 1) {
                        for (let col = 0; col < cols; col += 1) {
                            if (Math.random() > 0.46) {
                                windows.push({
                                    x: 8 + col * 12 + Math.random() * 1.5,
                                    y: 12 + row * 14 + Math.random() * 2,
                                    w: 3 + Math.random() * 2,
                                    h: 4 + Math.random() * 4,
                                    alpha: 0.18 + Math.random() * 0.35
                                });
                            }
                        }
                    }

                    skyline.push({
                        x,
                        w: buildingWidth,
                        h: buildingHeight,
                        glow: Math.random() * 0.2 + 0.08,
                        windows
                    });
                    x += buildingWidth - 4;
                }

                drops = Array.from({ length: 150 }, () => ({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    length: Math.random() * 25 + 10,
                    speed: Math.random() * 15 + 10,
                    alpha: Math.random() * 0.4 + 0.1
                }));
            };

            const draw = () => {
                const sky = ctx.createLinearGradient(0, 0, 0, height);
                sky.addColorStop(0, '#060912');
                sky.addColorStop(0.65, '#09111d');
                sky.addColorStop(1, '#0a0f17');
                ctx.fillStyle = sky;
                ctx.fillRect(0, 0, width, height);

                const haze = ctx.createRadialGradient(width * 0.78, height * 0.72, 10, width * 0.78, height * 0.72, width * 0.36);
                haze.addColorStop(0, 'rgba(245, 158, 11, 0.16)');
                haze.addColorStop(1, 'rgba(245, 158, 11, 0)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, 0, width, height);

                ctx.fillStyle = 'rgba(8, 12, 20, 0.28)';
                ctx.fillRect(0, 0, width, height);

                skyline.forEach((building) => {
                    const top = height - building.h;
                    const gradient = ctx.createLinearGradient(0, top, 0, height);
                    gradient.addColorStop(0, 'rgba(16, 24, 40, 0.92)');
                    gradient.addColorStop(1, 'rgba(7, 10, 18, 0.98)');
                    ctx.fillStyle = gradient;
                    ctx.fillRect(building.x, top, building.w, building.h);

                    building.windows.forEach((light) => {
                        const pulse = light.alpha + Math.sin((Date.now() / 900) + light.x) * 0.04;
                        ctx.fillStyle = `rgba(255, 213, 128, ${Math.max(0.12, pulse)})`;
                        ctx.fillRect(building.x + light.x, top + light.y, light.w, light.h);
                        ctx.fillStyle = `rgba(245, 158, 11, ${building.glow})`;
                        ctx.fillRect(building.x + light.x - 1, top + light.y - 1, light.w + 2, light.h + 2);
                    });
                });

                const groundGlow = ctx.createLinearGradient(0, height * 0.72, 0, height);
                groundGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
                groundGlow.addColorStop(1, 'rgba(245, 158, 11, 0.08)');
                ctx.fillStyle = groundGlow;
                ctx.fillRect(0, height * 0.72, width, height * 0.28);

                drops.forEach((drop) => {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(255, 255, 255, ${drop.alpha})`;
                    ctx.lineWidth = 1.4;
                    ctx.moveTo(drop.x, drop.y);
                    ctx.lineTo(drop.x - drop.speed / 3, drop.y + drop.length);
                    ctx.stroke();

                    drop.y += drop.speed;
                    drop.x -= drop.speed / 3;
                    if (drop.y > height) {
                        drop.y = -drop.length;
                        drop.x = Math.random() * width + width * 0.2;
                    }
                });

                requestAnimationFrame(draw);
            };

            buildSkyline();
            window.addEventListener('resize', buildSkyline);
            draw();
        }
    };

    window.AppUI = UI;
})();
