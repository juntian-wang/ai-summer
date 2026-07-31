/**
 * viewerEngine.js
 * AI奇葩说 - 观众投票引擎
 * 30位AI观众投票 + 跑票统计 + 补票机制
 */

const agentEngine = require('./agentEngine');

// ===== 睡眠工具 =====

/**
 * 睡眠指定毫秒数
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 投票主入口 =====

/**
 * 执行投票
 * @param {Object} session - Session对象
 * @param {string} voteType - 投票类型 "init" | "final"
 * @param {Array} viewerProfiles - 观众Profile数组
 * @returns {Promise<Object>} VoteRecord
 */
async function executeVote(session, voteType, viewerProfiles) {
  const voteTypeLabel = voteType === 'init' ? '初投' : voteType === 'final' ? '终投' : `环节投票(${voteType})`;
  console.log(`[viewerEngine] 开始${voteTypeLabel}...`);

  // 分批并行投票
  const voteResult = await batchVote(viewerProfiles, session, voteType);

  // 检查有效票数，不足20补票
  if (voteResult.validCount < 20) {
    console.log(`[viewerEngine] 有效票数(${voteResult.validCount})不足20，启动补票机制`);
    const filled = fillDefaultVotes(voteResult, viewerProfiles, 20);
    return filled;
  }

  console.log(`[viewerEngine] ${voteTypeLabel}完成: 正方${voteResult.proCount}票, 反方${voteResult.conCount}票, 弃权${voteResult.abstainCount}票`);
  return voteResult;
}
/**
 * 分批并行投票（30人分6批，每批5人）
 * @param {Array} viewers - 观众Profile数组
 * @param {Object} session - Session对象
 * @param {string} voteType - 投票类型 "init" | "final"
 * @returns {Promise<Object>} VoteRecord
 */
async function batchVote(viewers, session, voteType) {
  const BATCH_SIZE = 5;
  const BATCH_INTERVAL_MS = 500;

  const details = [];
  const failedViewerIds = [];
  let proCount = 0;
  let conCount = 0;
  let abstainCount = 0;

  // 构建完整的辩论内容摘要（用于终投）
  let fullDebateSummary = '';
  if (voteType === 'final') {
    fullDebateSummary = session.memory
      .filter(m => m.type !== 'vote')
      .map(m => {
        const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
        return `【${sideLabel}  ${m.speakerName}】: ${m.content.substring(0, 200)}`;
      })
      .join('\n---\n');
  }

  // 分批处理
  for (let i = 0; i < viewers.length; i += BATCH_SIZE) {
    const batch = viewers.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(viewer => {
      return voteSingleViewer(viewer, session, voteType, fullDebateSummary);
    });

    const batchResults = await Promise.all(batchPromises);

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const viewer = batch[j];

      if (result.success) {
        details.push({
          viewerId: viewer.id,
          label: viewer.label,
          choice: result.choice,
          reason: result.reason,
          confidence: result.confidence,
          reaction: result.reaction || '',
        });

        if (result.choice === 'pro') proCount++;
        else if (result.choice === 'con') conCount++;
        else abstainCount++;
      } else {
        failedViewerIds.push(viewer.id);
        // 失败者根据倾向给默认票
        const defaultChoice = getDefaultChoiceFromTendency(viewer.tendency);
        details.push({
          viewerId: viewer.id,
          label: viewer.label,
          choice: defaultChoice,
          reason: '（系统默认投票）',
          confidence: 0.5,
        });
        if (defaultChoice === 'pro') proCount++;
        else if (defaultChoice === 'con') conCount++;
        else abstainCount++;
      }
    }

    // 批间延时
    if (i + BATCH_SIZE < viewers.length) {
      await sleep(BATCH_INTERVAL_MS);
    }
  }

  const validCount = proCount + conCount;

  return {
    proCount,
    conCount,
    abstainCount,
    validCount,
    failedViewerIds,
    details,
  };
}

/**
 * 单个观众投票
 * @param {Object} viewer - 观众Profile
 * @param {Object} session - Session对象
 * @param {string} voteType - 投票类型
 * @param {string} fullDebateSummary - 完整辩论内容（终投使用）
 * @returns {Promise<Object>} {success, choice, reason, confidence}
 */
async function voteSingleViewer(viewer, session, voteType, fullDebateSummary) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const userPrompt = buildVotePrompt(viewer, session, voteType, fullDebateSummary);

      const messages = [
        {
          role: 'system',
          content: `你是${viewer.label}，你是一位${viewer.tendency}的观众。你关心的维度：${viewer.dimensions.join('、')}。

请根据辩论内容独立投票，不要受他人影响。回复JSON格式：
{"choice":"pro","reason":"你的理由","confidence":0.8}

- choice: "pro"(支持正方) / "con"(支持反方) / "abstain"(弃权)
- reason: 简短理由（10-30字）
- confidence: 0.0-1.0 的信心指数`,
        },
        { role: 'user', content: userPrompt },
      ];

      const result = await agentEngine.callLLM(messages);

      if (!result.success) {
        if (attempt < MAX_RETRIES) {
          await sleep(1000);
          continue;
        }
        return { success: false, choice: null, reason: null, confidence: 0 };
      }

      // 解析JSON
      const parsed = parseVoteJson(result.content);
      if (parsed && ['pro', 'con', 'abstain'].includes(parsed.choice)) {
        return {
          success: true,
          choice: parsed.choice,
          reason: parsed.reason || '',
          confidence: parsed.confidence || 0.5,
          reaction: parsed.reaction || '',
        };
      }

      if (attempt < MAX_RETRIES) {
        await sleep(1000);
      }
    } catch (err) {
      console.warn(`[viewerEngine] 观众${viewer.label}投票异常: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(1000);
      }
    }
  }

  return { success: false, choice: null, reason: null, confidence: 0 };
}

/**
 * 构建投票Prompt
 * @param {Object} viewer - 观众Profile
 * @param {Object} session - Session对象
 * @param {string} voteType - 投票类型
 * @param {string} fullDebateSummary - 完整辩论摘要
 * @returns {string} User prompt
 */
function buildVotePrompt(viewer, session, voteType, fullDebateSummary) {
  const debateContent = voteType === 'final' && fullDebateSummary
    ? `\n完整辩论内容：\n${fullDebateSummary}`
    : '';

  // 如果有详细的人生故事，加到Prompt里
  const bioContent = viewer.bio
    ? `\n\n你的人生故事：\n${viewer.bio}\n\n你的价值观：${(viewer.values || []).join('、')}\n你的性格：${(viewer.personality?.traits || []).join('、')}`
    : '';

  // 感想指令：初投是基于辩题的初步看法，mid/终投是基于辩论内容的反应
  const reactionLine = voteType === 'init'
    ? '请用一句话写下你对这个辩题的初步看法（100字以内），结合你的人生经历和价值观。不要写出"正方说""反方说"之类的话——辩论还没开始，你还没听到任何发言。'
    : '请用一句话写下你听完刚才辩论后的感想（100字以内），就像你坐在观众席上跟着辩论走心了一样。';

  // 注入正反方立场描述（自定义辩题通过校验后生成）
  let positionLine = '';
  if (session.topicPosition && session.topicPosition.pro && session.topicPosition.con) {
    positionLine = `\n\n辩题立场解读：\n- 正方立场：${session.topicPosition.pro}\n- 反方立场：${session.topicPosition.con}`;
  }

  return `辩题：${session.topicTitle}
你是${viewer.label}（${viewer.tendency}）。
你特别关注：${viewer.dimensions.join('、')}${bioContent}${debateContent}${positionLine}

请根据你的人生经历、价值观和性格倾向，给出你的真实投票。选择支持正方(pro)、反方(con)或弃权(abstain)。
注意：你的投票理由应该基于你真实的人生经历和价值观，不要给出和你人设矛盾的理由。

${reactionLine}

回复JSON格式：{"choice":"pro","reason":"...","confidence":0.8,"reaction":"..."}`;
}

/**
 * 从LLM回复中解析JSON投票结果
 * @param {string} text - LLM回复
 * @returns {Object|null} {choice, reason, confidence}
 */
function parseVoteJson(text) {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch (e) {
    // 尝试从文本中提取JSON块
    const jsonMatch = text.match(/\{[^]*"choice"[^]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // 忽略
      }
    }
    // 尝试正则提取choice
    const choiceMatch = text.match(/"choice"\s*:\s*"(pro|con|abstain)"/);
    if (choiceMatch) {
      const reasonMatch = text.match(/"reason"\s*:\s*"([^"]+)"/);
      const confMatch = text.match(/"confidence"\s*:\s*([0-9.]+)/);
      const reactionMatch = text.match(/"reaction"\s*:\s*"([^"]+)"/);
      return {
        choice: choiceMatch[1],
        reason: reasonMatch ? reasonMatch[1] : '',
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
        reaction: reactionMatch ? reactionMatch[1] : '',
      };
    }
    return null;
  }
}

/**
 * 从倾向字符串中获取默认投票
 * @param {string} tendency - 倾向描述
 * @returns {string} "pro" | "con" | "abstain"
 */
function getDefaultChoiceFromTendency(tendency) {
  const t = tendency || '';
  if (t.includes('偏正') || t.includes('偏实用') || t.includes('随性')) {
    return 'pro';
  }
  if (t.includes('偏反') || t.includes('偏传统') || t.includes('偏理性')) {
    return 'con';
  }
  if (t.includes('理想')) {
    return 'pro';
  }
  // 随机
  return Math.random() > 0.5 ? 'pro' : 'con';
}

// ===== 跑票统计 =====

/**
 * 计算跑票（对比初投和终投）
 * @param {Object} initVotes - 初投VoteRecord
 * @param {Object} finalVotes - 终投VoteRecord
 * @returns {Object} {swingCount, swingViewerIds, details}
 */
function calculateSwing(initVotes, finalVotes) {
  if (!initVotes || !finalVotes) {
    return { swingCount: 0, swingViewerIds: [], details: [] };
  }

  const initDetails = initVotes.details || [];
  const finalDetails = finalVotes.details || [];

  // 构建viewerId -> choice的映射
  const initMap = {};
  for (const d of initDetails) {
    initMap[d.viewerId] = d.choice;
  }

  const finalMap = {};
  for (const d of finalDetails) {
    finalMap[d.viewerId] = d.choice;
  }

  const swingViewerIds = [];
  const swingDetails = [];

  // 取交集
  for (const viewerId of Object.keys(initMap)) {
    if (finalMap[viewerId] !== undefined) {
      if (initMap[viewerId] !== finalMap[viewerId]) {
        swingViewerIds.push(viewerId);
        swingDetails.push({
          viewerId,
          from: initMap[viewerId],
          to: finalMap[viewerId],
        });
      }
    }
  }

  return {
    swingCount: swingViewerIds.length,
    swingViewerIds,
    details: swingDetails,
  };
}

// ===== 补票机制 =====

/**
 * 补票：有效票不足时从已投票观众中按倾向补充
 * @param {Object} voteRecord - 原始VoteRecord
 * @param {Array} viewerProfiles - 观众Profile数组
 * @param {number} targetCount - 目标有效票数
 * @returns {Object} 补充后的VoteRecord
 */
function fillDefaultVotes(voteRecord, viewerProfiles, targetCount) {
  targetCount = targetCount || 20;

  if (voteRecord.validCount >= targetCount) {
    return voteRecord;
  }

  const details = voteRecord.details || [];
  const existingViewerIds = new Set(details.map(d => d.viewerId));

  // 找出还没投票的观众，按倾向补充
  const remainingViewers = viewerProfiles.filter(v => !existingViewerIds.has(v.id));

  let proCount = voteRecord.proCount;
  let conCount = voteRecord.conCount;
  let abstainCount = voteRecord.abstainCount;

  for (const viewer of remainingViewers) {
    if (proCount + conCount >= targetCount) break;

    const choice = getDefaultChoiceFromTendency(viewer.tendency);
    details.push({
      viewerId: viewer.id,
      label: viewer.label,
      choice,
      reason: '（补票）',
      confidence: 0.5,
    });

    if (choice === 'pro') proCount++;
    else if (choice === 'con') conCount++;
    else abstainCount++;
  }

  return {
    proCount,
    conCount,
    abstainCount,
    validCount: proCount + conCount,
    failedViewerIds: voteRecord.failedViewerIds || [],
    details,
  };
}

// ===== 情绪计算（V1留钩子） =====

/**
 * 计算发言对观众的情绪影响
 * V1版本：返回空数组，为V2留钩子
 * @param {string} speechText - 发言文本
 * @param {Object} viewer - 观众Profile
 * @returns {Array} 情绪影响数组
 */
function calculateEmotionImpact(speechText, viewer) {
  // TODO V2: 实现基于文本的情绪影响计算
  // 计划：分析speechText中的关键词，匹配viewer.triggers，计算情绪偏移
  return [];
}

module.exports = {
  executeVote,
  batchVote,
  calculateSwing,
  fillDefaultVotes,
  calculateEmotionImpact,
  // 导出用于测试
  parseVoteJson,
  getDefaultChoiceFromTendency,
};
