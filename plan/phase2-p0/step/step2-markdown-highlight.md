# Step 2: 代码高亮 & Markdown 增强

## 目标

修复当前 Markdown 渲染的若干体验缺陷：
1. 只有一个亮色 `highlight.js` 主题，暗色模式下代码块不可读
2. Diff 代码块没有语法高亮
3. 代码块缺少行号，复制按钮无状态反馈

---

## 子步骤

### Step 2.1: 暗色主题高亮 + 动态主题切换

**改动范围**：`src/components/chat/MarkdownContent.tsx` + 新增 `src/assets/`

#### 问题
当前固定导入 `highlight.js/styles/github.css`（亮色主题），暗色模式下代码背景为白色文字为深色，与其他暗色 UI 不协调。

#### 方案
1. 新增两个 CSS 文件：
   - `src/assets/hljs-light.css` — 覆盖亮色 `github.css` 的 CSS 变量化版本
   - `src/assets/hljs-dark.css` — 覆盖暗色 `github-dark.css` 的 CSS 变量化版本

2. 在 `useUIStore` 的 `applyTheme` 函数中，动态切换 hljs 样式：
   ```ts
   function applyHighlightTheme(theme: 'light' | 'dark') {
     const existing = document.querySelector('link[data-hljs-theme]');
     if (existing) existing.remove();
     const link = document.createElement('link');
     link.rel = 'stylesheet';
     link.setAttribute('data-hljs-theme', '');
     link.href = theme === 'dark' ? '/src/assets/hljs-dark.css' : '/src/assets/hljs-light.css';
     document.head.appendChild(link);
   }
   ```

   ⚠️ **实际方案**：由于 Vite 构建后路径不同，用 CSS 变量覆盖更稳健：
   - 在 `:root` 和 `.dark` 选择器中定义 hljs 相关 CSS 变量
   - 在 `styles.css` 中统一管理，通过 Tailwind 的 dark class 切换

3. 或者更简单的方案：**用 `highlight.js` 的 link 标签动态切换**：
   - 导入两个 CSS 文件作为字符串（`?inline`）→ 不推荐
   - **推荐**：用 CSS 变量覆盖 `github.css` 和 `github-dark.css` 的颜色值

**最终采用方案**：在 `styles.css` 中用 CSS 自定义属性 + `.dark` 选择器覆盖 hljs 样式，这样不需要动态加载 CSS 文件。

```css
/* 亮色模式 — 覆盖 hljs */
.hljs { color: #24292e; background: #f6f8fa; }
/* 暗色模式 */
.dark .hljs { color: #c9d1d9; background: #0d1117; }
/* ... 更多 token 颜色映射 */
```

#### 验收标准
- [ ] 暗色模式下代码块背景为深色，文字可读
- [ ] 亮色模式下代码块保持现有体验
- [ ] 系统主题切换（system → dark/light）时 hljs 颜色跟随
- [ ] 代码块语言标签颜色适配暗色

---

### Step 2.2: Diff 语法高亮

#### 问题
当前 `MarkdownContent.tsx` 的语言标签提取逻辑正常，但 diff 代码块只是普通文本高亮（或没有高亮）。

#### 方案
1. 在 rehype-highlight 的处理链中注册 `diff` 语言
2. 如果 `highlight.js` 内置的 diff 高亮不够好，自定义 CSS 规则覆盖 `.hljs-addition` / `.hljs-deletion`
3. 确保 `diff` 语言标签被正确识别：即 `` ```diff `` 块正常工作

**实现**：
- 验证 `highlight.js` 已内置 `diff` 语言支持（检查 node_modules）
- 在 `styles.css` 中增强 diff 代码块的视觉表现：
  - `.hljs-addition`: 绿色背景
  - `.hljs-deletion`: 红色背景
  - `.hljs-meta`: 蓝色（`diff --git`, `@@` 等）

#### 验收标准
- [ ] `` ```diff `` 代码块有颜色区分 +/-
- [ ] `@@` 和 `diff --git` 行有元信息颜色
- [ ] 亮色/暗色模式下都可区分

---

### Step 2.3: 行号 + 复制按钮状态反馈

#### 行号显示
**改动范围**：`MarkdownContent.tsx` 的 `pre` 组件

方案：
- 在 `pre > code` 的渲染中加入行号
- 使用 CSS `counter` 机制（更高效，不增加 DOM）：
  ```css
  .code-block-container pre {
    counter-reset: line;
  }
  .code-block-container code .line::before {
    counter-increment: line;
    content: counter(line);
    /* 行号样式 */
  }
  ```
- 或者：将代码按行拆分，手动渲染行号和代码

**推荐方案**：手动拆分行（因为 hljs 不会自动生成 `.line` span）：
- 在 `pre` 组件中用 `React.Children` 读取 code 的文本内容
- 按 `\n` 拆分为行数组
- 渲染为 `<table>` 或 `<div>` 结构，每行一个 `<span>` + 行号

#### 复制按钮反馈
当前复制按钮点击后无状态反馈。改进：
- 添加 `useState` 管理 `copied` 状态
- 点击后图标变为 ✓ + "已复制" 文字，2s 后恢复
- 使用 `useCallback` 避免不必要的重渲染

#### 验收标准
- [ ] 代码块左侧有灰色行号
- [ ] 行号不影响代码选择和复制（`user-select: none`）
- [ ] 复制按钮点击后有「已复制」状态反馈（图标+文字，2s 恢复）
- [ ] 行号对齐（至少支持 999 行不偏移）

---

## 接口设计

无后端变更，纯前端改动。

### 文件清单
| 文件 | 操作 | 说明 |
|---|---|---|
| `src/styles.css` | 修改 | 新增 hljs 暗色覆盖 + diff color + line-number CSS |
| `src/components/chat/MarkdownContent.tsx` | 修改 | pre 行号渲染 + CodeCopyButton 状态反馈 |

## 依赖
- Step 2.1 → Step 2.2（无依赖，可并行）
- Step 2.1 + 2.2 → Step 2.3（无强依赖）
- **不依赖 Step 1 或 Step 3**
