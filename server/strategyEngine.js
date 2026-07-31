/**
 * strategyEngine.js
 * AI奇葩说 - 策略推荐引擎
 * 基于当前语境（辩题、辩手风格、局势、对方发言）动态推荐最合适的开杠策略
 */

const agentEngine = require('./agentEngine');
const path = require('path');
const fs = require('fs');

// ===== 策略库加载 =====

/**
 * 加载完整策略库
 * @returns {Array} 策略对象数组
 */
function loadAllStrategies() {
  try {
    const filePath = path.join(__dirname, '..', 'data', 'battle_strategies.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[strategyEngine] 加载策略库失败:', err.message);
    return [];
  }
}

// ===== 推荐引擎 =====

/**
 * 格式化策略库为LLM可读文本
 * @param {Array} strategies - 策略对象数组
 * @returns {string} 格式化文本
 */
function formatStrategiesForPrompt(strategies) {
  return strategies.map((s, i) => {
    return `${i + 1}. 【${s.id}】${s.name}
  说明：${s.description}
  效果：${s.effect}
  适合辩手：${(s.suitableFor || []).join('、')}
  分类标签：${(s.tags || []).join('、')}
  适用时机：${s.timing || 'all'}`;
  }).join('\n\n');
}

/**
 * 获取对方上一轮开杠发言
 * @param {Object} session - Session对象
 * @returns {string|null} 发言内容
 */
function getLastOpponentBattleSpeech(session, currentSide) {
  const oppositeSide = currentSide === 'pro' ? 'con' : 'pro';
  const lastBattle = session.memory
    .filter(m => m.side === oppositeSide && m.type === 'battle')
    .pop();
  return lastBattle ? lastBattle.content : null;
}

/**
 * 推荐最佳策略（基于当前语境）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤（含battlePhase, battleTurn等）
 * @param {Object} debaterProfile - 当前发言辩手Profile
 * @param {number} n - 返回推荐数量，默认5
 * @returns {Promise<Array>} 推荐的策略对象数组 [{strategy, reason}, ...]
 */
async function recommendStrategies(session, flowStep, debaterProfile, n = 5) {
  // 1. 加载完整策略库
  const allStrategies = loadAllStrategies();
  if (!allStrategies || allStrategies.length === 0) {
    console.warn('[strategyEngine] 策略库为空');
    return [];
  }

  // 2. 收集语境信息
  const battlePhaseLabel = flowStep.battlePhase === 'p1' ? '一辩开杠' : '三辩开杠';
  const currentSide = flowStep.side || 'pro';
  const lastOpponentSpeech = getLastOpponentBattleSpeech(session, currentSide);

  // 初投结果
  const initVotes = session.votes?.init || {};
  const proCount = initVotes.proCount ?? '?';
  const conCount = initVotes.conCount ?? '?';

  // 辩手信息
  const debaterName = debaterProfile?.name || '未知辩手';
  const debaterLabel = debaterProfile?.label || '';
  const debaterPersona = debaterProfile?.persona || '';

  // 3. 构建推荐Prompt
  const formattedStrategies = formatStrategiesForPrompt(allStrategies);

  const systemPrompt = `你是一个专业的辩论策略顾问。你的任务是根据当前辩论的语境，从策略库中推荐最合适的策略。
请基于辩手风格、当前局势和对方发言，输出JSON格式的推荐结果。`;

  const userPrompt = `请为当前开杠环节推荐最合适的策略。

【辩题】${session.topicTitle || '未知辩题'}
【辩手】${debaterName}（${debaterLabel}）
【辩手风格】${debaterPersona}
【开杠阶段】${battlePhaseLabel}
【当前轮次】第${flowStep.battleTurn || 1}轮${flowStep.wordCount ? `（${flowStep.wordCount}字）` : ''}
【当前局势】正方 ${proCount} : ${conCount} 反方
${lastOpponentSpeech ? `【对方上一轮发言】"${lastOpponentSpeech}"` : '【对方上一轮发言】（暂无）'}

可用策略库：
${formattedStrategies}

要求：
1. 从以上策略中选择 ${n} 个最适合当前语境的策略
2. 考虑辩手风格、局势和对方发言
3. 返回JSON格式：{"recommendations":[{"id":"strategyId","reason":"推荐理由"}...]}
4. 推荐理由用中文，清晰简洁地说明为什么这个策略适合当前语境`;

  // 4. 调用DeepSeek API
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await agentEngine.callLLM(messages, 15000);

  if (!result.success) {
    console.warn(`[strategyEngine] LLM调用失败: ${result.error}，使用默认推荐`);
    return getDefaultRecommendations(allStrategies, debaterProfile, n);
  }

  // 5. 解析JSON结果
  try {
    const parsed = parseRecommendationResult(result.content, allStrategies, n);
    if (parsed && parsed.length > 0) {
      console.log(`[strategyEngine] LLM推荐了 ${parsed.length} 个策略`);
      return parsed;
    }
  } catch (err) {
    console.warn(`[strategyEngine] 解析推荐结果失败: ${err.message}`);
  }

  // 6. 降级：默认推荐
  console.warn('[strategyEngine] 降级到默认推荐');
  return getDefaultRecommendations(allStrategies, debaterProfile, n);
}

/**
 * 解析LLM返回的推荐结果
 * @param {string} content - LLM输出文本
 * @param {Array} allStrategies - 完整策略库
 * @param {number} n - 期望数量
 * @returns {Array} 推荐结果数组
 */
function parseRecommendationResult(content, allStrategies, n) {
  // 尝试提取JSON
  let jsonMatch = content.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
  if (!jsonMatch) {
    // 尝试找 [] 格式
    jsonMatch = content.match(/\[[\s\S]*"id"[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('未找到JSON格式的推荐结果');
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // 尝试修复常见JSON问题
    const cleaned = jsonMatch[0]
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(cleaned);
    } catch (e2) {
      throw new Error(`JSON解析失败: ${e2.message}`);
    }
  }

  // 提取推荐列表
  const recommendations = parsed.recommendations || parsed;
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    throw new Error('推荐列表为空');
  }

  // 映射到完整策略对象
  const strategyMap = {};
  allStrategies.forEach(s => { strategyMap[s.id] = s; });

  const result = [];
  for (const rec of recommendations) {
    const strategyId = rec.id || rec.strategyId;
    const reason = rec.reason || rec.recommendation || '';
    if (strategyId && strategyMap[strategyId]) {
      result.push({
        strategy: strategyMap[strategyId],
        reason: reason,
      });
    }
  }

  return result;
}

/**
 * 默认推荐（当LLM推荐失败时使用）
 * @param {Array} allStrategies - 完整策略库
 * @param {Object} debaterProfile - 辩手Profile
 * @param {number} n - 推荐数量
 * @returns {Array} 推荐结果数组
 */
function getDefaultRecommendations(allStrategies, debaterProfile, n) {
  const label = debaterProfile?.label || '';

  // 根据辩手风格匹配推荐策略
  const styleMap = {
    '逻辑型': ['confront', 'critique', 'strike-core', 'contradiction', 'follow-through'],
    '理性型': ['confront', 'critique', 'undermine', 'contradiction', 'strike-core'],
    '综艺型': ['humor', 'avoid', 'lure', 'counterforce', 'follow-through'],
    '煽情型': ['sublime', 'emotional', 'counterforce', 'clarify', 'confront'],
    '解构型': ['humor', 'follow-through', 'lure', 'substitute', 'counterforce'],
    '思想型': ['sublime', 'clarify', 'counterforce', 'confront', 'emotional'],
    '犀利型': ['strike-core', 'confront', 'critique', 'contradiction', 'undermine'],
  };

  const preferredIds = styleMap[label] || ['confront', 'critique', 'counterforce', 'humor', 'sublime'];

  // 按优先级排序
  const sorted = [];
  const added = new Set();

  // 先加偏好的
  for (const id of preferredIds) {
    const s = allStrategies.find(st => st.id === id);
    if (s && !added.has(id)) {
      sorted.push({ strategy: s, reason: `推荐给${label}型辩手使用的经典策略` });
      added.add(id);
      if (sorted.length >= n) break;
    }
  }

  // 如果还不够，补其他策略
  if (sorted.length < n) {
    for (const s of allStrategies) {
      if (!added.has(s.id)) {
        sorted.push({ strategy: s, reason: '备用推荐策略' });
        added.add(s.id);
        if (sorted.length >= n) break;
      }
    }
  }

  return sorted.slice(0, n);
}

module.exports = {
  recommendStrategies,
  loadAllStrategies,
};
