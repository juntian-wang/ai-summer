/**
 * agentEngine.js
 * AI奇葩说 - LLM引擎
 * Prompt构建 + DeepSeek API调用 + 输出自检 + 降级处理
 */

const sessionStore = require('./sessionStore');

// ===== 停用词表 =====
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它',
  '们', '有', '不', '就', '这', '那', '也', '都', '要',
  '和', '与', '对', '把', '被', '让', '给', '为', '所',
  '以', '能', '会', '很', '更', '最', '但', '而', '或',
  '其', '中', '上', '下', '来', '去', '到', '从', '没',
  '着', '过', '吧', '吗', '呢', '啊', '哦', '嗯', '哈',
  '呀', '么', '个', '之', '将', '及', '并', '又', '再',
  '已', '已', '还', '可', '如', '若', '虽', '因', '由',
  '于', '自', '比', '向', '当', '同', '跟', '使', '让',
  '叫', '替', '为', '给', '对', '把', '将', '被', '让',
  '向', '往', '朝', '到', '在', '从', '自', '打', '由',
  '于', '至', '当', '临', '趁', '乘', '冲', '凭', '据',
  '按', '照', '依', '经', '通过', '根据', '关于', '对于',
]);

// ===== LLM API调用 =====

/**
 * 调用DeepSeek API
 * @param {Array} messages - [{role, content}, ...]
 * @param {number} timeoutMs - 超时时间，默认30000ms
 * @returns {Promise<{success: boolean, content: string, error: string|null}>}
 */
async function callLLM(messages, timeoutMs) {
  timeoutMs = timeoutMs || 30000;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey) {
    console.warn('[agentEngine] DEEPSEEK_API_KEY 未设置');
    return { success: false, content: '', error: 'API Key未配置' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: messages,
        temperature: 0.8,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        content: '',
        error: `API请求失败 [${response.status}]: ${errorText || response.statusText}`,
      };
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return { success: false, content: '', error: 'API返回格式异常' };
    }

    const content = data.choices[0].message.content || '';
    return { success: true, content, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, content: '', error: 'API请求超时' };
    }
    return { success: false, content: '', error: `网络错误: ${err.message}` };
  }
}

// ===== Prompt构建函数 =====

/**
 * 获取之前的memory摘要
 * @param {Array} memory - Session记忆数组
 * @param {number} maxEntries - 最大返回条数
 * @returns {string} 摘要文本
 */
function getMemorySummary(memory, maxEntries) {
  maxEntries = maxEntries || 999;
  if (!memory || memory.length === 0) return '（暂无之前发言）';

  const recent = memory.slice(-maxEntries);
  return recent.map(m => {
    const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
    return `【${m.step}】${sideLabel} ${m.speakerName}: ${m.content}`;
  }).join('\n');
}

/**
 * 随机从数组中选取指定数量的元素
 * @param {Array} arr - 源数组
 * @param {number} count - 选取数量
 * @returns {Array} 选取结果
 */
function pickRandom(arr, count) {
  const shuffled = arr.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * 构建主持人Prompt
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} hostProfile - 主持人Profile
 * @returns {Array} messages数组
 */
function buildHostPrompt(session, flowStep, hostProfile) {
  const examplesStr = (hostProfile.example_speeches && hostProfile.example_speeches.length > 0)
    ? `\n\n格式参考：\n${hostProfile.example_speeches.map(s => `- ${s}`).join('\n')}`
    : '';

  const systemPrompt = `你是${hostProfile.name}。${hostProfile.persona}
${hostProfile.speaking_rules.map(r => `- ${r}`).join('\n')}
${hostProfile.forbidden.map(r => `- ${r}`).join('\n')}${examplesStr}`;

  const memorySummary = getMemorySummary(session.memory, 999);

  const userPrompt = `辩题：${session.topicTitle}
当前环节：${flowStep.role}
之前发言：
${memorySummary}

直接说话，不要加任何角色标记。不要加括号说明。不要描述你在做什么。
如果是开场环节，只聊辩题，最后说'好，请各位观众投票'。不要介绍任何辩手，介绍辩手是后面的环节。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建辩手发言Prompt
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} debater - 辩手Profile
 * @returns {Array} messages数组
 */
function buildSpeechPrompt(session, flowStep, debater) {
  const randomLines = pickRandom(debater.exampleLines || [], 3);

  const systemPrompt = `你是${debater.name}辩手，风格标签：${debater.label}。
人设：${debater.persona}
说话规则：
${debater.speakingRules.map(r => `- ${r}`).join('\n')}
禁止：
${debater.forbidden.map(r => `- ${r}`).join('\n')}
- 禁止使用台本、舞台说明（如"（笑）、（鼓掌）"等括号动作描述）。只说辩论内容本身。
开场风格：${debater.openingStyle}
金句参考：
${randomLines.map(l => `- "${l}"`).join('\n')}`;

  // 构造之前所有发言的完整上下文（自己队友 + 对手 + 主持人评论）
  const allPrevious = session.memory.filter(
    m => m.type === 'speech' || m.type === 'battle' || m.type === 'closing' || m.type === 'host'
  );
  const fullContext = allPrevious.length > 0
    ? allPrevious.map(m => {
        const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
        return `【${m.speakerName}】(${sideLabel}): ${m.content}`;
      }).join('\n---\n')
    : '（暂无之前发言）';

  // 根据position说明任务差异
  const positionMap = {
    first: '你是一辩，负责立论。用300-400字构建完整的论证框架，定义辩题关键概念，提出本方核心论点，为后续队友打好基础。',
    second: '你是二辩，负责补充和反驳。在队友一辩的基础上补充新的论点和论据，同时有针对性地反驳对方一辩的核心观点。',
    third: '你是三辩，负责深化和铺垫。在前两轮的基础上深化攻防，拆解对方论证漏洞，为本方结辩做铺垫。',
  };
  const positionInstruction = positionMap[flowStep.position] || '请进行辩论发言。';

  const userPrompt = `辩题：${session.topicTitle}
你的立场：${flowStep.side === 'pro' ? '正方' : '反方'}
你的位置：${flowStep.position}辩
任务说明：${positionInstruction}

之前所有发言（含队友、对手、主持人）：
${fullContext}

请以${debater.name}的风格进行辩论发言。注意不要添加角色标记（如"正方："等），直接开始你的发言。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建开杠Prompt（全自动/非扮演方默认）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} debater - 辩手Profile
 * @param {string} lastOpponentSpeech - 对方上一轮发言内容
 * @returns {Array} messages数组
 */
function buildBattlePrompt(session, flowStep, debater, lastOpponentSpeech) {
  const randomLines = pickRandom(debater.exampleLines || [], 2);

  const positionLabel = flowStep.position === 'first' ? '一辩' : flowStep.position === 'third' ? '三辩' : flowStep.position + '辩';

  const systemPrompt = `你是${debater.name}辩手，风格标签：${debater.label}。
人设：${debater.persona}
说话规则：
${debater.speakingRules.map(r => `- ${r}`).join('\n')}
禁止：
${debater.forbidden.map(r => `- ${r}`).join('\n')}
- 禁止使用台本、舞台说明（如"（笑）、（鼓掌）"等括号动作描述）。只说辩论内容本身。
金句参考：
${randomLines.map(l => `- "${l}"`).join('\n')}

注意：本轮是开杠环节（自由辩论），必须正面回应对方上一轮的核心观点，短促有力。
${flowStep.wordCount ? `${flowStep.wordCount}字` : '50-150字'}，像连珠炮一样直接攻击对方逻辑漏洞。不要长篇大论，不要做价值升华。`;

  const battlePhaseLabel = flowStep.battlePhase === 'p1' ? '一辩开杠' : flowStep.battlePhase === 'p3' ? '三辩开杠' : '开杠';

  const userPrompt = `辩题：${session.topicTitle}
你的立场：${flowStep.side === 'pro' ? '正方' : '反方'}
开杠环节：${battlePhaseLabel}
你的位置：${positionLabel}
开杠轮次：第${flowStep.battleTurn}轮

对方上一轮发言：
"${lastOpponentSpeech || '（开场发言）'}"

请直接、犀利地回应对方的核心观点。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建带策略的开杠Prompt
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} debater - 辩手Profile
 * @param {string} lastOpponentSpeech - 对方上一轮发言内容
 * @param {Object} strategy - 策略对象
 * @returns {Array} messages数组
 */
function buildBattleStrategyPrompt(session, flowStep, debater, lastOpponentSpeech, strategy) {
  const randomLines = pickRandom(debater.exampleLines || [], 2);

  const positionLabel = flowStep.position === 'first' ? '一辩' : flowStep.position === 'third' ? '三辩' : flowStep.position + '辩';

  // 根据轮次估算秒数
  const turnNum = flowStep.battleTurn || 1;
  const secondsMap = { 1: '15', 2: '15', 3: '10' };
  const seconds = secondsMap[turnNum] || '15';

  const systemPrompt = `你是${debater.name}辩手，风格标签：${debater.label}。
人设：${debater.persona}
说话规则：
${debater.speakingRules.map(r => `- ${r}`).join('\n')}
禁止：
${debater.forbidden.map(r => `- ${r}`).join('\n')}
- 禁止使用台本、舞台说明（如"（笑）、（鼓掌）"等括号动作描述）。只说辩论内容本身。
金句参考：
${randomLines.map(l => `- "${l}"`).join('\n')}

注意：本轮是开杠环节（自由辩论），必须正面回应对方上一轮的核心观点，短促有力。
${flowStep.wordCount ? `${flowStep.wordCount}字` : '50-150字'}，像连珠炮一样直接攻击对方逻辑漏洞。不要长篇大论，不要做价值升华。`;

  const battlePhaseLabel = flowStep.battlePhase === 'p1' ? '一辩开杠' : flowStep.battlePhase === 'p3' ? '三辩开杠' : '开杠';

  const userPrompt = `辩题：${session.topicTitle}
你的立场：${flowStep.side === 'pro' ? '正方' : '反方'}
开杠环节：${battlePhaseLabel}
你的位置：${positionLabel}
开杠轮次：第${flowStep.battleTurn}轮

当前是开杠环节，每方共有 45 秒总计时（约 150-180 字）。
你是${debater.name}（${positionLabel}），请针对对方上一轮发言进行回应。
本轮发言约 ${flowStep.wordCount || '50-80'} 字（模拟约 ${seconds} 秒口播），短促有力，不要长篇大论。
策略指令：${strategy.promptInstruction}

对方上一轮发言：
"${lastOpponentSpeech || '（开场发言）'}"

请直接、犀利地回应对方的核心观点。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建结辩Prompt
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} debater - 辩手Profile
 * @returns {Array} messages数组
 */
function buildClosingPrompt(session, flowStep, debater) {
  const randomLines = pickRandom(debater.exampleLines || [], 3);

  const systemPrompt = `你是${debater.name}辩手，风格标签：${debater.label}。
人设：${debater.persona}
说话规则：
${debater.speakingRules.map(r => `- ${r}`).join('\n')}
禁止：
${debater.forbidden.map(r => `- ${r}`).join('\n')}
- 禁止使用台本、舞台说明（如"（笑）、（鼓掌）"等括号动作描述）。只说辩论内容本身。
金句参考：
${randomLines.map(l => `- "${l}"`).join('\n')}

注意：本轮是结辩环节。${flowStep.side === 'con' ? '反方先结辩' : '正方最后收尾'}。
200-300字，升华总结全场比赛，不要提出新论点，着重价值升华和情感收尾。`;

  // 整场比赛的完整回顾
  const debateSummary = session.memory.filter(m => m.type !== 'vote' && m.type !== 'host')
    .map(m => {
      const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
      return `【${sideLabel}】${m.speakerName}: ${m.content}`;
    }).join('\n');

  const userPrompt = `辩题：${session.topicTitle}
你的立场：${flowStep.side === 'pro' ? '正方' : '反方'}

全场辩论回顾：
${debateSummary}

请以${debater.name}的风格进行结辩。从本方立场出发，总结核心观点，进行价值升华。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建导师点评Prompt（正式点评）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} mentorProfile - 导师Profile
 * @returns {Array} messages数组
 */
function buildMentorPrompt(session, flowStep, mentorProfile, mentorStance) {
  const toolsStr = (mentorProfile.analytical_tools || [])
    .map(t => `- ${t}`).join('\n');
  const rulesStr = (mentorProfile.speaking_rules || [])
    .map(r => `- ${r}`).join('\n');
  const forbiddenStr = (mentorProfile.forbidden || [])
    .map(r => `- ${r}`).join('\n');
  const quotesStr = (mentorProfile.example_quotes || [])
    .map(q => `- "${q}"`).join('\n');

  const stanceLabel = mentorStance === 'pro' ? '正方' : mentorStance === 'con' ? '反方' : '中立';

  const systemPrompt = `你是${mentorProfile.name}，${mentorProfile.persona}。
分析工具：
${toolsStr}
说话规则：
${rulesStr}
禁止：
${forbiddenStr}
- 禁止使用台本、舞台说明（如"（笑）、（点头）"等括号动作描述）。只说点评内容本身。
经典语录参考：
${quotesStr}

注意：150-300字。
你目前持【${stanceLabel}】立场，请从你的专业视角提供有启发性的观点和深度点评，可以选边站队，但要有理有据。`;

  const fullDebate = session.memory.filter(m => m.type !== 'vote')
    .map(m => {
      const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
      return `【${sideLabel}】${m.speakerName}: ${m.content}`;
    }).join('\n---\n');

  const userPrompt = `辩题：${session.topicTitle}

完整辩论内容：
${fullDebate}

请以${mentorProfile.name}的独特视角，对这场辩论进行点评。
你目前持【${stanceLabel}】立场，请从你的专业角度提供有启发性的观点。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建导师插话Prompt（简短即兴点评）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} mentorProfile - 导师Profile
 * @returns {Array} messages数组
 */
function buildMentorCommentPrompt(session, flowStep, mentorProfile, mentorStance) {
  const quotesStr = (mentorProfile.example_quotes || [])
    .map(q => `- "${q}"`).join('\n');

  const stanceLabel = mentorStance === 'pro' ? '正方' : mentorStance === 'con' ? '反方' : '中立';

  const systemPrompt = `你是${mentorProfile.name}，${mentorProfile.persona}。
经典语录参考：
${quotesStr}

注意：用一两句话简短点评刚才的辩论，30-60字。
你目前持【${stanceLabel}】立场，请从你的专业视角给出有意思的点评。
不要长篇大论，给出一个有趣的角度即可。`;

  // 获取最近的几段发言
  const recentMemories = session.memory.slice(-8)
    .map(m => {
      const sideLabel = m.side === 'pro' ? '正方' : m.side === 'con' ? '反方' : '';
      return `【${sideLabel}】${m.speakerName}: ${m.content}`;
    }).join('\n');

  const userPrompt = `辩题：${session.topicTitle}

最近的辩论内容：
${recentMemories}

作为${mentorProfile.name}，请用一两句话简短点评刚才的辩论（30-60字）。直接输出点评内容，不要加角色前缀。
你目前持【${stanceLabel}】立场。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 构建降级版Prompt（去掉风格约束，只保留辩题+立场+环节）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @returns {Array} messages数组
 */
function buildSimplifiedPrompt(session, flowStep) {
  const sideMap = { pro: '正方', con: '反方' };
  const typeLabels = {
    host: '主持人串场',
    host_template: '主持人串场',
    speech: '辩论发言',
    battle: '开杠',
    closing: '结辩',
    mentor: '导师点评',
    mentor_comment: '导师插话',
  };

  let sideInfo = '';
  if (flowStep.side) {
    sideInfo = `你的立场：${sideMap[flowStep.side] || flowStep.side}`;
  }

  let positionInfo = '';
  if (flowStep.position) {
    positionInfo = `位置：${flowStep.position}辩`;
  }

  const memorySummary = getMemorySummary(session.memory, 999);

  const userPrompt = `辩题：${session.topicTitle}
环节：${typeLabels[flowStep.type] || flowStep.step}
${sideInfo}
${positionInfo}

之前发言摘要：
${memorySummary}

请根据上述环节进行发言。直接输出内容，不要加角色前缀。`;

  return [
    {
      role: 'system',
      content: '你是一个辩论节目的参与者。请根据辩题和当前环节的要求进行发言。直接输出发言内容，不要加任何角色标记。',
    },
    { role: 'user', content: userPrompt },
  ];
}

// ===== 输出自检 =====

/**
 * 提取关键词（去掉停用词）
 * @param {string} text - 输入文本
 * @returns {string[]} 关键词数组
 */
function extractKeywords(text) {
  if (!text) return [];
  // 按空格和常见标点拆分
  const tokens = text.split(/[\s，。！？、；：""''（）【】《》\.,!?;:'"()\[\]{}<>\/\\\-—\n\r]+/);
  return tokens.filter(t => t.length > 0 && !STOP_WORDS.has(t));
}

/**
 * 验证输出
 * @param {string} output - LLM输出文本
 * @param {Object} flowStep - 当前流程步骤
 * @returns {Object} {valid, checks, warnings}
 */
function validateOutput(output, flowStep) {
  const warnings = [];
  let valid = true;

  // 非空检查
  if (!output || output.length === 0) {
    warnings.push('输出为空');
    valid = false;
    return { valid, checks: { nonEmpty: false }, warnings };
  }

  // 长度检查
  const length = output.length;
  const lengthRanges = {
    speech: { min: 100, max: 600 },
    battle: { min: 20, max: 200 },
    closing: { min: 100, max: 400 },
    host: { min: 30, max: 400 },
    mentor: { min: 100, max: 400 },
    mentor_comment: { min: 20, max: 100 },
  };

  const range = lengthRanges[flowStep.type];
  if (range) {
    if (length < range.min) {
      warnings.push(`字数过少(${length}<${range.min})`);
      valid = false;
    } else if (length > range.max) {
      warnings.push(`字数过多(${length}>${range.max})`);
      // 字数过多不判定为无效，但标记警告
    }
  }

  // 无角色标记检查
  const rolePrefixes = ['[正方]', '【正方】', '[反方]', '【反方】', '辩手：', '主持人：', '导师：', '正方辩手：', '反方辩手：'];
  for (const prefix of rolePrefixes) {
    if (output.includes(prefix)) {
      warnings.push(`包含角色标记: ${prefix}`);
      valid = false;
      break;
    }
  }

  // 无拒绝回答检查
  const rejectPatterns = ['抱歉', '我不能', '作为AI模型', '作为AI', '作为人工智能', '我无法', '我不能够'];
  for (const pattern of rejectPatterns) {
    if (output.includes(pattern)) {
      warnings.push(`包含拒绝回答关键词: ${pattern}`);
      valid = false;
      break;
    }
  }

  return { valid, checks: { nonEmpty: true }, warnings };
}

/**
 * 验证开杠回复是否回应了对方
 * @param {string} output - 本轮发言
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @returns {Object} {valid, missingKeywords, matchedKeywords}
 */
function validateBattleResponse(output, session, flowStep) {
  if (!output) return { valid: false, missingKeywords: [], matchedKeywords: [] };

  // 从对方上一轮memory中提取关键词
  const oppositeSide = flowStep.side === 'pro' ? 'con' : 'pro';
  const lastOpponentMemory = session.memory
    .filter(m => m.side === oppositeSide && (m.type === 'battle'))
    .pop();

  if (!lastOpponentMemory) return { valid: true, missingKeywords: [], matchedKeywords: [] };

  const opponentKeywords = extractKeywords(lastOpponentMemory.content);
  const outputKeywords = extractKeywords(output);

  const matched = opponentKeywords.filter(kw => outputKeywords.includes(kw));
  const missing = opponentKeywords.filter(kw => !outputKeywords.includes(kw));

  return {
    valid: matched.length > 0,
    matchedKeywords: matched,
    missingKeywords: missing,
  };
}

// ===== 降级和占位 =====

/**
 * 生成占位文本
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} session - Session对象
 * @returns {string} 占位文本
 */
function generateFallbackContent(flowStep, session) {
  switch (flowStep.type) {
    case 'host':
    case 'host_template':
      return '（主持人串场中...）';
    case 'speech':
      return '（辩论暂时中断...此发言跳过）';
    case 'battle':
      return '（开杠中断...）';
    case 'closing':
      return '（结辩中断...）';
    case 'mentor':
      return '（导师点评暂时无法获取...）';
    case 'mentor_comment':
      return '（导师插话暂时无法获取...）';
    default:
      return '（内容暂缺）';
  }
}

// ===== 执行步骤核心 =====

/**
 * 获取对应位置的辩手
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @returns {Object|null} 辩手对象
 */
function getDebaterForStep(session, flowStep) {
  const team = flowStep.side === 'pro' ? session.proTeam : session.conTeam;
  if (flowStep.type === 'speech') {
    return team.find(d => d.assignedPosition === flowStep.position) || null;
  }
  if (flowStep.type === 'battle') {
    // 开杠根据 position 字段查找对应辩位的辩手
    return team.find(d => d.assignedPosition === flowStep.position) || null;
  }
  if (flowStep.type === 'closing') {
    // 结辩默认由三辩执行
    return team.find(d => d.assignedPosition === 'third') || null;
  }
  return null;
}

/**
 * 获取对方上一轮发言
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @returns {string|null} 对方发言内容
 */
function getLastOpponentSpeech(session, flowStep) {
  const oppositeSide = flowStep.side === 'pro' ? 'con' : 'pro';
  const lastMemory = session.memory
    .filter(m => m.side === oppositeSide)
    .pop();
  return lastMemory ? lastMemory.content : null;
}

/**
 * 获取上一个对手开杠发言（专门用于开杠环节）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @returns {string|null}
 */
function getLastOpponentBattleSpeech(session, flowStep) {
  const oppositeSide = flowStep.side === 'pro' ? 'con' : 'pro';
  const lastBattle = session.memory
    .filter(m => m.side === oppositeSide && m.type === 'battle')
    .pop();
  return lastBattle ? lastBattle.content : null;
}

/**
 * 获取导师插话的轮换方案
 * @param {string} phase - 插话阶段: 'p1' | 'bp1' | 'p2' | 'p3' | 'bp3'
 * @param {Array} mentors - 导师数组
 * @returns {Object} 导师Profile
 */
function getMentorForComment(phase, mentors) {
  if (!mentors || mentors.length === 0) return null;

  // 导师轮换方案
  const mentorMap = {
    'p1': 0,   // 薛兆丰
    'bp1': 3,  // 李诞
    'p2': 2,   // 蔡康永
    'p3': 1,   // 刘擎
  };

  if (phase === 'bp3') {
    // 随机从4人中选
    const idx = Math.floor(Math.random() * mentors.length);
    return mentors[idx];
  }

  const mentorIdx = mentorMap[phase];
  if (mentorIdx !== undefined && mentors[mentorIdx]) {
    return mentors[mentorIdx];
  }

  // 兜底：随机选
  return mentors[Math.floor(Math.random() * mentors.length)];
}

/**
 * 执行一个流程步骤（核心函数）
 * @param {Object} session - Session对象
 * @param {Object} flowStep - 当前流程步骤
 * @param {Object} extraOptions - 额外选项（可选）
 * @returns {Promise<Object>} {success, content, attemptCount, degraded, error}
 */
async function executeStep(session, flowStep, extraOptions) {
  const hostProfile = sessionStore.getHostProfile();
  const mentors = sessionStore.getAllMentors();

  // host_template 步骤不应进入 LLM 引擎（server.js 已拦截）；兜底返回零 LLM 占位
  if (flowStep.type === 'host_template') {
    console.warn('[agentEngine] host_template 不应进入LLM引擎（server.js 已拦截），返回占位');
    return {
      success: true,
      content: generateFallbackContent(flowStep, session),
      attemptCount: 0,
      degraded: true,
      error: null,
    };
  }

  let attemptCount = 0;
  let degraded = false;
  let lastError = null;

  // 尝试1-3: 完整Prompt
  for (let attempt = 1; attempt <= 3; attempt++) {
    attemptCount++;
    try {
      let messages;
      let debater;

      switch (flowStep.type) {
        case 'host':
          messages = buildHostPrompt(session, flowStep, hostProfile);
          break;

        case 'speech':
          debater = getDebaterForStep(session, flowStep);
          if (!debater) {
            throw new Error(`未找到${flowStep.side === 'pro' ? '正方' : '反方'}${flowStep.position}辩手`);
          }
          messages = buildSpeechPrompt(session, flowStep, debater);
          break;

        case 'battle':
          debater = getDebaterForStep(session, flowStep);
          if (!debater) {
            throw new Error(`未找到${flowStep.side === 'pro' ? '正方' : '反方'}开杠辩手`);
          }
          const lastOpponent = getLastOpponentBattleSpeech(session, flowStep);

          // 检查是否有策略注入
          if (extraOptions && extraOptions.strategy) {
            messages = buildBattleStrategyPrompt(session, flowStep, debater, lastOpponent, extraOptions.strategy);
          } else {
            messages = buildBattlePrompt(session, flowStep, debater, lastOpponent);
          }
          break;

        case 'closing':
          debater = getDebaterForStep(session, flowStep);
          if (!debater) {
            throw new Error(`未找到${flowStep.side === 'pro' ? '正方' : '反方'}结辩辩手`);
          }
          messages = buildClosingPrompt(session, flowStep, debater);
          break;

        case 'mentor':
          const mentor = mentors[flowStep.idx];
          if (!mentor) {
            throw new Error(`未找到导师[${flowStep.idx}]`);
          }
          const mentorStance = session.mentorStances ? session.mentorStances[mentor.id] : null;
          messages = buildMentorPrompt(session, flowStep, mentor, mentorStance);
          break;

        case 'mentor_comment': {
          // 获取导师轮换方案
          const mentorProfile = getMentorForComment(flowStep.phase, mentors);
          if (!mentorProfile) {
            throw new Error(`未找到插话导师[phase=${flowStep.phase}]`);
          }
          // 如果 extraOptions 传入了 mentorProfile，优先使用
          const actualMentor = (extraOptions && extraOptions.mentorProfile) || mentorProfile;
          const commentStance = session.mentorStances ? session.mentorStances[actualMentor.id] : null;
          messages = buildMentorCommentPrompt(session, flowStep, actualMentor, commentStance);
          break;
        }

        default:
          throw new Error(`未知步骤类型: ${flowStep.type}`);
      }

      const result = await callLLM(messages);

      if (!result.success) {
        lastError = result.error;
        console.warn(`[agentEngine] 第${attempt}次调用失败: ${result.error}`);
        if (attempt < 3) {
          // 等待2秒后重试
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        continue;
      }

      // 验证输出
      const validation = validateOutput(result.content, flowStep);

      // 如果是开杠，额外验证回应质量
      if (flowStep.type === 'battle' && validation.valid) {
        const battleValidation = validateBattleResponse(result.content, session, flowStep);
        if (!battleValidation.valid) {
          console.warn(`[agentEngine] 第${attempt}次开杠验证失败: 未回应对方关键词`);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          continue;
        }
      }

      if (validation.valid) {
        return {
          success: true,
          content: result.content,
          attemptCount,
          degraded: false,
          error: null,
        };
      } else {
        lastError = `输出验证失败: ${validation.warnings.join(', ')}`;
        console.warn(`[agentEngine] 第${attempt}次输出验证失败: ${lastError}`);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[agentEngine] 第${attempt}次执行异常: ${err.message}`);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // 尝试4: 降级Prompt
  attemptCount++;
  degraded = true;
  try {
    const messages = buildSimplifiedPrompt(session, flowStep);
    const result = await callLLM(messages);

    if (result.success) {
      const validation = validateOutput(result.content, flowStep);
      if (validation.valid) {
        return {
          success: true,
          content: result.content,
          attemptCount,
          degraded: true,
          error: null,
        };
      } else {
        lastError = `降级调用输出验证失败: ${validation.warnings.join(', ')}`;
      }
    } else {
      lastError = result.error;
    }
  } catch (err) {
    lastError = err.message;
  }

  // 最终降级：占位文本
  console.warn(`[agentEngine] 所有调用失败，使用占位文本。最后错误: ${lastError}`);
  const fallback = generateFallbackContent(flowStep, session);
  return {
    success: false,
    content: fallback,
    attemptCount,
    degraded: true,
    error: lastError,
  };
}

module.exports = {
  callLLM,
  buildHostPrompt,
  buildSpeechPrompt,
  buildBattlePrompt,
  buildBattleStrategyPrompt,
  buildClosingPrompt,
  buildMentorPrompt,
  buildMentorCommentPrompt,
  buildSimplifiedPrompt,
  validateOutput,
  validateBattleResponse,
  extractKeywords,
  generateFallbackContent,
  getDebaterForStep,
  getMentorForComment,
  executeStep,
};
