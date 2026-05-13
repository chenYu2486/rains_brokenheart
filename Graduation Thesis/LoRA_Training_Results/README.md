# LoRA 微调训练实验说明

## 实验概述

基于 Qwen3.5-9B 基座模型，采用 LoRA 对注意力层的 Q 和 K 投影矩阵进行低秩适配，在约 20,000 条心理健康对话数据集上进行指令微调。数据集覆盖 20 个心理话题标签（职场内耗、原生家庭、亲密关系等），每条样本包含 system + 4 轮 user/assistant 对话（共 9 条消息），按 8:1:1 划分为训练/验证/测试集。

为探究不同超参数对微调效果的影响，设计了三组对照实验 + 一组完整训练参照。

---

## 实验分组

### 1. HighRank Overfitting（过拟合组）
| 参数 | 值 |
|------|-----|
| LoRA rank | 64 |
| Learning Rate | 3e-4 |
| 训练步数 | ~1,600（3 epoch） |
| 最终训练损失 | 0.68 |
| 最终评估损失 | 8.53 |
| Train-Eval Gap | 7.85 |
| 最高评估准确率 | 67.3%（1,070 步后停滞） |

**现象**：训练损失持续下降，但评估损失在第 1,070 步后开始反弹，最终达到 8.73。rank 过高（64）配合过大的学习率（3e-4）导致模型快速记忆训练数据，失去泛化能力。符合过拟合典型特征。

### 2. LowEpoch Underfit（欠拟合组）
| 参数 | 值 |
|------|-----|
| LoRA rank | 16 |
| Learning Rate | 2e-5 |
| 训练步数 | ~900 |
| 评估损失变化 | 4.58 → 2.68 |
| 评估准确率变化 | 45.6% → 56.2% |

**现象**：评估损失和准确率仍呈下降/上升趋势便被截断，模型尚未充分收敛。说明训练步数不足，处于欠拟合状态。

### 3. OverTraining Divergence（过拟合完整版 / 参照组）
| 参数 | 值 |
|------|-----|
| LoRA rank | 64（推断）|
| Learning Rate | 3e-4 |
| 训练步数 | ~1,596 |
| 评估损失最终值 | 8.73（第 1,605 步） |

**现象**：完整的过拟合训练过程，训练至后期评估损失急剧反弹。属于 HighRank Overfitting 组的完整版训练记录。

### 4. Proposed LoRA-Optimized（最优方案）
| 参数 | 值 |
|------|-----|
| LoRA rank | 16 |
| LoRA alpha | 32 |
| dropout | 0.05 |
| Learning Rate | 3e-5（cosine 衰减）|
| Batch Size | 32 |
| Epoch | 6 |
| 最大序列长度 | 2048 |
| 训练步数 | ~2,000 |
| 训练损失 | 4.09 → 0.77 |
| 评估损失 | 3.98 → 1.23 |
| Train-Eval Gap | **0.46** |
| 评估准确率 | 42% → **70%** |
| 梯度范数 | 稳定在 0.90 左右 |

**结论**：在 20,000 条数据规模下，rank=16 配合 cosine 学习率衰减策略是最优配置。训练-评估损失差距仅 0.46，表明模型在拟合训练数据与保持泛化能力之间取得了良好平衡。

- —2# 训练完成后将 LoRA 权重合并至基座模型并部署至 DashScope 平台，模型 ID：`qwen3-8b-9c3af956383a`

---

## 文件说明

```
LoRA_Training_Results/
├── _charts/                          # 6 张 300dpi 对比图
│   ├── 01_train_loss.png             # 训练损失曲线
│   ├── 02_eval_loss.png              # 评估损失曲线
│   ├── 03_eval_accuracy.png          # 评估准确率曲线
│   ├── 04_loss_gap.png               # Train-Eval Gap 柱状图
│   ├── 05_grad_norm.png              # 梯度范数曲线
│   └── 06_lr_schedule.png            # 学习率调度曲线
├── _LoRA_Training_Summary.xlsx       # 汇总表（6 个 Sheet）
│   ├── Summary                       # 实验总览
│   ├── Train Loss (per step)         # 训练损失逐步对比
│   ├── Eval Loss (per checkpoint)    # 评估损失逐点对比
│   ├── Eval Accuracy (per checkpoint)# 评估准确率逐点对比
│   ├── Gradient Norm (per step)      # 梯度范数逐步对比
│   └── Learning Rate (per step)      # 学习率逐步对比
├── HighRank_Overfitting/             # 10 个指标 xlsx
├── LowEpoch_Underfit/                # 10 个指标 xlsx
├── OverTraining_Divergence/          # 10 个指标 xlsx
└── Proposed_LoRA_Optimized/          # 10 个指标 xlsx
```

每个实验组包含 10 个 Excel 指标文件：

| 文件名 | 内容 |
|--------|------|
| train _ loss.xlsx | 训练损失（step, value）|
| train _ grad_norm.xlsx | 梯度范数（step, value）|
| train _ lr.xlsx | 学习率（step, value）|
| train _ epoch.xlsx | epoch 进度（step, epoch）|
| eval _ loss.xlsx | 评估损失（step, value）|
| eval _ accuracy.xlsx | 评估准确率（step, value）|
| eval _ runtime.xlsx | 评估运行时间（step, seconds）|
| eval _ samples_per_sec.xlsx | 评估吞吐量（step, samples/sec）|
| eval _ steps_per_sec.xlsx | 评估步频（step, steps/sec）|
| data _ tokens.xlsx | 数据 token 数分布 |

---

## 生成脚本

对比图由 `C:\Users\Yuchen\Downloads\plot_charts.py` 生成，依赖 matplotlib + openpyxl。

汇总表由 `plot_charts.py` 运行时自动生成。

---

## 论文引用

本实验数据已写入本科毕业论文《基于大模型微调的精神心理对话系统开发》第 5.2 节 "LoRA 训练设计"。
