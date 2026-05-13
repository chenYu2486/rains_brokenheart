# -*- coding: utf-8 -*-
"""用 DeepSeek API 生成 500 条评测数据集（25条/topic x 20 topics）"""

import json, os, time, ssl, random, sys
from http.client import HTTPSConnection

API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
HOST = "api.deepseek.com"
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'eval_dataset_500.jsonl')

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
    {"id": "information", "label": "信息过载", "desc": "刷太多、脑子停不下"},
    {"id": "study", "label": "学业压力", "desc": "考试、考研、比较压力"},
    {"id": "money", "label": "经济压力", "desc": "收入、负债、安全感"},
    {"id": "breakup", "label": "失恋恢复", "desc": "断联、复盘、放不下"}
]

AGES = ["19", "22", "25", "28", "31", "24", "27", "30", "23", "26", "21", "33", "29", "35", "20"]
GENDERS = ["男", "女", "女", "男", "女", "男", "女", "男"]
JOBS = ["大学生", "研究生", "程序员", "设计师", "产品经理", "老师", "护士", "销售", "自由职业", "运营", "HR", "会计", "新媒体编辑", "公务员", "客服", "快递员", "餐饮店主", "医学生", "律师助理", "行政"]

def call_deepseek(prompt, temperature=0.9, max_tokens=2048, retries=3):
    payload = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False
    }, ensure_ascii=False)
    for attempt in range(retries):
        try:
            ctx = ssl._create_unverified_context()
            conn = HTTPSConnection(HOST, timeout=180, context=ctx)
            conn.request("POST", "/v1/chat/completions", body=payload.encode('utf-8'), headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {API_KEY}"
            })
            resp = conn.getresponse()
            data = json.loads(resp.read())
            conn.close()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(3)
            else:
                return None

def generate_batch(topic, label, desc, batch_size=5):
    age = random.choice(AGES)
    gender = random.choice(GENDERS)
    job = random.choice(JOBS)
    prompt = (
        f"你是一个心理咨询数据集生成器。请生成{batch_size}条不同的心理对话测试用例，主题是「{label}」（{desc}）。\n\n"
        f"用户画像：{age}岁，{gender}性，职业是{job}。\n\n"
        "每条用例格式（请严格输出JSON数组）：\n"
        '{"cases": [\n'
        '  {"id": "topic_001", "topic": "' + topic + '", "scenario": "一句话场景描述", "user_input": "用户的第一句倾诉，30-80字，口语化，像真人说的话"},'
        '  ...'
        ']}\n\n'
        "要求：\n"
        "1. user_input 要真实自然，像真实的人在倾诉，不要像编的\n"
        "2. 覆盖不同细分场景，不要重复\n"
        "3. 结合当前社会热点和年轻人真实困境\n"
        "4. 输出严格合法的 JSON，不要 Markdown，不要解释"
    )
    return call_deepseek(prompt, temperature=0.92, max_tokens=4096)

def main():
    all_cases = []
    counter = 0

    for t in TOPICS:
        topic_id = t["id"]
        label = t["label"]
        desc = t["desc"]
        cases_for_topic = 0
        batch_num = 0
        batch_size = 5

        while cases_for_topic < 25:
            batch_num += 1
            remaining = 25 - cases_for_topic
            this_batch = min(batch_size, remaining)
            print(f"[{topic_id}] batch {batch_num} ({this_batch} cases)...", end=" ", flush=True)

            result = generate_batch(topic_id, label, desc, this_batch)
            if result is None:
                print("API error, retry after 5s")
                time.sleep(5)
                continue

            try:
                result = result.strip()
                if result.startswith("```"):
                    result = result.split("\n", 1)[-1]
                    result = result.rsplit("```", 1)[0].strip()
                data = json.loads(result)
                batch_cases = data.get("cases", [])
                for c in batch_cases:
                    counter += 1
                    c["id"] = f"eval_{counter:03d}"
                    all_cases.append(c)
                    cases_for_topic += 1
                print(f"ok (+{len(batch_cases)})")
            except:
                print("json parse failed, retry")
                time.sleep(2)
                continue

            time.sleep(1.5)

        print(f"[{topic_id}] DONE ({cases_for_topic} cases)")

    # Write output
    with open(OUTPUT, "w", encoding="utf-8") as f:
        for c in all_cases:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"\nTotal: {len(all_cases)} cases saved to {OUTPUT}")

if __name__ == "__main__":
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    main()
