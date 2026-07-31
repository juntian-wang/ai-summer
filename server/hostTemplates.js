/**
 * hostTemplates.js
 * 主持人过渡引导模板库
 * 所有涉及"有请XX发言"的简短过渡语，不调LLM，直接随机抽取
 *
 * 模板参数约定：
 *   - intro_first / intro_second / intro_third / turn_speech / closing_intro / closing_continue
 *     接收 (sideLabel, name)，其中 sideLabel 为 '正方' | '反方'（由 server.js 动态解析）
 *   - transition_round 接收 (round)，如 '二' / '三'
 *   - vote_call / battle_start / battle_end / final_vote 不需要参数
 *   - transition_to_con / transition_to_pro 接收 (name)（向后兼容）
 */

const TEMPLATES = {
  // 一辩发言介绍（动态顺序，需传 侧别 + 辩手名）
  intro_first: [
    (side, name) => `好，${side}${name}，一辩发言请！`,
    (side, name) => `有请${side}${name}，一辩立论！`,
    (side, name) => `${side}${name}，请开始一辩发言。`,
    (side, name) => `来，${side}${name}，一辩，该你了。`,
  ],

  // 二辩发言介绍（动态顺序）
  intro_second: [
    (side, name) => `有请${side}${name}（二辩）！`,
    (side, name) => `接下来，${side}${name}，二辩发言请！`,
    (side, name) => `好，${side}${name}，二辩，到你了。`,
    (side, name) => `${side}${name}，请开始二辩发言。`,
  ],

  // 三辩发言介绍（动态顺序）
  intro_third: [
    (side, name) => `最后是${side}${name}（三辩）！`,
    (side, name) => `有请${side}${name}，三辩发言！`,
    (side, name) => `好，${side}${name}，三辩，请！`,
    (side, name) => `${side}${name}，三辩立论，请。`,
  ],

  // 环节内换人发言（正→反 或 反→正，动态传入）
  turn_speech: [
    (side, name) => `好，${side}${name}，请！`,
    (side, name) => `有请${side}${name}！`,
    (side, name) => `${side}${name}，轮到你了。`,
    (side, name) => `好，${side}${name}，怎么看？`,
  ],

  // 环节过渡（进入第2、3环节）
  transition_round: [
    (round) => `好，接下来进入${round}辩环节！`,
    (round) => `让我们进入${round}辩环节。`,
    (round) => `好，${round}辩，开始！`,
    (round) => `接下来，${round}辩环节！`,
  ],

  // 介绍正方发言（传入辩手名，向后兼容）
  intro_pro: [
    name => `好，正方${name}，请！`,
    name => `有请正方${name}！`,
    name => `正方${name}，请发言。`,
    name => `来，正方${name}，该你了。`,
    name => `正方${name}，请！`,
  ],

  // 介绍反方发言（传入辩手名，向后兼容）
  intro_con: [
    name => `反方${name}，请！`,
    name => `有请反方${name}！`,
    name => `反方${name}，请发言。`,
    name => `好，反方${name}，怎么看？`,
    name => `来，反方${name}。`,
  ],

  // 过渡：从正方到反方（向后兼容）
  transition_to_con: [
    name => `谢谢正方。反方${name}，请！`,
    name => `正方发言完毕。有请反方${name}！`,
    name => `好，反方${name}，轮到你了。`,
  ],

  // 过渡：从反方到正方（向后兼容）
  transition_to_pro: [
    name => `谢谢反方。正方${name}，请！`,
    name => `反方发言完毕。有请正方${name}！`,
    name => `好，正方${name}，轮到你了。`,
  ],

  // 引导投票（含环节投票）
  vote_call: [
    '好，请各位观众开始投票！',
    '来，各位观众，投票时间！',
    '请各位观众投出你的一票。',
    '好，投票开始！',
  ],

  // 开杠开始
  battle_start: [
    '好，开杠环节，开始！',
    '自由辩论时间，开始！',
    '开杠！开始！',
    '好，双方准备，开杠！',
  ],

  // 开杠结束
  battle_end: [
    '时间到！开杠结束。',
    '好，停！开杠结束。',
    '时间到！',
  ],

  // 结辩引导（先结辩方，动态传入 侧别 + 辩手名）
  closing_intro: [
    (side, name) => `好，${side}${name}，先结辩，请！`,
    (side, name) => `有请${side}${name}做结辩。`,
    (side, name) => `${side}${name}，结辩，请！`,
  ],

  // 结辩过渡（压轴结辩方，动态传入 侧别 + 辩手名）
  closing_continue: [
    (side, name) => `好，${side}${name}，请做最后的结辩！`,
    (side, name) => `有请${side}${name}，压轴结辩！`,
    (side, name) => `最后，${side}${name}，结辩请！`,
    (side, name) => `好，${side}${name}，收尾结辩，请！`,
  ],

  // 终投引导
  final_vote: [
    '好，本场辩论到此结束。请各位观众投出最后一票！',
    '辩论结束，请各位观众开始最终投票！',
    '好，最后一轮投票，请！',
  ],
};

/**
 * 从模板库中随机抽取一条并填充参数
 * @param {string} category - 模板类别名
 * @param {...any} args - 模板参数
 * @returns {string} 生成的文本
 */
function pickTemplate(category, ...args) {
  const pool = TEMPLATES[category];
  if (!pool || pool.length === 0) {
    return '';
  }
  const idx = Math.floor(Math.random() * pool.length);
  const template = pool[idx];
  return typeof template === 'function' ? template(...args) : template;
}

module.exports = {
  TEMPLATES,
  pickTemplate,
};
