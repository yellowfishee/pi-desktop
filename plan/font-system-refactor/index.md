# 字体配置系统重构

## 背景
当前项目的字体配置存在以下问题：
1. Tailwind 自定义字号映射混乱（命名和实际值错位）
2. 硬编码字号遍地都是（text-[13px] 等）
3. 字号设置面板体验差（无预览、粒度粗）
4. CSS 变量和 Tailwind 类混用

## 目标
建立一套统一、语义化的字体层级系统，让字号配置清晰、可维护。

## 步骤

### Step 1: 修复 Tailwind 字号映射
- 修正 tailwind.config.js 中 fontSize 的命名和变量对应关系
- 确保 text-xs → --font-xs, text-sm → --font-sm 等一一对应

### Step 2: 统一 CSS 变量定义
- 在 styles.css 中重新定义 --font-2xs 到 --font-2xl 的变量
- 建立基于基准字号的缩放比例

### Step 3: 重构组件中的硬编码字号
- 将 text-[13px] 等硬编码值替换为语义化 Tailwind 类
- 统一 MarkdownContent、MessageBubble、MessageInput 等核心组件

### Step 4: 优化设置面板
- 增加字号滑块控件
- 添加实时预览效果
- 优化预设按钮布局

## 验收标准
- [ ] text-xs/text-sm/text-base 等类名与 CSS 变量一一对应
- [ ] 组件中无硬编码字号（除特殊场景如代码块）
- [ ] 字号设置可实时预览
- [ ] 暗/亮主题下字号一致
