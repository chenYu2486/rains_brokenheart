# -*- coding: utf-8 -*-
from pathlib import Path

from docx import Document


BASE = Path(r"D:\rains_brokenheart-main\rains_brokenheart-main\Graduation Thesis")
DOCX = max(
    [p for p in BASE.glob("*.docx") if "backup" not in p.name.lower() and not p.name.startswith("~$")],
    key=lambda p: p.stat().st_mtime,
)


def replace_startswith(doc, prefix, text):
    for paragraph in doc.paragraphs:
        if paragraph.text.strip().startswith(prefix):
            paragraph.text = text
            return True
    raise ValueError(f"paragraph not found: {prefix}")


def main():
    doc = Document(DOCX)

    replace_startswith(
        doc,
        "结合开题报告及项目 PPT 可知",
        "结合开题报告与项目阶段汇报可知，本系统的设计目标是构建具备要素化信息采集和检索增强能力的心理对话原型，主要服务对象为在生活中遭遇情绪困扰、学业压力、亲密关系困惑、工作焦虑和睡眠问题的人群。系统需要提供温和、低门槛的交互入口，并在涉及专业知识表达和危险信号识别时保持审慎。系统核心需求及对应实现方式如表3-1所示。",
    )
    replace_startswith(
        doc,
        "系统整体架构为一个运行在浏览器上的单页应用",
        "系统整体架构如图3-1所示。系统被设计为运行在浏览器端的单页应用，前端负责页面渲染、用户输入采集、状态维护、本地知识库检索和API调用；外部大语言模型服务提供兼容Chat Completions格式的对话接口；本地知识库以JSON或JavaScript文件形式加载到项目中。该架构的重点并非在界面中简单配置两个模型，而是根据对话阶段将评估任务与陪伴任务分配给不同模型。",
    )
    replace_startswith(
        doc,
        "系统显式状态机由idle、intake和therapy三个阶段构成",
        "系统显式状态机由idle、intake和therapy三个阶段构成，其切换关系如图3-2所示。用户选择1至5个心理关键词后进入intake阶段，系统调用评估模型发起建档访谈；达到设定轮次后，评估模型生成结构化画像，系统切换至therapy阶段；随后每经过若干轮用户输入，系统自动触发复评，更新画像并重建陪伴模型的系统提示词。",
    )
    replace_startswith(
        doc,
        "在数据持久化方面，系统采用localStorage与Supabase云存储相结合的双写策略",
        "在数据持久化方面，系统采用localStorage与Supabase云存储相结合的双写策略。storage.js封装数据访问层，提供loadConversations、saveMessages、saveReport、loadMemories、saveSettings和saveProfile等接口。在Supabase可用时，系统优先通过REST API同步至云端；网络不可用时则降级至localStorage，以保证核心对话功能不受后端服务状态影响。项目主要源码文件及职责如表3-2所示。",
    )
    replace_startswith(
        doc,
        "界面将压力负荷、内耗拉扯、风险程度和恢复弹性以进度条方式呈现",
        "界面将压力负荷、内耗拉扯、风险程度和恢复弹性以进度条方式呈现，并展示关键痛点、认知图式、陪伴关注点、建议方式和下一步动作。该可视化结果不用于疾病诊断，而是帮助用户与系统共同把握当前对话阶段；对于后续陪伴模型，画像也会作为动态提示词的一部分，使回答更贴近用户当下状态。画像核心字段如表4-1所示。",
    )
    replace_startswith(
        doc,
        "项目包含一份DSM-5-TR相关本地知识库",
        "项目包含一份DSM-5-TR相关本地知识库，document元数据记录显示该知识库共38页、61个chunk，解析方式为PyMuPDF与RapidOCR结合，chunk_size为900，chunk_overlap为120。每个chunk保留source_path、source_sha256、page_start、page_end、chunk_id、text_sha256和citations等字段，从而支持来源追踪。RAG处理与调用流程如图4-1所示。",
    )
    replace_startswith(
        doc,
        "为了说明系统页面和交互流程",
        "为了说明系统页面和交互流程，本文选用模拟对话生成的运行截图，不包含真实用户隐私信息。其中，图4-2展示关键词入口，图4-3展示建档访谈与知识库引用回显，图4-4展示动态画像和持续陪伴界面，图4-5展示双模型与本地RAG配置中心。上述截图可与本章前述模块设计相互印证。",
    )
    replace_startswith(
        doc,
        "所有训练数据采用统一的JSONL格式",
        "所有训练数据采用统一JSONL格式，每条样本包含1条system消息和交替出现的user、assistant多轮对话。system消息编码来访者画像和咨询师角色设定，user消息为来访者话语，assistant消息为咨询师回应。每条样本约9至12条消息（4至6轮对话），兼顾上下文长度和样本多样性。经清洗去重后，最终用于实验的稳定训练集约18,000条对话样本，并按照8:1:1比例划分为训练集、验证集和测试集。指令微调数据类型设计如表5-1所示。",
    )
    replace_startswith(
        doc,
        "实验结果表明，LoRA rank和学习率是影响微调效果的关键超参数",
        "实验结果表明，LoRA rank和学习率是影响微调效果的关键超参数。过高的rank（64）和过大的学习率（3e-4）会导致模型快速过拟合，而过低的训练步数则无法充分发挥微调潜力。在20,000条数据规模下，rank=16配合cosine学习率衰减策略是最优配置。训练完成后将LoRA权重合并至基座模型并部署至DashScope平台，模型ID为qwen3-8b-9c3af956383a，前端仅需在配置文件中修改模型ID即可切换，无需调整任何业务逻辑代码。LoRA关键超参数配置如表5-2所示。",
    )

    doc.save(DOCX)
    print(DOCX)


if __name__ == "__main__":
    main()
