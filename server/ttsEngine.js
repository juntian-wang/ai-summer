/**
 * ttsEngine.js
 * AI奇葩说 - 通义千问 TTS 引擎
 * 调用 DashScope qwen3-tts-instruct-flash 生成辩论语音
 */

const fs = require('fs');
const path = require('path');
const { getVoiceProfile } = require('./voiceMapping');

const API_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MODEL = 'qwen3-tts-instruct-flash';
const AUDIO_DIR = path.join(__dirname, 'audio');

// 确保 audio 目录存在
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * 生成一段辩论语音
 * @param {string} text - 要合成的文本
 * @param {string} speakerName - 发言者名字（用于匹配音色）
 * @param {string} role - 角色类型 host|speech|mentor
 * @param {string} sessionId - 会话ID（用于文件名）
 * @param {number} stepIdx - 步骤索引（用于文件名）
 * @returns {Promise<{success: boolean, audioUrl: string|null, error: string|null}>}
 */
async function generateSpeech(text, speakerName, role, sessionId, stepIdx) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.warn('[ttsEngine] DASHSCOPE_API_KEY 未配置，跳过语音生成');
    return { success: false, audioUrl: null, error: 'API Key未配置' };
  }

  if (!text || text.length < 2) {
    return { success: false, audioUrl: null, error: '文本太短' };
  }

  // TTS模型有中文字数限制（约300字），超长则截断
  const MAX_LEN = 280;
  let ttsText = text;
  console.log(`[ttsEngine] 原始文本长度: ${text.length}字`);
  if (ttsText.length > MAX_LEN) {
    // 从末尾截取（保留结尾的完整句子）
    ttsText = ttsText.slice(-MAX_LEN);
    // 尝试从句号/问号/感叹号处切分，确保句子完整
    const punctMatch = ttsText.match(/[。！？.!?]/);
    if (punctMatch && punctMatch.index > 0) {
      ttsText = ttsText.slice(punctMatch.index + 1);
    }
    console.log(`[ttsEngine] 文本超长已截断: ${text.length}→${ttsText.length}`);
  } else {
    console.log(`[ttsEngine] 文本长度正常: ${ttsText.length}字`);
  }

  const profile = getVoiceProfile(speakerName, role);

  try {
    // 1. 调用 DashScope TTS API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: {
          text: ttsText,
          voice: profile.voice,
          language_type: 'Chinese',
          instructions: profile.instructions,
          optimize_instructions: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ttsEngine] API 请求失败: ${response.status} ${errText}`);
      return { success: false, audioUrl: null, error: `API错误: ${response.status}` };
    }

    const data = await response.json();

    // 2. 获取音频 URL
    const audioUrl = data?.output?.audio?.url;
    if (!audioUrl) {
      console.error('[ttsEngine] 响应中没有音频URL:', JSON.stringify(data).slice(0, 200));
      return { success: false, audioUrl: null, error: '无音频URL' };
    }

    // 3. 下载音频到本地
    const safeName = `${sessionId || 'unknown'}_${stepIdx || Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(AUDIO_DIR, `${safeName}.wav`);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error(`[ttsEngine] 下载音频失败: ${audioResponse.status}`);
      return { success: false, audioUrl: null, error: '下载失败' };
    }

    const buffer = Buffer.from(await audioResponse.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const localUrl = `/audio/${safeName}.wav`;
    console.log(`[ttsEngine] ✅ 语音生成成功: ${speakerName} → ${localUrl} (${(buffer.length/1024).toFixed(0)}KB)`);

    return { success: true, audioUrl: localUrl, error: null };

  } catch (err) {
    console.error(`[ttsEngine] 语音生成异常:`, err.message);
    return { success: false, audioUrl: null, error: err.message };
  }
}

module.exports = { generateSpeech };
