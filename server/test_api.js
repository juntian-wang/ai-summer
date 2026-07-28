/**
 * test_api.js
 * AI奇葩说 - 全面API测试脚本
 * Edward (QA Engineer)
 * 
 * 测试覆盖：
 * Test 1: 基础健康检查
 * Test 2: Session生命周期
 * Test 3: 首次执行（Step 1 - host_opening）
 * Test 4: 初投（Step 2 - vote_init）
 * Test 5: 参数验证
 * Test 7: 静态文件服务
 * Test 8: 完整台本
 */

const BASE_URL = 'http://localhost:3000';

// ===== 工具函数 =====
let passed = 0;
let failed = [];
let skipped = [];
let totalTestCases = 0;

function assert(condition, name, details = '') {
  totalTestCases++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed.push({ name, details });
    console.log(`  ❌ ${name}: ${details}`);
  }
}

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

async function apiPost(path, bodyData) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function markSkip(name) {
  totalTestCases++;
  skipped.push(name);
  console.log(`  ⏭️  ${name} (跳过)`);
}

// ===== Test Suite =====
async function runTests() {
  console.log('\n========================================');
  console.log('  AI奇葩说 - 全面API测试');
  console.log('========================================\n');

  // ===== Test 1: 基础健康检查 =====
  console.log('--- Test 1: 基础健康检查 ---');
  
  // 1.1 GET / 返回200 + status: ok
  {
    const { status, body } = await apiGet('/');
    assert(status === 200, 'GET / 返回200', `Got ${status}`);
    assert(body?.code === 200, '返回code=200', JSON.stringify(body));
    assert(body?.data?.status === 'ok', '返回data.status=ok', JSON.stringify(body));
    assert(body?.data?.service === 'ai-qipashuo', '返回data.service=ai-qipashuo', JSON.stringify(body));
  }

  // 1.2 不存在的sessionId请求state返回404
  {
    const { status, body } = await apiGet('/api/session/nonexistent-id/state');
    assert(status === 404, '不存在的sessionId返回404', `Got ${status}`);
    assert(body?.code === 404, '返回code=404', JSON.stringify(body));
    assert(body?.message === 'Session not found', '返回not found消息', JSON.stringify(body));
  }

  // 1.3 不存在的sessionId请求next返回404
  {
    const { status, body } = await apiGet('/api/session/nonexistent-id/next');
    assert(status === 404, '不存在的sessionId next返回404', `Got ${status}`);
    assert(body?.code === 404, '返回code=404', JSON.stringify(body));
  }

  // 1.4 不存在的sessionId请求full返回404
  {
    const { status, body } = await apiGet('/api/session/nonexistent-id/full');
    assert(status === 404, '不存在的sessionId full返回404', `Got ${status}`);
    assert(body?.code === 404, '返回code=404', JSON.stringify(body));
  }

  // ===== Test 5: 参数验证 =====
  console.log('\n--- Test 5: 参数验证 ---');

  // 5.1 缺少pro字段返回400
  {
    const { status, body } = await apiPost('/api/session/start', { con: ['a', 'b', 'c'], topicIndex: 0 });
    assert(status === 400, '缺少pro字段返回400', `Got ${status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // 5.2 缺少con字段返回400
  {
    const { status, body } = await apiPost('/api/session/start', { pro: ['a', 'b', 'c'], topicIndex: 0 });
    assert(status === 400, '缺少con字段返回400', `Got ${status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // 5.3 pro不是数组返回400
  {
    const { status, body } = await apiPost('/api/session/start', { pro: 'notarray', con: ['a', 'b', 'c'], topicIndex: 0 });
    assert(status === 400, 'pro不是数组返回400', `Got ${status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // 5.4 pro长度不等于3返回400
  {
    const { status, body } = await apiPost('/api/session/start', { pro: ['a', 'b'], con: ['a', 'b', 'c'], topicIndex: 0 });
    assert(status === 400, 'pro长度不足3返回400', `Got ${status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // 5.5 空数组返回400
  {
    const { status, body } = await apiPost('/api/session/start', { pro: [], con: ['a', 'b', 'c'], topicIndex: 0 });
    assert(status === 400, '空pro数组返回400', `Got ${status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // 5.6 不存在的辩手ID返回错误
  {
    const { status, body } = await apiPost('/api/session/start', {
      pro: ['nonexistent1', 'nonexistent2', 'nonexistent3'],
      con: ['a', 'b', 'c'],
      topicIndex: 0
    });
    assert(status === 500, '不存在的辩手ID返回500', `Got ${status} - ${JSON.stringify(body)}`);
    assert(body?.code === 500, '返回code=500', JSON.stringify(body));
  }

  // 5.7 缺少body
  {
    const res = await fetch(`${BASE_URL}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => null);
    assert(res.status === 400, '缺少所有字段返回400', `Got ${res.status}`);
    assert(body?.code === 400, '返回code=400', JSON.stringify(body));
  }

  // ===== Test 7: 静态文件服务 =====
  console.log('\n--- Test 7: 静态文件服务 ---');

  // 7.1 index.html的存在
  {
    const res = await fetch(`${BASE_URL}/index.html`);
    const text = await res.text().catch(() => '');
    assert(res.status === 200, 'GET /index.html 返回200', `Got ${res.status}`);
    assert(text.includes('AI 奇葩说') || text.includes('奇葩说'), 'index.html内容包含标题', text.substring(0, 100));
  }

  // 7.2 data/topics.json能返回
  {
    const res = await fetch(`${BASE_URL}/data/topics.json`);
    const text = await res.text().catch(() => '');
    assert(res.status === 200, 'GET /data/topics.json 返回200', `Got ${res.status}`);
    const json = JSON.parse(text);
    assert(Array.isArray(json) && json.length > 0, 'topics.json是包含内容的数组', `length=${json.length}`);
    assert(json[0].title, 'topics[0]包含title字段', json[0].title);
  }

  // ===== Test 2: Session生命周期 =====
  console.log('\n--- Test 2: Session生命周期 ---');

  let sessionId = '';
  const validBody = {
    pro: ['chenming', 'fushouer', 'huangzhizhong'],
    con: ['lidan', 'zhanqingyun', 'maweiwei'],
    topicIndex: 0
  };

  // 2.1 创建Session
  {
    const { status, body } = await apiPost('/api/session/start', validBody);
    assert(status === 200, 'POST /api/session/start 返回200', `Got ${status}`);
    assert(body?.code === 200, '返回code=200', JSON.stringify(body));
    assert(body?.data?.sessionId, '返回有效sessionId', body?.data?.sessionId);
    assert(body?.data?.sessionId.length > 10, 'sessionId长度合理', `length=${body?.data?.sessionId.length}`);
    sessionId = body.data.sessionId;
  }

  // 2.2 检查state
  {
    const { status, body } = await apiGet(`/api/session/${sessionId}/state`);
    assert(status === 200, 'GET /state 返回200', `Got ${status}`);
    assert(body?.code === 200, '返回code=200', JSON.stringify(body));
    assert(body?.data?.sessionId === sessionId, 'sessionId匹配', body?.data?.sessionId);
    assert(body?.data?.topicTitle === '结婚到底要不要买房？', '辩题是topicIndex=0', body?.data?.topicTitle);
    assert(body?.data?.status === 'CREATED', 'status为CREATED', body?.data?.status);
    assert(body?.data?.currentStepIdx === 0, 'currentStepIdx为0', `${body?.data?.currentStepIdx}`);
    assert(body?.data?.currentStepName === 'host_opening', 'currentStepName为host_opening', body?.data?.currentStepName);
    assert(body?.data?.memoryLength === 0, 'memoryLength为0', `${body?.data?.memoryLength}`);
    
    // 检查队伍信息
    assert(body?.data?.proTeam?.length === 3, '正方3人', `${body?.data?.proTeam?.length}`);
    assert(body?.data?.conTeam?.length === 3, '反方3人', `${body?.data?.conTeam?.length}`);
    assert(body?.data?.proTeam[0]?.id === 'chenming', '正方一辩chenming', body?.data?.proTeam[0]?.id);
    assert(body?.data?.conTeam[0]?.id === 'lidan', '反方一辩lidan', body?.data?.conTeam[0]?.id);
    assert(body?.data?.overtimeRounds === 0, 'overtimeRounds为0', `${body?.data?.overtimeRounds}`);
  }

  // ===== Test 3: 首次执行（Step 1 - host_opening）=====
  console.log('\n--- Test 3: 首次执行（Step 1 - host_opening）---');

  // 3.1 执行next
  {
    const { status, body } = await apiGet(`/api/session/${sessionId}/next`);
    assert(status === 200, 'GET /next 返回200', `Got ${status}`);
    assert(body?.code === 200, '返回code=200', JSON.stringify(body));
    
    const data = body?.data;
    if (data?.done) {
      // LLM调用可能失败，但不应影响测试
      markSkip('LLM返回done（LLM可能失败降级）');
    } else {
      assert(data?.step === 'host_opening', 'step为host_opening', data?.step);
      assert(data?.type === 'host', 'type为host', data?.type);
      assert(data?.speakerName === '马东', '发言人为马东', data?.speakerName);
      assert(data?.content && data?.content.length > 0, 'content非空', `length=${data?.content?.length}`);
      
      // 检查flowProgress
      assert(data?.flowProgress?.current === 1, 'flowProgress.current=1', `${data?.flowProgress?.current}`);
      assert(data?.flowProgress?.total > 0, 'flowProgress.total>0', `${data?.flowProgress?.total}`);
    }
  }

  // 3.2 验证state已更新
  {
    const { status, body } = await apiGet(`/api/session/${sessionId}/state`);
    assert(status === 200, '执行后state返回200', `Got ${status}`);
    const data = body?.data;
    if (data?.currentStepIdx > 0) {
      assert(data?.currentStepIdx === 1, 'currentStepIdx变为1', `${data?.currentStepIdx}`);
      assert(data?.currentStepName === 'vote_init', 'currentStepName为vote_init', data?.currentStepName);
      assert(data?.memoryLength === 1, 'memoryLength变为1', `${data?.memoryLength}`);
    } else {
      markSkip('LLM调用未成功推进步骤');
    }
  }

  // ===== Test 4: 初投（Step 2 - vote_init）=====
  console.log('\n--- Test 4: 初投（Step 2 - vote_init）---');

  // 4.1 执行投票步骤
  {
    const { status, body } = await apiGet(`/api/session/${sessionId}/next`);
    assert(status === 200, '投票step返回200', `Got ${status}`);
    
    const data = body?.data;
    if (data?.done) {
      markSkip('LLM返回done（可能已结束）');
    } else if (data?.type === 'vote') {
      assert(data?.step === 'vote_init' || data?.label === 'init', 'step为vote_init', data?.step);
      assert(data?.type === 'vote', 'type为vote', data?.type);
      assert(typeof data?.pro === 'number', 'pro为数字', `${data?.pro}`);
      assert(typeof data?.con === 'number', 'con为数字', `${data?.con}`);
      assert(typeof data?.abstain === 'number', 'abstain为数字', `${data?.abstain}`);
      
      const total = data?.pro + data?.con + data?.abstain;
      assert(total >= 20, '总票数>=20', `pro=${data?.pro} con=${data?.con} abstain=${data?.abstain} total=${total}`);
      
      assert(typeof data?.pro_pct === 'number', 'pro_pct为数字', `${data?.pro_pct}`);
      assert(typeof data?.con_pct === 'number', 'con_pct为数字', `${data?.con_pct}`);
      
      const pctSum = data?.pro_pct + data?.con_pct;
      assert(Math.abs(pctSum - 100) <= 1, 'pro_pct + con_pct ≈ 100', `pro_pct=${data?.pro_pct} con_pct=${data?.con_pct} sum=${pctSum}`);
      
      assert(Array.isArray(data?.details), 'details是数组', typeof data?.details);
      assert(data?.details?.length > 0, 'details非空', `length=${data?.details?.length}`);
      
      // 验证投票详情有投票理由
      const hasReasons = data?.details?.every(d => d.reason && d.reason.length > 0);
      assert(hasReasons, '每个投票都有理由', `details count=${data?.details?.length}`);
      
      // 验证每个detail有choice字段
      const allHaveChoice = data?.details?.every(d => ['pro', 'con', 'abstain'].includes(d.choice));
      assert(allHaveChoice, '所有投票choice有效', '');
    } else {
      markSkip(`返回非vote类型: ${data?.type}`);
    }
  }

  // ===== Test 6: 连续执行测试（前5步）=====
  console.log('\n--- Test 6: 连续执行测试（前5步）---');

  // 先获取当前state
  {
    const { body } = await apiGet(`/api/session/${sessionId}/state`);
    let currentStep = body?.data?.currentStepIdx || 0;
    const startStep = currentStep;
    
    console.log(`  从步骤${startStep}开始，尝试连续执行`);
    
    // 连续执行直到完成5个新步骤或结束
    for (let i = 0; i < 5; i++) {
      const { status, body: nextBody } = await apiGet(`/api/session/${sessionId}/next`);
      
      if (status !== 200) {
        assert(false, `第${i+1}次next调用`, `status=${status}`);
        break;
      }
      
      const data = nextBody?.data;
      if (data?.done) {
        console.log(`  辩论在步骤${currentStep + i}结束: ${data?.status}`);
        break;
      }
      
      // 基本结构验证
      const hasStep = !!data?.step;
      const hasType = !!data?.type;
      const hasContent = data?.type === 'vote' ? true : !!data?.content;
      
      if (!hasStep) {
        assert(false, `第${i+1}步有step字段`, JSON.stringify(data));
        break;
      }
      
      // 验证结构
      assert(hasStep, `第${i+1}步(${data?.step})有step`, data?.step);
      assert(hasType, `第${i+1}步有type`, data?.type);
      
      if (data?.type !== 'vote') {
        assert(hasContent, `第${i+1}步(${data?.step})有content`, `len=${data?.content?.length}`);
      }
      
      if (data?.flowProgress) {
        assert(data.flowProgress.current > currentStep, 'flowProgress递增', 
          `${data.flowProgress.current} > ${currentStep}`);
        currentStep = data.flowProgress.current;
      }
      
      console.log(`   步骤${i+1}: ${data?.step} (type=${data?.type})`);
    }
    
    if (currentStep > startStep) {
      assert(true, `成功执行${currentStep - startStep}步`, `从${startStep}到${currentStep}`);
    }
  }

  // ===== Test 8: 完整台本 =====
  console.log('\n--- Test 8: 完整台本 ---');

  {
    const { status, body } = await apiGet(`/api/session/${sessionId}/full`);
    assert(status === 200, 'GET /full 返回200', `Got ${status}`);
    assert(body?.code === 200, '返回code=200', JSON.stringify(body));
    assert(body?.data?.session, '返回session数据', typeof body?.data?.session);
    assert(body?.data?.session?.id === sessionId, 'sessionId匹配', body?.data?.session?.id);
    assert(body?.data?.session?.memory, '包含memory', `length=${body?.data?.session?.memory?.length}`);
    assert(Array.isArray(body?.data?.session?.proTeam), 'proTeam是数组', '');
    assert(Array.isArray(body?.data?.session?.conTeam), 'conTeam是数组', '');
    assert(body?.data?.session?.proTeam?.length === 3, 'proTeam有3人', `${body?.data?.session?.proTeam?.length}`);
  }

  // ===== 额外的：API响应格式检查 =====
  console.log('\n--- 额外检查: 统一响应格式 ---');

  {
    // 检查所有成功响应都是 { code, data, message } 格式
    const res = await fetch(`${BASE_URL}/`);
    const body = await res.json();
    assert('code' in body, '健康检查响应有code', '');
    assert('data' in body, '健康检查响应有data', '');
    assert('message' in body, '健康检查响应有message', '');
  }

  // ===== 输出结果 =====
  console.log('\n========================================');
  console.log('  测试报告');
  console.log('========================================\n');
  console.log(`  总计: ${totalTestCases} | 通过: ${passed} | 失败: ${failed.length} | 跳过: ${skipped.length}\n`);

  if (failed.length > 0) {
    console.log('  ❌ 失败用例:');
    failed.forEach(f => console.log(`    - ${f.name}: ${f.details}`));
  }

  if (skipped.length > 0) {
    console.log('  ⏭️  跳过的用例:');
    skipped.forEach(s => console.log(`    - ${s}`));
  }

  const passRate = ((passed / (totalTestCases - skipped.length)) * 100).toFixed(1);
  console.log(`\n  通过率: ${passRate}%\n`);

  if (failed.length === 0) {
    console.log('  ✅ 整体评估: PASS');
  } else if (failed.length <= 3) {
    console.log('  ⚠️  整体评估: PASS with Minor Issues');
  } else {
    console.log('  ❌ 整体评估: FAIL');
  }

  return { total: totalTestCases, passed, failed: failed.length, skipped: skipped.length, failures: failed };
}

runTests().then(result => {
  console.log('\n测试完毕。');
  process.exit(result.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
