"""
并行批量生成器：同时处理多个主题
用法: python3 generate_batch.py
"""
import subprocess
import sys
import os

# 导入主题列表
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_dataset import TOPICS

# 20个主题分为4组，每组5个主题，每组一个进程
GROUPS = [
    (0, 5),    # 原生家庭、亲密关系、职场内耗、存在焦虑、自我价值
    (5, 5),    # 讨好模式、完美主义、拖延自责、焦虑失控、低落麻木
    (10, 5),   # 睡眠紊乱、社交耗竭、依恋创伤、创伤记忆、边界感
    (15, 5),   # 容貌身材、信息过载、学业压力、经济压力、失恋恢复
]

processes = []

for start, count in GROUPS:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    p = subprocess.Popen(
        [sys.executable, "generate_dataset.py", str(start), str(count)],
        env=env,
        stdout=open(f"log_group_{start}.txt", "w", encoding="utf-8"),
        stderr=subprocess.STDOUT,
    )
    processes.append(p)
    print(f"启动组 {start}-{start+count-1} (PID: {p.pid})")

print(f"\n共 {len(processes)} 个并行进程，等待完成...")

for i, p in enumerate(processes):
    p.wait()
    g = GROUPS[i]
    print(f"组 {g[0]}-{g[0]+g[1]-1} 完成，返回码: {p.returncode}")

# 合并所有文件
print("\n合并所有文件到 Trainingdata.jsonl ...")
with open("Trainingdata.jsonl", "w", encoding="utf-8") as out:
    for i, _ in enumerate(TOPICS):
        fname = f"training_data_{TOPICS[i]['id']}.jsonl"
        try:
            with open(fname, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        out.write(line)
        except FileNotFoundError:
            pass

# 统计
total = 0
with open("Trainingdata.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        if line.strip():
            total += 1

print(f"\n{'='*60}")
print(f"✅ 全部完成！共 {total} 条数据")
print(f"{'='*60}")
