/**
 * sessionStore.js
 * AI奇葩说 - Session存储与管理
 * 负责数据加载、Session CRUD、超时清理
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ===== 数据缓存（模块级变量） =====
let _dataCache = null;
let _topicsCache = null;
let _debatersCache = null;
let _audienceCache = null;
let _refereeCache = null;
let _mentorsCache = null;

// 数据目录路径
const DATA_DIR = path.resolve(__dirname, '..', 'data');

// ===== Session存储 =====
const _sessions = new Map();
let _cleanupTimer = null;

// ===== 数据加载函数 =====

/**
 * 加载并缓存全部JSON数据文件
 * 首次调用时从磁盘加载，后续返回缓存
 * @returns {Object} 包含所有数据的对象
 */
function loadAllData() {
  if (_dataCache) return _dataCache;

  try {
    const topics = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'topics.json'), 'utf-8'));
    const debaters = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'debaters.json'), 'utf-8'));
    // 优先加载 audience_300.json，不存在则降级到 audience.json
    let audience = [];
    const audience300Path = path.join(DATA_DIR, 'audience_300.json');
    const audienceLegacyPath = path.join(DATA_DIR, 'audience.json');
    if (fs.existsSync(audience300Path)) {
      audience = JSON.parse(fs.readFileSync(audience300Path, 'utf-8'));
      console.log(`[sessionStore] 加载300人观众池: ${audience.length}人`);
    } else {
      audience = JSON.parse(fs.readFileSync(audienceLegacyPath, 'utf-8'));
      console.log(`[sessionStore] 加载经典观众池: ${audience.length}人（audience_300.json不存在）`);
    }
    const referee = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'referee.json'), 'utf-8'));
    const mentors = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mentors.json'), 'utf-8'));

    _topicsCache = topics;
    _debatersCache = debaters;
    _audienceCache = audience;
    _refereeCache = referee;
    _mentorsCache = mentors;

    _dataCache = { topics, debaters, audience, referee, mentors };
    console.log(`[sessionStore] 数据加载完成: ${topics.length}个辩题, ${debaters.length}个辩手, ${audience.length}个观众, ${mentors.length}个导师`);
    return _dataCache;
  } catch (err) {
    console.error('[sessionStore] 数据加载失败:', err.message);
    throw new Error(`数据加载失败: ${err.message}`);
  }
}

/**
 * 获取所有辩题
 * @returns {Array} 辩题数组
 */
function loadTopics() {
  if (!_topicsCache) loadAllData();
  return _topicsCache;
}

/**
 * 获取所有辩手
 * @returns {Array} 辩手数组
 */
function loadDebaters() {
  if (!_debatersCache) loadAllData();
  return _debatersCache;
}

/**
 * 获取所有观众
 * @returns {Array} 观众数组
 */
function loadAudience() {
  if (!_audienceCache) loadAllData();
  return _audienceCache;
}

/**
 * 获取主持人数据
 * @returns {Object} 主持人Profile
 */
function loadReferee() {
  if (!_refereeCache) loadAllData();
  return _refereeCache;
}

/**
 * 获取所有导师
 * @returns {Array} 导师数组
 */
function loadMentors() {
  if (!_mentorsCache) loadAllData();
  return _mentorsCache;
}

// ===== 对外暴露的缓存访问方法（供其他模块使用）=====

/**
 * 获取所有观众（对外接口）
 * 返回完整观众池（300人）
 * @returns {Array} 观众数组
 */
function getAllAudience() {
  return loadAudience();
}

/**
 * 从观众池中随机抽取指定数量的观众
 * 确保不重复，且分布均匀
 * @param {number} count - 抽取人数，默认30
 * @returns {Array} 抽取的观众数组
 */
function sampleAudience(count) {
  const pool = loadAudience();
  if (pool.length <= count) {
    // 如果池子不够大，打乱后全部返回
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    console.log(`[sessionStore] 观众池不足${count}人，全部使用（${pool.length}人）`);
    return shuffled;
  }
  // Fisher-Yates 洗牌算法取前 count 个
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, count);
  console.log(`[sessionStore] 从${pool.length}人中随机抽取${count}人作为本场观众`);
  return selected;
}

/**
 * 获取所有导师（对外接口）
 * @returns {Array} 导师数组
 */
function getAllMentors() {
  return loadMentors();
}

/**
 * 获取主持人（对外接口）
 * @returns {Object} 主持人Profile
 */
function getHostProfile() {
  return loadReferee();
}

// ===== Session CRUD =====

/**
 * 创建新Session
 * @param {number} topicIndex - 辩题索引（0-19），不传则随机
 * @param {string[]} proTeamIds - 正方三辩手ID数组 [firstId, secondId, thirdId]
 * @param {string[]} conTeamIds - 反方三辩手ID数组 [firstId, secondId, thirdId]
 * @returns {string} sessionId
 */
function createSession(topicIndex, proTeamIds, conTeamIds, customTopic) {
  const data = loadAllData();

  // 选择辩题：优先使用自定义辩题
  let topic;
  let idx;
  if (customTopic) {
    topic = { title: customTopic };
    idx = -1;
  } else {
    idx = (topicIndex !== undefined && topicIndex !== null)
      ? topicIndex
      : Math.floor(Math.random() * data.topics.length);
    topic = data.topics[idx];
    if (!topic) {
      throw new Error(`辩题索引无效: ${idx}, 最大索引: ${data.topics.length - 1}`);
    }
  }

  // 分配正方辩手
  const proTeam = proTeamIds.map((debaterId, i) => {
    const debater = data.debaters.find(d => d.id === debaterId);
    if (!debater) {
      throw new Error(`辩手未找到: ${debaterId}`);
    }
    const positions = ['first', 'second', 'third'];
    return {
      id: debater.id,
      name: debater.name,
      label: debater.label,
      persona: debater.persona,
      bestPosition: debater.best_position,
      speakingRules: debater.speaking_rules,
      openingStyle: debater.opening_style,
      rebuttalStyle: debater.rebuttal_style,
      forbidden: debater.forbidden,
      exampleLines: debater.example_lines,
      assignedPosition: positions[i],
    };
  });

  // 分配反方辩手
  const conTeam = conTeamIds.map((debaterId, i) => {
    const debater = data.debaters.find(d => d.id === debaterId);
    if (!debater) {
      throw new Error(`辩手未找到: ${debaterId}`);
    }
    const positions = ['first', 'second', 'third'];
    return {
      id: debater.id,
      name: debater.name,
      label: debater.label,
      persona: debater.persona,
      bestPosition: debater.best_position,
      speakingRules: debater.speaking_rules,
      openingStyle: debater.opening_style,
      rebuttalStyle: debater.rebuttal_style,
      forbidden: debater.forbidden,
      exampleLines: debater.example_lines,
      assignedPosition: positions[i],
    };
  });

  const sessionId = uuidv4();

  const now = Date.now();
  // 从300人观众池中随机抽取30人
  const selectedAudience = sampleAudience(30);
  const session = {
    id: sessionId,
    topicIndex: idx,
    topicTitle: topic.title,
    status: 'CREATED',
    proTeam: proTeam,
    conTeam: conTeam,
    selectedAudience: selectedAudience,  // 本场随机抽选的30位观众
    currentStepIdx: 0,
    currentStepType: null,
    memory: [],
    overtimeRounds: 0,
    votes: { init: null, final: null },
    log: {
      steps: [],
      totalDurationMs: 0,
      totalApiCalls: 0,
      totalRetries: 0,
      totalDegrades: 0,
    },
    createdAt: now,
    lastAccessedAt: now,
  };

  _sessions.set(sessionId, session);
  console.log(`[sessionStore] Session创建: ${sessionId}, 辩题: "${topic.title}"`);
  return sessionId;
}

/**
 * 获取Session
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session对象，不存在返回null
 */
function getSession(sessionId) {
  const session = _sessions.get(sessionId);
  if (!session) return null;
  session.lastAccessedAt = Date.now();
  return session;
}

/**
 * 更新Session
 * @param {string} sessionId - Session ID
 * @param {Object} partial - 要更新的字段
 * @returns {Object|null} 更新后的Session，不存在返回null
 */
function updateSession(sessionId, partial) {
  const session = _sessions.get(sessionId);
  if (!session) return null;

  Object.assign(session, partial);
  session.lastAccessedAt = Date.now();
  return session;
}

/**
 * 删除Session
 * @param {string} sessionId - Session ID
 * @returns {boolean} 是否成功删除
 */
function deleteSession(sessionId) {
  return _sessions.delete(sessionId);
}

/**
 * 获取所有活跃Session ID列表
 * @returns {string[]} Session ID数组
 */
function getActiveSessionIds() {
  return Array.from(_sessions.keys());
}

// ===== 超时清理 =====

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

/**
 * 清理超时Session
 * 删除lastAccessedAt超过30分钟的Session
 * @returns {number} 清理的Session数量
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of _sessions.entries()) {
    if (now - session.lastAccessedAt > SESSION_TIMEOUT_MS) {
      _sessions.delete(sessionId);
      cleaned++;
      console.log(`[sessionStore] 清理超时Session: ${sessionId}`);
    }
  }

  if (cleaned > 0) {
    console.log(`[sessionStore] 本次清理了 ${cleaned} 个超时Session`);
  }
  return cleaned;
}

/**
 * 启动定时清理任务
 * 每5分钟清理一次超时Session
 */
function startCleanupTimer() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
  }
  _cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
  // 确保timer不会阻止进程退出
  if (_cleanupTimer && _cleanupTimer.unref) {
    _cleanupTimer.unref();
  }
  console.log('[sessionStore] Session清理定时器已启动（每5分钟）');
}

/**
 * 停止定时清理任务
 */
function stopCleanupTimer() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
    console.log('[sessionStore] Session清理定时器已停止');
  }
}

module.exports = {
  loadAllData,
  loadTopics,
  loadDebaters,
  loadAudience,
  loadReferee,
  loadMentors,
  getAllAudience,
  sampleAudience,
  getAllMentors,
  getHostProfile,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  getActiveSessionIds,
  cleanupExpiredSessions,
  startCleanupTimer,
  stopCleanupTimer,
};
