"""
心理咨询对话数据集生成器
生成格式: JSONL, 每条为 {"messages": [system, user, assistant, user, assistant, ...]}
使用 DashScope API (qwen3-8b) 批量生成多样化心理咨询对话
"""

import json
import random
import time
import hashlib
from http.client import HTTPSConnection
import ssl

API_KEY = "sk-76456a9801c14ee9901727f080c635f9"
HOST = "dashscope.aliyuncs.com"

TOPICS = [
    {"id": "family", "label": "原生家庭", "desc": "控制、忽视、边界混乱"},
    {"id": "intimacy", "label": "亲密关系", "desc": "依恋模式、误解、失望"},
    {"id": "career", "label": "职场内耗", "desc": "绩效压力、倦怠、讨好"},
    {"id": "existential", "label": "存在焦虑", "desc": "意义感、孤独、空心感"},
    {"id": "selfworth", "label": "自我价值", "desc": "总觉得自己不够好"},
    {"id": "peoplepleasing", "label": "讨好模式", "desc": "怕冲突、不敢拒绝"},
    {"id": "perfectionism", "label": "完美主义", "desc": "一出错就自责"},
    {"id": "procrastination", "label": "拖延自责", "desc": "拖着拖着更内疚"},
    {"id": "anxious", "label": "焦虑失控", "desc": "反复担心、停不下来"},
    {"id": "depressed", "label": "低落麻木", "desc": "提不起劲、没感受"},
    {"id": "sleep", "label": "睡眠紊乱", "desc": "难入睡、早醒、梦多"},
    {"id": "social", "label": "社交耗竭", "desc": "怕见人、维持关系很累"},
    {"id": "attachment", "label": "依恋创伤", "desc": "忽冷忽热、害怕失去"},
    {"id": "trauma", "label": "创伤记忆", "desc": "反复回闪、躯体紧绷"},
    {"id": "boundaries", "label": "边界感", "desc": "总被越界、不会保护自己"},
    {"id": "bodyimage", "label": "容貌身材", "desc": "外貌焦虑、羞耻感"},
    {"id": "infooverload", "label": "信息过载", "desc": "刷太多、脑子停不下"},
    {"id": "study", "label": "学业压力", "desc": "考试、考研、比较压力"},
    {"id": "money", "label": "经济压力", "desc": "收入、负债、安全感"},
    {"id": "breakup", "label": "失恋恢复", "desc": "断联、复盘、放不下"}
]

# 多样化人物设定池
AGES = ["18岁", "20岁", "22岁", "25岁", "28岁", "30岁", "32岁", "35岁", "38岁", "40岁", "45岁", "50岁"]
GENDERS = ["男", "女"]
JOBS = [
    "大学生", "研究生", "程序员", "设计师", "教师", "医生", "护士",
    "销售", "市场运营", "产品经理", "公务员", "自由职业者", "全职妈妈/爸爸",
    "快递员", "外卖员", "服务员", "会计", "律师", "HR", "创业者",
    "编辑", "主播", "应届生待业", "退休人员", "留学生", "蓝领工人"
]
PERSONALITIES = [
    "性格内向，不善表达", "平时很开朗但独处时容易低落",
    "典型的讨好型人格", "完美主义倾向严重",
    "理性派，习惯压抑情绪", "高敏感型，容易想多",
    "外表坚强内心脆弱", "性格温和但容易委屈自己",
    "自尊心强但自信心低", "习惯性自我否定",
    "典型的焦虑型依恋", "回避型依恋风格"
]
EMOTIONS = [
    "语气低落，带着疲惫", "声音有些颤抖", "平静中透着一丝无奈",
    "有点激动，语速快", "沉默了一会儿才开口", "苦笑着",
    "声音很小，不太自信", "带着一丝哭腔", "深呼吸了一下",
    "自嘲地笑了笑", "语气平淡但能感到压抑", "说到一半停了下来"
]

# 对话场景种子，保证多样性
def make_user_backstory(topic, idx):
    """为每条数据生成独特的用户背景"""
    age = random.choice(AGES)
    gender = random.choice(GENDERS)
    job = random.choice(JOBS)
    personality = random.choice(PERSONALITIES)
    emotion = random.choice(EMOTIONS)

    # 根据索引产生变化
    variant = idx % 12
    extra = ""
    if variant == 0:
        extra = "最近刚经历了一件让他/她触动很大的事"
    elif variant == 1:
        extra = "这个问题已经困扰他/她好几年了"
    elif variant == 2:
        extra = "之前没跟任何人说过，第一次开口"
    elif variant == 3:
        extra = "身边朋友都觉得他/她过得挺好的"
    elif variant == 4:
        extra = "尝试过自己调整，但效果不好"
    elif variant == 5:
        extra = "最近严重影响到日常生活了"
    elif variant == 6:
        extra = "家人/伴侣并不理解他/她的感受"
    elif variant == 7:
        extra = "刚在网上查了资料，更焦虑了"
    elif variant == 8:
        extra = "其实知道问题在哪，就是改不了"
    elif variant == 9:
        extra = "怕被别人知道自己有这种困扰"
    elif variant == 10:
        extra = "最近睡眠和食欲都受到了影响"
    elif variant == 11:
        extra = "希望能找到一个解决办法"

    return {
        "age": age,
        "gender": gender,
        "job": job,
        "personality": personality,
        "emotion": emotion,
        "extra": extra,
        "topic": topic["label"],
        "topic_desc": topic["desc"]
    }


def build_generate_prompt(bg, topic):
    """构造生成对话的系统提示"""
    return f"""你是一位专业的心理咨询对话数据生成器。请生成一段完整的心理咨询对话。

【用户画像】
- 年龄：{bg['age']}
- 性别：{bg['gender']}
- 职业：{bg['job']}
- 性格：{bg['personality']}
- 当前情绪状态：{bg['emotion']}
- 背景：{bg['extra']}

【对话主题】
主题：{topic['label']}（{topic['desc']}）
这位用户正在经历与{topic['label']}相关的心理困扰，来找心理咨询师倾诉。

【格式要求】
生成一段3-8轮的心理咨询对话（每轮包括1句用户话+1句咨询师回应）。
用户用"来访者："开头，咨询师用"咨询师："开头。

【质量要求】
1. 来访者的话语要真实、口语化、像真人倾诉
2. 咨询师的话语要专业、共情、温和、不评判
3. 包含真实的情绪波动——可以有停顿、沉默、自嘲、甚至玩笑
4. 话题可以涉及非常私密的经历和感受
5. 不要机械地一问一答，要像真实的对话
6. 不同人物的身份、语气要差异化明显
7. 如果合适，可以包含适当的幽默和轻松的片段
8. 来访者和咨询师的角色扮演要具有非常高的质量，语气真实，情绪饱满，对话自然

只输出对话内容，不要额外说明。"""


def parse_conversation(text, bg, topic):
    """从生成文本中解析出对话轮次"""
    lines = text.strip().split("\n")
    messages = []

    system_prompt = f"""你是一位温柔、专业、稳定的心理咨询师林知微。你正在和一位来访者进行心理咨询对话。
来访者信息：{bg['age']}、{bg['gender']}、{bg['job']}。
主要困扰：{topic['label']}（{bg['topic_desc']}）。
{bg['personality']}。{bg['extra']}。

作为咨询师，你要：
1. 语气温和、共情、不评判
2. 每次只推进一个核心问题
3. 用口语化的中文交流
4. 先承接情绪，再温和探索
5. 绝对不说教、不鸡汤、不敷衍"""

    messages.append({"role": "system", "content": system_prompt})

    for line in lines:
        line = line.strip()
        if line.startswith("来访者：") or line.startswith("来访者:"):
            content = line.split("：", 1)[-1] if "：" in line else line.split(":", 1)[-1]
            content = content.strip()
            if content and len(content) > 5:
                messages.append({"role": "user", "content": content})
        elif line.startswith("咨询师：") or line.startswith("咨询师:"):
            content = line.split("：", 1)[-1] if "：" in line else line.split(":", 1)[-1]
            content = content.strip()
            if content and len(content) > 5:
                messages.append({"role": "assistant", "content": content})

    # 至少要有 2 轮对话（user+assistant 各至少2条才像完整对话）
    user_count = sum(1 for m in messages if m["role"] == "user")
    asst_count = sum(1 for m in messages if m["role"] == "assistant")

    if user_count >= 2 and asst_count >= 2 and user_count == asst_count:
        return messages
    return None


def call_dashscope(prompt, retries=3):
    """调用 DashScope qwen3-8b 生成对话"""
    payload = json.dumps({
        "model": "qwen3-8b",
        "messages": [{"role": "system", "content": "你是一个专业的心理咨询对话数据生成器。"}, {"role": "user", "content": prompt}],
        "temperature": 0.95,
        "max_tokens": 2048,
        "stream": False,
        "enable_thinking": False
    })

    for attempt in range(retries):
        try:
            ctx = ssl._create_unverified_context()
            conn = HTTPSConnection(HOST, timeout=120, context=ctx)
            conn.request("POST", "/compatible-mode/v1/chat/completions", body=payload, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {API_KEY}"
            })
            resp = conn.getresponse()
            body = resp.read()
            data = json.loads(body)
            conn.close()
            if "choices" not in data:
                print(f"  API返回异常: {json.dumps(data, ensure_ascii=False)[:300]}")
                raise KeyError("choices")
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  请求失败，{wait}s后重试: {e}")
                time.sleep(wait)
            else:
                print(f"  放弃: {e}")
                return None


def generate_one(topic, idx):
    """生成一条数据"""
    bg = make_user_backstory(topic, idx)
    prompt = build_generate_prompt(bg, topic)

    print(f"  正在生成...", end="", flush=True)
    text = call_dashscope(prompt)
    if not text:
        print(" 失败")
        return None

    messages = parse_conversation(text, bg, topic)
    if not messages:
        print(" 解析失败")
        return None

    print(f" ✅ {len(messages)}条消息")
    return {"messages": messages}


def generate_topic(topic, count=500, start_from=0, output_file=None):
    """为一个主题生成count条数据"""
    print(f"\n{'='*60}")
    print(f"主题: {topic['label']} ({topic['desc']})")
    print(f"目标: {count}条")
    print(f"{'='*60}")

    if output_file is None:
        output_file = f"training_data_{topic['id']}.jsonl"

    total = 0
    successes = 0
    batch_size = 5  # 每批生成5条

    for batch_start in range(start_from, start_from + count, batch_size):
        end = min(batch_start + batch_size, start_from + count)
        print(f"\n--- 批次 {batch_start//batch_size + 1}/{(count + batch_size - 1)//batch_size} ({batch_start}-{end-1}) ---")

        for idx in range(batch_start, end):
            total += 1
            result = generate_one(topic, idx)
            if result:
                with open(output_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(result, ensure_ascii=False) + "\n")
                successes += 1

            # 请求间隔，避免限流
            time.sleep(0.5 + random.random() * 1.0)

        # 每批次后保存进度
        print(f"  进度: {end}/{start_from + count} 条, 成功 {successes}/{total}")

    print(f"\n✅ {topic['label']} 完成: 成功 {successes}/{total} 条 → {output_file}")
    return successes


if __name__ == "__main__":
    # Windows GBK 兼容：强制使用 UTF-8 输出
    import sys
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    # ================================
    # 支持命令行参数: python3 generate_dataset.py [start_topic] [topic_count]
    # ================================
    import sys
    TOPIC_START = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    TOPIC_COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else len(TOPICS)
    PER_TOPIC = 500  # 每个主题生成条数

    end = min(TOPIC_START + TOPIC_COUNT, len(TOPICS))

    # ================================
    # 开始生成
    # ================================
    for i in range(TOPIC_START, end):
        topic = TOPICS[i]
        output = f"training_data_{topic['id']}.jsonl"
        generate_topic(topic, count=PER_TOPIC, output_file=output)
        print(f"\n组内主题 {i} ({topic['label']}) 完成")

    print(f"\n{'='*60}")
    print(f"✅ 主题 {TOPIC_START}-{end-1} 全部生成完成！")
    print(f"{'='*60}")
