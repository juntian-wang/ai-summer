/**
 * flowDefinition.js
 * AI奇葩说 - 28步辩论流程定义
 */

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

/**
 * 获取完整流程数组
 * @returns {Array} FLOW数组
 */
function getFlow() {
  return FLOW;
}

/**
 * 获取指定索引的步骤
 * @param {number} index - 步骤索引
 * @returns {Object|null} 步骤对象
 */
function getStep(index) {
  if (index < 0 || index >= FLOW.length) return null;
  return FLOW[index];
}

/**
 * 获取流程总步数
 * @returns {number} 步数
 */
function getFlowLength() {
  return FLOW.length;
}

/**
 * 获取指定步骤的类型
 * @param {number} index - 步骤索引
 * @returns {string|null} 步骤类型
 */
function getStepType(index) {
  const step = getStep(index);
  return step ? step.type : null;
}

/**
 * 判断步骤是否为发言类型
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isSpeechStep(step) {
  return step && step.type === 'speech';
}

/**
 * 判断步骤是否为主持人环节
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isHostStep(step) {
  return step && step.type === 'host';
}

/**
 * 判断步骤是否为开杠环节
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isBattleStep(step) {
  return step && step.type === 'battle';
}

/**
 * 判断步骤是否为投票环节
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isVoteStep(step) {
  return step && step.type === 'vote';
}

/**
 * 判断步骤是否为结辩环节
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isClosingStep(step) {
  return step && step.type === 'closing';
}

/**
 * 判断步骤是否为导师环节
 * @param {Object} step - 流程步骤对象
 * @returns {boolean}
 */
function isMentorStep(step) {
  return step && step.type === 'mentor';
}

module.exports = {
  FLOW,
  getFlow,
  getStep,
  getFlowLength,
  getStepType,
  isSpeechStep,
  isHostStep,
  isBattleStep,
  isVoteStep,
  isClosingStep,
  isMentorStep,
};
