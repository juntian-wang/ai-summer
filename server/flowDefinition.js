/**
 * flowDefinition.js
 * AI奇葩说 - 辩论流程定义
 *
 * 投票规则：共 5 次投票（初投 + 一辩环节后 + 二辩环节后 + 三辩环节后 + 终投）
 *   - 初投：开场后
 *   - mid_p1：一辩环节结束后（含一辩开杠）
 *   - mid_p2：二辩环节结束后
 *   - mid_p3：三辩环节结束后（含三辩开杠）
 *   - final：结辩后
 *
 * 主持人过渡规则：所有简短过渡（有请/谢谢/引导投票/环节切换/开杠开始/结辩引导/终投引导）
 *   走模板（type: 'host_template'），零 LLM 调用。
 *   仅保留 host_opening（开场白）与 host_mentors（邀请导师）为 LLM host 类型。
 *
 * 发言顺序规则（用户确认，见 改造设计_开杠策略导师插话.md §七·补）：
 *   - 一辩立论：初投后票数少的一方先发言
 *   - 一辩开杠：延续，票少方先开杠
 *   - 二辩立论：与一辩相反（交替轮换）
 *   - 三辩立论：与二辩相反（回到一辩顺序）
 *   - 三辩开杠：当前落后方先开杠（参考最近一次投票 mid_p2 的结果）
 *   - 结辩：先立论方后结辩（"先发后结"，压轴）
 *
 * 说明：speech / battle / closing 步骤中的 side 字段是"名义顺序"（pro→con），
 *   实际执行时由 server.js 依据投票结果动态重排（参考 reorderBattleStep 模式）。
 */

const FLOW = [
  // ===== 开场 & 初投 =====
  { step: 'host_opening', type: 'host', role: '开场' },
  { step: 'vote_init',    type: 'vote', label: 'init' },

  // ===== 一辩立论（票少方先）=====
  { step: 'host_intro_p1',  type: 'host_template', template: 'intro_first',  position: 'first', slot: 0 },
  { step: 'pro_first',      type: 'speech', side: 'pro', position: 'first',  wordCount: '300-400' },
  { step: 'host_turn_con1', type: 'host_template', template: 'turn_speech',  position: 'first', slot: 1 },
  { step: 'con_first',      type: 'speech', side: 'con', position: 'first',  wordCount: '300-400' },
  { step: 'mentor_comment_p1', type: 'mentor_comment', phase: 'p1' },

  // ===== 一辩开杠（延续，票少方先）=====
  { step: 'host_battle_p1',  type: 'host_template', template: 'battle_start', battlePhase: 'p1' },
  { step: 'battle_p1_pro_1', type: 'battle', side: 'pro', position: 'first', battlePhase: 'p1', battleTurn: 1, wordCount: '50-80' },
  { step: 'battle_p1_con_1', type: 'battle', side: 'con', position: 'first', battlePhase: 'p1', battleTurn: 1, wordCount: '50-80' },
  { step: 'battle_p1_pro_2', type: 'battle', side: 'pro', position: 'first', battlePhase: 'p1', battleTurn: 2, wordCount: '50-80' },
  { step: 'battle_p1_con_2', type: 'battle', side: 'con', position: 'first', battlePhase: 'p1', battleTurn: 2, wordCount: '50-80' },
  { step: 'battle_p1_pro_3', type: 'battle', side: 'pro', position: 'first', battlePhase: 'p1', battleTurn: 3, wordCount: '30-50' },
  { step: 'battle_p1_con_3', type: 'battle', side: 'con', position: 'first', battlePhase: 'p1', battleTurn: 3, wordCount: '30-50' },
  { step: 'mentor_comment_bp1', type: 'mentor_comment', phase: 'bp1' },

  // ===== 一辩环节后投票（含开杠）=====
  { step: 'host_vote_call_1', type: 'host_template', template: 'vote_call' },
  { step: 'vote_mid_p1',      type: 'vote', label: 'mid_p1' },

  // ===== 二辩立论（与一辩相反）=====
  { step: 'host_transition_p2', type: 'host_template', template: 'transition_round', round: '二' },
  { step: 'pro_second',         type: 'speech', side: 'pro', position: 'second', wordCount: '300-400' },
  { step: 'host_turn_con2',     type: 'host_template', template: 'turn_speech', position: 'second', slot: 1 },
  { step: 'con_second',         type: 'speech', side: 'con', position: 'second', wordCount: '300-400' },
  { step: 'mentor_comment_p2',  type: 'mentor_comment', phase: 'p2' },

  // ===== 二辩环节后投票 =====
  { step: 'host_vote_call_2', type: 'host_template', template: 'vote_call' },
  { step: 'vote_mid_p2',      type: 'vote', label: 'mid_p2' },

  // ===== 三辩立论（与二辩相反，回到一辩顺序）=====
  { step: 'host_transition_p3', type: 'host_template', template: 'transition_round', round: '三' },
  { step: 'pro_third',          type: 'speech', side: 'pro', position: 'third', wordCount: '300-400' },
  { step: 'host_turn_con3',     type: 'host_template', template: 'turn_speech', position: 'third', slot: 1 },
  { step: 'con_third',          type: 'speech', side: 'con', position: 'third', wordCount: '300-400' },
  { step: 'mentor_comment_p3',  type: 'mentor_comment', phase: 'p3' },

  // ===== 三辩开杠（当前落后方先：参考 mid_p2）=====
  { step: 'host_battle_p3',  type: 'host_template', template: 'battle_start', battlePhase: 'p3' },
  { step: 'battle_p3_pro_1', type: 'battle', side: 'pro', position: 'third', battlePhase: 'p3', battleTurn: 1, wordCount: '50-80' },
  { step: 'battle_p3_con_1', type: 'battle', side: 'con', position: 'third', battlePhase: 'p3', battleTurn: 1, wordCount: '50-80' },
  { step: 'battle_p3_pro_2', type: 'battle', side: 'pro', position: 'third', battlePhase: 'p3', battleTurn: 2, wordCount: '50-80' },
  { step: 'battle_p3_con_2', type: 'battle', side: 'con', position: 'third', battlePhase: 'p3', battleTurn: 2, wordCount: '50-80' },
  { step: 'battle_p3_pro_3', type: 'battle', side: 'pro', position: 'third', battlePhase: 'p3', battleTurn: 3, wordCount: '30-50' },
  { step: 'battle_p3_con_3', type: 'battle', side: 'con', position: 'third', battlePhase: 'p3', battleTurn: 3, wordCount: '30-50' },
  { step: 'mentor_comment_bp3', type: 'mentor_comment', phase: 'bp3' },

  // ===== 三辩环节后投票（含开杠）=====
  { step: 'host_vote_call_3', type: 'host_template', template: 'vote_call' },
  { step: 'vote_mid_p3',      type: 'vote', label: 'mid_p3' },

  // ===== 结辩（先发后结：先立论方压轴）=====
  { step: 'host_closing',      type: 'host_template', template: 'closing_intro' },
  { step: 'con_closing',       type: 'closing', side: 'con', wordCount: '200-300' },
  { step: 'host_closing_pro',  type: 'host_template', template: 'closing_continue' },
  { step: 'pro_closing',       type: 'closing', side: 'pro', wordCount: '200-300' },

  // ===== 终投 + 导师正式点评 =====
  { step: 'host_final_vote', type: 'host_template', template: 'final_vote' },
  { step: 'vote_final',      type: 'vote', label: 'final' },
  { step: 'host_mentors',    type: 'host', role: '邀请导师' },
  { step: 'mentor_1',        type: 'mentor', idx: 0 },
  { step: 'mentor_2',        type: 'mentor', idx: 1 },
];

function getFlow() { return FLOW; }
function getStep(index) { if (index < 0 || index >= FLOW.length) return null; return FLOW[index]; }
function getFlowLength() { return FLOW.length; }
function getStepType(index) { const step = getStep(index); return step ? step.type : null; }
function isSpeechStep(step) { return step && step.type === 'speech'; }
function isHostStep(step) { return step && step.type === 'host'; }
function isBattleStep(step) { return step && step.type === 'battle'; }
function isVoteStep(step) { return step && step.type === 'vote'; }
function isClosingStep(step) { return step && step.type === 'closing'; }
function isMentorStep(step) { return step && step.type === 'mentor'; }
function isMentorCommentStep(step) { return step && step.type === 'mentor_comment'; }
function isHostTemplateStep(step) { return step && step.type === 'host_template'; }

module.exports = {
  FLOW, getFlow, getStep, getFlowLength, getStepType,
  isSpeechStep, isHostStep, isBattleStep, isVoteStep,
  isClosingStep, isMentorStep, isMentorCommentStep, isHostTemplateStep,
};
