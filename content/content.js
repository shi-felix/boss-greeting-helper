// content.js - 注入 Boss直聘岗位详情页
// 职责：右上角浮动小按钮（不遮挡立即沟通）+ 读取JD + 响应侧边栏的JD请求

(function () {
  'use strict';

  // 避免重复注入
  if (window.__BOSS_GREETING_INJECTED__) return;
  window.__BOSS_GREETING_INJECTED__ = true;

  // ---------- 浮动小按钮（Shadow DOM 隔离样式） ----------
  const host = document.createElement('div');
  host.id = 'boss-greeting-host';
  host.style.cssText = 'position:fixed !important; z-index:2147483647 !important; top:0 !important; right:0 !important;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .fab {
        position: fixed; top: 80px; right: 16px;
        width: 40px; height: 40px; border-radius: 50%;
        background: #3A7BC8; color: #fff; border: none; cursor: pointer;
        box-shadow: 0 2px 8px rgba(58,123,200,0.4);
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s, background 0.15s;
        padding: 0;
      }
      .fab:hover { background: #3270b5; transform: scale(1.06); }
      .fab svg { width: 20px; height: 20px; }
      .fab .tip {
        position: absolute; right: 48px; top: 50%; transform: translateY(-50%);
        background: #1a2332; color: #fff; font-size: 12px; padding: 4px 8px;
        border-radius: 6px; white-space: nowrap; opacity: 0; pointer-events: none;
        transition: opacity 0.15s; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .fab:hover .tip { opacity: 1; }
    </style>
    <button class="fab" id="fab" title="打招呼助手">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <span class="tip">打招呼助手</span>
    </button>
  `;

  const fab = shadow.getElementById('fab');
  fab.addEventListener('click', () => {
    // 读取当前JD并暂存到 storage，供侧边栏读取
    saveCurrentJd();
    // 通知 background 打开侧边栏
    chrome.runtime.sendMessage({ type: 'OPEN_PANEL' }, (resp) => {
      if (chrome.runtime.lastError) {
        // background 可能未就绪，忽略
      }
    });
  });

  // ---------- JD 读取：多 selector 容错 + 关键词锚点定位 ----------
  function readJdFromPage() {
    const parts = [];

    // 职位名
    const titleSels = [
      '.job-banner .name h1',
      '.info-primary .name h1',
      '.job-title',
      '.name .job-name',
      'h1.name',
      '[class*="job-name"]'
    ];
    const titleEl = queryFirst(titleSels);
    if (titleEl) parts.push('【职位】' + titleEl.innerText.trim());

    // 薪资 / 经验 / 学历（顶部信息条）
    const infoSels = [
      '.job-banner .info-primary p',
      '.job-detail .job-info',
      '.info-primary .info',
      '.job-info .salary',
      '.job-tags'
    ];
    const infoEl = queryFirst(infoSels);
    if (infoEl) parts.push(infoEl.innerText.trim());

    // JD 详情正文：先用固定 selector，再用关键词锚点兜底
    const detailSels = [
      '.job-sec-text',
      '.job-detail .job-sec-text',
      '.job-detail .text',
      '.job-detail-section .text',
      '.detail-content .text',
      '.text.fold-text',
      '[class*="job-sec"]',
      '[class*="job-detail"] .text'
    ];
    const detailEl = queryFirstFiltered(detailSels);
    if (detailEl) {
      const txt = detailEl.innerText.trim();
      if (txt) parts.push(txt);
    }

    // 关键词锚点兜底：找包含"职位要求/岗位职责/任职要求"等的最小容器
    if (parts.length < 3) {
      const anchored = findJdByKeywords();
      if (anchored && !parts.join('\n').includes(anchored.slice(0, 30))) {
        parts.push(anchored);
      }
    }

    // 最终兜底：最长文本块（同样过滤含列表特征的）
    if (parts.length < 3) {
      const longest = findLongestTextBlock();
      if (longest && !parts.join('\n').includes(longest.slice(0, 30))) {
        parts.push(longest);
      }
    }

    return cleanJdText(parts.join('\n'));
  }

  // 关键词锚点策略：找包含 JD 关键词的最小元素
  function findJdByKeywords() {
    const anchors = ['职位要求', '岗位职责', '任职要求', '任职资格', '工作内容', '职位描述', '岗位描述', '工作职责'];
    // 排除特征：含这些说明是列表/侧边栏/筛选器，不是JD正文
    const excludeSignals = [
      '立即沟通', '收藏', '举报', '微信扫码分享', '前往App',
      '热门职位', '热门城市', '热门企业', '附近城市',
      '推荐', '求职期望', '添加求职期望', '求职类型',
      '经验不限', 'BOSS直聘招聘',
      // 右侧筛选器特征
      '工作区域', '职位类型', '薪资待遇', '工作经验', '学历要求',
      '公司行业', '公司规模', '融资阶段', '清空',
      // 列表卡片特征
      '·薪'
    ];
    let best = null;
    let bestLen = Infinity;

    const all = document.querySelectorAll('div, section, article, p, li, span');
    for (const el of all) {
      const txt = (el.innerText || '').trim();
      if (txt.length < 50 || txt.length > 6000) continue;
      const hit = anchors.some(a => txt.includes(a));
      if (!hit) continue;
      // 命中2个以上排除特征 = 大容器，跳过
      const excludeHits = excludeSignals.filter(s => txt.includes(s)).length;
      if (excludeHits >= 2) continue;
      if (txt.length < bestLen) {
        bestLen = txt.length;
        best = txt;
      }
    }
    return best;
  }

  // 清洗 JD 文本：去乱码字符/多余空行/首尾空白 + 截断筛选器等无关内容
  function cleanJdText(text) {
    if (!text) return '';
    let result = text
      // 去除 Boss 字体图标乱码（Private Use Area: U+E000–U+F8FF）
      .replace(/[\uE000-\uF8FF]/g, '')
      // 去除其他不可见控制字符（保留换行和空格）
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      // 合并连续空格为单个
      .replace(/[ \t]+/g, ' ')
      // 合并连续3+换行为2个
      .replace(/\n{3,}/g, '\n\n')
      // 去除每行首尾空白
      .split('\n').map(l => l.trim()).join('\n')
      .trim();

    // 截断筛选器/侧边栏等无关内容
    // JD正文绝不会含这些词，一旦出现说明抓多了，从该位置截断删除之后所有内容
    const cutoffWords = [
      '工作区域', '清空',            // 右侧筛选器
      '热门职位', '热门城市',         // 底部热门
      '微信扫码分享', '前往App',      // 分享区
      '查看更多信息', '求职工具',      // 底部工具区
      'BOSS直聘招聘', '附近城市'      // 底部SEO区
    ];
    let cutoffIdx = -1;
    for (const w of cutoffWords) {
      const idx = result.indexOf(w);
      if (idx !== -1 && (cutoffIdx === -1 || idx < cutoffIdx)) {
        cutoffIdx = idx;
      }
    }
    if (cutoffIdx !== -1) {
      result = result.slice(0, cutoffIdx).trim();
    }

    // 移除残留的列表卡片特征行（"·薪"结尾或"·XX区·"格式的城市行）
    result = result.split('\n').filter(line => {
      // 单独一行的"·薪"特征（列表卡片薪资）
      if (/^-K·薪?$/.test(line)) return false;
      // 城市行 "深圳·宝安区·新安"
      if (/^[^·]+·[^·]+区·[^·]+$/.test(line) && line.length < 20) return false;
      return true;
    }).join('\n');

    // 清理末尾残留的单独城市名行（如"深圳""上海"等，JD正文后的城市标签）
    result = result.split('\n');
    while (result.length > 1) {
      const last = result[result.length - 1].trim();
      // 末尾是2-4字的纯城市名（常见城市列表），且不是JD内容
      if (last.length >= 2 && last.length <= 4 && /^[\u4e00-\u9fa5]+$/.test(last)) {
        // 检查是否是常见城市名或疑似城市标签
        const cities = ['深圳', '北京', '上海', '广州', '杭州', '成都', '南京', '苏州', '武汉', '西安', '长沙', '厦门', '珠海', '东莞', '佛山', '中山', '惠州', '宁波', '无锡', '青岛', '大连', '天津', '重庆', '济南', '福州', '昆明', '郑州', '合肥', '南昌', '哈尔滨', '沈阳', '长春', '太原', '贵阳', '兰州', '海口', '三亚'];
        if (cities.includes(last)) {
          result.pop();
          continue;
        }
      }
      break;
    }
    result = result.join('\n');

    return result.trim();
  }

  function queryFirst(selectors) {
    for (const s of selectors) {
      try {
        const el = document.querySelector(s);
        if (el && el.innerText && el.innerText.trim()) return el;
      } catch (e) { /* 非法 selector 跳过 */ }
    }
    return null;
  }

  // 带过滤的 selector 查找：排除含列表/侧边栏/筛选器特征的大容器
  function queryFirstFiltered(selectors) {
    const excludeSignals = [
      '立即沟通', '微信扫码分享', '热门职位', '热门城市', '求职期望', '附近城市',
      '工作区域', '职位类型', '薪资待遇', '公司行业', '公司规模', '融资阶段', '清空', '·薪'
    ];
    for (const s of selectors) {
      try {
        const el = document.querySelector(s);
        if (!el) continue;
        const txt = (el.innerText || '').trim();
        if (!txt) continue;
        // 命中2个以上排除特征 = 大容器，跳过
        const exHits = excludeSignals.filter(x => txt.includes(x)).length;
        if (exHits >= 2) continue;
        return el;
      } catch (e) { /* */ }
    }
    return null;
  }

  // 兜底策略：扫描所有文本块，找包含岗位关键词的最长文本
  function findLongestTextBlock() {
    const keywords = ['负责', '要求', '任职', '职责', '优先', '熟悉', '精通', '岗位', '经验'];
    const excludeSignals = [
      '立即沟通', '微信扫码分享', '热门职位', '热门城市', '求职期望', '附近城市', '推荐',
      '工作区域', '职位类型', '薪资待遇', '公司行业', '公司规模', '融资阶段', '清空', '·薪'
    ];
    const candidates = [];
    document.querySelectorAll('div, section, article, p').forEach(el => {
      const txt = (el.innerText || '').trim();
      if (txt.length < 50 || txt.length > 5000) return;
      if (el.children.length > 5) return;
      const hits = keywords.filter(k => txt.includes(k)).length;
      if (hits < 2) return;
      // 排除含列表/筛选器特征的
      const exHits = excludeSignals.filter(x => txt.includes(x)).length;
      if (exHits >= 2) return;
      candidates.push({ txt, hits, len: txt.length });
    });
    if (!candidates.length) return '';
    candidates.sort((a, b) => (b.hits - a.hits) || (b.len - a.len));
    return candidates[0].txt;
  }

  // 把JD暂存到 storage 供侧边栏读取
  function saveCurrentJd() {
    const jd = readJdFromPage();
    if (jd) {
      chrome.storage.local.set({ current_jd: jd });
    }
  }

  // ---------- 响应侧边栏的 READ_JD 请求 ----------
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'READ_JD') {
      const jd = readJdFromPage();
      if (jd) {
        chrome.storage.local.set({ current_jd: jd });
      }
      sendResponse({ success: !!jd, jd });
      return false; // 同步响应
    }
  });

  // ---------- 页面加载后自动读一次JD存到storage ----------
  // 延迟执行，等页面渲染完
  setTimeout(saveCurrentJd, 1500);

  // ---------- 监听 SPA 路由变化（Boss切岗位不刷新页面）----------
  let lastUrl = location.href;

  function onRouteChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // SPA 异步渲染，多次延迟读取确保拿到新JD
    [800, 2000, 3500].forEach(delay => setTimeout(saveCurrentJd, delay));
  }

  // 拦截 pushState / replaceState（很多 SPA 用这两个切路由）
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method];
    history[method] = function () {
      const ret = orig.apply(this, arguments);
      try { setTimeout(onRouteChange, 50); } catch (e) {}
      return ret;
    };
  });
  // 监听 popstate（前进后退）
  window.addEventListener('popstate', onRouteChange);
  // MutationObserver 兜底
  const observer = new MutationObserver(() => onRouteChange());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ---------- panel 打开时主动触发读取（通过 storage 信号）----------
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.request_read_jd) {
      saveCurrentJd();
    }
  });
})();
