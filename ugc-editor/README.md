# UGC 编辑器使用说明

基于 Web 的 UGC（用户生成内容）编辑器，流水线为：

**Prompt → LLM → UGC DSL（JSON）→ Validator → Visual Editor → Compiler → Runtime**

---

## 环境要求

- [Node.js](https://nodejs.org/)（建议当前 LTS）
- 包管理器：npm（随 Node 安装）

---

## 安装与启动

在项目中的 `ugc-editor` 目录下执行：

```bash
cd ugc-editor
npm install
npm run dev
```

终端会打印本地访问地址（一般为 `http://localhost:5173`）。浏览器打开即可。

### 生产构建（可选）

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。

---

## 界面分区说明

### ① Prompt & LLM（自然语言生成 DSL）

1. 在文本框中输入你想要的界面或场景描述（中文即可）。
2. 点击 **「生成 DSL」**。
3. 生成结果会写入下方的 DSL 文档与 JSON 区域。

**没有 API Key 时：** 会使用本地启发式模板生成一份可用的 DSL，仍可完整体验校验、可视化、编译与运行时预览。

**有 API Key 时：** 见下文「可选：云端 LLM」，会调用兼容 OpenAI 的 Chat Completions 接口；请求失败时会自动回退到本地模板。

---

### ② DSL（JSON）

- 可直接编辑 JSON，语义需符合内置 DSL（见下文「DSL 要点」）。
- **「解析 JSON 到文档」**：把当前 JSON 解析并同步到文档；若有错误会弹出提示。
- **「从左侧文档格式化」**：用当前内存中的文档覆盖 JSON 文本并格式化。

校验结果会显示在下方：**通过** 表示当前文档通过校验器规则。

---

### ③ 可视化编辑

- **元数据**：标题、描述。
- **画布**：宽度、高度、背景色（CSS 颜色字符串，如 `#1a1d23`）。
- **节点**：可添加 **文本 / 矩形 / 按钮**，并在表单中修改坐标、`z` 顺序及各类型专有字段。
- **删除**：某个节点字段集右上角的 **「删除」**。

修改会同步到 JSON（通过顶栏文档状态）。

---

### ④ 编译产物

校验通过后，显示将 DSL **编译** 得到的扁平结构（画布信息 + `RenderOp` 列表）。用于调试「编译器输出」是否与预期一致。

---

### ⑤ 运行时预览

校验通过且编译成功时，按编译结果在画布上绘制场景。

- **按钮** 可点击；点击后会在 **「运行时事件」** 中记录对应的 `actionId` 与按钮文案。
- 真实产品中，可由宿主程序监听这些 action，再执行游戏逻辑或跳转。

---

## DSL 要点（v1）

根对象包含：

| 字段 | 说明 |
|------|------|
| `version` | 固定为 `1` |
| `meta` | `title`（必填）、`description`（可选） |
| `canvas` | `width`、`height`（正数）、`background`（可选，CSS 颜色） |
| `nodes` | 节点数组，见下表 |

### 节点类型

- **`text`**：`content`；可选 `fontSize`、`color`。
- **`rect`**：`width`、`height`；可选 `fill`、`radius`。
- **`button`**：`width`、`height`、`label`、`actionId`。

所有节点共有：`id`、`x`、`y`，可选 `z`（绘制顺序，越大越靠前）。

**标识符规则：** `id` 与 `actionId` 建议使用字母开头，仅含字母、数字、`_`、`-`，长度合理（校验器会检查）。

---

## 可选：云端 LLM（OpenAI 兼容）

若希望在浏览器端调用真实大模型生成 DSL：

1. 复制 `ugc-editor/.env.example` 为 `.env.local`（若尚无该文件）。
2. 在 `.env.local` 中设置：

   ```env
   VITE_OPENAI_API_KEY=你的密钥
   ```

3. 可选覆盖：

   ```env
   VITE_OPENAI_BASE_URL=https://api.openai.com/v1
   VITE_OPENAI_MODEL=gpt-4o-mini
   ```

4. **保存后必须重启** `npm run dev`（Vite 仅在启动时注入环境变量）。

`.env.local` 不应提交到版本库；仓库内仅保留 `.env.example` 作为模板。

---

## 没有 API Key 时的替代做法

1. 使用界面上的 **离线模板生成**（点击「生成 DSL」）。
2. 或在 **Cursor 等编辑器** 中请 AI 按上文 DSL 规则生成 JSON，再粘贴到 **② DSL（JSON）** 并点击 **「解析 JSON 到文档」**。

这两种方式都不需要在项目中配置 OpenAI 密钥。

---

## 与 Cursor 的关系

- **Cursor 编辑器**的 AI 功能依赖 Cursor 账号，**不需要**在本项目中填写 `VITE_OPENAI_API_KEY`。
- 本项目中的 **Key 仅用于** UGC 网页内「一键调用云端模型」；没有 Key 时编辑器仍可使用离线生成与手动编辑。

---

## 常见问题

**修改 `.env.local` 后仍像没有 Key？**  
请确认已重启开发服务器。

**JSON 校验失败？**  
对照「DSL 要点」检查字段类型、`version` 是否为 `1`、`id` 是否重复等；界面会列出具体路径与原因。

**运行时按钮无反应？**  
预览区仅演示事件日志；接入游戏或应用时需由宿主程序处理 `actionId`。
