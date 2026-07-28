# 任务 E：数据与配置文件创建

> 独立任务。可与任务 A、B 并行执行。

---

## 目标

创建项目所需的所有静态数据文件和配置文件。

---

## 前置依赖

- 无（纯数据任务，可与 A、B 并行）
- 参考：`制作步骤.md`、`Loop设计.md`
- 任务 A 会更新 `debaters.json`，任务 B 会更新 `referee.json` 和 `mentors.json`

---

## 需要创建的文件

| 文件 | 内容 | 谁负责 |
|------|------|--------|
| `data/topics.json` | 辩题库（15-20 题） | 任务 E |
| `data/audience.json` | 30 个观众人设（含情绪响应矩阵） | 任务 E |
| `data/debaters.json` | 辩手风格库（骨架版） | 任务 E（任务 A 会充实） |
| `data/referee.json` | 主持人风格（骨架版） | 任务 E（任务 B 会充实） |
| `data/mentors.json` | 导师风格（骨架版） | 任务 E（任务 B 会充实） |
| `.env.example` | 环境变量模板 | 任务 E |
| `package.json` | Node 依赖配置 | 任务 E |

---

## Step 1：辩题库 `data/topics.json`

格式：

```json
[
  { "title": "结婚到底要不要买房？" },
  { "title": "该不该告诉孩子家里不富裕？" },
  { "title": "小学生该不该有手机？" },
  { "title": "成绩重要还是兴趣重要？" },
  { "title": "家长该不该检查孩子的聊天记录？" },
  { "title": "分手后还能不能做朋友？" },
  { "title": "该不该催好朋友还钱？" },
  { "title": "同事能不能成为真正的朋友？" },
  { "title": "如果有一瓶能消除所有记忆的药水，你要不要喝？" },
  { "title": "外星人来了，人类应该先开战还是先谈判？" },
  { "title": "如果能预知未来十年，你要不要看？" },
  { "title": "AI 能不能替代老师？" },
  { "title": "熬夜工作值得吗？" },
  { "title": "二十岁该不该开始攒钱养老？" },
  { "title": "要不要为了高薪放弃自己的爱好？" }
]
```

**要求**：
- 生活类 ≥ 8 题，脑洞类 ≥ 5 题
- 每个辩题系统能自动拆解正反方立场（含"该不该/要不要/能不能"等关键词）
- 无法自动拆解的题在字段中标注 `pro_position` / `con_position`

---

## Step 2：观众人设 `data/audience.json`

30 个观众，每人包含：

```json
{
  "id": 1,
  "label": "职场妈妈",
  "tendency": "偏实用主义",
  "dimensions": ["实用性", "情感共鸣"],
  "emotion": {
    "humor": 0.6,
    "logic": 0.3,
    "emotion": 0.9,
    "aggression": -0.2,
    "story": 0.8,
    "novelty": 0.3,
    "golden": 0.7,
    "question": 0.4,
    "exclamation": 0.5,
    "dash": 0.3,
    "short": 0.4,
    "long": -0.3,
    "life": 0.8,
    "data": 0.2,
    "attack": -0.4,
    "sublime": 0.6
  },
  "triggers": {
    "家庭": 1.0,
    "孩子": 1.2,
    "安全感": 0.8,
    "钱": 0.6,
    "自由": -0.3
  }
}
```

**要求**：
- 30 个人设标签不重复，覆盖不同年龄/职业/性格
- emotion 矩阵中 10 个维度值在 -1.0 ~ 1.0 之间，分布均匀（不能全是 0.5）
- 每人 3-5 个 triggers
- 至少有 5 个"偏理性"、5 个"偏感性"、5 个"偏实用主义"、5 个"偏传统"、5 个"偏理想主义"

**emotion 维度对应关系**（与前端 10 个形态特征匹配）：

| 特征序号 | 特征名 | emotion 字段 |
|---------|--------|-------------|
| 1 | is_question | `question` |
| 2 | has_exclamation | `exclamation` |
| 3 | has_dash | `dash` |
| 4 | is_short | `short` |
| 5 | is_long | `long` |
| 6 | has_emotion_word | `emotion` |
| 7 | has_life_word | `life` |
| 8 | has_data_word | `data` |
| 9 | has_attack_word | `attack` |
| 10 | has_sublime_word | `sublime` |

> 注：`humor` `logic` `aggression` `story` `novelty` `golden` 是复合维度，用于情绪分类（见 `制作步骤.md` 情绪引擎算法部分）。前端实际计算时使用上述 10 个特征，但 emoji 归类时参考这些复合维度。

---

## Step 3：辩手风格骨架 `data/debaters.json`

创建骨架结构（任务 A 会填入详细内容）。最少包含：

```json
[
  {
    "id": "chenming",
    "name": "陈铭风格",
    "label": "逻辑型",
    "persona": "温和理性的大学老师，用知识拆解一切",
    "best_position": "一辩",
    "speaking_rules": ["先拆解辩题定义", "..."],
    "forbidden": ["..."],
    "example_lines": ["..."]
  }
]
```

12 个辩手 id：chenming, fushouer, xiaoxiao, huangzhizhong, zhanqingyun, lidan, yanrujing, maweiwei, qiuchen, jiangsida, xirui, fantiantian

---

## Step 4：主持人 + 导师骨架

创建骨架 `data/referee.json` 和 `data/mentors.json`（任务 B 会填入详细内容）。

---

## Step 5：环境配置 `.env.example`

```
# DeepSeek API Configuration
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

---

## Step 6：`package.json`

```json
{
  "name": "ai-qipashuo",
  "version": "1.0.0",
  "description": "AI 奇葩说 - 多 Agent 辩论节目",
  "main": "server/server.js",
  "scripts": {
    "start": "node server/server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "dotenv": "^16.3.0"
  }
}
```

---

## 你的 Loop 自检

你是 Agent 3，遵循 Agent Loop 协议（见 `项目总览.md`）。

### 每创建一个文件后立即查

- [ ] 文件已写入磁盘
- [ ] JSON 格式合法（`JSON.parse` 不报错，或用在线 JSON 验证）
- [ ] 字段名和任务文件指定的完全一致
- [ ] 数量达标（topics ≥ 15 题，audience = 30 人）

### 专项检查

**topics.json**
- [ ] ≥ 15 题，生活类 ≥ 8，脑洞类 ≥ 5
- [ ] 每题的 title 能自动拆解正反方（含"该不该/要不要/能不能/还是"等关键词）

**audience.json**
- [ ] 30 人，id 1-30 连续无跳
- [ ] 每人 `emotion` 对象 10 个字段齐全，都在 -1.0 ~ 1.0 区间
- [ ] emotion 值分布均匀——不能所有人都是 0.5
- [ ] 每人 3-5 个 triggers
- [ ] 标签覆盖：偏理性/偏感性/偏实用/偏传统/偏理想 各 ≥ 5 人

**debaters/referee/mentors 骨架**
- [ ] debaters.json 有 12 个人（id: chenming, fushouer, xiaoxiao, huangzhizhong, zhanqingyun, lidan, yanrujing, maweiwei, qiuchen, jiangsida, xirui, fantiantian）
- [ ] referee.json 只有 1 个主持人
- [ ] mentors.json 有 2 个人（xuezhaofeng, caikangyong）
- [ ] 每个对象字段名正确、无缺漏

**.env.example**
- [ ] 包含 DEEPSEEK_API_KEY 和 DEEPSEEK_BASE_URL

**package.json**
- [ ] 包含 express 和 dotenv 依赖
- [ ] `npm start` 脚本指向正确

### 自检失败怎么办

```
JSON 格式错误 → 修复，验证
数量不达标 → 直接补充，不重写
字段名错误 → 对照任务文件修正
连续 3 次修不好同一个文件 → 标注，继续下一个
```

### 停止条件

- **成功**：7 个文件全部创建 + 格式验证通过
- **失败**：超过 2 个文件无法通过格式验证 → 停止，列出问题文件

### 终检

- [ ] 对每个 JSON 文件执行 `JSON.parse(fs.readFileSync(path))`
- [ ] audience.json 抽查 5 个人：emotion 值有没有空的、有没有超出 -1~1 的
- [ ] topics.json 抽查 3 题：立场能否自动拆解
- [ ] 跑 `npm install && node -e "require('./package.json'); console.log('OK')"`
