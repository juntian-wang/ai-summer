# 任务 C：后端核心搭建

> 独立任务。可交给任意对话执行。

---

## 目标

搭建完整的 Node.js 后端服务，实现辩论编排器 + 状态机 + Prompt 工厂 + LLM 调用 + 观众系统。

产出一个可独立运行的 `server.js` 及其模块文件。

---

## 前置依赖

- 任务 A、B 完成（需要 `data/debaters.json`、`data/mentors.json`、`data/referee.json`）
- 任务 E 完成（需要 `data/topics.json`、`data/audience.json`、`.env`）
- 参考文档：`制作步骤.md` 第三步、`Loop设计.md`

---

## 技术栈

- Node.js + Express
- DeepSeek API（OpenAI 兼容格式）
- `dotenv` 管理环境变量

---

## 需要创建的文件

```
server/
├── server.js             ← Express 主入口 + 路由
├── flowDefinition.js     ← FLOW 数组（纯数据，附录1）
├── agentEngine.js        ← Prompt 构建 + LLM 调用 + 重试
├── viewerEngine.js       ← 观众投票 + 情绪计算 + 跑票
└── sessionStore.js       ← Session 创建/读取/更新
```

---

## 具体步骤

### Step 1：环境配置

- 创建 `package.json`（依赖：express, dotenv, node-fetch）
- 创建 `.env.example`（变量：DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL）
- `npm install`

### Step 2：Session 存储模块

- 实现 session 的增删查改（内存存储，Map 结构）
- session 结构：`{ config, memory[], stepIdx, viewerStates[], voteInit, voteFinal }`
- 30 分钟超时自动清理

### Step 3：状态机 + FLOW 定义

- 定义 FLOW 数组（附录 1），共约 28 个步骤
- 实现 `sessionStore.advance(sid)` 方法：stepIdx++ → 返回当前步骤数据

### Step 4：Agent 引擎

- `buildPrompt(agent, step, memory)` — 组装 system prompt
  - 包含角色 Profile（speaking_rules + forbidden + persona）
  - 包含完整共享记忆（前面所有人的发言）
  - 包含当前环节任务说明
  - 各辩位任务差异（一辩立论 / 二辩补充 / 三辩攻防 / 结辩升华）
- `callLLM(prompt)` — 调 DeepSeek API
  - 带重试逻辑（×3，间隔 2s）
  - 超时 30s
  - 降级路径（第 4 次去风格约束）

### Step 5：观众引擎

- `batchAudienceVote(topic, debate, initVotes)` — 30 人分批投票
  - 每批 5 人并行，批间 sleep 500ms
  - 每人根据自己的人设 Profile + 辩题/辩论内容输出投给谁 + 理由
  - 失败观众给默认票（按人设倾向）
  - 统计跑票
- `viewerEmotionUpdate(memory)` — V1 留钩子（当前为空，V2 启用 LLM 段落分析）

### Step 6：Express 路由

实现 4 个 API：

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/session/start` | POST | 创建 session，返回 session_id |
| `/api/session/:id/state` | GET | 获取当前状态（stepIdx, memory 长度） |
| `/api/session/:id/next` | GET | 执行下一步，返回发言/投票/导师数据 |
| `/api/session/:id/full` | GET | 获取完整台本（导出用） |

- `/next` 返回格式随步骤类型变化：
  - host → `{ type: "host", text: "..." }`
  - speech → `{ type: "speech_pro|speech_con", text: "...", role: "...", style: "..." }`
  - battle → `{ type: "battle_pro|battle_con", text: "...", side: "pro|con" }`
  - vote → `{ type: "vote_init|vote_final", pro: N, con: N, pro_pct: NN, ... }`
  - mentor → `{ type: "mentor", name: "...", text: "..." }`
  - done → `{ done: true }`

### Step 7：静态文件服务

- Express 托管 `../index.html` 和 `../data/` 目录

### Step 8：Loop 自检逻辑

- 每步输出后验证（见 `Loop设计.md` §3）
- 跑票 = 0 时触发加赛开杠
- 致命错误处理（见 `Loop设计.md` §4.3）

---

## 你的 Loop 自检

你是 Agent 4，遵循 Agent Loop 协议（见 `项目总览.md`）。

### 每完成一个模块后立即查

- [ ] 文件已写入磁盘（不要攒到最后）
- [ ] 代码语法正确（`node --check server.js` 不报错）
- [ ] `npm start` 不崩溃

### 核心检查项（功能测试）

- [ ] `POST /api/session/start` 返回有效 session_id
- [ ] 连续调 `GET /api/session/:id/next` 直到返回 `{ done: true }`，中间不崩溃
- [ ] 初投/终投数据完整（pro + con = 30，或标注有效票数）
- [ ] 跑票计算正确（终投 - 初投 = 跑票人数）
- [ ] FLOW 数组执行到最后一个 step 后返回 `{ done: true }`
- [ ] 降级路径：不设 API key 时能触发降级并返回占位文本

### 自检失败怎么办

```
npm start 崩溃 → 查错误栈，修复，重试
API 返回错误 → 加日志定位，修复，重试
降级未触发 → 检查重试次数和条件，修复
同一问题连续 3 次修复无效 → 标记该模块为"待定"，写清楚卡在哪里，继续下一个模块
```

### 停止条件

- **成功**：所有模块完成 + 完整一集辩论不崩溃 + API 返回正确
- **致命**：`npm start` 无法启动（服务端跑不起来）→ 停止，报错
- **降级**：个别发言占位跳过（非开杠/结辩）→ 记录，仍算通过

### 终检

- [ ] 完整跑通一集辩论（从 /start 到 done）
- [ ] 检查 memory 数组：辩手、主持人、导师发言都有
- [ ] 检查跑票：sways 数组正确
- [ ] 连跑 3 次不崩（稳定性检查）

---

## 附录 1：FLOW 数组定义

```javascript
const FLOW = [
  { step: 'host_opening',    type: 'host',   role: '开场' },
  { step: 'vote_init',       type: 'vote',   label: 'init' },
  { step: 'host_intro_p1',   type: 'host',   role: '介绍正方一辩' },
  { step: 'pro_first',       type: 'speech', side: 'pro',  position: 'first' },
  { step: 'con_first',       type: 'speech', side: 'con',  position: 'first' },
  { step: 'host_intro_p2',   type: 'host',   role: '介绍正方二辩' },
  { step: 'pro_second',      type: 'speech', side: 'pro',  position: 'second' },
  { step: 'con_second',      type: 'speech', side: 'con',  position: 'second' },
  { step: 'host_intro_p3',   type: 'host',   role: '介绍正方三辩' },
  { step: 'pro_third',       type: 'speech', side: 'pro',  position: 'third' },
  { step: 'con_third',       type: 'speech', side: 'con',  position: 'third' },
  { step: 'host_battle',     type: 'host',   role: '开杠开始' },
  { step: 'battle_r1_pro',   type: 'battle', side: 'pro',  round: 1 },
  { step: 'battle_r1_con',   type: 'battle', side: 'con',  round: 1 },
  { step: 'battle_r2_pro',   type: 'battle', side: 'pro',  round: 2 },
  { step: 'battle_r2_con',   type: 'battle', side: 'con',  round: 2 },
  { step: 'battle_r3_pro',   type: 'battle', side: 'pro',  round: 3 },
  { step: 'battle_r3_con',   type: 'battle', side: 'con',  round: 3 },
  { step: 'host_closing',    type: 'host',   role: '结辩开始' },
  { step: 'con_closing',     type: 'closing', side: 'con' },
  { step: 'pro_closing',     type: 'closing', side: 'pro' },
  { step: 'host_final_vote', type: 'host',   role: '引导终投' },
  { step: 'vote_final',      type: 'vote',   label: 'final' },
  { step: 'host_mentors',    type: 'host',   role: '邀请导师' },
  { step: 'mentor_1',        type: 'mentor', idx: 0 },
  { step: 'mentor_2',        type: 'mentor', idx: 1 },
];
```
