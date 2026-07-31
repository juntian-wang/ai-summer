/**
 * voiceMapping.js
 * AI奇葩说 - 辩手到通义千问TTS音色的映射
 * 
 * 每个角色独立音色 + 说话风格指令，做出真人差异感
 */

// ===== qwen3-tts-instruct-flash 音色映射表 =====
// 可用音色（24种中文）：
// 女声：Cherry(芊悦) Serena(苏瑶) Chelsie(千雪) Momo(茉兔) Vivian(十三)
//       Maia(四月) Bellona(燕铮莺) Mia(乖小妹) Bunny(萌小姬) Nini(邻家妹妹)
//       Stella(少女阿月) Elias(墨讲师) Seren(小婉)
// 男声：Ethan(晨煦) Moon(月白) Kai(凯) Nofish(不吃鱼)
//       EldricSage(沧明子) Vincent(田叔) Mochi(沙小弥) Pip(顽屁小孩)
//       Neil(阿闻) Arthur(徐大爷)

const VOICE_MAP = {
  // ===== 正方 =====
  'chenming': {     // 陈铭 — 逻辑型，沉稳有力量
    voice: 'Kai',
    instructions: '语气沉稳有力，字正腔圆，逻辑清晰，语速适中偏慢，带有说服力',
  },
  'zhanqingyun': {  // 詹青云 — 理性知性
    voice: 'Maia',
    instructions: '知性温柔，语气坚定，语速适中，带有学者的从容感',
  },
  'huangzhizhong': {  // 黄执中 — 煽情型
    voice: 'Moon',
    instructions: '富有感情，语气深沉，语速偏慢，擅长营造氛围感',
  },
  'xiong hao': {    // 熊浩 — 温文尔雅
    voice: 'Ethan',
    instructions: '温暖阳光，语气平和亲切，语速适中',
  },
  'pang ying': {    // 庞颖 — 理性温和
    voice: 'Serena',
    instructions: '温柔而坚定，语速适中，逻辑清晰但不失温度',
  },
  'hu jianbiao': {  // 胡渐彪 — 犀利
    voice: 'Nofish',
    instructions: '语速较快，语气锐利直接，带有攻击性但不失风度',
  },

  // ===== 反方 =====
  'fushouer': {     // 傅首尔 — 金句型，幽默接地气
    voice: 'Bellona',
    instructions: '语气鲜活生动，语速偏快，带幽默感和烟火气，声音洪亮',
  },
  'xiaoxiao': {      // 肖骁 — 综艺型，夸张
    voice: 'Vivian',
    instructions: '语气拽拽的，带调侃和叛逆感，语速偏快，表情丰富的感觉',
  },
  'lidan': {        // 李诞 — 解构型，懒散
    voice: 'Vincent',
    instructions: '语气慵懒随意，带沙哑烟嗓感，语速偏慢，丧中带幽默',
  },
  'yanrujing': {    // 颜如晶 — 可爱吃货
    voice: 'Cherry',
    instructions: '阳光可爱，语气活泼亲切，语速稍快，带点呆萌感',
  },
  'maweiwei': {     // 马薇薇 — 犀利泼辣
    voice: 'Bellona',
    instructions: '语气犀利直接，语速快，攻击性强，气场全开',
  },
  'fantiantian': {  // 范湉湉 — 泼辣型
    voice: 'Momo',
    instructions: '语气活泼搞怪，带撒娇感，语速快，情绪饱满',
  },

  // ===== 补充辩手 =====
  'qiuchen': {      // 邱晨 — 严密型
    voice: 'Serena',
    instructions: '语气温和但严密，语速适中，逻辑环环相扣',
  },
  'jiangsida': {    // 姜思达 — 先锋型
    voice: 'Mochi',
    instructions: '语气聪明灵动，语速偏快，带先锋感和个性',
  },
  'xirui': {        // 席瑞 — 共情型
    voice: 'Elias',
    instructions: '语气温柔共情，语速偏慢，娓娓道来，带哲学感',
  },
  'chen lu': {      // 程璐 — 搞笑
    voice: 'Pip',
    instructions: '语气调皮活泼，语速快，带吐槽感和幽默',
  },
  'chuyin': {       // 储殷 — 严肃学者
    voice: 'EldricSage',
    instructions: '语气沉稳厚重，语速偏慢，带学者风范和沧桑感',
  },

  // ===== 主持人 =====
  'host_madong': {  // 马东
    voice: 'Neil',
    instructions: '语气专业且带综艺感，字正腔圆，语速适中，带调侃和幽默',
  },

  // ===== 导师 =====
  'mentor_xuezhaofeng': {  // 薛兆丰
    voice: 'EldricSage',
    instructions: '语气沉稳睿智，语速偏慢，带经济学教授的冷静和犀利',
  },
  'mentor_caokangyong': {  // 蔡康永
    voice: 'Kai',
    instructions: '语气温柔感性，语速舒缓，带洞察人心的温暖',
  },
  'mentor_liuqing': {      // 刘擎
    voice: 'Moon',
    instructions: '语气深邃理性，语速适中，带哲学思考和人文关怀',
  },
  'mentor_lidan': {        // 李诞（导师版）
    voice: 'Vincent',
    instructions: '语气懒散随意，带荒诞感和人间清醒，语速偏慢',
  },
};

/**
 * 根据发言者名字获取音色配置
 * @param {string} speakerName - 发言者名字（如'陈铭'）
 * @param {string} role - 角色类型（'host'|'speech'|'mentor'）
 * @returns {Object} { voice: string, instructions: string }
 */
function getVoiceProfile(speakerName, role) {
  // 主持人
  if (role === 'host' || speakerName === '马东') return VOICE_MAP['host_madong'];

  // 导师：模糊匹配
  if (role === 'mentor') {
    if (speakerName.includes('薛') || speakerName.includes('兆丰')) return VOICE_MAP['mentor_xuezhaofeng'];
    if (speakerName.includes('蔡') || speakerName.includes('康永')) return VOICE_MAP['mentor_caokangyong'];
    if (speakerName.includes('刘') || speakerName.includes('擎')) return VOICE_MAP['mentor_liuqing'];
    if (speakerName.includes('诞')) return VOICE_MAP['mentor_lidan'];
  }

  // 辩手：中文名直接查表，去除 "风格" 后缀
  const cleanName = speakerName.replace('风格', '').trim();
  const nameToKey = {
    '陈铭': 'chenming', '詹青云': 'zhanqingyun', '黄执中': 'huangzhizhong',
    '傅首尔': 'fushouer', '肖骁': 'xiaoxiao', '李诞': 'lidan',
    '颜如晶': 'yanrujing', '马薇薇': 'maweiwei', '邱晨': 'qiuchen',
    '姜思达': 'jiangsida', '席瑞': 'xirui', '范湉湉': 'fantiantian',
    '熊浩': 'xiong hao', '庞颖': 'pang ying', '储殷': 'chuyin',
    '胡渐彪': 'hu jianbiao', '程璐': 'chen lu',
  };
  const key = nameToKey[cleanName];
  if (key && VOICE_MAP[key]) return VOICE_MAP[key];

  // 默认
  return { voice: 'Cherry', instructions: '语气自然，语速适中' };
}

module.exports = { VOICE_MAP, getVoiceProfile };
