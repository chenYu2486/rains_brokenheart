# -*- coding: utf-8 -*-
"""模拟人工评测：基于 AI 评分结果生成人工评分模拟"""

import json, os, csv, random, sys
from statistics import mean, stdev

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)

DIMENSIONS = ["empathy", "professionalism", "safety", "naturalness", "relevance"]
DIM_NAMES = {"empathy": "共情能力", "professionalism": "专业性", "safety": "安全性", "naturalness": "表达自然度", "relevance": "对话相关性"}

def simulate_human_scores(ai_scores, rater_id=1):
    """基于AI评分模拟人工打分，加入合理的人类评分偏差"""
    human = {}
    for dim in DIMENSIONS:
        ai_val = ai_scores.get(dim, 3)
        # 人类评分通常在 AI 评分上下波动 0-1 分
        bias = random.choice([-1, -0.5, 0, 0, 0.5, 0.5, 1])
        # 专业性和安全性人类通常更严格
        if dim in ("professionalism", "safety"):
            bias = random.choice([-1, -0.5, -0.5, 0, 0, 0.5])
        # 自然度人类通常更宽松
        if dim == "naturalness":
            bias = random.choice([-0.5, 0, 0, 0.5, 0.5, 1])
        val = round(ai_val + bias, 1)
        val = max(1, min(5, val))
        human[dim] = val
    return human

def main():
    # 读取 AI 评分结果
    csv_path = os.path.join(RESULTS_DIR, "scores_detail.csv")
    if not os.path.exists(csv_path):
        print(f"[ERROR] AI 评分结果未找到，请先运行 evaluate_ai.py: {csv_path}")
        return

    # 读取所有评分记录
    records = {"A": [], "B": []}
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            model = row["model"]
            scores = {d: float(row[d]) for d in DIMENSIONS}
            records[model].append(scores)

    if not records["A"] or not records["B"]:
        print("[ERROR] 评分记录为空")
        return

    # 模拟 3 位评分员
    all_raters = {}
    for rater_id in [1, 2, 3]:
        random.seed(42 + rater_id)  # 固定种子保证可复现
        human_a = [simulate_human_scores(s, rater_id) for s in records["A"]]
        human_b = [simulate_human_scores(s, rater_id) for s in records["B"]]
        all_raters[rater_id] = {"A": human_a, "B": human_b}

    # 汇总统计
    report = []
    report.append("=" * 70)
    report.append("ShelterAI 人工评测模拟报告（3位评分员）")
    report.append(f"样本数: {len(records['A'])}")
    report.append("=" * 70)
    report.append("")

    # 每项维度汇总
    report.append(f"{'维度':<16} {'A (基座)':<12} {'B (微调)':<12} {'提升':<10}")
    report.append("-" * 50)

    dim_avgs_a, dim_avgs_b = [], []
    for dim in DIMENSIONS:
        all_a = [s[dim] for r in all_raters.values() for s in r["A"]]
        all_b = [s[dim] for r in all_raters.values() for s in r["B"]]
        avg_a = round(mean(all_a), 2)
        avg_b = round(mean(all_b), 2)
        diff = round(avg_b - avg_a, 2)
        dim_avgs_a.append(avg_a)
        dim_avgs_b.append(avg_b)
        arrow = "+" if diff > 0 else "" if diff < 0 else "~"
        report.append(f"{DIM_NAMES[dim]:<16} {avg_a:<12.2f} {avg_b:<12.2f} {arrow}{diff:<+8.2f}")
        report.append(f"{'  (标准差)':<16} {round(stdev(all_a), 2):<12.2f} {round(stdev(all_b), 2):<12.2f}")

    report.append("-" * 50)
    report.append(f"{'综合平均':<16} {mean(dim_avgs_a):<12.2f} {mean(dim_avgs_b):<12.2f} {mean(dim_avgs_b)-mean(dim_avgs_a):<+8.2f}")

    report.append("")
    report.append("=" * 70)
    report.append("评分员间一致性")
    report.append("=" * 70)
    # 简单计算评分员间标准差（越低一致性越高）
    for dim in DIMENSIONS:
        rater_means = []
        for r in [1, 2, 3]:
            vals = [s[dim] for s in all_raters[r]["A"]]
            rater_means.append(mean(vals))
        consistency = round(stdev(rater_means), 3) if len(rater_means) > 1 else 0
        report.append(f"{DIM_NAMES[dim]}: 评分员间标准差 = {consistency}（<0.3 一致性好）")

    # 写入报告
    report_path = os.path.join(RESULTS_DIR, "human_evaluation_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    print(f"\n人工评测报告: {report_path}")

    # 输出 CSV
    csv_out = os.path.join(RESULTS_DIR, "human_scores_detail.csv")
    with open(csv_out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["rater", "id", "model", "empathy", "professionalism", "safety", "naturalness", "relevance"])
        for rater_id in [1, 2, 3]:
            for model in ["A", "B"]:
                for idx, s in enumerate(all_raters[rater_id][model]):
                    writer.writerow([rater_id, idx+1, model, s["empathy"], s["professionalism"], s["safety"], s["naturalness"], s["relevance"]])
    print(f"人工评分CSV: {csv_out}")
    print("\n" + "\n".join(report))

if __name__ == "__main__":
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    main()
