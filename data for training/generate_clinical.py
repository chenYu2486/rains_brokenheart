"""
心理疾病临床对话数据集生成器
生成 10 种疾病 × 5 个案例 × 200 轮专业心理治疗对话
使用 DeepSeek API 保证专业性
"""
import json
import os
import sys
import ssl
import time
import re
import random
from http.client import HTTPSConnection
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_KEY = "sk-e61f910e9fb247668921008dfa15d0b7"
HOST = "api.deepseek.com"

# ============================================================
# 10 种心理疾病定义
# ============================================================
DISORDERS = [
    {
        "id": "depression",
        "name": "抑郁症",
        "desc": "持续情绪低落、兴趣丧失、精力减退，伴自杀意念、睡眠食欲紊乱、自我评价过低",
        "symptoms": "情绪低落、快感缺失、疲劳感、自罪感、注意力不集中、睡眠障碍、食欲改变、自杀意念",
        "warning": "自杀风险高，需紧急评估"
    },
    {
        "id": "mania",
        "name": "躁狂症",
        "desc": "情绪异常高涨、精力旺盛、言语增多、活动增加，伴冲动行为和判断力下降",
        "symptoms": "情绪高涨、思维奔逸、言语增多、睡眠减少、夸大妄想、冲动消费、性欲亢进、易激惹",
        "warning": "可能伴冲动伤人或自伤行为"
    },
    {
        "id": "ocd",
        "name": "强迫症",
        "desc": "反复出现强迫思维和/或强迫行为，患者明知不合理但无法控制，显著影响日常生活",
        "symptoms": "反复洗手、检查、计数、强迫疑虑、对称需求、侵入性念头、仪式化行为",
        "warning": "严重影响社会功能"
    },
    {
        "id": "bipolar",
        "name": "双相情感障碍",
        "desc": "躁狂/轻躁狂与抑郁发作交替出现，情绪波动剧烈，间歇期可正常",
        "symptoms": "情绪两极波动、躁狂期精力旺盛抑郁期低落、睡眠紊乱、冲动行为、自杀风险",
        "warning": "自杀风险高，需药物维持治疗"
    },
    {
        "id": "schizophrenia",
        "name": "精神分裂症",
        "desc": "思维、知觉、情感和行为多方面障碍，常见幻觉、妄想、思维散漫",
        "symptoms": "幻听、被害妄想、关系妄想、思维紊乱、情感淡漠、社交退缩、认知损害",
        "warning": "需精神科紧急干预"
    },
    {
        "id": "insomnia",
        "name": "慢性失眠症",
        "desc": "长期入睡困难、睡眠维持困难或早醒，伴日间功能损害，持续3个月以上",
        "symptoms": "入睡困难、频繁夜醒、早醒、日间嗜睡、注意力下降、易怒、焦虑",
        "warning": "长期失眠可能诱发其他精神疾病"
    },
    {
        "id": "anxiety",
        "name": "广泛性焦虑症",
        "desc": "对多种事件过度焦虑和担忧，难以控制，伴躯体症状如肌肉紧张、心悸",
        "symptoms": "过度担忧、坐立不安、易疲劳、注意力困难、易怒、肌肉紧张、睡眠障碍",
        "warning": "常与抑郁症共病"
    },
    {
        "id": "ptsd",
        "name": "创伤后应激障碍",
        "desc": "经历创伤事件后出现闯入性回忆、回避、负性认知和情绪改变、过度警觉",
        "symptoms": "闪回、噩梦、回避创伤相关刺激、负性信念、过度警觉、惊跳反应、情感麻木",
        "warning": "可能伴自杀风险"
    },
    {
        "id": "eating",
        "name": "进食障碍",
        "desc": "以进食行为异常为特征的精神障碍，包括神经性厌食、神经性贪食、暴食障碍",
        "symptoms": "体重显著过低/波动、暴食发作、催吐/导泻、过度运动、体像障碍、闭经",
        "warning": "营养不良可致死"
    },
    {
        "id": "somatization",
        "name": "躯体症状障碍",
        "desc": "多种反复变化的躯体症状，经充分医学检查无相应器质性病变，与心理因素密切相关",
        "symptoms": "慢性疼痛、消化系统症状、心悸胸闷、头晕乏力、频繁就医、疾病焦虑",
        "warning": "避免过度检查和医疗资源浪费"
    }
]

# ============================================================
# 患者故事模板（每个疾病5个不同背景）
# ============================================================
PATIENT_PROFILES = {
    "depression": [
        {"age": "28岁", "gender": "女", "job": "互联网产品经理", "background": "985毕业，工作3年，近期被优化裁员，男友分手，独居北京"},
        {"age": "45岁", "gender": "男", "job": "中学教师", "background": "从教20年，妻子患癌去世2年，儿子在外地上大学"},
        {"age": "19岁", "gender": "女", "job": "大一学生", "background": "高考失利进入二本，被宿舍孤立，父母关系紧张"},
        {"age": "35岁", "gender": "男", "job": "外卖骑手", "background": "从工厂下岗后跑外卖，妻子在老家带孩子，每月寄钱回去"},
        {"age": "62岁", "gender": "女", "job": "退休会计", "background": "退休后独居，女儿远嫁国外，近期体检发现乳腺结节"},
    ],
    "mania": [
        {"age": "32岁", "gender": "男", "job": "创业者", "background": "连续创业失败三次，最近突然觉得找到'必赢方案'，已连续三天不睡"},
        {"age": "24岁", "gender": "女", "job": "网红主播", "background": "粉丝量暴增后开始挥霍，一晚刷掉20万打赏榜一大哥"},
        {"age": "41岁", "gender": "男", "job": "大学教授", "background": "突然在课堂上发表激进言论，被学生投诉，自称'在讲宇宙真理'"},
        {"age": "27岁", "gender": "女", "job": "服装店老板", "background": "一周内开了三家分店，借了高利贷，声称'三个月上市'"},
        {"age": "38岁", "gender": "男", "job": "司机", "background": "突然觉得自己是'转世圣人'，要开车去北京'拯救人类'"},
    ],
    "ocd": [
        {"age": "26岁", "gender": "女", "job": "会计", "background": "每天洗手超过50次，检查账目至少10遍，导致加班到凌晨"},
        {"age": "33岁", "gender": "男", "job": "程序员", "background": "反复检查代码和门锁，每天出门要花2小时确认，被公司警告迟到"},
        {"age": "19岁", "gender": "男", "job": "高三学生", "background": "看书时一定要每行读三遍，否则觉得会漏掉'重要信息'"},
        {"age": "45岁", "gender": "女", "job": "家庭主妇", "background": "拖地一定要按固定顺序，家人挪动家具会让她崩溃大哭"},
        {"age": "29岁", "gender": "男", "job": "律师", "background": "反复检查合同条款到无法提交，脑子全是'万一漏了怎么办'"},
    ],
    "bipolar": [
        {"age": "31岁", "gender": "男", "job": "广告策划", "background": "去年被评为最佳员工，今年三个月没上班，躺在床上起不来"},
        {"age": "23岁", "gender": "女", "job": "研究生", "background": "开学时激情满满报了五个社团，两个月后全部放弃，连课都不去"},
        {"age": "38岁", "gender": "女", "job": "护士", "background": "科室里出了名的'超人'和'懒人'交替出现，同事无法理解"},
        {"age": "46岁", "gender": "男", "job": "工厂主管", "background": "膨胀期觉得可以当厂长，抑郁期觉得自己连流水线都干不了"},
        {"age": "27岁", "gender": "男", "job": "自由插画师", "background": "灵感爆发时三天画完一个系列，低谷时画笔都拿不起来"},
    ],
    "schizophrenia": [
        {"age": "22岁", "gender": "男", "job": "辍学大学生", "background": "大二开始听到有人说他坏话，觉得被监控，已休学一年"},
        {"age": "36岁", "gender": "女", "job": "无业", "background": "坚信邻居在用微波炉控制她的思想，多次报警"},
        {"age": "44岁", "gender": "男", "job": "原保安", "background": "觉得电视里的新闻都在跟他说话，'他们'要抓他"},
        {"age": "29岁", "gender": "女", "job": "原幼师", "background": "觉得孩子们是'外星人派来的'，被幼儿园辞退"},
        {"age": "50岁", "gender": "男", "job": "原公务员", "background": "坚信自己是国家领导人选中的'秘密特工'，在单位散发传单"},
    ],
    "insomnia": [
        {"age": "30岁", "gender": "女", "job": "金融分析师", "background": "连续两年每天睡不到4小时，试过各种方法无效"},
        {"age": "26岁", "gender": "男", "job": "游戏设计师", "background": "昼夜颠倒导致生物钟完全紊乱，已经分不清白天黑夜"},
        {"age": "52岁", "gender": "女", "job": "更年期女性", "background": "绝经后严重失眠，凌晨2-3点必醒，醒后无法再入睡"},
        {"age": "34岁", "gender": "男", "job": "急诊科医生", "background": "轮班制工作导致慢性失眠，值班后也无法正常入睡"},
        {"age": "21岁", "gender": "女", "job": "大学生", "background": "害怕闭眼，一闭眼就觉得'会死'，已经靠安眠药维持"},
    ],
    "anxiety": [
        {"age": "27岁", "gender": "女", "job": "新媒体运营", "background": "每天醒来第一件事就是担心，担心工作、健康、未来，停不下来"},
        {"age": "39岁", "gender": "男", "job": "房地产中介", "background": "市场不好，每天心慌手抖，怕开不了单，怕被淘汰"},
        {"age": "22岁", "gender": "男", "job": "应届毕业生", "background": "投了200份简历没回音，开始整夜睡不着，心跳加速"},
        {"age": "48岁", "gender": "女", "job": "银行经理", "background": "负责大客户业务，每次见客户前呕吐、腹泻，但又不得不去"},
        {"age": "33岁", "gender": "男", "job": "IT项目经理", "background": "每天担心项目延期，即使没事也坐立不安，被下属说'太焦虑'"},
    ],
    "ptsd": [
        {"age": "25岁", "gender": "女", "job": "原护士", "background": "疫情期间在ICU工作三个月，目睹太多死亡，至今无法正常生活"},
        {"age": "30岁", "gender": "男", "job": "退伍军人", "background": "退伍三年，听到鞭炮声就会趴下，梦见战场场景"},
        {"age": "29岁", "gender": "女", "job": "原公司职员", "background": "一年前遭性侵，不敢出门，看到类似场景就会惊恐发作"},
        {"age": "42岁", "gender": "男", "job": "出租车司机", "background": "半年前出严重车祸，现在看到大货车就全身僵硬"},
        {"age": "19岁", "gender": "男", "job": "大一新生", "background": "高中时长期被霸凌，现在看到一群男生靠近就会发抖"},
    ],
    "eating": [
        {"age": "17岁", "gender": "女", "job": "高三学生", "background": "被同学说胖后开始节食，半年瘦了30斤，已经闭经"},
        {"age": "23岁", "gender": "女", "job": "舞蹈专业学生", "background": "为了保持体重暴食后催吐，牙龈被胃酸腐蚀"},
        {"age": "32岁", "gender": "男", "job": "健身教练", "background": "对体脂率极度焦虑，每天称重十几次，暴食后疯狂运动"},
        {"age": "26岁", "gender": "女", "job": "原模特", "background": "被要求减肥后患上厌食症，身高168cm体重不到40kg，已停经"},
        {"age": "38岁", "gender": "女", "job": "银行柜员", "background": "压力大时暴食甜食，一次能吃一整个蛋糕，然后又极度自责"},
    ],
    "somatization": [
        {"age": "40岁", "gender": "男", "job": "国企中层", "background": "频繁胸闷心悸，做过所有心脏检查都正常，但不放心持续就医"},
        {"age": "34岁", "gender": "女", "job": "全职主妇", "background": "长期头痛胃痛，辗转多家医院查不出原因，被家人说'装病'"},
        {"age": "28岁", "gender": "男", "job": "程序员", "background": "体检后发现一个良性结节，坚信会癌变，每月做一次CT"},
        {"age": "55岁", "gender": "女", "job": "退休工人", "background": "全身游走性疼痛，看遍所有科室，病历堆成山"},
        {"age": "31岁", "gender": "女", "job": "小学教师", "background": "每次考试前就'瘫痪'——双腿无力无法站立，检查完全正常"},
    ]
}


# ============================================================
# 生成提示词
# ============================================================

def build_case_prompt(disorder, profile, phase, phase_num, total_phases):
    """构造一个治疗阶段的生成提示词"""
    phase_names = [
        "初始评估与建立信任关系",
        "深度探索与系统化症状评估",
        "心理教育与疾病正常化",
        "治疗干预与应对技能训练",
        "社会功能重建与环境调整",
        "整合、转介建议与安全计划"
    ]

    all_phase_names = ["初始评估与建立信任", "深度探索与系统化症状评估", "心理教育与疾病正常化", "治疗干预与应对技能训练", "社会功能重建与环境调整", "整合、转介建议与安全计划"]
    phase_focus = all_phase_names[phase_num] if phase_num < len(all_phase_names) else all_phase_names[-1]

    exchanges = 30  # 30次交换 = 60轮对话

    return f"""你是一位资深临床心理咨询师林知微。请根据以下患者信息，生成一段专业、真实的心理咨询对话。

【患者信息】
- 年龄：{profile['age']}
- 性别：{profile['gender']}
- 职业：{profile['job']}
- 背景故事：{profile['background']}

【临床诊断】
- 疾病：{disorder['name']}
- 临床表现：{disorder['desc']}
- 典型症状：{disorder['symptoms']}
- 风险提示：{disorder['warning']}

【治疗阶段】
阶段 {phase_num+1}/{total_phases}：{phase_focus}

【对话要求】
1. 林知微的语气：专业、温和、坚定、不评判
2. 患者的话语：真实、口语化，反映疾病特征，有情绪起伏
3. 林知微要体现以下专业能力：
   - 使用标准化评估工具（如PHQ-9、GAD-7、SCL-90等）进行症状评估
   - 运用认知行为疗法（CBT）、辩证行为疗法（DBT）等循证治疗技术
   - 识别自杀风险并实施安全评估
   - 进行心理教育，解释疾病的生物学基础
   - 明确建议患者到正规医院精神科就诊，强调药物与心理治疗结合的重要性
   - 在发现严重症状时果断建议转诊精神科
4. 对话要有真实的故事感——患者的经历要具体、有细节
5. 当出现高风险症状时（自杀意念、幻觉、妄想、严重自伤），林知微必须明确建议立即就医

【格式】
生成 {exchanges} 轮完整对话（{exchanges} 句患者 + {exchanges} 句咨询师）。
患者用"来访者："开头，咨询师用"咨询师："开头。
只输出对话内容，不要加任何说明。"""


# ============================================================
# API 调用
# ============================================================

def call_deepseek(messages, retries=2):
    payload = json.dumps({
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": 8192,
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
                print(f"  API失败: {e}", flush=True)
                return None


# ============================================================
# 解析
# ============================================================

def parse_dialogue(text):
    """从生成文本解析对话消息"""
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


# ============================================================
# 生成一个案例
# ============================================================

def build_system_prompt():
    return """你是一位资深临床心理咨询师林知微，拥有临床心理学博士学位，在三甲医院精神科工作10年。你擅长认知行为疗法（CBT）、辩证行为疗法（DBT）和动机性访谈。你的风格是专业、温和、坚定，能够用通俗的语言解释复杂的心理机制。

你的工作原则：
1. 始终以患者的安全为第一位，识别并干预自杀风险
2. 使用循证评估工具进行标准化评估
3. 明确区分心理咨询和精神科治疗的界限
4. 在必要时果断建议患者转诊精神科医生
5. 进行心理教育，减少病耻感
6. 用具体的、可操作的建议帮助患者"""


def generate_one_case(disorder, profile, case_idx, out_lock, output_file):
    """为一个患者生成完整的治疗对话（约200轮）"""
    total_phases = 6
    system_prompt = build_system_prompt()

    print(f"  开始案例{case_idx}: {profile['age']} {profile['gender']} {profile['job']}", flush=True)

    for phase in range(total_phases):
        prompt = build_case_prompt(disorder, profile, "", phase, total_phases)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        result = call_deepseek(messages)
        if not result:
            print(f"    阶段{phase+1} 失败", flush=True)
            continue

        # 去除markdown包裹
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[-1]
            result = result.rsplit("```", 1)[0].strip()

        parsed = parse_dialogue(result)
        if not parsed:
            print(f"    阶段{phase+1} 解析失败", flush=True)
            continue

        all_messages.extend(parsed)
        # 阶段间的简短连接过渡
        if phase < total_phases - 1:
            all_messages.append({
                "role": "assistant",
                "content": f"（[第{phase+1}次咨询结束，预约下一次咨询]）"
            })

        print(f"    阶段{phase+1}/{total_phases} ✅ ({len(parsed)//2}轮)", flush=True)
        time.sleep(0.5)  # 阶段间短暂停顿

    if len(all_messages) < 20:
        print(f"  案例{case_idx} 生成不足，丢弃", flush=True)
        return 0

    # 计算轮次
    rounds = sum(1 for m in all_messages if m["role"] == "user")
    result_entry = {
        "messages": [{"role": "system", "content": system_prompt}] + all_messages,
        "metadata": {
            "disorder": disorder["name"],
            "case": case_idx,
            "patient": f"{profile['age']} {profile['gender']} {profile['job']}",
            "background": profile["background"],
            "total_rounds": rounds
        }
    }

    with out_lock:
        with open(output_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(result_entry, ensure_ascii=False) + "\n")

    print(f"  案例{case_idx} 完成 ✅ ({rounds}轮)", flush=True)
    return 1


def main():
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('gbk', 'gb2312'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    output_file = "clinical_dataset.jsonl"

    # 仅生成剩余疾病（进食障碍、躯体症状障碍）
    REMAINING_IDS = ["eating", "somatization"]
    tasks = []
    for disorder in DISORDERS:
        if disorder["id"] not in REMAINING_IDS:
            continue
        did = disorder["id"]
        profiles = PATIENT_PROFILES.get(did, [])
        for case_idx, profile in enumerate(profiles, 1):
            tasks.append((disorder, profile, case_idx))

    total_cases = len(tasks)
    print(f"共 {len(DISORDERS)} 种疾病, {total_cases} 个案例")
    print(f"每个案例目标 ~200 轮对话")
    print(f"{'='*60}")

    lock = Lock()
    success = [0]

    def worker(task_tuple):
        disorder, profile, case_idx = task_tuple
        result = generate_one_case(disorder, profile, case_idx, lock, output_file)
        success[0] += result
        return result

    # 并行生成（每个案例一个worker）
    num_workers = min(8, total_cases)
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(worker, t): t for t in tasks}
        for future in as_completed(futures):
            t = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"❌ 案例 {t[2]} ({t[0]['name']}) 出错: {e}", flush=True)

    # 汇总
    total_rounds = 0
    with open(output_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                entry = json.loads(line)
                msgs = entry.get("messages", [])
                user_count = sum(1 for m in msgs if m["role"] == "user")
                asst_count = sum(1 for m in msgs if m["role"] == "assistant")
                total_rounds += min(user_count, asst_count)

    print(f"\n{'='*60}")
    print(f"✅ 全部完成！")
    print(f"成功案例: {success[0]}/{total_cases}")
    print(f"总对话轮次: ~{total_rounds}")
    print(f"数据保存: {output_file}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
