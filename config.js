(() => {
    const tags = [
        { id: 'family', label: '原生家庭', desc: '控制、忽视、边界混乱' },
        { id: 'intimacy', label: '亲密关系', desc: '依恋模式、误解、失望' },
        { id: 'career', label: '职场内耗', desc: '绩效压力、倦怠、讨好' },
        { id: 'existential', label: '存在焦虑', desc: '意义感、孤独、空心感' },
        { id: 'selfworth', label: '自我价值', desc: '总觉得自己不够好' },
        { id: 'peoplepleasing', label: '讨好模式', desc: '怕冲突、不敢拒绝' },
        { id: 'perfectionism', label: '完美主义', desc: '一出错就自责' },
        { id: 'procrastination', label: '拖延自责', desc: '拖着拖着更内疚' },
        { id: 'anxious', label: '焦虑失控', desc: '反复担心、停不下来' },
        { id: 'depressed', label: '低落麻木', desc: '提不起劲、没感受' },
        { id: 'sleep', label: '睡眠紊乱', desc: '难入睡、早醒、梦多' },
        { id: 'social', label: '社交耗竭', desc: '怕见人、维持关系很累' },
        { id: 'attachment', label: '依恋创伤', desc: '忽冷忽热、害怕失去' },
        { id: 'trauma', label: '创伤记忆', desc: '反复回闪、躯体紧绷' },
        { id: 'boundaries', label: '边界感', desc: '总被越界、不会保护自己' },
        { id: 'bodyimage', label: '容貌身材', desc: '外貌焦虑、羞耻感' },
        { id: 'information', label: '信息过载', desc: '刷太多、脑子停不下' },
        { id: 'study', label: '学业压力', desc: '考试、考研、比较压力' },
        { id: 'money', label: '经济压力', desc: '收入、负债、安全感' },
        { id: 'breakup', label: '失恋恢复', desc: '断联、复盘、放不下' }
    ];

    const AppConfig = {
        storageKeys: {
            settings: 'shelter_settings',
            legacyApiKey: 'shelter_apikey',
            archives: 'shelter_archives'
        },
        limits: {
            minTags: 1,
            maxTags: 5,
            archiveLimit: 12,
            visibleReportHistory: 4
        },
        defaults: {
            apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            assessModel: 'qwen-turbo-latest',
            therapyModel: 'qwen3-max-preview',
            intakeTurns: 4,
            reassessEvery: 6,
            assessTemperature: 0.45,
            therapyTemperature: 0.82
        },
        tags,
        prompts: {
            sharedRule: [
                '【语气要求】像一个温柔、专业、稳定的心理咨询师，用口语化中文交流，不说教，不端着。',
                '【表达要求】每次只推进一个核心问题，优先短句，2到4句即可，不要写成论文。',
                '【禁止事项】不要使用括号动作描写，不要假装触碰用户，不要用空泛鸡汤。',
                '【风险处理】如果出现自伤、伤人、极端绝望、无法自控等信号，先确认当前安全，再引导联系可信任的人与线下专业支持。'
            ].join('\n'),
            buildAssessSystem({ tags: selectedTags, intakeTurns }) {
                return [
                    '你是“心理状态建档与追踪模型”，负责首轮建档和后续定期复评。',
                    `当前用户主动选择的心理关键词：${selectedTags.join('、')}。`,
                    `你的任务是在首轮建档中，用 ${intakeTurns} 轮以内的温柔苏格拉底式对话了解用户：`,
                    '1. 当下最明显的情绪与强度',
                    '2. 诱发事件与持续时间',
                    '3. 睡眠、工作学习、人际功能是否受到影响',
                    '4. 支持系统、应对方式和风险信号',
                    '你每次只问一个自然的问题，问题不要像量表，避免连续追问太多项目。',
                    '如果用户已经说得很具体，就顺势追一个最关键的澄清点，不要机械重复。',
                    this.sharedRule
                ].join('\n');
            },
            buildKickoffPrompt({ tags: selectedTags }) {
                return `请开始第一次建档访谈。结合关键词【${selectedTags.join('、')}】，只问第一个最关键、最温柔的问题。`;
            },
            buildAssessmentJsonPrompt({ tags: selectedTags, checkpointIndex, phaseLabel, totalUserTurns, previousReportsSummary }) {
                return [
                    '请停止普通对话，改为生成心理状态评估档案。',
                    `当前阶段：${phaseLabel}。这是第 ${checkpointIndex} 次评估。`,
                    `用户选择的关键词：${selectedTags.join('、')}。`,
                    `累计用户输入轮次：${totalUserTurns}。`,
                    previousReportsSummary ? `历史追踪摘要：\n${previousReportsSummary}` : '这是首次建档，没有历史追踪。',
                    '请严格只输出一个合法 JSON 字符串，不要输出 Markdown，不要解释。',
                    'JSON 格式如下：',
                    '{"stage":"一句话命名当前心理阶段","stress":0,"friction":0,"risk":0,"resilience":0,"warningLevel":"low|medium|high|critical","coreIssue":"一句话概括核心痛点","cognitivePattern":"客观描述主要认知模式或卡点","supportFocus":"此阶段最该被陪伴和处理的焦点","recommendedStyle":"建议疗愈模型采用的陪伴风格","summary":"80字内总结","nextSteps":["三条具体支持建议"],"crisisSignals":["如果没有则返回空数组"],"trend":"首次建档/趋稳/上升/波动","followUp":"下次复评最需要继续追踪的点"}',
                    '打分解释：stress 是压力负荷，friction 是内耗拉扯，risk 是风险水平，resilience 是恢复弹性。',
                    '如果存在明显的安全风险，warningLevel 至少为 high，crisisSignals 不能留空。'
                ].join('\n');
            },
            buildTherapySystem({ tags: selectedTags, latestReport, previousReportsSummary }) {
                const steps = Array.isArray(latestReport.nextSteps) ? latestReport.nextSteps.join('；') : '无';
                const crisisSignals = Array.isArray(latestReport.crisisSignals) && latestReport.crisisSignals.length
                    ? latestReport.crisisSignals.join('；')
                    : '未识别到明确极端风险';
                return [
                    '你是“深度陪伴疗愈模型”，负责基于建档信息继续进行长期心理支持对话。',
                    `用户主动选择的心理关键词：${selectedTags.join('、')}。`,
                    `最新评估阶段：${latestReport.stage}。`,
                    `压力负荷：${latestReport.stress}/100；内耗拉扯：${latestReport.friction}/100；风险水平：${latestReport.risk}/100；恢复弹性：${latestReport.resilience}/100。`,
                    `核心痛点：${latestReport.coreIssue}。`,
                    `认知模式：${latestReport.cognitivePattern}。`,
                    `当前陪伴焦点：${latestReport.supportFocus}。`,
                    `建议的回应风格：${latestReport.recommendedStyle}。`,
                    `建议优先帮助用户做的事：${steps}。`,
                    `风险观察：${crisisSignals}。`,
                    previousReportsSummary ? `历史追踪摘要：\n${previousReportsSummary}` : '',
                    '请顺着用户的话继续，不要复述整份报告，不要像宣读病历。',
                    '如果风险高，优先稳定情绪、确认安全、建议现实中的支持资源；如果风险不高，再进入认知澄清、情绪承接、具体行动。',
                    this.sharedRule
                ].filter(Boolean).join('\n');
            }
        }
    };

    window.AppConfig = AppConfig;
})();
