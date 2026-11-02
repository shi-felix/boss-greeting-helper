// panel.js - 侧边栏生成打招呼语界面
// 职责：从storage读JD自动填入、调background生成、显示3条候选、一键复制、跳转设置

const els = {
  jdText: document.getElementById('jdText'),
  reRead: document.getElementById('reRead'),
  pasteJd: document.getElementById('pasteJd'),
  genBtn: document.getElementById('genBtn'),
  regenBtn: document.getElementById('regenBtn'),
  greetList: document.getElementById('greetList'),
  errorBox: document.getElementById('errorBox'),
  statusTip: document.getElementById('statusTip'),
  goSettings: document.getElementById('goSettings')
};

document.addEventListener('DOMContentLoaded', async () => {
  // 加载时恢复上次的状态（JD + 打招呼语）
  const { current_jd, last_greetings } = await chrome.storage.local.get(['current_jd', 'last_greetings']);
  if (current_jd) {
    els.jdText.value = current_jd;
  }
  if (last_greetings && last_greetings.length) {
    renderGreetings(last_greetings);
    els.regenBtn.style.display = '';
  }
  bindEvents();
  // 通知 content script 重新读取最新 JD（应对切岗位后未刷新）
  // 只在 panel 首次打开且没有上次内容时自动刷新
  if (!current_jd) {
    refreshJdFromPage();
  }
});

// 监听 storage 变化：content script 读到新 JD 后更新 JD 框
// 只在用户没手动编辑且新JD与当前不同时更新，避免覆盖用户操作
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.current_jd && changes.current_jd.newValue) {
    if (!els.jdText.dataset.userEdited && changes.current_jd.newValue !== els.jdText.value) {
      els.jdText.value = changes.current_jd.newValue;
    }
  }
});

// 通知 content script 重新读 JD（先发 storage 信号，再发消息双保险）
async function refreshJdFromPage() {
  // 1. storage 信号（触发 content script 的 onChanged）
  await chrome.storage.local.set({ request_read_jd: Date.now() });
  // 2. 直接发消息给当前 tab 的 content script
  try {
    const tab = await getCurrentTab();
    if (!tab || !/zhipin\.com/.test(tab.url || '')) return;
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'READ_JD' });
    if (resp && resp.success && resp.jd && !els.jdText.dataset.userEdited) {
      els.jdText.value = resp.jd;
    }
  } catch (e) {
    // content script 可能未注入，忽略
  }
}

function bindEvents() {
  // 用户手动编辑 JD 时打标记，避免被自动刷新覆盖
  els.jdText.addEventListener('input', () => {
    els.jdText.dataset.userEdited = '1';
  });

  // 粘贴按钮：清空当前JD并粘贴剪贴板内容
  els.pasteJd.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showError('剪贴板为空');
        return;
      }
      els.jdText.value = text.trim();
      els.jdText.dataset.userEdited = '1';
      showError('');
    } catch (e) {
      showError('读取剪贴板失败，请手动粘贴（Ctrl+V）');
    }
  });

  els.reRead.addEventListener('click', async () => {
    // 清除编辑标记，强制从页面重新读取
    delete els.jdText.dataset.userEdited;
    await refreshJdFromPage();
    if (!els.jdText.value.trim()) {
      showError('未读取到JD，请手动粘贴');
    } else {
      showError('');
    }
  });

  els.genBtn.addEventListener('click', onGenerate);
  els.regenBtn.addEventListener('click', onGenerate);

  els.goSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function onGenerate() {
  const jd = els.jdText.value.trim();
  if (!jd) {
    showError('请先填写岗位JD');
    return;
  }
  showError('');
  setBusy(true);
  els.greetList.innerHTML = '<div class="empty">正在生成，请稍候...</div>';
  els.regenBtn.style.display = 'none';

  try {
    const { resume_profile } = await chrome.storage.local.get('resume_profile');
    if (!resume_profile) {
      throw new Error('未导入简历，请点右上角设置图标先导入简历');
    }
    // 调用 background，前端 45 秒兜底超时，避免无限转圈
    const resp = await withTimeout(
      chrome.runtime.sendMessage({ type: 'GENERATE_GREETING', jd, resume: resume_profile }),
      45000,
      '生成无响应（45秒），可能是后台服务异常，请重试'
    );
    if (!resp.success) throw new Error(resp.error);
    renderGreetings(resp.data);
    els.regenBtn.style.display = '';
    // 保存到 storage，重开 panel 时恢复
    await chrome.storage.local.set({ last_greetings: resp.data });
  } catch (err) {
    els.greetList.innerHTML = '';
    showError(err.message || '生成失败');
  } finally {
    setBusy(false);
  }
}

// Promise 超时包装：超时则 reject
function withTimeout(promise, ms, timeoutMsg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function setBusy(busy) {
  els.genBtn.disabled = busy;
  els.regenBtn.disabled = busy;
  els.statusTip.textContent = busy ? '生成中...' : '';
  if (busy) {
    els.genBtn.innerHTML = '<span class="spinner"></span> 生成中...';
  } else {
    els.genBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> 生成打招呼语';
  }
}

function renderGreetings(list) {
  if (!list || !list.length) {
    els.greetList.innerHTML = '<div class="empty">未生成结果</div>';
    return;
  }
  els.greetList.innerHTML = '';
  list.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'greet-item';
    // 超过80字标红警告（精炼优先，目标50-80字）
    const overLimit = g.length > 80;
    const countClass = overLimit ? 'count over-limit' : 'count';
    const countText = overLimit ? `${g.length}字 (偏长，建议删减)` : `${g.length}字`;
    item.innerHTML = `
      <div class="greet-text">${escapeHtml(g)}</div>
      <div class="greet-actions">
        <button class="btn btn-copy" data-idx="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          复制
        </button>
        <span class="${countClass}">${countText}</span>
      </div>
    `;
    const btn = item.querySelector('.btn-copy');
    btn.addEventListener('click', () => copyText(g, btn));
    els.greetList.appendChild(item);
  });
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>已复制';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = orig;
    }, 1500);
  } catch (e) {
    showError('复制失败：' + e.message);
  }
}

function showError(msg) {
  if (msg) {
    els.errorBox.textContent = msg;
    els.errorBox.style.display = 'block';
  } else {
    els.errorBox.style.display = 'none';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
