#!/usr/bin/env python3
"""
生成300个AI观众的完整人设（每人含1000字人生故事）。
步骤：
  1. 定义人群分布矩阵
  2. 生成300人骨架（不含bio）
  3. 分批调DeepSeek API填充bio
  4. 保存到 data/audience_300.json
"""

import json
import random
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

random.seed(42)

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'audience_300.json')

# ============================================================
# 1. 人群分布矩阵
# ============================================================

CITIES = [
    ("北京", "华北"), ("上海", "华东"), ("广州", "华南"), ("深圳", "华南"),
    ("杭州", "华东"), ("成都", "西南"), ("武汉", "华中"), ("南京", "华东"),
    ("西安", "西北"), ("重庆", "西南"), ("长沙", "华中"), ("苏州", "华东"),
    ("天津", "华北"), ("郑州", "华中"), ("东莞", "华南"), ("青岛", "华东"),
    ("沈阳", "东北"), ("昆明", "西南"), ("厦门", "华东"), ("哈尔滨", "东北"),
]

AGES = (
    [(18, 25)] * 60 +   # 60人
    [(26, 30)] * 45 +
    [(31, 35)] * 45 +
    [(36, 40)] * 40 +
    [(41, 45)] * 35 +
    [(46, 50)] * 30 +
    [(51, 55)] * 15 +
    [(56, 60)] * 15 +
    [(61, 70)] * 15
)  # 合计 300

EDUCATIONS = [
    "初中", "高中/中专", "大专", "本科", "硕士", "博士"
]

# 职业池（覆盖各阶层）
OCCUPATIONS = [
    # 互联网/科技
    "前端工程师", "后端工程师", "算法工程师", "产品经理", "UI设计师",
    "测试工程师", "运维工程师", "数据分析师", "AI研究员",
    # 金融/法律
    "银行柜员", "基金经理", "保险经纪人", "证券分析师", "律师", "法务专员",
    # 教育/医疗
    "小学老师", "中学老师", "大学教授", "幼儿园老师", "医生", "护士", "心理咨询师",
    # 体制内
    "公务员", "国企职员", "事业单位职工", "社区工作者", "警察",
    # 服务业
    "外卖骑手", "快递员", "网约车司机", "房产中介", "超市收银员",
    "餐厅服务员", "酒店前台", "美容师", "理发师", "健身教练",
    # 蓝领/技工
    "电工", "焊工", "装修工人", "工厂质检员", "仓库管理员", "货车司机",
    "物业维修工", "保安",
    # 自由职业/创业
    "自媒体博主", "摄影师", "独立插画师", "网店店主", "自由撰稿人",
    "抖音主播", "民宿老板",
    # 学生
    "大学生", "研究生", "博士生",
    # 其他
    "全职妈妈", "全职爸爸", "退休人员", "家庭主妇", "刚毕业找工作",
]

MARRIAGE_STATUS = ["未婚", "已婚", "离异", "丧偶"]
HAS_CHILDREN = ["无", "1个孩子", "2个孩子", "3个及以上"]

MBTI_TYPES = ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
              "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"]

PERSONALITY_TRAITS = [
    "乐观", "悲观", "务实", "理想主义", "理性", "感性", "内向", "外向",
    "谨慎", "冲动", "随和", "固执", "幽默", "严肃", "焦虑", "佛系",
    "上进", "躺平", "细致", "粗放", "慷慨", "节俭", "直率", "圆滑",
    "敏感", "钝感", "理性", "暴躁", "温柔", "冷峻"
]

VALUES_POOL = [
    "家庭第一", "事业为重", "自由至上", "稳定压倒一切",
    "钱不是万能但没钱万万不能", "活在当下", "人活着要有梦想",
    "知识改变命运", "健康最重要", "公平正义",
    "自己开心最重要", "要为社会做贡献", "做人要善良",
    "努力就有回报", "平平淡淡才是真", "及时行乐",
    "诚信为本", "人脉就是资源", "低调做人", "敢想敢拼"
]

HOBBIES_POOL = [
    "打游戏", "看电视剧", "看电影", "看综艺", "看书", "健身",
    "跑步", "打球", "做饭", "烘焙", "养宠物", "种花",
    "钓鱼", "爬山", "骑行", "摄影", "画画", "弹琴",
    "唱歌", "跳舞", "逛街", "刷短视频", "打麻将", "下棋",
    "喝茶", "喝酒", "露营", "旅游"
]

MEDIA_POOL = ["抖音", "快手", "小红书", "B站", "微博", "知乎", "微信公众号", "今日头条"]

DEBATER_IDS = [
    "chenming", "fushouer", "xiaoxiao", "huangzhizhong",
    "zhanqingyun", "lidan", "yanrujing", "maweiwei",
    "qiuchen", "jiangsida", "xirui", "fantiantian"
]

# 16维情绪敏感度的人设模板（不同性格倾向有不同的默认权重）
EMOTION_TEMPLATES = {
    "理性务实":  { "humor": 0.3, "logic": 0.9, "emotion": 0.2, "aggression": 0.1, "story": 0.2, "novelty": 0.4, "golden": 0.3, "question": 0.2, "exclamation": 0.1, "dash": 0.2, "short": 0.3, "long": 0.6, "life": 0.3, "data": 0.5, "attack": 0.0, "sublime": 0.2 },
    "感性温情":  { "humor": 0.6, "logic": 0.3, "emotion": 0.9, "aggression": -0.3, "story": 0.8, "novelty": 0.4, "golden": 0.7, "question": 0.3, "exclamation": 0.2, "dash": 0.3, "short": 0.2, "long": 0.3, "life": 0.7, "data": 0.2, "attack": -0.1, "sublime": 0.5 },
    "幽默外向":  { "humor": 0.9, "logic": 0.3, "emotion": 0.6, "aggression": 0.4, "story": 0.6, "novelty": 0.7, "golden": 0.7, "question": 0.4, "exclamation": 0.3, "dash": 0.3, "short": 0.3, "long": 0.2, "life": 0.5, "data": 0.1, "attack": 0.2, "sublime": 0.2 },
    "愤世嫉俗":  { "humor": 0.2, "logic": 0.6, "emotion": 0.5, "aggression": 0.9, "story": 0.3, "novelty": 0.5, "golden": 0.3, "question": 0.5, "exclamation": 0.5, "dash": 0.2, "short": 0.5, "long": 0.4, "life": 0.4, "data": 0.3, "attack": 0.7, "sublime": 0.1 },
    "佛系随缘":  { "humor": 0.5, "logic": 0.4, "emotion": 0.4, "aggression": -0.6, "story": 0.5, "novelty": 0.4, "golden": 0.4, "question": 0.2, "exclamation": 0.0, "dash": 0.2, "short": 0.1, "long": 0.2, "life": 0.5, "data": 0.2, "attack": -0.2, "sublime": 0.4 },
    "传统保守":  { "humor": 0.3, "logic": 0.6, "emotion": 0.5, "aggression": -0.5, "story": 0.6, "novelty": -0.5, "golden": 0.4, "question": 0.1, "exclamation": 0.1, "dash": 0.2, "short": 0.2, "long": 0.4, "life": 0.7, "data": 0.4, "attack": -0.3, "sublime": 0.5 },
    "文艺青年":  { "humor": 0.4, "logic": 0.3, "emotion": 0.8, "aggression": -0.4, "story": 0.8, "novelty": 0.8, "golden": 0.8, "question": 0.3, "exclamation": 0.1, "dash": 0.5, "short": 0.2, "long": 0.3, "life": 0.5, "data": 0.1, "attack": -0.2, "sublime": 0.7 },
    "精明商人":  { "humor": 0.4, "logic": 0.8, "emotion": 0.2, "aggression": 0.5, "story": 0.3, "novelty": 0.6, "golden": 0.4, "question": 0.3, "exclamation": 0.3, "dash": 0.1, "short": 0.4, "long": 0.5, "life": 0.3, "data": 0.4, "attack": 0.3, "sublime": 0.1 },
}

TENDENCY_LABELS = [
    "偏理性", "偏感性", "偏实用主义", "偏理想主义", "偏传统", "偏随性", "偏批判性", "偏包容性"
]


# ============================================================
# 2. 生成300人骨架
# ============================================================

def generate_person(id):
    city, region = CITIES[(id - 1) % len(CITIES)]
    age_range = AGES[(id - 1) % len(AGES)]
    age = random.randint(age_range[0], age_range[1])
    gender = random.choice(["男", "女"])
    edu = random.choices(EDUCATIONS, weights=[5, 15, 25, 35, 15, 5])[0]
    occ = random.choice(OCCUPATIONS)
    married = random.choice(MARRIAGE_STATUS)
    children = random.choice(HAS_CHILDREN) if married in ["已婚", "离异"] else "无"
    income_bracket = random.randint(1, 10)

    # 根据职业决定收入区间描述
    income_map = {
        "算法工程师":"3.5万+", "AI研究员":"3万+", "基金经理":"5万+", "律师":"2-4万",
        "大学教授":"1.5-2.5万", "医生":"1.5-3万", "公务员":"5k-1.2万", "国企职员":"6k-1.2万",
        "外卖骑手":"5k-1万", "快递员":"5k-1万", "网店店主":"不固定", "大学生":"暂无收入",
        "退休人员":"4k-8k", "全职妈妈":"无收入"
    }
    income = income_map.get(occ, f"{random.choice(['3k','5k','8k','1万','1.5万','2万','3万'])}-{random.choice(['8k','1万','1.5万','2万','3万','5万'])}")

    # 名字
    surnames = "王李张刘陈杨赵黄周吴徐孙马胡朱郭何罗高林"
    given_names_m = ["伟","强","磊","军","勇","明","杰","涛","斌","鹏","飞","超","波","辉","刚","健","俊","志","文","海"]
    given_names_f = ["芳","娟","敏","静","丽","霞","婷","娜","燕","玲","琳","雪","云","梅","红","莲","英","萍","丹","青"]
    surname = random.choice(surnames)
    if gender == "男":
        name = surname + random.choice(given_names_m) + (random.choice(given_names_m) if random.random()<0.3 else "")
    else:
        name = surname + random.choice(given_names_f) + (random.choice(given_names_f) if random.random()<0.3 else "")

    # 性格
    mbti = random.choice(MBTI_TYPES)
    traits = random.sample(PERSONALITY_TRAITS, random.randint(3, 5))
    core_drive = random.choice(["安全感", "成就感", "归属感", "自由", "被尊重", "影响力", "掌控感", "新鲜感"])
    fear = random.choice(["没钱", "孤独", "生病", "失败", "被看不起", "失去自由", "平庸", "被欺骗"])

    # 价值观
    values = random.sample(VALUES_POOL, random.randint(3, 5))

    # 情绪模板
    emo_template_key = random.choice(list(EMOTION_TEMPLATES.keys()))
    emotion = dict(EMOTION_TEMPLATES[emo_template_key])
    # 加随机扰动
    for k in emotion:
        emotion[k] = round(max(-1.0, min(1.0, emotion[k] + random.uniform(-0.15, 0.15))), 2)

    # triggers
    trigger_words = random.sample(
        ["钱","自由","家庭","孩子","梦想","稳定","健康","公平","爱情","事业","教育","养老","婚姻","成功","快乐","面子","孤独","尊重","责任","信任"],
        random.randint(4, 7)
    )
    triggers = {}
    for tw in trigger_words:
        triggers[tw] = round(random.uniform(-1.0, 1.2), 1)

    # 喜好
    hobbies = random.sample(HOBBIES_POOL, random.randint(3, 5))
    media = random.sample(MEDIA_POOL, random.randint(2, 4))

    # 辩论倾向
    favored = random.choice(DEBATER_IDS)
    tendency = random.choice(TENDENCY_LABELS)
    dims = random.sample(["逻辑性","情感共鸣","故事性","观点新颖度","实用价值","娱乐性","深度","社会关怀"], random.randint(2, 3))

    return {
        "id": id,
        "name": name,
        "label": occ,
        "basic": {
            "age": age,
            "gender": gender,
            "city": city,
            "education": edu,
            "occupation": occ,
            "income": income,
            "marriage": married,
            "children": children
        },
        "bio": "",  # 待填充
        "personality": {
            "mbti": mbti,
            "traits": traits,
            "core_drive": core_drive,
            "fear": fear
        },
        "values": values,
        "lifestyle": {
            "hobbies": hobbies,
            "media": media
        },
        "debate_profile": {
            "favored_debater": favored,
            "favored_style": emo_template_key,
            "tendency": tendency
        },
        # 向后兼容字段
        "tendency": tendency,
        "dimensions": dims,
        "emotion": emotion,
        "triggers": triggers
    }


def generate_skeleton():
    people = [generate_person(i) for i in range(1, 301)]
    # 确保ID唯一
    ids = [p["id"] for p in people]
    assert len(set(ids)) == 300, f"ID有重复: {len(set(ids))}/300"
    return people


# ============================================================
# 3. 调DeepSeek填充bio
# ============================================================

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    # 尝试从.env读取
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith('DEEPSEEK_API_KEY='):
                    DEEPSEEK_API_KEY = line.split('=', 1)[1].strip()
                    break

DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")


def call_deepseek(messages, temperature=0.9, max_tokens=2000):
    """调DeepSeek API（使用urllib）"""
    if not DEEPSEEK_API_KEY:
        return None
    try:
        payload = json.dumps({
            "model": "deepseek-v4-flash",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }).encode('utf-8')
        req = urllib.request.Request(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        print(f"  API错误 {e.code}: {e.read().decode()[:200]}")
        return None
    except Exception as e:
        print(f"  请求异常: {e}")
        return None


def fill_bio(person):
    """为一个人生成1000字人生故事"""
    p = person
    prompt = f"""你是一个人物编剧。请根据以下人物设定，写一段约1000字的人生故事。

人物设定：
- 姓名：{p['name']}
- 年龄：{p['basic']['age']}岁
- 性别：{p['basic']['gender']}
- 城市：{p['basic']['city']}
- 学历：{p['basic']['education']}
- 职业：{p['basic']['occupation']}
- 收入：{p['basic']['income']}
- 婚姻：{p['basic']['marriage']}
- 子女：{p['basic']['children']}
- 性格：{', '.join(p['personality']['traits'])}（MBTI: {p['personality']['mbti']}）
- 核心价值观：{', '.join(p['values'])}
- 恐惧：{p['personality']['fear']}

要求：
1. 写一段真实感人的个人故事，仿佛这个人就生活在我们身边
2. 包括具体的成长经历、生活中的重要转折、没有实现的遗憾、对未来最大的期待
3. 要有细节——具体的年份、地点、人名（可以编）、对话片段
4. 语言自然生动，像一个人在接受采访时的自述
5. 约1000字，不要少于800字
6. 用第一人称"我"来写
7. 最后自然带出这个人对"辩论"这件事的态度——他/她喜欢看什么类型的节目？为什么？"""

    content = call_deepseek([
        {"role": "system", "content": "你是一个擅长写人物传记的作家，文笔细腻，善于捕捉生活中的真实情感。"},
        {"role": "user", "content": prompt}
    ])

    if content:
        # 清理可能的markdown引号
        content = content.strip()
        if content.startswith('"') and content.endswith('"'):
            content = content[1:-1]
        if content.startswith("```") and content.endswith("```"):
            lines = content.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            content = '\n'.join(lines).strip()
        return content
    return None


def fill_all_bios(people, batch_size=5, checkpoint_interval=30):
    """并行填充bio，同时最多batch_size人，每checkpoint_interval人保存一次"""
    total = len(people)
    completed = sum(1 for p in people if p["bio"] and len(p["bio"]) > 100)
    print(f"已有{completed}/{total}人完成bio")

    # 只处理未完成的
    todo = [(i, people[i]) for i in range(total) if not people[i]["bio"] or len(people[i]["bio"]) <= 100]
    print(f"待生成: {len(todo)}人，并行度={batch_size}")

    done_count = completed
    with ThreadPoolExecutor(max_workers=batch_size) as executor:
        # 提交所有任务
        future_map = {}
        for idx, person in todo:
            future = executor.submit(fill_bio, person)
            future_map[future] = (idx, person)

        for future in as_completed(future_map):
            idx, person = future_map[future]
            bio = future.result()
            if bio:
                people[idx]["bio"] = bio
                done_count += 1
                print(f"  [{done_count}/{total}] ✅ {person['name']} ({person['basic']['occupation']}) - {len(bio)}字")
            else:
                print(f"  [{done_count+1}/{total}] ❌ {person['name']} 失败，跳过")
                done_count += 1

            # 每 checkpoint_interval 人保存一次
            if done_count % checkpoint_interval == 0:
                save_json(people)
                print(f"  💾 已保存进度 ({done_count}/{total})")

    save_json(people)
    print(f"🎉 全部完成！共 {done_count} 人生成成功")


def save_json(people):
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(people, f, ensure_ascii=False, indent=2)


# ============================================================
# 4. 主入口
# ============================================================

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "skeleton":
        # 只生成骨架
        people = generate_skeleton()
        save_json(people)
        print(f"骨架已生成: {OUTPUT_PATH}")
        print(f"共 {len(people)} 人")

    elif mode == "bios":
        # 只补bio（从已有文件继续）
        if os.path.exists(OUTPUT_PATH):
            people = json.load(open(OUTPUT_PATH, 'r', encoding='utf-8'))
            print(f"加载已有文件: {len(people)} 人")
        else:
            people = generate_skeleton()
        fill_all_bios(people)

    elif mode == "stats":
        # 统计信息
        people = json.load(open(OUTPUT_PATH, 'r', encoding='utf-8'))
        bio_count = sum(1 for p in people if p["bio"] and len(p["bio"]) > 100)
        avg_len = sum(len(p["bio"]) for p in people if p["bio"]) // bio_count if bio_count else 0
        print(f"总人数: {len(people)}")
        print(f"已完成bio: {bio_count}")
        print(f"平均bio字数: {avg_len}")
        occ_dist = {}
        for p in people:
            occ = p["basic"]["occupation"]
            occ_dist[occ] = occ_dist.get(occ, 0) + 1
        print(f"职业分布 ({len(occ_dist)}种):")
        for occ, cnt in sorted(occ_dist.items(), key=lambda x: -x[1])[:20]:
            print(f"  {occ}: {cnt}人")

    else:
        # 全流程
        people = generate_skeleton()
        save_json(people)
        print(f"骨架已生成: {len(people)} 人")
        fill_all_bios(people)

    print("Done.")
