// background service worker
// 职责：调用 DeepSeek API（避开 content script 的 CORS 限制）、点击图标/浮动按钮打开侧边栏

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// ★ 消息监听必须先注册，且不能被后面的异常中断
// content script 浮动按钮 → 通知打开侧边栏
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'OPEN_PANEL') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      openSidePanel(tabId, 'panel/panel.html')
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: '无标签页上下文' });
    }
    return true;
  }

  if (request.type === 'GENERATE_GREETING') {
    generateGreeting(request.jd, request.resume)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 异步响应
  }

  if (request.type === 'EXTRACT_RESUME') {
    extractResumeFields(request.text)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 点击插件图标 → 在浏览器侧边栏打开生成界面 panel.html
chrome.action.onClicked.addListener(async (tab) => {
  await openSidePanel(tab.id, 'panel/panel.html');
});

async function openSidePanel(tabId, path) {
  // 用 try/catch 保护，确保 sidePanel 异常不会让其它逻辑失效
  try {
    await chrome.sidePanel.setOptions({ tabId, path, enabled: true });
    await chrome.sidePanel.open({ tabId });
  } catch (e) {
    // 侧边栏不可用时，降级为新标签页
    await chrome.tabs.create({ url: path });
  }
}

// 允许侧边栏在所有页面可用（点击图标即打开），放在最后，异常不影响上面逻辑
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (e) { /* 忽略，侧边栏不可用时走 openSidePanel 的降级 */ }

// 从存储取 API key
async function getApiKey() {
  const { deepseek_api_key } = await chrome.storage.local.get('deepseek_api_key');
  if (!deepseek_api_key) {
    throw new Error('未配置 DeepSeek API Key，请在设置页填写');
  }
  return deepseek_api_key;
}

// 通用 DeepSeek 调用（带超时，避免一直卡在"生成中"）
async function callDeepSeek(messages, temperature = 0.8) {
  const apiKey = await getApiKey();
  // 60秒超时
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let resp;
  try {
    resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature,
        stream: false
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('生成超时（60秒），请重试');
    }
    throw new Error('网络请求失败：' + err.message);
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek 请求失败(${resp.status})：${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// 生成打招呼语：JD + 简历 → 3 条 100 字内匹配型打招呼语
async function generateGreeting(jd, resume) {
  const resumeText = buildResumeText(resume);

  const systemPrompt = `你是求职打招呼语撰写助手。根据岗位JD和候选人简历，生成3条高转化打招呼语。

核心目标：让HR看到后愿意回复，提升约面率。

每条招呼语必须放入以下三位一体内容（缺一不可）：
1. 【具体工作经验】：如"3年后端","1年AI应用开发"，突出与JD匹配的领域经验，用年限+领域说明，不要只写"有经验"。
2. 【擅长技术方向】：从简历项目/技能中提炼成方向词（如：智能问答、知识库构建、RAG应用开发、Agent工作流、全栈开发），要具体到做过的方向，而不是J**的通用方向。
3. 【亮点项目】：挑1个最亮的项目，说清"做了什么+达到什么效果"（如"搭过知识库问答系统，支持万级文档检索"）。

禁止项（绝对不要出现）：
- 空泛的吃苦耐劳/性格描述：如"吃苦耐劳""责任心强""学习能力强""抗压能力强""认真负责""踏实肯干"等纯形容词堆砌，无信息量的自我评价
- 套话和AI味："您好""贵公司""契合度""赋能""助力""深入""扎实""丰富""期望""机会"等
- 无匹配点的通用话术

策略：
1. 对照JD要求逐条匹配，从JD核心要求中找1-2个点，用上面的三位一体内容精准回应
2. AI工具能力（Codex/Claude Code/Cursor等）作为加分项自然融入，不喧宾夺主
3. 3条要差异化：分别侧重不同匹配点（如一条突出项目、一条突出技术方向、一条突出工作经验+AI能力）

风格要求：
1. 字数60-90字以内（精炼，信息密度高）
2. 真诚口语化，像真人随手发的消息
3. 开头用"哈喽""你好"或直接说重点
4. 结尾简短表达沟通意愿（"方便聊聊？""可以沟通下吗"），不过度谦卑
5. 必须是完整句子

示例：
- 差："您好，我有相关经验，能吃苦耐劳，希望有机会和您聊聊。"（空泛无信息）
- 好："哈喽，3年前端经验，做过知识库问答项目（LangChain+RAG，支持万级文档检索），看你JD也在做AI应用，方便聊聊？"

输出格式：严格按JSON数组输出，不要任何额外说明文字
["打招呼语1","打招呼语2","打招呼语3"]`;

  const userPrompt = `【岗位JD】
${jd}

【我的简历核心信息】
${resumeText}

请针对该JD生成3条打招呼语。每条必须包含具体工作经验、擅长技术方向、亮点项目，禁止空泛的吃苦耐劳类描述。`;

  const content = await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 0.85);

  return parseGreetingResult(content);
}

// 解析生成结果（容错：可能带 markdown 代码块）
function parseGreetingResult(content) {
  let text = content.trim();
  // 去除可能的 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) {
    throw new Error('生成结果格式异常');
  }
  // 取前3条，不截断（长度由 prompt 控制，UI 显示字数警告）
  return arr.slice(0, 3).map(s => String(s).trim());
}

// 简历结构化字段 → Prompt 文本
function buildResumeText(resume) {
  if (!resume) return '(未提供简历信息)';
  const parts = [];
  if (resume.name) parts.push(`姓名: ${resume.name}`);
  if (resume.years) parts.push(`工作年限: ${resume.years}`);
  if (resume.currentJob) parts.push(`当前职位: ${resume.currentJob}`);
  if (resume.targetJob) parts.push(`目标职位: ${resume.targetJob}`);
  // 技术栈单独强调（生成打招呼语时最关键）
  if (resume.skills) parts.push(`【技术栈详情】: ${resume.skills}`);
  if (resume.aiTools) parts.push(`【AI工具能力】: ${resume.aiTools}`);
  if (resume.projects) parts.push(`亮点项目: ${resume.projects}`);
  if (resume.education) parts.push(`学历: ${resume.education}`);
  if (resume.intention) parts.push(`求职意向: ${resume.intention}`);
  if (resume.highlight) parts.push(`个人亮点: ${resume.highlight}`);
  return parts.join('\n') || '(简历信息为空)';
}

// 把简历纯文本提取成结构化字段
async function extractResumeFields(text) {
  // 文本过长截断，避免 token 浪费
  const truncated = text.slice(0, 6000);

  const systemPrompt = `你是简历信息提取助手。从简历文本中提取结构化字段，用于生成求职打招呼语。

提取要求（重要）：
1. projects字段：提取1-3个最重要的项目，每个项目要详细描述，包含：项目名、你的角色、用了什么技术栈、做了什么、解决了什么问题或达到什么效果。每个项目100-200字。
2. aiTools字段：只提取具体的AI编程工具名称，如 Codex、Claude Code、Cursor、Trae、Copilot、通义灵码等。格式："熟练使用Codex、Claude Code、Cursor进行日常开发"。如果简历没提AI工具，填""。
3. skills字段：提取所有出现的技术栈，按语言/框架/数据库/工具分类，逗号分隔，尽量具体。
4. 其他字段：如实提取，不要编造。

输出格式：严格按JSON对象输出，不要任何额外说明文字。字段缺失时填空字符串""。
{
  "name": "姓名",
  "years": "工作年限（如3年）",
  "currentJob": "当前/最近职位",
  "targetJob": "目标职位",
  "skills": "技术栈详情，分类列出（如：Python/Java/Go, FastAPI/SpringBoot/Gin, MySQL/Redis/MongoDB, LangChain/Docker/Git等）",
  "aiTools": "AI编程工具名称（如：熟练使用Codex、Claude Code、Cursor进行日常开发）。简历没提AI工具就填空字符串",
  "projects": "项目1：项目名 - 角色 - 技术栈 - 做了什么 - 效果。项目2：... 每个项目详细描述",
  "education": "学历（如本科/硕士+学校+专业+毕业年份）",
  "intention": "求职意向（方向/城市/薪资期望如有）",
  "highlight": "一句话个人亮点（如：3年Python后端经验，主导过百万级QPS系统）"
}`;

  const userPrompt = `【简历文本】
${truncated}

请按上述要求提取结构化字段，projects要详细，aiTools只填工具名。`;

  const content = await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 0.2);

  let text2 = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  return JSON.parse(text2);
}
