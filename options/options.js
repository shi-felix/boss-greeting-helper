// options.js - 设置页逻辑
// 职责：API key 保存、简历文件导入解析、结构化字段编辑保存

const FIELDS = ['name','years','currentJob','targetJob','skills','aiTools','projects','education','intention','highlight'];

document.addEventListener('DOMContentLoaded', async () => {
  await loadApiKey();
  await loadResume();
  bindEvents();
});

// ---------- API Key ----------
async function loadApiKey() {
  const { deepseek_api_key } = await chrome.storage.local.get('deepseek_api_key');
  if (deepseek_api_key) {
    document.getElementById('apiKey').value = deepseek_api_key;
    setKeyStatus('已保存', 'success');
  }
}

async function saveApiKey() {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) {
    setKeyStatus('请输入 API Key', 'error');
    return;
  }
  const btn = document.getElementById('saveKey');
  btn.disabled = true;
  setKeyStatus('保存中...', 'loading');
  try {
    await chrome.storage.local.set({ deepseek_api_key: key });
    setKeyStatus('保存成功', 'success');
  } catch (err) {
    setKeyStatus('失败：' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function setKeyStatus(msg, type) {
  const el = document.getElementById('keyStatus');
  el.textContent = msg;
  el.className = 'status ' + type;
}

// ---------- 简历导入 ----------
async function handleImport(file) {
  if (!file) return;
  setImportStatus('解析中...', 'loading');
  try {
    const text = await parseFile(file);
    if (!text || !text.trim()) {
      throw new Error('文件内容为空');
    }
    setImportStatus('AI 提取中...', 'loading');
    // 发给 background 用 DeepSeek 提取结构化字段
    const resp = await chrome.runtime.sendMessage({ type: 'EXTRACT_RESUME', text });
    if (!resp.success) throw new Error(resp.error);
    fillResumeForm(resp.data);
    showResumeForm();
    setImportStatus('提取完成，请核对', 'success');
  } catch (err) {
    setImportStatus('失败：' + err.message, 'error');
  }
}

// 根据文件类型解析为纯文本
async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt')) {
    return await file.text();
  }
  if (name.endsWith('.pdf')) {
    return await parsePdf(file);
  }
  if (name.endsWith('.docx')) {
    return await parseDocx(file);
  }
  throw new Error('不支持的文件类型，请使用 PDF / DOCX / TXT');
}

// pdf.js 解析 PDF
async function parsePdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF 解析库未加载，请检查 lib/pdf.min.js');
  }
  // 设置 worker（使用本地文件）
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

// mammoth.js 解析 Word
async function parseDocx(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('Word 解析库未加载，请检查 lib/mammoth.browser.min.js');
  }
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

// ---------- 简历表单 ----------
function fillResumeForm(data) {
  FIELDS.forEach(f => {
    const el = document.getElementById('r_' + f);
    if (el) el.value = data[f] || '';
  });
  syncAiToolsPresets();
}

function showResumeForm() {
  document.getElementById('resumeForm').classList.remove('hidden');
}

function hideResumeForm() {
  document.getElementById('resumeForm').classList.add('hidden');
}

function collectResume() {
  const obj = {};
  FIELDS.forEach(f => {
    const el = document.getElementById('r_' + f);
    obj[f] = el ? el.value.trim() : '';
  });
  return obj;
}

async function saveResume() {
  const btn = document.getElementById('saveResume');
  const status = document.getElementById('resumeSaveStatus');
  btn.disabled = true;
  status.textContent = '保存中...';
  status.className = 'status loading';
  try {
    const resume = collectResume();
    await chrome.storage.local.set({ resume_profile: resume });
    status.textContent = '已保存';
    status.className = 'status success';
  } catch (err) {
    status.textContent = '失败：' + err.message;
    status.className = 'status error';
  } finally {
    btn.disabled = false;
  }
}

async function clearResume() {
  if (!confirm('确定清空简历信息？')) return;
  await chrome.storage.local.remove('resume_profile');
  FIELDS.forEach(f => {
    const el = document.getElementById('r_' + f);
    if (el) el.value = '';
  });
  hideResumeForm();
  setImportStatus('已清空', 'success');
}

async function loadResume() {
  const { resume_profile } = await chrome.storage.local.get('resume_profile');
  if (resume_profile) {
    fillResumeForm(resume_profile);
    showResumeForm();
  }
}

function setImportStatus(msg, type) {
  const el = document.getElementById('importStatus');
  el.textContent = msg;
  el.className = 'status ' + type;
}

// ---------- 事件绑定 ----------
function bindEvents() {
  document.getElementById('saveKey').addEventListener('click', saveApiKey);

  const fileInput = document.getElementById('resumeFile');
  document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    handleImport(file);
    fileInput.value = ''; // 允许重复导入同一文件
  });

  document.getElementById('saveResume').addEventListener('click', saveResume);
  document.getElementById('clearResume').addEventListener('click', clearResume);

  // AI工具能力预设标签点击
  document.querySelectorAll('#aiToolsPresets .preset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const input = document.getElementById('r_aiTools');
      const val = tag.dataset.val;
      let tools = input.value.trim();
      if (tag.classList.contains('active')) {
        // 取消选中：移除
        tools = tools.split(/[，,、]/).map(s => s.trim()).filter(s => s && s !== val).join('、');
        // 保留前缀
        input.value = tools ? '熟练使用' + tools + '进行日常开发' : '';
        tag.classList.remove('active');
      } else {
        // 选中：添加
        const toolsArr = tools.replace(/^熟练使用/, '').replace(/进行日常开发$/, '').split(/[，,、]/).map(s => s.trim()).filter(s => s);
        if (!toolsArr.includes(val)) toolsArr.push(val);
        input.value = '熟练使用' + toolsArr.join('、') + '进行日常开发';
        tag.classList.add('active');
      }
    });
  });
}

// 根据输入框值同步预设标签的选中状态
function syncAiToolsPresets() {
  const input = document.getElementById('r_aiTools');
  if (!input) return;
  const val = input.value;
  document.querySelectorAll('#aiToolsPresets .preset-tag').forEach(tag => {
    if (val.includes(tag.dataset.val)) {
      tag.classList.add('active');
    } else {
      tag.classList.remove('active');
    }
  });
}
