"""
使用 DeepSeek API 批量润色已生成的心理咨询对话数据
提升咨询师专业性、来访者真实感、对话自然度
"""
import json
import os
import sys
import ssl
import time
import random
from http.client import HTTPSConnection
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
HOST = "api.deepseek.com"

ENHANCE_PROMPT = """你是一位心理咨询对话优化专家。以下是一条心理咨询对话数据，包含多轮"来访者"和"咨询师"的对话。

请提升对话质量，具体要求：
1. 咨询师的回应要更专业——使用心理咨询核心技术（情感反射、内容摘要、开放提问、正常化、共情）
2. 来访者的话语要更真实——更像真人倾诉，有情绪起伏，有停顿感
3. 对话节奏更自然——避免一问一答的机械感，要有真实的交流感
4. 保持对话的核心困扰和人物背景不变
5. 保持输出格式完全不变：依然是"来访者："和"咨询师："开头的对话

只输出润色后的对话内容，不要加任何说明、不要加引号包裹。"""


def call_deepseek(messages, retries=3):
    """调用 DeepSeek API"""
    payload = json.dumps({
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": False
    }, ensure_ascii=False)

    for attempt in range(retries):
        try:
            ctx = ssl._create_unverified_context()
            conn = HTTPSConnection(HOST, timeout=120, context=ctx)
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
                time.sleep(2 ** attempt)
            else:
                print(f"  API调用失败: {e}", flush=True)
                return None


def enhance_one_conversation(system_prompt, dialogue_text):
    """用 DeepSeek 润色一条对话"""
    messages = [
        {"role": "system", "content": ENHANCE_PROMPT},
        {"role": "user", "content": f"【系统设定】\n{system_prompt}\n\n【对话内容】\n{dialogue_text}"}
    ]
    result = call_deepseek(messages)
    if not result:
        return None
    return result.strip()


def parse_messages(text):
    """从对话文本解析出 messages 列表"""
    lines = text.strip().split("\n")
    messages = []
    for line in lines:
        line = line.strip()
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


def enhance_entry(entry):
    """润色一条数据"""
    msgs = entry["messages"]
    system_prompt = ""
    dialogue_lines = []

    for m in msgs:
        if m["role"] == "system":
            system_prompt = m["content"]
        elif m["role"] == "user":
            dialogue_lines.append(f"来访者：{m['content']}")
        elif m["role"] == "assistant":
            dialogue_lines.append(f"咨询师：{m['content']}")

    if not dialogue_lines:
        return None

    dialogue_text = "\n".join(dialogue_lines)
    improved = enhance_one_conversation(system_prompt, dialogue_text)
    if not improved:
        return None

    # 去除可能的 markdown 代码块包裹
    improved = improved.strip()
    if improved.startswith("```"):
        improved = improved.split("\n", 1)[-1]
        improved = improved.rsplit("```", 1)[0].strip()

    new_msgs = parse_messages(improved)
    if not new_msgs:
        return None

    return {"messages": [{"role": "system", "content": system_prompt}] + new_msgs}


def enhance_batch(entries, worker_id, out_lock, output_file):
    """润色一批数据（逐条保存到文件）"""
    count = 0
    for i, entry in enumerate(entries):
        result = enhance_entry(entry)
        if result:
            count += 1
            with out_lock:
                with open(output_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(result, ensure_ascii=False) + "\n")
            print(f"  [Worker {worker_id}] 第{i+1}/{len(entries)}条 ✅", flush=True)
        else:
            print(f"  [Worker {worker_id}] 第{i+1}/{len(entries)}条 ❌", flush=True)
        time.sleep(0.1 + random.random() * 0.2)
    return count


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    input_file = "Trainingdata.jsonl"
    output_file = "Trainingdata_enhanced.jsonl"

    if not os.path.exists(input_file):
        print(f"文件不存在: {input_file}")
        return

    # 读取所有数据
    print(f"读取 {input_file} ...")
    with open(input_file, "r", encoding="utf-8") as f:
        all_entries = [json.loads(line) for line in f if line.strip()]
    print(f"共 {len(all_entries)} 条数据")

    # 分8组并行处理
    num_workers = 8
    chunk_size = (len(all_entries) + num_workers - 1) // num_workers
    chunks = [all_entries[i:i+chunk_size] for i in range(0, len(all_entries), chunk_size)]

    print(f"分 {len(chunks)} 组并行润色，每组约 {chunk_size} 条")

    lock = Lock()
    total_success = [0]  # mutable counter for threads

    # 清空旧输出
    with open(output_file, "w", encoding="utf-8") as f:
        pass

    def process_chunk(chunk, wid):
        count = enhance_batch(chunk, wid, lock, output_file)
        total_success[0] += count
        print(f"\n✅ Worker {wid} 完成，润色成功 {count} 条\n", flush=True)

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(process_chunk, chunk, i): i for i, chunk in enumerate(chunks)}
        for future in as_completed(futures):
            wid = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"\n❌ Worker {wid} 失败: {e}\n", flush=True)

    # 统计最终结果
    final_count = 0
    seen = set()
    with open(output_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip() and line not in seen:
                seen.add(line)
                final_count += 1

    print(f"\n润色完成！成功 {total_success[0]} / {len(all_entries)} 条，文件共 {final_count} 条唯一记录")
    print(f"已保存到 {output_file}")


if __name__ == "__main__":
    main()
