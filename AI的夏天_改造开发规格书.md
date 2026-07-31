# AI的夏天 — 改造开发规格书

> 一次性改造三项内容：①按奇葩说第六季改流程 ②开杠策略选择 ③导师中途插话
>
> **开发前必读文档**：请先阅读以下文件了解现有架构
> - `项目总览.md` — 项目全局看板
> - `制作步骤.md` — 制作流程和技术架构
> - `要达到的效果.md` — 产品设计愿景
> - `.workbuddy/memory/MEMORY.md` — 架构决策和踩坑记录

---

## 一、设计决策汇总（改之前先看这个）

| # | 问题 | 决定 |
|---|------|------|
| 1 | 赛制 | 奇葩说第六季：一辩开杠 + 三辩开杠，二辩无开杠，无二排 |
| 2 | 开杠计时 | 每方 45 秒总计时，用字数模拟。正常语速~200-250字/分钟，45秒≈150-180字 |
| 3 | 开杠分段 | 各 3 段交替（正→反→正→反→正→反），每段 50-80字（约15秒口播），收尾段 30-50字 |
| 4 | 导师配置 | 4 位导师固定在场（薛兆丰、刘擎、蔡康永、李诞），**无需用户选择** |
| 5 | 导师立场 | 每场辩论开始时自动分配 stance（pro/con），导师按立场发言 |
| 6 | 导师插话 | 5 处，30-60 字短评，4 位导师轮换，按各自立场发言 |
| 7 | 策略数量 | 5 个：回避问题、直面反击、挑出对方的问题、幽默化解、升华价值 |
| 8 | 策略选择方式 | 用户手动选。每段开杠前选扮演方，每轮到扮演方发言时选策略 |
| 9 | 超时未选 | 10 秒自动随机选 |
| 10 | 不选扮演方 | 全自动，向后兼容 |

---

## 二、完整辩论流程（40 步）

### 2.1 步骤列表

```
┌─────────────────────────────────────────────────────┐
│  开场 & 初投 (2步)                                   │
├─────────────────────────────────────────────────────┤
│  0  host_opening        主持人开场                    │
│  1  vote_init           初投                          │
├─────────────────────────────────────────────────────┤
│  一辩环节 (12步)                                     │
├─────────────────────────────────────────────────────┤
│  2  host_intro_p1       主持人介绍正方一辩             │
│  3  pro_first           正方一辩立论 (300-400字)      │
│  4  con_first           反方一辩立论 (300-400字)      │
│  5  mentor_comment_p1   导师插话 (30-60字, 薛兆丰)    │
│                                                        │
│  6  host_battle_p1      主持人引导一辩开杠             │
│  7  battle_p1_pro①      正方一辩开杠 (50-80字)        │
│  8  battle_p1_con①      反方一辩开杠 (50-80字)        │
│  9  battle_p1_pro②      正方一辩开杠 (50-80字)        │
│ 10  battle_p1_con②      反方一辩开杠 (50-80字)        │
│ 11  battle_p1_pro③      正方一辩收尾 (30-50字)        │
│ 12  battle_p1_con③      反方一辩收尾 (30-50字)        │
│ 13  mentor_comment_bp1  导师插话 (30-60字, 李诞)     │
├─────────────────────────────────────────────────────┤
│  二辩环节 (4步)                                      │
├─────────────────────────────────────────────────────┤
│ 14  host_intro_p2       主持人介绍正方二辩             │
│ 15  pro_second          正方二辩发言 (300-400字)      │
│ 16  con_second          反方二辩发言 (300-400字)      │
│ 17  mentor_comment_p2   导师插话 (30-60字, 蔡康永)    │
├─────────────────────────────────────────────────────┤
│  三辩环节 (12步)                                     │
├─────────────────────────────────────────────────────┤
│ 18  host_intro_p3       主持人介绍正方三辩             │
│ 19  pro_third           正方三辩发言 (300-400字)      │
│ 20  con_third           反方三辩发言 (300-400字)      │
│ 21  mentor_comment_p3   导师插话 (30-60字, 刘擎)     │
│                                                        │
│ 22  host_battle_p3      主持人引导三辩开杠             │
│ 23  battle_p3_pro①      正方三辩开杠 (50-80字)        │
│ 24  battle_p3_con①      反方三辩开杠 (50-80字)        │
│ 25  battle_p3_pro②      正方三辩开杠 (50-80字)        │
│ 26  battle_p3_con②      反方三辩开杠 (50-80字)        │
│ 27  battle_p3_pro③      正方三辩收尾 (30-50字)        │
│ 28  battle_p3_con③      反方三辩收尾 (30-50字)        │
│ 29  mentor_comment_bp3  导师插话 (30-60字, 随机)     │
├─────────────────────────────────────────────────────┤
│  结尾 (10步)                                         │
├─────────────────────────────────────────────────────┤
│ 30  host_closing         主持人引导结辩                 │
│ 31  con_closing          反方结辩 (200-300字)          │
│ 32  pro_closing          正方结辩 (200-300字)          │
│ 33  host_final_vote      主持人引导终投                 │
│ 34  vote_final           终投                          │
│ 35  host_mentors         主持人邀请导师正式点评         │
│ 36  mentor_1             导师正式点评 (150-300字)       │
│ 37  mentor_2             导师正式点评 (150-300字)       │
├─────────────────────────────────────────────────────┤
│  异常：加赛（跑票为 0 时触发）                         │
└─────────────────────────────────────────────────────┘
```
> 注：步数编号仅作参考，实际 FLOW 数组索引从 0 开始。

### 2.2 与现在的对比

```
现在（33步）：    
  6人发言(正→反→正→反→正→反) → 开杠(6轮,仅三辩) → 结辩 → 终投 → 导师点评(2人)

改造后（40步）：
  一辩(正→反) → 导师插话 → 一辩开杠(3轮×2人) → 导师插话
  → 二辩(正→反) → 导师插话
  → 三辩(正→反) → 导师插话 → 三辩开杠(3轮×2人) → 导师插话
  → 结辩 → 终投 → 导师正式点评(2人)
```

---

## 三、开杠计时机制

### 3.1 真实规则 vs. LLM 模拟

| 项目 | 真实奇葩说 | 本系统模拟方式 |
|------|-----------|---------------|
| 计时方式 | 每方 45 秒总计时，推杆交替 | 用字数模拟时长 |
| 发言次数 | 不限次数，自由交替 | 固定 3 轮交替（正→反→正→反→正→反） |
| 每段时长 | 辩手自由控制 | 前 2 轮各 50-80 字，收尾轮 30-50 字 |
| 总计字数 | ~150-200字/方 | ~150-200字/方 |
| 结束条件 | 计时用完 | 3 轮完成后自动结束 |

### 3.2 字数-时长换算

- 中文辩论语速：~200-250字/分钟（含停顿、思考、推杆动作）
- 45 秒 ≈ 150-180 字
- 50-80 字 ≈ 12-20 秒口播
- 30-50 字 ≈ 8-12 秒口播（时间将尽时）

### 3.3 开杠发言人逻辑

原来的 battle 发言者固定找三辩。改造后要根据步骤名判断是谁发言：

| 步骤名模式 | 发言者位置 |
|-----------|-----------|
| `battle_p1_*` | assignedPosition === 'first' |
| `battle_p3_*` | assignedPosition === 'third' |

---

## 四、导师插话机制

### 4.1 插话位置（5 处）

| 步骤名 | 时机 | 字数 | 指派导师 |
|--------|------|------|---------|
| mentor_comment_p1 | 一辩对战结束、开杠之前 | 30-60 字 | 薛兆丰 |
| mentor_comment_bp1 | 一辩开杠结束 | 30-60 字 | 李诞 |
| mentor_comment_p2 | 二辩对战结束 | 30-60 字 | 蔡康永 |
| mentor_comment_p3 | 三辩对战结束、开杠之前 | 30-60 字 | 刘擎 |
| mentor_comment_bp3 | 三辩开杠结束 | 30-60 字 | 随机从4人中选 |

### 4.2 与正式导师点评的区别

| 项目 | 导师插话 (mentor_comment) | 导师正式点评 (mentor) |
|------|--------------------------|----------------------|
| 时机 | 每段对战/开杠后 | 全场比赛结束后 |
| 字数 | 30-60 字，一句话 | 150-300 字 |
| 深度 | 灵光一闪，即兴感 | 完整评述，有准备感 |
| 风格 | 轻快、简短、像插嘴 | 深度、展开、像总结 |
| Prompt | "用一两句话简短点评" | "深度分析，价值升华" |

### 4.3 新增步骤类型

在 `flowDefinition.js` 的 FLOW 数组中，新增步骤类型 `type: 'mentor_comment'`。

对应的步骤对象结构：
```javascript
{ step: 'mentor_comment_p1', type: 'mentor_comment', mentorIdx: 0 }
```

---

## 五、导师立场机制

### 5.1 为什么导师需要有立场

在传统辩论节目中，导师有自己的观点和倾向。薛兆丰从经济学出发，蔡康永从人文关怀出发，刘擎从哲学思辨出发，李诞从解构幽默出发——同一个辩题，四位导师可能站不同立场。

改造后：
- **不再让导师"不站队"**——每位导师在每场辩论中会获得一个 stance（支持正方或反方）
- **导师插话和最终点评都按立场说话**——让导师的发言有方向、有个性
- **导师之间可能有观点碰撞**——增强节目效果

### 5.2 立场分配方式

在 Session 创建时（`createSession()`）自动分配。逻辑如下：

```javascript
// createSession 中，在确定了辩题之后
function assignMentorStances(topic, mentors) {
  // 简单版本：随机分配，确保 2 正方 2 反方
  const stances = ['pro', 'pro', 'con', 'con'];
  // 洗牌后分配给 4 位导师
  shuffle(stances);
  return mentors.map((m, i) => ({
    ...m,
    stance: stances[i]  // 'pro' 或 'con'
  }));
}
```

也可以扩展为"根据导师风格倾向 + 辩题内容智能分配"（V2 优化项）。

### 5.3 Session 数据结构变更

```javascript
// session 新增字段
mentorStances: {
  xuezhaofeng: 'pro',   // 薛兆丰本场支持正方
  liuqin: 'con',        // 刘擎本场支持反方
  caikangyong: 'con',   // 蔡康永本场支持反方
  lidan: 'pro'          // 李诞本场支持正方
}
```

### 5.4 Prompt 变更

**导师插话 Prompt** — 注入立场：
```
你是薛兆丰，经济学教授。
你目前持【正方】立场——即你认为"结婚应该买房"。
请从你的经济学视角，用一两句话（30-60字）点评刚才一辩的对战。
```

**导师最终点评 Prompt** — 同样注入立场：
```
你是蔡康永。
你目前持【反方】立场。
请从你的温柔人文视角，深度点评这场比赛（150-300字）。
```

### 5.5 前端配置页变更

去掉导师选择下拉框，改为固定显示 4 位导师都在场：

```html
<!-- 原来 -->
<div class="host-group">
  <label>导师</label>
  <select id="mentorSelect"></select>
</div>

<!-- 改为 -->
<div class="host-group">
  <label>导师（固定）</label>
  <div class="mentor-fixed-list">
    <span>🧑‍🏫 薛兆丰</span>
    <span>🧑‍🏫 刘擎</span>
    <span>🎩 蔡康永</span>
    <span>🤡 李诞</span>
  </div>
</div>
```

`getCurrentConfigFromSelects()` 函数不再读取导师选择，改为返回全部 4 位导师。

---

## 五、策略选择机制

### 5.1 交互流程

```
开杠环节开始（host_battle_p1 或 host_battle_p3）
  → 前端弹出"选择扮演方"面板
     ├── [扮演正方]   该段正方的 3 轮开杠让你选策略
     ├── [扮演反方]   该段反方的 3 轮开杠让你选策略
     └── [跳过]       全自动播放

  → 如果是扮演方发言：
     前端弹出策略选择面板（5 个按钮 + 倒计时 10 秒）
     用户点击 → POST /api/session/:id/battle/strategy
     后端按策略生成 → 打字机播放
     10 秒未选 → 自动随机选一个

  → 如果非扮演方发言：
     全自动 LLM 生成

  → 重复上述，直到该段开杠结束
```

### 5.2 5 个策略的 Prompt 指令

在 `agentEngine.js` 中，每个策略对应一段 Prompt 指令（完整的策略数据在 `data/battle_strategies.json` 中）：

| # | 策略 | Prompt 指令 |
|---|------|-------------|
| 1 | 回避问题 | "你选择了【回避问题】策略。不要直接回答对方的问题，转移话题到对方论证的薄弱环节，打乱对方节奏。" |
| 2 | 直面反击 | "你选择了【直面反击】策略。逐一反驳对方的核心论点，用逻辑和事实压制对方，语气坚决。" |
| 3 | 挑出对方的问题 | "你选择了【挑出对方的问题】策略。精准指出对方论证中的逻辑漏洞、前后矛盾或事实错误。" |
| 4 | 幽默化解 | "你选择了【幽默化解】策略。用幽默、调侃或自嘲的方式化解对方的攻击，让观众站在你这边。" |
| 5 | 升华价值 | "你选择了【升华价值】策略。跳出具体争论的细节，把话题拉到价值观或人生意义的层面进行回应。" |

### 5.3 向后兼容

用户两段都选"跳过" → 开杠完全自动，流程、LLM 调用、前端展示都和现在一样。

---

## 六、后端变更

### 6.1 flowDefinition.js — 完全重写 FLOW 数组

用新的 40 步流程替换原来的 33 步。新增步骤类型 `mentor_comment`。

新增 getter 函数：
```javascript
function isMentorCommentStep(step) { return step && step.type === 'mentor_comment'; }
```

### 6.2 sessionStore.js — Session 新增字段

```javascript
// 开杠扮演相关
battleController_p1: null,    // 一辩开杠：用户扮演方 "pro" / "con" / null
pendingStrategy_p1: null,     // 一辩开杠：等待的策略
battleController_p3: null,    // 三辩开杠
pendingStrategy_p3: null,
```

### 6.3 agentEngine.js — 变更清单

1. **改造 `buildBattlePrompt()`**：接收辩手对象（不固定三辩），根据 `flowStep.step` 前缀找对应辩手（p1→first, p3→third）
2. **新增 `buildBattleWithStrategyPrompt()`**：在 battle prompt 基础上追加策略指令
3. **新增 `buildMentorCommentPrompt()`**：短评版，30-60 字
4. **输出验证更新**：新增 `mentor_comment` 类型的长度验证（min:20, max:100）

### 6.4 server.js — 变更清单

1. `executeNextStep` 函数新增两个分支：
   - **`type === 'mentor_comment'`**：随机选一个导师，调用 `buildMentorCommentPrompt()` 生成短评，写入 memory
   - **`type === 'battle'` 改造**：判断是否是用户扮演方 + 是否需要策略选择等待
2. 新增 2 个 API 路由：

**`POST /api/session/:id/battle/select-side`**
```json
// 请求
{ "phase": "p1", "side": "pro" }
// 响应
{ "code": 200, "data": { "controlledSide": "pro" }, "message": "ok" }
```

**`POST /api/session/:id/battle/strategy`**
```json
// 请求
{ "strategy": "直面反击" }
// 响应
{
  "code": 200,
  "data": {
    "step": "battle_p1_con",
    "type": "battle",
    "strategy": "直面反击",
    "content": "...",
    "speakerName": "陈铭",
    "flowProgress": { "current": 8, "total": 40 }
  },
  "message": "ok"
}
```

3. `/next` 返回增加 `awaiting_strategy` 状态：

```json
{
  "step": "battle_p1_con",
  "type": "battle",
  "status": "awaiting_strategy",
  "side": "con",
  "round": 2,
  "speakerName": "詹青云",
  "lastOpponentSpeech": "对方上一轮发言摘要",
  "strategies": ["回避问题", "直面反击", "挑出对方的问题", "幽默化解", "升华价值"],
  "flowProgress": { "current": 8, "total": 40 }
}
```

### 6.5 开杠发言人逻辑

当前代码中 battle 发言者固定找三辩。改造后要根据 `flowStep.step` 来找：

```javascript
function getBattleSpeaker(session, flowStep) {
  const team = flowStep.side === 'pro' ? session.proTeam : session.conTeam;
  let position;
  if (flowStep.step.startsWith('battle_p1')) {
    position = 'first';  // 一辩开杠 → 一辩
  } else if (flowStep.step.startsWith('battle_p3')) {
    position = 'third';  // 三辩开杠 → 三辩
  }
  return position ? team.find(d => d.assignedPosition === position) : null;
}
```

---

## 七、前端变更

### 7.1 同步 FLOW

前端的 mock 数据和步骤判断需要同步更新新的 step 名称。具体位置：
- 前端的 `FLOW` mock 数组（用于离线调试）需要改为 40 步新流程
- 步骤渲染函数中新增 `mentor_comment` 类型处理
- battle 步骤的 UI 元素需要能适配不同辩位（原来只显示"正方三辩"）

### 7.2 新增 UI 组件

**组件1：扮演方选择面板**

在一辩开杠开始前（step 6 完成后）、三辩开杠开始前（step 22 完成后）弹出。

```
┌──────────────────────────────────────┐
│      ⚡ 开杠 · 选择你扮演的辩手       │
│                                      │
│   ┌────────────┐  ┌────────────┐     │
│   │  扮演正方    │  │  扮演反方    │     │
│   │  陈铭(一辩) │  │  肖骁(一辩) │     │
│   └────────────┘  └────────────┘     │
│                                      │
│   [ 跳过 — AI自动完成 ]               │
└──────────────────────────────────────┘
```

- 调用 `POST /api/session/:id/battle/select-side`
- 选择后遮罩消失，继续播放

**组件2：策略选择面板**

在轮到扮演方发言时弹出。

```
┌──────────────────────────────────────┐
│      🎯 轮到你了 · 选择策略           │
│                                      │
│  对方刚说：                          │
│  "买房就是买枷锁……"                   │
│                                      │
│  【回避问题】  转移话题，避其锋芒       │
│  【直面反击】  正面硬刚，逐条反驳       │
│  【挑出对方的问题】 指出逻辑漏洞         │
│  【幽默化解】  用幽默调侃化解           │
│  【升华价值】  拉到价值观层面           │
│                                      │
│  ▓▓▓▓▓▓▓░░░  10秒后自动选择          │
└──────────────────────────────────────┘
```

- 调用 `POST /api/session/:id/battle/strategy`
- 倒计时 10 秒，超时自动随机选
- 收到还击内容后遮罩消失，进入打字机播放

**组件3：导师插话卡片**

区别于正式点评，用小型卡片显示，标注"导师插话"。

```
┌─────────────────────┐
│ 💬 薛兆丰 插话        │
│                     │
│ "刚才一辩的攻防很有  │
│  意思，但我注意到一   │
│  个逻辑跳跃……"       │
└─────────────────────┘
```

### 7.3 playLoop 变更

```javascript
async function playLoop() {
  const data = await fetchNext();
  
  // 策略选择等待
  if (data.type === 'battle' && data.status === 'awaiting_strategy') {
    // 暂停自动播放
    showStrategyPanel(data);
    return;  // 等待用户交互
  }
  
  // 导师插话
  if (data.type === 'mentor_comment') {
    renderMentorComment(data);
    await typewriter(data.content);
    await delay(800);
    continuePlay();
    return;
  }
  
  // 正常渲染
  // ...
}
```

---

## 八、新增/修改文件清单

### 8.1 需新建的文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `data/battle_strategies.json` | 策略知识库，5个策略及其Prompt指令 | ✅ **已创建** |

### 8.2 需修改的文件

| 文件 | 变更内容 | 优先级 |
|------|---------|--------|
| `server/flowDefinition.js` | 完全重写 FLOW 数组：33步→40步 | 🔴 必须先做 |
| `server/sessionStore.js` | Session 新增 4 个字段 | 🔴 必须先做 |
| `server/agentEngine.js` | 新增 battle 策略 Prompt + 导师短评 Prompt | 🔴 必须先做 |
| `server/server.js` | 新增 2 个 API 路由 + executeNextStep 适配 | 🟡 第三步 |
| `index.html` | 同步 FLOW + 3 个新 UI 组件 | 🟡 第四步 |

---

## 九、执行顺序

```
第1步 → 改 flowDefinition.js（新 FLOW 数组）
第2步 → 改 sessionStore.js（新增字段） 
第3步 → 改 agentEngine.js（新增 Prompt 函数）
第4步 → 改 server.js（新增分支 + API）
第5步 → 改 index.html（新 UI + 同步）
第6步 → 联调测试
```

---

## 十、参考文件索引

| 文件 | 用途 | 必读程度 |
|------|------|---------|
| `data/battle_strategies.json` | 5个策略的完整数据 | 🔴 必读 |
| `docs/辩论方法论完整研究报告.md` | 辩论技巧的深度方法论参考 | 🟡 了解即可 |
| `.workbuddy/plans/stellar-nebula-newton.md` | 设计决策的完整记录 | 🟡 了解即可 |
