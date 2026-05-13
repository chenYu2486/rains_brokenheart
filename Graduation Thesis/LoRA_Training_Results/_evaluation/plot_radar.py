# -*- coding: utf-8 -*-
"""生成雷达对比图 + 柱状图"""

import os, json, csv, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Noto Sans SC']
plt.rcParams['axes.unicode_minus'] = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)

# 维度配置
DIMENSIONS = ['共情能力', '专业性', '安全性', '表达自然度', '对话相关性']
DIM_IDS = ['empathy', 'professionalism', 'safety', 'naturalness', 'relevance']

COLOR_A = '#7f8c8d'   # 基座模型 - 灰色
COLOR_B = '#27ae60'   # 微调模型 - 绿色


def load_scores():
    """从CSV加载评分数据"""
    csv_path = os.path.join(RESULTS_DIR, 'scores_detail.csv')
    if not os.path.exists(csv_path):
        print(f"未找到评分文件: {csv_path}")
        return None

    scores = {"A": {d: [] for d in DIM_IDS}, "B": {d: [] for d in DIM_IDS}}
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            model = row["model"]
            for d in DIM_IDS:
                try:
                    scores[model][d].append(float(row[d]))
                except:
                    pass
    return scores


def plot_radar(scores):
    """雷达图"""
    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))

    angles = np.linspace(0, 2 * np.pi, len(DIMENSIONS), endpoint=False).tolist()
    angles += angles[:1]

    for model, color, label in [("A", COLOR_A, "基座模型 (Base)"), ("B", COLOR_B, "微调模型 (Ours)")]:
        values = [np.mean(scores[model][d]) for d in DIM_IDS]
        values += values[:1]
        ax.fill(angles, values, color=color, alpha=0.15)
        ax.plot(angles, values, color=color, linewidth=2, label=label, marker='o', markersize=6)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(DIMENSIONS, fontsize=12)
    ax.set_ylim(0, 5)
    ax.set_yticks([1, 2, 3, 4, 5])
    ax.set_yticklabels(['1', '2', '3', '4', '5'], fontsize=9, color='gray')
    ax.set_title('ShelterAI 模型微调效果对比', fontsize=14, pad=20)
    ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1), fontsize=11)

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, 'radar_comparison.png')
    fig.savefig(path, dpi=300)
    plt.close()
    print(f"雷达图: {path}")


def plot_bar(scores):
    """柱状对比图"""
    fig, ax = plt.subplots(figsize=(10, 5.5))

    x = np.arange(len(DIMENSIONS))
    width = 0.3

    a_means = [np.mean(scores["A"][d]) for d in DIM_IDS]
    b_means = [np.mean(scores["B"][d]) for d in DIM_IDS]

    bars_a = ax.bar(x - width/2, a_means, width, color=COLOR_A, alpha=0.8, label='基座模型 (Base)')
    bars_b = ax.bar(x + width/2, b_means, width, color=COLOR_B, alpha=0.8, label='微调模型 (Ours)')

    # 标注数值
    for bar in bars_a:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2, h + 0.05, f'{h:.2f}', ha='center', va='bottom', fontsize=9, color=COLOR_A)
    for bar in bars_b:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2, h + 0.05, f'{h:.2f}', ha='center', va='bottom', fontsize=9, color=COLOR_B)

    # 标注提升
    for i in range(len(DIMENSIONS)):
        diff = b_means[i] - a_means[i]
        if diff > 0:
            ax.annotate(f'+{diff:.2f}', xy=(x[i], max(a_means[i], b_means[i]) + 0.4),
                       ha='center', fontsize=9, fontweight='bold', color=COLOR_B)

    ax.set_xticks(x)
    ax.set_xticklabels(DIMENSIONS, fontsize=11)
    ax.set_ylabel('平均分 (1-5)', fontsize=11)
    ax.set_ylim(0, 5.5)
    ax.set_title('ShelterAI 各维度评分对比', fontsize=14)
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3, axis='y')

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, 'bar_comparison.png')
    fig.savefig(path, dpi=300)
    plt.close()
    print(f"柱状图: {path}")


def plot_gap_improvement(scores):
    """提升幅度图"""
    fig, ax = plt.subplots(figsize=(10, 4))

    improvements = [np.mean(scores["B"][d]) - np.mean(scores["A"][d]) for d in DIM_IDS]
    colors = [COLOR_B if v > 0 else '#e74c3c' for v in improvements]

    bars = ax.barh(DIMENSIONS, improvements, color=colors, alpha=0.8, height=0.5)

    for bar, v in zip(bars, improvements):
        if v != 0:
            label = f'+{v:.2f}' if v > 0 else f'{v:.2f}'
            ax.text(v + 0.02 if v > 0 else v - 0.25, bar.get_y() + bar.get_height()/2,
                    label, va='center', fontsize=11, fontweight='bold')

    ax.axvline(0, color='gray', linewidth=0.8)
    ax.set_xlabel('提升幅度（分）', fontsize=11)
    ax.set_title('微调相比基座模型各维度提升幅度', fontsize=14)
    ax.grid(True, alpha=0.3, axis='x')

    fig.tight_layout()
    path = os.path.join(RESULTS_DIR, 'improvement_gap.png')
    fig.savefig(path, dpi=300)
    plt.close()
    print(f"提升幅度图: {path}")


def main():
    scores = load_scores()
    if not scores:
        print("请先运行 evaluate_ai.py 生成评分数据")
        return

    plot_radar(scores)
    plot_bar(scores)
    plot_gap_improvement(scores)
    print(f"\n图表保存至: {RESULTS_DIR}")


if __name__ == "__main__":
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    main()
