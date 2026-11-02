# Boss直聘打招呼助手

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4B8BBE.svg)
![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-4D6BFE.svg)

一个 Chrome / Edge 浏览器扩展：在 Boss直聘岗位页一键读取 JD，结合你预先导入的简历，调用 DeepSeek 生成 **3 条定制打招呼语**，复制即可发。

解决的是「一份模板复制粘贴所有人」的问题——每条招呼语都必须落到你真实的年限、技术方向和一个具体项目上。

> 半自动设计：只生成、只复制，**不会替你自动发送**，避免触发平台反机器人风控。

---

## 它长什么样

| 位置 | 表现 |
|---|---|
| 岗位页 | 右上角一个蓝色圆形浮动按钮（距顶部 80px，不遮挡「立即沟通」） |
| 点击后 | 浏览器侧边栏打开：上半是自动填好的 JD，下半是 3 条候选 |
| 设置页 | API Key 配置 + 简历导入表单（10 个字段可手改） |

生成结果形如：

> 哈喽，3 年后端经验，做过知识库问答项目（LangChain + RAG，支持万级文档检索），看你 JD 也在做 AI 应用，方便聊聊？

## 功能

- **JD 自动读取**：三层兜底（固定选择器 → 「岗位职责/任职要求」关键词锚点 → 最长文本块），并清洗 Boss 的字体图标乱码与侧边栏噪声；读不到可一键粘贴。
- **简历结构化**：导入 PDF / DOCX / TXT，AI 提取成 10 个字段（年限、技术栈、AI 工具、亮点项目等），可逐项手动修正。
- **三要素强制**：每条招呼语必须包含「具体年限+领域 / 擅长技术方向 / 亮点项目+效果」，并禁止「吃苦耐劳」「贵公司」「赋能」这类空话。
- **字数红线**：目标 60–90 字，界面超过 80 字标红提示「偏长，建议删减」。
- **SPA 适配**：Boss 切岗位不刷新页面，靠监听 `pushState` / `popstate` / `MutationObserver` 补读 JD。
- **本地优先**：Key 与简历只存 `chrome.storage.local`，无自建服务器、无埋点。

---

## 快速开始

1. 克隆或下载本仓库，得到含 `manifest.json` 的目录。
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）→ 开启「开发者模式」→「加载已解压的扩展程序」→ 选中该目录。
3. 点扩展图标打开设置页 → 填 DeepSeek API Key → 导入简历 → 保存。

然后在任意 Boss 岗位详情页点右上角蓝色按钮即可。

```bash
git clone https://github.com/shi-felix/boss-greeting-helper.git
```

> 本扩展未上架应用商店，只能以「加载已解压」方式安装。要求 Chrome / Edge **114+**（用到 `chrome.sidePanel`）。

---

## 环境要求

| 项目 | 要求 |
|---|---|
| 浏览器 | Chrome / Edge **114 及以上**（低版本会自动退化为新标签页打开生成界面） |
| 网络 | 能访问 `https://api.deepseek.com` |
| DeepSeek 账号 | 需有 API Key，且账户有余额 |
| 构建 | **无**。纯静态 MV3 扩展，改完直接重载，没有 npm / webpack |

---

## 安装详解

解压 / 克隆后的目录必须长这样（`manifest.json` 在这一层）：

```
boss-greeting-helper/
├── manifest.json          ← 加载时选这个文件夹
├── background.js
├── README.md
├── content/  options/  panel/  lib/  icons/
```

如果出现 `boss-greeting-helper/boss-greeting-helper/manifest.json`，加载时选**外层**会报「清单文件缺失」。

| 浏览器 | 扩展管理页 |
|---|---|
| Chrome | `chrome://extensions` |
| Edge | `edge://extensions` |

打开「开发者模式」→「加载已解压的扩展程序」→ 选中目录 → 列表出现「Boss直聘打招呼助手」即成功。建议把图标固定到工具栏。

---

## 配置

### DeepSeek API Key

- 申请：<https://platform.deepseek.com/api_keys>
- 粘贴后点「保存」，显示「已保存」即可。Key 只写入本机 `chrome.storage.local`，仓库内无任何硬编码 Key。
- 费用：一次「生成」= 1 次对话请求，一次「导入简历」= 1 次提取请求，单次消耗 tokens 很少；单价以官网为准。

### 简历字段

| 字段 | 是否影响生成 | 填写建议 |
|---|---|---|
| 姓名 | 否 | 如实填 |
| 工作年限 | **是** | 写「3年」「应届」这类明确表达；在校生写「应届 / 实习」 |
| 当前职位 | 弱 | 如「后端开发实习生」 |
| 目标职位 | 弱 | 如「Agent 开发 / 后端开发」 |
| 技术栈详情 | **是（重点）** | 具体到框架：`Python/FastAPI、LangChain、MySQL/Redis、Vue` |
| AI 编程工具能力 | **是（加分项）** | 有预设标签：Codex / Claude Code / Cursor / Trae / Copilot / 通义灵码，自动拼成「熟练使用 X、Y 进行日常开发」 |
| 亮点项目 | **是（最关键）** | 项目名 + 你的角色 + 技术栈 + 做了什么 + 达到什么效果 |
| 学历 | 弱 | 学校 + 专业 + 毕业年份 |
| 求职意向 | 弱 | 方向 / 城市 |
| 个人亮点 | 弱 | 一句话，别写成形容词堆砌 |

**三个加粗字段是生成质量的天花板**：项目描述越具体（有技术栈、有量级、有结果），生成的招呼语越不像模板。

导入后必须点「保存简历」才生效——生成只读已保存的 `resume_profile`。

---

## 使用

1. 打开 **岗位详情页**（`zhipin.com` 域名，列表页读不到 JD）。
2. 点右上角蓝色浮动按钮 → 侧边栏打开，JD 自动填入。
3. JD 框三种来源：自动读取（进入页面 1.5 秒后读一次，SPA 切岗后 0.8/2/3.5 秒补读）、「从当前页读取」强制重读、「粘贴」贴剪贴板；手改后不会被自动刷新覆盖。
4. 点「生成打招呼语」，3–15 秒出 3 条候选。
5. 点「复制」→ 回 Boss 聊天框粘贴发送。

界面右侧显示每条字数，超 80 字标红。「换一批」= 同 JD 重新生成（温度 0.85，结果会有差异）。

---

## 开发与二开

### 本地调试

| 改了什么 | 怎么生效 |
|---|---|
| `content/content.js` | 扩展页点刷新 → **重开 Boss 页面**（content script 只在页面加载时注入） |
| `background.js` | 扩展页点「Service Worker」看日志，或点刷新按钮重载 |
| `panel/*`、`options/*` | 关掉侧边栏 / 设置页再打开即可 |
| 任意文件 | 无需构建，保存即生效（content script 除外，需刷新页面） |

看存储：DevTools → Application → Storage → Extension Storage，或在 Service Worker 控制台执行 `chrome.storage.local.get(console.log)`。

侧边栏调试：右键侧边栏空白处 → 检查。它是独立页面，有独立 Console。

### 关键改动点

| 想改什么 | 位置 |
|---|---|
| 打招呼语 prompt（三要素、禁止词、字数、示例） | `background.js` `generateGreeting()` 的 `systemPrompt` |
| 简历提取 prompt（10 字段定义） | `background.js` `extractResumeFields()`，原文截断 6000 字符 |
| 模型 / 温度 | `deepseek-chat`；生成 0.85，提取 0.2 |
| 超时 | 请求 60 秒中断；前端 45 秒兜底 |
| JD 抓取策略 | `content/content.js` `readJdFromPage()`：多选择器 → 关键词锚点 → 最长文本块 |
| JD 清洗 | `cleanJdText()`：去字体图标乱码、按「工作区域/热门职位」等词截断 |
| 输出解析 | 严格 JSON 数组 `["语1","语2","语3"]`，解析时容错剥离 markdown 代码块 |

### 适配其它招聘站点

1. `manifest.json`：往 `host_permissions` 和 `content_scripts[0].matches` 加域名（如 `https://www.liepin.com/*`）；
2. `content/content.js`：把 `readJdFromPage()` 里的 `titleSels` / `infoSels` / `detailSels` 换成目标站点的选择器，`findJdByKeywords()` 的关键词表基本可复用；
3. `background.js` 无需改动。

### 换模型

`callDeepSeek()` 走的是 OpenAI 兼容的 `/chat/completions`。改 `DEEPSEEK_API_URL` + `model` 字段即可指向任意兼容端点（Kimi、Qwen、GLM、本地 vLLM 等），Key 的读取逻辑不用动。

### 技术栈

Manifest V3 · DeepSeek Chat API · pdf.js · mammoth.js · Shadow DOM 样式隔离。无框架、无构建。

---

## 隐私与数据

| 数据 | 存放位置 | 是否外发 |
|---|---|---|
| DeepSeek API Key | 本机 `chrome.storage.local` | 仅作为请求头发给 `api.deepseek.com` |
| 简历结构化字段 | 本机 `chrome.storage.local` | 生成时随请求发给 DeepSeek |
| 当前 JD | 本机 `chrome.storage.local` | 生成时随请求发给 DeepSeek |
| 最近一批生成结果 | 本机（`last_greetings`） | 否 |

- 除 DeepSeek 官方 API 外，不向任何第三方发送数据；无埋点、无统计、无自建服务器。
- 简历原文只在导入时读进内存做文本提取，**不落盘**。
- 不跨设备同步。换电脑 / 换浏览器配置文件 = 重新填 Key、重新导简历。
- 清空：设置页「清空」按钮，或移除扩展。

---

## 常见问题

**Q1 加载时报「清单文件缺失」**
选错目录。必须选到 `manifest.json` 所在那层。

**Q2 点图标没反应 / 侧边栏不出来**
浏览器低于 Chrome 114。会自动降级为新标签页打开；也可在扩展管理页「详情 → 扩展选项」进设置。

**Q3 JD 没自动读到**
Boss 改版导致选择器失效。点「粘贴」手动贴，功能不受影响。参见「适配其它招聘站点」改选择器。

**Q4 生成失败**

| 报错 | 原因 | 处理 |
|---|---|---|
| 未配置 DeepSeek API Key | 没保存 Key | 设置页填 Key 并保存 |
| 请求失败(401) | Key 无效 / 复制带了空格 | 重新复制，去空格 |
| 请求失败(402) | 余额不足 | 去 DeepSeek 平台充值 |
| 请求失败(429) | 触发限流 | 等几十秒再点 |
| 生成超时（60秒） | 网络或服务端慢 | 重试；检查代理 |
| 生成无响应（45秒） | Service Worker 异常 | 扩展页点刷新重载 |
| 生成结果格式异常 | 模型没按 JSON 返回 | 点「换一批」；或降低 temperature |

**Q5 提示「未导入简历」**
只导入不点「保存简历」不算，生成只读已保存的 `resume_profile`。

**Q6 .doc 简历导入不了**
只支持 `.docx/.pdf/.txt`。用 Word / WPS 另存为 PDF 或 docx。

**Q7 简历解析为空**
PDF 是扫描件 / 图片型，没有文字层。改传 docx，或手动填表单。

**Q8 生成的太像 AI 写的 / 太长**
改 `background.js` 的 systemPrompt：加长禁止词表、把字数上限从 60–90 调小；同时在「亮点项目」里补更多可量化细节。

**Q9 会被判定为机器人吗**
扩展不自动发送、不批量投递，只做「读页面 + 生成文本 + 写剪贴板」，最终由你手动粘贴。仍建议控制发送频率。

---

## 已知限制

- 只在 `zhipin.com` / `www.zhipin.com` 生效，其它平台需自行适配选择器。
- 只覆盖岗位详情页，列表页读不到 JD。
- 半自动：不代发消息、不批量投递、不记录沟通历史。
- 只保留最近一批生成结果，无历史记录。
- 依赖 Boss 页面 DOM，官方改版后可能需要更新选择器。
- 未上架应用商店，无自动更新。

## Roadmap

- [ ] 更多招聘平台适配（猎聘 / 拉勾 / 实习僧）
- [ ] 打招呼历史记录与按岗位归档
- [ ] 兼容 `.doc` 旧格式
- [ ] 支持自定义模型端点（目前需改代码）
- [ ] 侧边栏 Markdown 渲染与候选手动编辑

## 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0.0 | 2026-08-25 | 首个可用版本：JD 自动读取、简历导入、3 条差异化生成、侧边栏复制 |

## License

[MIT](LICENSE) © 2026 Felix Shi

## 免责声明

本项目仅用于个人求职效率提升，生成内容需自行核对后再发送。请遵守目标平台的服务条款并控制使用频率；因不当使用导致的账号风险由使用者自行承担。作者与 DeepSeek 官方无隶属关系。
