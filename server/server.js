/**
 * server.js
 * AI奇葩说 - 后端主入口
 * Express + DeepSeek API 驱动的全自动辩论节目引擎
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const flowDef = require('./flowDefinition');
const sessionStore = require('./sessionStore');
const agentEngine = require('./agentEngine');
const strategyEngine = require('./strategyEngine');
const viewerEngine = require('./viewerEngine');
const { generateSpeech } = require('./ttsEngine');
const hostTemplates = require('./hostTemplates');

const app = express();
app.use(cors());
app.use(express.json());

// === 健康检查 ===
app.get('/api/health', (req, res) => {
  res.json({ code: 200, data: { status: 'ok', service: 'ai-qipashuo' }, message: 'ok' });
});

// 根路径 → 前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 静态文件服务（放在API路由之后，避免覆盖API路由）
app.use(express.static(path.join(__dirname, '..')));

// 音频文件服务
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// === API 路由 ===

// POST /api/topic/validate — 校验自定义辩题的可辩论性
app.post('/api/topic/validate', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ code: 400, data: null, message: '辩题不能为空' });
    }

    const result = await agentEngine.evaluateTopic(topic.trim());

    if (result.verdict === 'reject' && !result.success) {
      // evaluateTopic 返回 success=false 只在"辩题为空"时出现，已被上面拦截
      return res.status(500).json({ code: 500, data: null, message: result.error || '校验失败' });
    }

    res.json({
      code: 200,
      data: {
        verdict: result.verdict,
        reason: result.reason || '',
        proPosition: result.proPosition || '',
        conPosition: result.conPosition || '',
        debateability: result.debateability || 0.5,
        degraded: result.degraded || false,
      },
      message: 'ok',
    });
  } catch (err) {
    // 任何未预料的错误 → 降级：跳过校验
    console.error('[server] 辩题校验异常:', err.message);
    res.json({
      code: 200,
      data: {
        verdict: 'ok',
        reason: '（校验服务异常，已跳过校验）',
        proPosition: '',
        conPosition: '',
        debateability: 0.5,
        degraded: true,
      },
      message: 'ok',
    });
  }
});

// POST /api/session/start — 创建辩论Session
app.post('/api/session/start', async (req, res) => {
  try {
    const { pro, con, topicIndex, customTopic, voiceEnabled, topicPosition } = req.body;
    if (!pro || !con || !Array.isArray(pro) || !Array.isArray(con) || pro.length !== 3 || con.length !== 3) {
      return res.status(400).json({ code: 400, data: null, message: '需要pro和con各3个辩手ID' });
    }
    const sessionId = sessionStore.createSession(topicIndex, pro, con, customTopic, topicPosition);
    // 存储语音开关状态（?z模式）
    const session = sessionStore.getSession(sessionId);
    // 语音开关：默认关闭，仅 ?z 模式开启
    if (session) session.voiceEnabled = voiceEnabled === true;
    res.json({ code: 200, data: { sessionId }, message: 'ok' });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// GET /api/session/:id/state — 获取Session状态
app.get('/api/session/:id/state', (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }
    const step = flowDef.getStep(session.currentStepIdx);
    res.json({
      code: 200,
      data: {
        sessionId: session.id,
        topicTitle: session.topicTitle,
        proTeam: session.proTeam.map(d => ({ id: d.id, name: d.name, label: d.label, assignedPosition: d.assignedPosition })),
        conTeam: session.conTeam.map(d => ({ id: d.id, name: d.name, label: d.label, assignedPosition: d.assignedPosition })),
        audience: (session.selectedAudience || []).map(v => ({ id: v.id, label: v.label, name: v.name || null })),
        status: session.status,
        currentStepIdx: session.currentStepIdx,
        currentStepName: step ? step.step : null,
        memoryLength: session.memory.length,
        overtimeRounds: session.overtimeRounds,
        latestReactions: session.latestReactions || null,
      },
      message: 'ok',
    });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// GET /api/session/:id/next — 执行下一步
app.get('/api/session/:id/next', async (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }

    // 检查是否已完成
    if (session.status === 'SUCCESS' || session.status === 'ABORTED') {
      return res.json({ code: 200, data: { done: true, status: session.status }, message: 'ok' });
    }

    const result = await executeNextStep(session);
    res.json({ code: 200, data: result, message: 'ok' });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// GET /api/session/:id/full — 获取完整Session数据
app.get('/api/session/:id/full', (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }
    res.json({ code: 200, data: { session }, message: 'ok' });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// POST /api/session/:id/battle/select-side — 选择扮演方
app.post('/api/session/:id/battle/select-side', (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }

    const { battlePhase, side } = req.body; // battlePhase: 'p1' | 'p3', side: 'pro' | 'con' | null
    if (battlePhase !== 'p1' && battlePhase !== 'p3') {
      return res.status(400).json({ code: 400, data: null, message: 'battlePhase must be p1 or p3' });
    }

    if (!session.battleController) {
      return res.status(400).json({ code: 400, data: null, message: 'battleController not initialized' });
    }

    session.battleController[battlePhase].selectedSide = side || null;
    if (side) {
      session.battleController[battlePhase].playingSide = side;
    }

    console.log(`[server] 用户选择扮演方: phase=${battlePhase}, side=${side || '跳过'}`);
    res.json({ code: 200, data: { battlePhase, selectedSide: side || null }, message: 'ok' });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// POST /api/session/:id/battle/strategy — 提交策略
app.post('/api/session/:id/battle/strategy', (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }

    const { battlePhase, turn, strategyId } = req.body;
    if (battlePhase !== 'p1' && battlePhase !== 'p3') {
      return res.status(400).json({ code: 400, data: null, message: 'battlePhase must be p1 or p3' });
    }

    if (!session.battleController) {
      return res.status(400).json({ code: 400, data: null, message: 'battleController not initialized' });
    }

    // 验证策略ID是否存在
    const strategies = sessionStore.getAllStrategies();
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) {
      return res.status(400).json({ code: 400, data: null, message: `策略不存在: ${strategyId}` });
    }

    session.battleController[battlePhase].strategies[String(turn)] = strategyId;
    console.log(`[server] 用户选择策略: phase=${battlePhase}, turn=${turn}, strategy=${strategyId}`);

    res.json({ code: 200, data: { battlePhase, turn, strategyId }, message: 'ok' });
  } catch (err) {
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// GET /api/session/:id/battle/recommend-strategies — 获取推荐策略
app.get('/api/session/:id/battle/recommend-strategies', async (req, res) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    }

    const { phase, turn } = req.query; // phase: p1/p3, turn: 1/2/3
    if (phase !== 'p1' && phase !== 'p3') {
      return res.status(400).json({ code: 400, data: null, message: 'phase must be p1 or p3' });
    }

    // 确定当前发言辩手的信息
    const position = phase === 'p1' ? 'first' : 'third';
    let currentSide = null;
    let debater = null;

    // 从battleController获取用户选择的扮演方
    const bc = session.battleController;
    if (bc && bc[phase]) {
      currentSide = bc[phase].selectedSide;
    }

    // 如果用户选择了方，用该方的辩手；否则尝试双方都推荐
    if (currentSide) {
      const team = currentSide === 'pro' ? session.proTeam : session.conTeam;
      debater = team.find(d => d.assignedPosition === position) || null;
    }

    // 如果找不到指定辩手，用正方对应位置辩手（兜底）
    if (!debater) {
      debater = session.proTeam.find(d => d.assignedPosition === position) || null;
    }

    // 构建flowStep对象
    const turnNum = parseInt(turn) || 1;
    const flowStep = {
      type: 'battle',
      battlePhase: phase,
      battleTurn: turnNum,
      position: position,
      side: currentSide || 'pro',
      wordCount: turnNum <= 2 ? '50-80' : '30-60',
    };

    // 调用策略推荐引擎
    const recommendations = await strategyEngine.recommendStrategies(session, flowStep, debater, 5);

    // 格式化返回
    const strategies = recommendations.map(r => ({
      id: r.strategy.id,
      name: r.strategy.name,
      description: r.strategy.description,
      effect: r.strategy.effect,
      reason: r.reason,
      tags: r.strategy.tags || [],
    }));

    res.json({
      code: 200,
      data: { strategies },
      message: 'ok',
    });
  } catch (err) {
    console.error('[server] recommend-strategies 错误:', err.message);
    res.status(500).json({ code: 500, data: null, message: err.message });
  }
});

// === 核心执行函数 ===
let consecutiveSpeechFailures = 0;
let deepSeek5xxCount = 0;

/**
 * 根据投票记录判断"落后方"（票数少的一方）
 * @param {Object|null} voteRecord - 投票记录 { proCount, conCount }
 * @returns {string} 'pro' | 'con'（平局默认正方）
 */
function getVoteLoserSide(voteRecord) {
  if (!voteRecord) return 'pro'; // 默认正方先
  const pro = voteRecord.proCount || 0;
  const con = voteRecord.conCount || 0;
  if (pro < con) return 'pro';   // 正方票少，正方先
  if (con < pro) return 'con';   // 反方票少，反方先
  return 'pro';                  // 平局，正方先
}

/**
 * 获取开杠环节应参考的投票记录
 * - p1 一辩开杠：延续一辩立论（初投票少方先）
 * - p3 三辩开杠：当前落后方先（参考最近一次投票 mid_p2 → mid_p1 → init）
 * @param {Object} session - Session对象
 * @param {string} battlePhase - 'p1' | 'p3'
 * @returns {Object|null} 投票记录
 */
function getBattleReferenceVote(session, battlePhase) {
  if (battlePhase === 'p1') {
    return session.votes?.init || null;
  }
  if (battlePhase === 'p3') {
    return session.votes?.mid_p2 || session.votes?.mid_p1 || session.votes?.init || null;
  }
  return session.votes?.init || null;
}

/**
 * 根据投票结果生成开杠发言顺序（落后方先发言）
 * @param {Object} session - Session对象
 * @param {string} battlePhase - 'p1' | 'p3'
 */
function generateBattleOrder(session, battlePhase) {
  if (!session.battleController || !session.battleController[battlePhase]) return;

  const referenceVote = getBattleReferenceVote(session, battlePhase);
  const firstSide = getVoteLoserSide(referenceVote);
  const secondSide = firstSide === 'pro' ? 'con' : 'pro';
  session.battleController[battlePhase].battleOrder = [
    firstSide, secondSide, firstSide, secondSide, firstSide, secondSide
  ];

  console.log(`[server] 开杠顺序生成(phase=${battlePhase}): ${session.battleController[battlePhase].battleOrder.join(' → ')} (落后方先)`);
}

/**
 * 获取导师插话的轮换名称
 * @param {string} phase - 插话阶段
 * @returns {string} 导师名字
 */
function getMentorCommentSpeakerName(phase, mentors) {
  if (!mentors || mentors.length === 0) return '导师';

  const mentorNameMap = {
    'p1': 0,   // 薛兆丰
    'bp1': 3,  // 李诞
    'p2': 2,   // 蔡康永
    'p3': 1,   // 刘擎
  };

  if (phase === 'bp3') {
    // 随机
    const idx = Math.floor(Math.random() * mentors.length);
    return mentors[idx]?.name || '导师';
  }

  const idx = mentorNameMap[phase];
  if (idx !== undefined && mentors[idx]) {
    return mentors[idx].name;
  }

  return mentors[0]?.name || '导师';
}

/**
 * 根据初投结果动态重排 battle 步骤的 side
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} session - Session对象
 * @returns {Object} 重排后的 flowStep
 */
function reorderBattleStep(flowStep, session) {
  if (flowStep.type !== 'battle') return flowStep;

  const battlePhase = flowStep.battlePhase;
  if (!battlePhase) return flowStep;

  // 确保 battleOrder 已经生成
  if (!session.battleController[battlePhase] || !session.battleController[battlePhase].battleOrder) {
    generateBattleOrder(session, battlePhase);
  }

  const battleOrder = session.battleController[battlePhase].battleOrder;
  const battleIdx = flowDef.getFlow().filter(s => s.type === 'battle' && s.battlePhase === battlePhase).findIndex(
    s => s.step === flowStep.step
  );

  if (battleIdx >= 0 && battleIdx < battleOrder.length) {
    const reorderedStep = { ...flowStep };
    reorderedStep.side = battleOrder[battleIdx];
    return reorderedStep;
  }

  return flowStep;
}

/**
 * 获取一辩立论先发言方（初投票少方，平局正方）
 * @param {Object} session - Session对象
 * @returns {string} 'pro' | 'con'
 */
function getFirstSpeechSide(session) {
  return getVoteLoserSide(session.votes?.init);
}

/**
 * 获取某辩位立论的发言顺序
 * - first: [先发方, 后发方]（初投票少方先）
 * - second: 与 first 相反（交替轮换）
 * - third: 与 first 相同（回到一辩顺序）
 * @param {Object} session - Session对象
 * @param {string} position - 'first' | 'second' | 'third'
 * @returns {string[]} [先发方, 后发方]
 */
function getSpeechOrderForPosition(session, position) {
  const firstSide = getFirstSpeechSide(session);
  const otherSide = firstSide === 'pro' ? 'con' : 'pro';
  if (position === 'second') return [otherSide, firstSide];
  return [firstSide, otherSide];
}

/**
 * 获取结辩顺序（"先发后结"：先立论方后结辩，压轴）
 * @param {Object} session - Session对象
 * @returns {string[]} [先结辩方, 后结辩方]
 */
function getClosingOrder(session) {
  const firstSpeechSide = getFirstSpeechSide(session);
  return firstSpeechSide === 'pro' ? ['con', 'pro'] : ['pro', 'con'];
}

/**
 * 获取侧别中文标签
 * @param {string} side - 'pro' | 'con'
 * @returns {string} '正方' | '反方'
 */
function getSideLabel(side) {
  return side === 'pro' ? '正方' : '反方';
}

/**
 * 按侧别与辩位查找辩手名字（去掉"风格"风格后缀）
 * @param {Object} session - Session对象
 * @param {string} side - 'pro' | 'con'
 * @param {string} position - 'first' | 'second' | 'third'
 * @returns {string|null} 辩手名字
 */
function getDebaterNameBySide(session, side, position) {
  const team = side === 'pro' ? session.proTeam : session.conTeam;
  const debater = team.find(d => d.assignedPosition === position);
  if (!debater) return null;
  return debater.name.replace('风格', '');
}

/**
 * 动态重排 speech 步骤的 side（票少方先 / 交替轮换）
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} session - Session对象
 * @returns {Object} 重排后的 flowStep
 */
function reorderSpeechStep(flowStep, session) {
  if (flowStep.type !== 'speech') return flowStep;

  const position = flowStep.position;
  const order = getSpeechOrderForPosition(session, position);
  const speechSteps = flowDef.getFlow().filter(s => s.type === 'speech' && s.position === position);
  const nominalIdx = speechSteps.findIndex(s => s.step === flowStep.step);
  if (nominalIdx < 0) return flowStep;

  const actualSide = order[nominalIdx % order.length];
  if (actualSide === flowStep.side) return flowStep;

  const reordered = { ...flowStep };
  reordered.side = actualSide;
  reordered.step = (actualSide === 'pro' ? 'pro_' : 'con_') + position;
  return reordered;
}

/**
 * 动态重排 closing 步骤的 side（"先发后结"：先立论方压轴）
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} session - Session对象
 * @returns {Object} 重排后的 flowStep
 */
function reorderClosingStep(flowStep, session) {
  if (flowStep.type !== 'closing') return flowStep;

  const closingOrder = getClosingOrder(session);
  const closingSteps = flowDef.getFlow().filter(s => s.type === 'closing');
  const nominalIdx = closingSteps.findIndex(s => s.step === flowStep.step);
  if (nominalIdx < 0) return flowStep;

  const actualSide = closingOrder[nominalIdx % closingOrder.length];
  if (actualSide === flowStep.side) return flowStep;

  const reordered = { ...flowStep };
  reordered.side = actualSide;
  reordered.step = actualSide === 'pro' ? 'pro_closing' : 'con_closing';
  return reordered;
}

/**
 * 生成 host_template 步骤的主持人串词（零 LLM）
 * 根据当前环节的动态发言顺序解析辩手名字，再从模板库随机抽取话术
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤（含 template / position / slot / round）
 * @returns {string} 主持人串词
 */
function getHostTemplateContent(session, flowStep) {
  const tmpl = flowStep.template;
  const pick = (...args) => hostTemplates.pickTemplate(tmpl, ...args);

  switch (tmpl) {
    // 辩位发言介绍：顺序动态，slot 0 = 该环节先发方，slot 1 = 后发方
    case 'intro_first':
    case 'intro_second':
    case 'intro_third': {
      const position = flowStep.position || 'first';
      const order = getSpeechOrderForPosition(session, position);
      const slot = flowStep.slot || 0;
      const side = order[slot % order.length] || order[0];
      const posLabel = position === 'first' ? '一辩' : position === 'second' ? '二辩' : '三辩';
      const name = getDebaterNameBySide(session, side, position) || (getSideLabel(side) + posLabel);
      return pick(getSideLabel(side), name);
    }

    // 环节内换人发言：动态传入后发方
    case 'turn_speech': {
      const position = flowStep.position || 'first';
      const order = getSpeechOrderForPosition(session, position);
      const slot = flowStep.slot || 1;
      const side = order[slot % order.length] || order[1];
      const name = getDebaterNameBySide(session, side, position) || (getSideLabel(side) + '辩手');
      return pick(getSideLabel(side), name);
    }

    // 环节过渡（进入第2、3环节）
    case 'transition_round':
      return pick(flowStep.round || '二');

    // 开杠开始：无需参数
    case 'battle_start':
      return pick();

    // 结辩引导：先结辩方
    case 'closing_intro': {
      const side = getClosingOrder(session)[0];
      const name = getDebaterNameBySide(session, side, 'third') || (getSideLabel(side) + '三辩');
      return pick(getSideLabel(side), name);
    }

    // 结辩过渡：压轴结辩方
    case 'closing_continue': {
      const side = getClosingOrder(session)[1];
      const name = getDebaterNameBySide(session, side, 'third') || (getSideLabel(side) + '三辩');
      return pick(getSideLabel(side), name);
    }

    // 投票引导 / 终投引导：无需参数
    case 'vote_call':
      return pick();
    case 'final_vote':
      return pick();

    // 向后兼容旧模板（transition_to_con / transition_to_pro，只传名字）
    case 'transition_to_con': {
      const position = flowStep.position || 'first';
      const name = getDebaterNameBySide(session, 'con', position) || '反方辩手';
      return pick(name);
    }
    case 'transition_to_pro': {
      const position = flowStep.position || 'third';
      const name = getDebaterNameBySide(session, 'pro', position) || '正方辩手';
      return pick(name);
    }

    default:
      return '好，请继续。';
  }
}

/**
 * 执行辩论的下一步
 * @param {Object} session - Session对象
 * @returns {Promise<Object>} 执行结果
 */
async function executeNextStep(session) {
  // 检查是否已完成所有流程步骤
  if (session.currentStepIdx >= flowDef.getFlowLength()) {
    // FLOW执行完毕，检查跑票情况
    const swingResult = viewerEngine.calculateSwing(session.votes?.init, session.votes?.final);

    if (session.votes?.final && swingResult?.swingCount === 0 && session.overtimeRounds < 1) {
      // 无人跑票，触发加赛开杠
      session.overtimeRounds++;
      console.log(`[server] 无人跑票！触发加赛开杠（第${session.overtimeRounds}轮）`);

      // 加赛开杠 - 正方三辩
      const overtimeStepPro = { step: 'battle_overtime_pro', type: 'battle', side: 'pro', round: 4, position: 'third' };
      const proDebater = session.proTeam.find(d => d.assignedPosition === 'third');
      const resultPro = await agentEngine.executeStep(session, overtimeStepPro);

      session.memory.push({
        step: 'battle_overtime_pro',
        type: 'battle',
        side: 'pro',
        speakerName: proDebater ? proDebater.name : '未知辩手',
        content: resultPro.content,
        attemptCount: resultPro.attemptCount,
        degraded: resultPro.degraded,
        timestamp: Date.now(),
      });

      // 加赛开杠 - 反方三辩
      const overtimeStepCon = { step: 'battle_overtime_con', type: 'battle', side: 'con', round: 4, position: 'third' };
      const conDebater = session.conTeam.find(d => d.assignedPosition === 'third');
      const resultCon = await agentEngine.executeStep(session, overtimeStepCon);

      session.memory.push({
        step: 'battle_overtime_con',
        type: 'battle',
        side: 'con',
        speakerName: conDebater ? conDebater.name : '未知辩手',
        content: resultCon.content,
        attemptCount: resultCon.attemptCount,
        degraded: resultCon.degraded,
        timestamp: Date.now(),
      });

      // 更新session
      sessionStore.updateSession(session.id, {
        memory: session.memory,
        overtimeRounds: session.overtimeRounds,
        currentStepIdx: flowDef.getFlowLength(), // 保持指向结束
      });

      return {
        step: 'overtime_battle',
        type: 'battle',
        content: '加赛开杠完成，请重新发起终投',
        overtimeRound: 1,
      };
    }

    // 正常结束
    session.status = 'SUCCESS';
    sessionStore.updateSession(session.id, { status: 'SUCCESS' });
    console.log(`[server] 辩论结束! 状态: SUCCESS`);
    return { done: true, status: 'SUCCESS' };
  }

  let flowStep = flowDef.getStep(session.currentStepIdx);
  console.log(`[server] 执行步骤 ${session.currentStepIdx + 1}/${flowDef.getFlowLength()}: ${flowStep.step} (${flowStep.type})`);

  // === 动态发言顺序（依据投票结果重排 side）===
  if (flowStep.type === 'speech') {
    flowStep = reorderSpeechStep(flowStep, session);
    console.log(`[server] 发言步骤重排后: side=${flowStep.side}, step=${flowStep.step}`);
  }

  // === 开杠步骤：根据动态顺序替换 side ===
  if (flowStep.type === 'battle') {
    flowStep = reorderBattleStep(flowStep, session);
    console.log(`[server] 开杠步骤重排后: side=${flowStep.side}`);
  }

  // === 结辩步骤：先发后结，动态替换 side ===
  if (flowStep.type === 'closing') {
    flowStep = reorderClosingStep(flowStep, session);
    console.log(`[server] 结辩步骤重排后: side=${flowStep.side}, step=${flowStep.step}`);
  }

  let result;

  if (flowStep.type === 'vote') {
    // === 投票步骤 ===

    // 初投可能已被 host_opening 后台触发，检查缓存
    let voteResult;
    if (flowStep.label === 'init' && session.votes?.init) {
      // 如果后台投票已完成，直接返回缓存结果
      voteResult = session.votes.init;
      console.log('[server] ✅ 使用缓存初投结果');
    } else if (flowStep.label === 'init' && session._pendingVotePromise) {
      // 后台投票还在进行，等待它完成
      console.log('[server] ⏳ 等待后台初投完成...');
      voteResult = await session._pendingVotePromise;
    } else {
      // 正常执行投票
      const audience = session.selectedAudience || sessionStore.getAllAudience();
      voteResult = await viewerEngine.executeVote(session, flowStep.label, audience);
    }

    if (!session.votes) session.votes = {};
    if (flowStep.label === 'init') session.votes.init = voteResult;
    else if (flowStep.label === 'final') session.votes.final = voteResult;
    else session.votes[flowStep.label] = voteResult; // mid_p1 / mid_p2 / mid_p3
    // 每次投票（初投/环节投/终投）都更新 latestReactions
    const reactions = {};
    (voteResult.details || []).forEach(v => { reactions[v.viewerId] = v.reaction || ''; });
    session.latestReactions = reactions;

    // 投票完成后生成/刷新开杠顺序
    // - 初投：确定一辩开杠顺序（延续票少方先）与三辩开杠兜底顺序
    // - mid_p2：三辩开杠前的最近一次投票，刷新三辩开杠顺序（当前落后方）
    if (flowStep.label === 'init') {
      generateBattleOrder(session, 'p1');
      generateBattleOrder(session, 'p3');
    }
    if (flowStep.label === 'mid_p2') {
      generateBattleOrder(session, 'p3');
    }

    const totalVotes = voteResult.proCount + voteResult.conCount;
    const proPct = totalVotes > 0 ? Math.round((voteResult.proCount / totalVotes) * 100) : 50;
    const conPct = totalVotes > 0 ? Math.round((voteResult.conCount / totalVotes) * 100) : 50;

    session.currentStepIdx++;
    sessionStore.updateSession(session.id, {
      votes: session.votes,
      currentStepIdx: session.currentStepIdx,
    });

    return {
      step: flowStep.step,
      type: 'vote',
      label: flowStep.label,
      pro: voteResult.proCount,
      con: voteResult.conCount,
      abstain: voteResult.abstainCount,
      pro_pct: proPct,
      con_pct: conPct,
      validCount: voteResult.validCount,
      details: voteResult.details || [],
      latestReactions: session.latestReactions || null,
      flowProgress: { current: session.currentStepIdx, total: flowDef.getFlowLength() },
    };
  }

  // === mentor_comment 步骤 ===
  if (flowStep.type === 'mentor_comment') {
    const mentors = sessionStore.getAllMentors();
    const mentorProfile = agentEngine.getMentorForComment(flowStep.phase, mentors);

    if (!mentorProfile) {
      console.warn(`[server] 未找到插话导师[phase=${flowStep.phase}]，使用占位`);
      result = { success: true, content: '（导师插话暂时无法获取）', attemptCount: 0, degraded: true };
    } else {
      result = await agentEngine.executeStep(session, flowStep, { mentorProfile });
    }

    // 获取导师名字和立场
    const mentorName = mentorProfile ? mentorProfile.name : '导师';
    const commentStance = session.mentorStances ? session.mentorStances[mentorProfile ? mentorProfile.id : ''] : null;

    // 写入memory
    session.memory.push({
      step: flowStep.step,
      type: flowStep.type,
      side: null,
      speakerName: mentorName,
      content: result.content,
      attemptCount: result.attemptCount,
      degraded: result.degraded,
      timestamp: Date.now(),
    });

    session.currentStepIdx++;
    sessionStore.updateSession(session.id, {
      memory: session.memory,
      currentStepIdx: session.currentStepIdx,
    });

    // TTS
    let audioUrl = null;
    if (session.voiceEnabled !== false && result && result.content) {
      try {
        const ttsResult = await generateSpeech(result.content, mentorName, flowStep.type, session.id, session.currentStepIdx);
        if (ttsResult.success) audioUrl = ttsResult.audioUrl;
      } catch (ttsErr) {
        console.error(`[server] ❌ TTS异常: ${mentorName} - ${ttsErr.message}`);
      }
    }

    return {
      step: flowStep.step,
      type: flowStep.type,
      content: result.content,
      side: null,
      speakerName: mentorName,
      stance: commentStance,
      audioUrl,
      flowProgress: { current: session.currentStepIdx, total: flowDef.getFlowLength() },
    };
  }

  // === host_template 步骤：机械模板串词，零 LLM 调用 ===
  if (flowStep.type === 'host_template') {
    const content = getHostTemplateContent(session, flowStep);

    if (!content) content = '好，请继续。';

    session.currentStepIdx++;
    sessionStore.updateSession(session.id, { currentStepIdx: session.currentStepIdx });

    return {
      step: flowStep.step,
      type: 'host_template',
      content,
      speakerName: '马东',
      flowProgress: { current: session.currentStepIdx, total: flowDef.getFlowLength() },
    };
  }

  // === 非投票、非mentor_comment、非host_template步骤：host/speech/battle/closing/mentor → agentEngine ===
  const extraOptions = {};

  // battle步骤：检查是否有策略
  if (flowStep.type === 'battle') {
    const battlePhase = flowStep.battlePhase;
    const battleTurn = flowStep.battleTurn;
    const bc = session.battleController;

    if (bc && bc[battlePhase]) {
      const selectedSide = bc[battlePhase].selectedSide;
      const strategies = bc[battlePhase].strategies;

      // 如果是扮演方，尝试注入策略
      if (selectedSide && selectedSide === flowStep.side) {
        const strategyId = strategies && strategies[String(battleTurn)];
        if (strategyId) {
          const allStrategies = sessionStore.getAllStrategies();
          const strategy = allStrategies.find(s => s.id === strategyId);
          if (strategy) {
            extraOptions.strategy = strategy;
            console.log(`[server] 注入策略: phase=${battlePhase}, turn=${battleTurn}, strategy=${strategy.name}`);
          }
        }
      }
    }
  }

  result = await agentEngine.executeStep(session, flowStep, extraOptions);

  // 自检：连续speech失败检查
  if (flowStep.type === 'speech' && !result.success) {
    consecutiveSpeechFailures++;
    if (consecutiveSpeechFailures >= 3) {
      session.status = 'ABORTED';
      sessionStore.updateSession(session.id, { status: 'ABORTED' });
      console.warn(`[server] 连续3个辩手发言失败，终止辩论`);
      return { done: true, status: 'ABORTED', reason: '连续3个辩手发言失败' };
    }
  } else if (flowStep.type !== 'speech') {
    // 非speech步骤重置计数器
    consecutiveSpeechFailures = Math.max(0, consecutiveSpeechFailures - 1);
  }

  // battle/closing降级失败 → 用占位文本继续，不终止辩论
  if ((flowStep.type === 'battle' || flowStep.type === 'closing') && !result.success && result.degraded) {
    console.warn(`[server] ${flowStep.type}步骤所有尝试失败，使用占位文本继续`);
    result.content = agentEngine.generateFallbackContent(flowStep, session);
    result.success = true;
    result.degraded = true;
  }

  // 确定发言人名字
  let speakerName = '';
  if (flowStep.type === 'host') {
    speakerName = '马东';
  } else if (flowStep.type === 'speech') {
    const debater = (flowStep.side === 'pro' ? session.proTeam : session.conTeam)
      .find(d => d.assignedPosition === flowStep.position);
    speakerName = debater ? debater.name : '未知辩手';
  } else if (flowStep.type === 'battle') {
    // battle根据 position 查找（一辩开杠查一辩，三辩开杠查三辩）
    const debater = (flowStep.side === 'pro' ? session.proTeam : session.conTeam)
      .find(d => d.assignedPosition === flowStep.position);
    speakerName = debater ? debater.name : '未知辩手';
  } else if (flowStep.type === 'closing') {
    const debater = (flowStep.side === 'pro' ? session.proTeam : session.conTeam)
      .find(d => d.assignedPosition === 'third');
    speakerName = debater ? debater.name : '未知辩手';
  } else if (flowStep.type === 'mentor') {
    const mentors = sessionStore.getAllMentors();
    const mentorForStep = mentors[flowStep.idx];
    speakerName = mentorForStep?.name || '导师';
    // 记录导师立场
    if (mentorForStep && session.mentorStances) {
      result._stance = session.mentorStances[mentorForStep.id] || null;
    }
  }

  // 写入memory
  session.memory.push({
    step: flowStep.step,
    type: flowStep.type,
    side: flowStep.side || null,
    speakerName,
    content: result.content,
    attemptCount: result.attemptCount,
    degraded: result.degraded,
    timestamp: Date.now(),
  });

  session.currentStepIdx++;
  sessionStore.updateSession(session.id, {
    memory: session.memory,
    currentStepIdx: session.currentStepIdx,
  });

  // === 并行触发：主持人开场时后台启动投票 ===
  if (flowStep.step === 'host_opening') {
    const voteAudience = session.selectedAudience || sessionStore.getAllAudience();
    console.log('[server] ⏳ 主持人开场中，后台启动初投...');
    // 存储 promise 供 vote_init 步骤 await
    session._pendingVotePromise = (async () => {
      try {
        const voteResult = await viewerEngine.executeVote(session, 'init', voteAudience);
        if (!session.votes) session.votes = {};
        session.votes.init = voteResult;
        // 缓存 reactions
        const reactions = {};
        (voteResult.details || []).forEach(v => { reactions[v.viewerId] = v.reaction || ''; });
        session.latestReactions = reactions;
        // 后台生成开杠顺序（等初投完了才能排）
        generateBattleOrder(session, 'p1');
        generateBattleOrder(session, 'p3');
        sessionStore.updateSession(session.id, { votes: session.votes, latestReactions: reactions, battleController: session.battleController });
        console.log(`[server] ✅ 后台初投完成: ${voteResult.proCount} vs ${voteResult.conCount}`);
        return voteResult;
      } catch (err) {
        console.error('[server] ❌ 后台初投失败:', err.message);
        throw err;
      }
    })();
  }

  // === TTS 语音生成（仅 ?z 模式下启用，非vote/done类型） ===
  let audioUrl = null;
  if (session.voiceEnabled !== false && result && result.content && flowStep.type !== 'vote' && flowStep.type !== 'done') {
    try {
      const ttsResult = await generateSpeech(
        result.content,
        speakerName,
        flowStep.type,
        session.id,
        session.currentStepIdx
      );
      if (ttsResult.success) {
        audioUrl = ttsResult.audioUrl;
        console.log(`[server] ✅ 语音就绪: ${speakerName} → ${audioUrl}`);
      } else {
        console.log(`[server] ⏭️ 语音跳过: ${speakerName} - ${ttsResult.error}`);
      }
    } catch (ttsErr) {
      console.error(`[server] ❌ TTS异常: ${speakerName} - ${ttsErr.message}`);
    }
  }

  const strategyName = (extraOptions && extraOptions.strategy) ? extraOptions.strategy.name : null;
  const returnStance = result._stance || null;

  return {
    step: flowStep.step,
    type: flowStep.type,
    content: result.content,
    side: flowStep.side || null,
    speakerName,
    stance: returnStance,
    audioUrl,
    degraded: result.degraded,
    attemptCount: result.attemptCount,
    strategyName,
    flowProgress: { current: session.currentStepIdx, total: flowDef.getFlowLength() },
  };
}

// === 启动 ===
sessionStore.loadAllData();
sessionStore.startCleanupTimer();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI奇葩说后端已启动: http://localhost:${PORT}`);
});

module.exports = app;
