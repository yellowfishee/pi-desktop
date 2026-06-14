# Pi Desktop

跨平台桌面客户端，为 [Pi Coding Agent](https://github.com/pi-base/pi) 提供原生 GUI 交互体验。
基于 **Tauri 2** + **React** + **TypeScript** 构建，支持 macOS / Windows / Linux。

## 特性

- **完整 RPC 协议** — 实时流式消息、工具调用、扩展 UI、多模型切换
- **Codex 风格 UI** — 思考过程和工具调用内联展示，紧凑不碍眼
- **会话管理** — 多项目、多会话、时间分组、置顶、搜索过滤
- **分支导航** — Fork / Clone 会话分支，可视化分支树，双击编辑重发
- **命令面板** — `Cmd+P` 快速切换模型、思考深度、会话、执行命令
- **斜杠命令** — 输入 `/` 弹出命令菜单，一键 compact/fork/new/export
- **图片上传** — 点击、拖拽、粘贴图片，base64 内联发送
- **Git 集成** — 侧边栏展示分支名和变更数，Changes 面板 stage/unstage/commit
- **多窗口** — `Cmd+Shift+N` 新建独立窗口，多会话并行
- **诊断面板** — pi 进程状态、心跳、崩溃历史、一键重启
- **亮暗模式** — 跟随系统 / 手动切换，CSS 变量驱动

## 截图

<!-- TODO: 添加截图 -->

## 前置依赖

- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/) ≥ 10
- [Rust](https://www.rust-lang.org/) ≥ 1.80
- macOS: Xcode Command Line Tools
- Windows: Microsoft Visual Studio C++ Build Tools
- Linux: `webkit2gtk-4.1` 等系统库

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/yellowfish/pi-desktop.git
cd pi-desktop

# 安装依赖
pnpm install

# 启动开发模式（自动编译 Rust + 启动 Vite）
pnpm tauri dev
```

## 构建打包

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`：
- macOS: `.app` + `.dmg`
- Windows: `.msi` + `.exe`
- Linux: `.deb` + `.AppImage`

## 项目结构

```
pi-desktop/
├── src/                    # React 前端
│   ├── components/
│   │   ├── chat/           # 消息气泡、输入框、状态栏、信息栏
│   │   ├── layout/         # 侧边栏、标题栏
│   │   ├── panels/         # 属性面板、变更面板、设置、诊断
│   │   └── shared/         # 通用组件（命令面板、扩展对话框、右键菜单）
│   ├── hooks/              # 全局快捷键 hook
│   ├── services/           # Tauri IPC 封装、事件监听
│   ├── stores/             # Zustand 状态管理
│   └── types/              # RPC 协议类型定义
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── commands.rs     # Tauri IPC 命令
│       ├── pi_process.rs   # pi 子进程管理
│       ├── sessions.rs     # 会话扫描
│       ├── pi_check.rs     # pi / bash 检测
│       └── diagnostics.rs  # 进程诊断
├── plan/                   # 开发计划文档
│   ├── phase1/ ～ phase5/
├── docs/                   # 协议文档、Roadmap
├── package.json
└── pnpm-workspace.yaml
```

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript |
| 构建 | Vite 7 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| Markdown | react-markdown + rehype-highlight |
| 虚拟滚动 | @tanstack/react-virtual |
| Rust | tokio, serde, chrono, walkdir |

## License

MIT
