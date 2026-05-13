"""
超快速润色：10条对话一批发送给 DeepSeek，大幅减少 API 调用次数
"""
import json
import os
import sys
import ssl
import time
import re
from http.client import HTTPSConnection
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_KEY = "sk-e61f910e9fb247668921008dfa15d0b7"
HOST = "api.deepseek.com"
BATCH_SIZE = 10  # 每批10条

ENHANCE_PROMPT = """你是一位心理咨询对话优化专家。以下有{BATCH_SIZE}条心理咨询对话数据。

请逐条润色每一条对话：
1. 保持人物设定和核心困扰不变
2. 咨询师回应要更专业——使用情感反射、共情、开放提问等咨询技术
3. 来访者话语要更真实——有情绪起伏，像真人倾诉
4. 保持"来访者："和"咨询师："格式不变

输出规则：
- 每条对话之间用 "=== 对话X ===" 分隔（X为序号）
- 直接输出润色后的对话，不要任何说明
- 不要加引号包裹或markdown代码块

开始："""


def call_deepseek(messages, retries=2):
    payload = json.dumps({
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
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


def parse_messages(text):
    """从对话文本解析 messages 列表"""
    lines = text.strip().split("\n")
    messages = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("来访者：") or line.startswith("来访者:"):
            content = line.split("：", 1)[-1] if "：" in line else line.split(":", 1)[-1]
            content = content.strip()
            if content and len(content) > 3:
                messages.append({"role": "user", "content": content})
        elif line.startswith("咨询师：") or line.startswith("咨询师:"):
            content = line.split("：", 1)[-1] if "：" in line else line.split(":", 1)[-1]
            content = content.strip()
            if content and len(content) > 3:
                messages.append({"role": "assistant", "content": content})
    return messages if messages else None


def entry_to_text(entry):
    """把一条 entry 转为纯文本格式"""
    system_prompt = ""
    lines = []
    for m in entry["messages"]:
        if m["role"] == "system":
            system_prompt = m["content"]
        elif m["role"] == "user":
            lines.append(f"来访者：{m['content']}")
        elif m["role"] == "assistant":
            lines.append(f"咨询师：{m['content']}")
    return system_prompt, "\n".join(lines)


def build_batch_prompt(entries):
    """构建一批数据的提示词"""
    parts = []
    for i, entry in enumerate(entries):
        sp, text = entry_to_text(entry)
        parts.append(f"【对话{i+1}】\n系统设定：{sp}\n{text}")

    prompt = ENHANCE_PROMPT.replace("{BATCH_SIZE}", str(len(entries)))
    prompt += "\n---\n" + "\n\n".join(parts)
    return prompt


def parse_batch_response(text, count):
    """从 DeepSeek 返回结果中解析出各条对话"""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0].strip()

    # 先尝试用 === 对话N === 分割
    parts = re.split(r"===?\s*对话\s*\d+\s*===?", text)
    if len(parts) < 2:
        # 尝试其他可能的分隔
        parts = re.split(r"(?:^|\n)\s*对话\s*\d+\s*[：:]\s*\n", text)

    # 去除空的部分
    parts = [p.strip() for p in parts if p.strip()]

    if len(parts) >= count:
        return parts[:count]
    elif len(parts) > 0:
        return parts  # 返回能解析到的部分
    return [text]  # 整个当作一条


def enhance_batch(entries, worker_id, out_lock, output_file):
    """处理一批中的一小批（BATCH_SIZE 条）"""
    count = 0
    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i:i + BATCH_SIZE]
        prompt = build_batch_prompt(batch)
        n = len(batch)

        result = call_deepseek([
            {"role": "system", "content": "你是一个专业的心理咨询对话优化专家。请逐条润色对话。"},
            {"role": "user", "content": prompt}
        ])

        if not result:
            print(f"  [Worker {worker_id}] 批次{i//BATCH_SIZE+1} 失败(API)", flush=True)
            continue

        parsed = parse_batch_response(result, n)
        successes = 0

        for j, entry in enumerate(batch):
            if j < len(parsed):
                new_msgs = parse_messages(parsed[j])
                if new_msgs:
                    system_prompt = ""
                    for m in entry["messages"]:
                        if m["role"] == "system":
                            system_prompt = m["content"]
                            break
                    enhanced = {"messages": [{"role": "system", "content": system_prompt}] + new_msgs}
                    with out_lock:
                        with open(output_file, "a", encoding="utf-8") as f:
                            f.write(json.dumps(enhanced, ensure_ascii=False) + "\n")
                    successes += 1
                    count += 1

        print(f"  [Worker {worker_id}] 批次{i//BATCH_SIZE+1}: {successes}/{n} ✅", flush=True)

    return count


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    input_file = "Trainingdata.jsonl"
    output_file = "Trainingdata_enhanced.jsonl"

    # 如果已有部分结果，只处理未完成的
    done_ids = set()
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    done_ids.add(hash(line.strip()))

    with open(input_file, "r", encoding="utf-8") as f:
        all_entries = [json.loads(line) for line in f if line.strip()]

    # 过滤已完成的
    remaining = []
    for entry in all_entries:
        h = hash(json.dumps(entry.get("messages", []), ensure_ascii=False))
        if h not in done_ids:
            remaining.append(entry)

    print(f"总数: {len(all_entries)}, 已完成: {len(done_ids)}, 剩余: {len(remaining)}")

    if not remaining:
        print("全部已完成！")
        return

    # 15 个 worker
    num_workers = 15
    chunk_size = (len(remaining) + num_workers - 1) // num_workers
    chunks = [remaining[i:i + chunk_size] for i in range(0, len(remaining), chunk_size)]
    print(f"分 {len(chunks)} 组并行润色")

    lock = Lock()
    total = [0]

    def process_chunk(chunk, wid):
        c = enhance_batch(chunk, wid, lock, output_file)
        total[0] += c
        print(f"\n✅ Worker {wid} 完成，成功 {c} 条\n", flush=True)

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_chunk, chunk, i): i for i, chunk in enumerate(chunks)}
        for future in as_completed(futures):
            wid = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"\n❌ Worker {wid} 失败: {e}\n", flush=True)

    # 统计
    final_count = 0
    with open(output_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                final_count += 1

    print(f"\n润色完成！本轮成功 {total[0]} 条，文件共 {final_count} 条")
    print(f"保存到 {output_file}")


if __name__ == "__main__":
    main()
