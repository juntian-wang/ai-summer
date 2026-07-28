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
const viewerEngine = require('./viewerEngine');

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

// === API 路由 ===

// POST /api/session/start — 创建辩论Session
app.post('/api/session/start', async (req, res) => {
  try {
    const { pro, con, topicIndex, customTopic } = req.body;
    if (!pro || !con || !Array.isArray(pro) || !Array.isArray(con) || pro.length !== 3 || con.length !== 3) {
      return res.status(400).json({ code: 400, data: null, message: '需要pro和con各3个辩手ID' });
    }
    const sessionId = sessionStore.createSession(topicIndex, pro, con, customTopic);
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

// === 核心执行函数 ===
let consecutiveSpeechFailures = 0;
let deepSeek5xxCount = 0;

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
      const overtimeStepPro = { step: 'battle_overtime_pro', type: 'battle', side: 'pro', round: 4 };
      const lastConBattle = session.memory.filter(m => m.step === 'battle_r3_con').pop();
      const proDebater = session.proTeam.find(d => d.assignedPosition === 'third');
      const resultPro = await agentEngine.executeStep(session, overtimeStepPro, proDebater, lastConBattle?.content);

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
      const overtimeStepCon = { step: 'battle_overtime_con', type: 'battle', side: 'con', round: 4 };
      const conDebater = session.conTeam.find(d => d.assignedPosition === 'third');
      const resultCon = await agentEngine.executeStep(session, overtimeStepCon, conDebater, resultPro.content);

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

  const flowStep = flowDef.getStep(session.currentStepIdx);
  console.log(`[server] 执行步骤 ${session.currentStepIdx + 1}/${flowDef.getFlowLength()}: ${flowStep.step}`);

  let result;

  if (flowStep.type === 'vote') {
    // === 投票步骤 ===
    const audience = session.selectedAudience || sessionStore.getAllAudience();
    const voteResult = await viewerEngine.executeVote(session, flowStep.label, audience);

    if (!session.votes) session.votes = {};
    if (flowStep.label === 'init') session.votes.init = voteResult;
    else session.votes.final = voteResult;

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
      flowProgress: { current: session.currentStepIdx, total: flowDef.getFlowLength() },
    };
  }

  // === 非投票步骤：host/speech/battle/closing/mentor → agentEngine ===
  result = await agentEngine.executeStep(session, flowStep);

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

  // battle/closing降级失败 → ABORT
  if ((flowStep.type === 'battle' || flowStep.type === 'closing') && !result.success && result.degraded) {
    session.status = 'ABORTED';
    sessionStore.updateSession(session.id, { status: 'ABORTED' });
    console.warn(`[server] ${flowStep.type}步骤降级失败，终止辩论`);
    return { done: true, status: 'ABORTED', reason: `${flowStep.type}步骤降级失败` };
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
    const debater = (flowStep.side === 'pro' ? session.proTeam : session.conTeam)
      .find(d => d.assignedPosition === 'third');
    speakerName = debater ? debater.name : '未知辩手';
  } else if (flowStep.type === 'closing') {
    const debater = (flowStep.side === 'pro' ? session.proTeam : session.conTeam)
      .find(d => d.assignedPosition === 'third');
    speakerName = debater ? debater.name : '未知辩手';
  } else if (flowStep.type === 'mentor') {
    const mentors = sessionStore.getAllMentors();
    speakerName = mentors[flowStep.idx]?.name || '导师';
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

  return {
    step: flowStep.step,
    type: flowStep.type,
    content: result.content,
    side: flowStep.side || null,
    speakerName,
    degraded: result.degraded,
    attemptCount: result.attemptCount,
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
