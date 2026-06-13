# 边界情况与错误处理

## 一、流式渲染

### 1.1 Streaming Markdown 性能

**问题**:AI 回复逐 token 到达,不能每 token 完整重解析 Markdown。

**方案**:使用 streaming markdown 解析器

- 流式中:逐 token 追加到当前文本块,使用增量解析只处理新增部分
- 完成后:标准 Markdown 渲染,含完整格式化
- 未闭合结构处理:未闭合的代码块 ``` 显示为正在输入的代码块(带闪烁光标)

### 1.2 大量消息的性能

**问题**:长时间对话可能产生数百条消息,DOM 节点过多。

**方案**:虚拟滚动

- 使用 `react-virtuoso` 或 `@tanstack/react-virtual`
- 只渲染可视区域内的消息
- 注意:流式输出时需确保新内容始终可见(auto-scroll)

### 1.3 contentIndex 的增量追加

**问题**:`message_update` 事件中 `contentIndex` 可能跳跃(如 thinking 块和 text 块交替)。

**方案**:
- 维护 `contentIndex → ContentBlock` 映射
- 新 contentIndex 时创建新块
- 已有 contentIndex 时追加
- 按 contentIndex 排序渲染

## 二、工具输出

### 2.1 bash 输出过大

**问题**:bash 输出可能上万行。

**方案**:
- 默认显示前 50 行
- 超过 50 行时显示截断提示:"输出已截断,显示前 50 行 / 共 1,234 行"
- 点击"展开全部"显示完整输出
- `truncated: true` 时额外显示 `fullOutputPath`
- 虚拟滚动用于大输出

### 2.2 bash 输出含 ANSI 转义码

**问题**：bash 工具输出、扩展的 `setStatus` statusText 等都可能包含 ANSI 颜色码。

**方案**：
- 使用 `ansi-to-html` 库将 ANSI 转换为 HTML
- 或 strip ANSI 码，显示纯文本
- 配置选项：用户可选择保留颜色（HTML）或去除（纯文本）
- **扩展 statusText 也可能含 ANSI**（校准确认：pi-speeed 发送 `\u001b[38;2;102;102;102m...\u001b[39m` 格式的颜色码）

### 2.3 edit 工具的 diff 输出

**问题**:edit 工具结果包含 diff 信息,需要语法着色。

**方案**:
- 检测 `details.diff` 或 `details.patch` 字段
- 使用 diff 语法高亮渲染
- 绿色表示新增行,红色表示删除行

### 2.4 工具结果中的图片

**问题**:某些工具结果可能包含 `ImageContent` 块。

**方案**:
- ToolCard 中检测 `content` 数组中的 `ImageContent` 类型
- 行内渲染缩略图,点击放大

## 三、图片处理

### 3.1 图片传输

**问题**:RPC 支持两种图片格式--prompt 命令的 `images` 参数和 UserMessage.content 中的 ImageContent。

**方案**:
- 前端统一内部模型:`{ data: string; mimeType: string }` (base64)
- 发送时转换为 `ImageContent` 格式
- 展示时从 UserMessage.content 数组中提取

### 3.2 大图片

**问题**:大图片可能影响渲染性能。

**方案**:
- 前端缩略图:CSS 限制最大显示尺寸 (400x300px)
- 点击放大:lightbox 全屏查看
- base64 过大时显示加载指示

### 3.3 图片粘贴和拖拽

**问题**:用户可能粘贴或拖拽大图片。

**方案**:
- 粘贴/拖拽时自动读取为 base64
- 显示附件预览条(输入框上方)
- 支持移除附件
- 图片格式限制:仅接受 image/png, image/jpeg, image/gif, image/webp

## 四、会话持久化

### 4.1 会话列表获取

**问题**:RPC 没有 `list_sessions` 命令。

**方案**:Rust 端扫描 `~/.pi/agent/sessions/` 目录

```rust
pub async fn list_sessions() -> Vec<SessionMeta> {
    let sessions_dir = get_sessions_dir(); // ~/.pi/agent/sessions/
    let mut sessions = Vec::new();

    // 递归扫描 .jsonl 文件
    for entry in walkdir::WalkDir::new(&sessions_dir) {
        let entry = entry?;
        if entry.path().extension() == Some(OsStr::new("jsonl")) {
            // 读取首行 (session header) 和 session_info entry
            let meta = parse_session_meta(entry.path())?;
            sessions.push(meta);
        }
    }

    // 按时间倒序
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sessions
}
```

### 4.2 会话切换时消息加载

**问题**:切换会话后需要重新加载消息。

**方案**:
- `switch_session` 命令成功后
- 调用 `get_messages` 获取新会话的消息
- 替换 MessageStore 中的消息列表
- 重新调用 `get_state` 更新状态

### 4.3 会话文件删除

**问题**:删除会话需要删除文件系统中的 .jsonl 文件。

**方案**:
- Rust 端执行文件删除
- 优先使用 `trash` crate(移到回收站),fallback 到永久删除
- 删除后刷新会话列表

## 五、进程健康

### 5.1 pi 进程崩溃

**问题**：pi 进程可能意外退出。

**方案**：
- Rust 端监控 stdout EOF
- EOF 时 emit("pi-process-exit", { code, reason })
- 前端显示错误弹窗：“pi 进程已退出"
- 提供“重启 pi”按钮
- 重启后自动恢复当前会话（通过 `--session <path>` 启动）

### 5.1b 启动时的 extension_ui_request 风暴

**问题**：pi 启动后会立即发出大量 `extension_ui_request`（setStatus / setWidget），来自各种扩展（pi-subagents, pi-mcp-adapter, pi-themes, pi-powerline-footer, pi-speeed 等）。

**方案**：
- 前端必须在 pi 启动后立即准备好处理 `extension_ui_request`
- 这些请求可能在 `get_state` 响应之前到达
- 建议前端在 EventConsumer 初始化时就注册 `pi-extension-ui-request` 监听器
- 首次启动时将这些 fire-and-forget 请求暂存，待 UI 渲染后再分发

### 5.2 pi 无响应

**问题**:pi 进程可能卡死不输出。

**方案**:
- 心跳检测:每 30s 发送 `get_state`
- 连续 3 次无响应(90s)→ 判定为无响应
- 显示警告:"pi 无响应"
- 提供"强制终止并重启"按钮

### 5.3 pi 启动失败

**问题**:pi 可能因各种原因启动失败(API Key 未配置、端口占用等)。

**方案**:
- 启动后 10s 内无 stdout 输出 → 判定为启动失败
- 读取 stderr 输出,显示给用户
- 提供诊断信息:
  - pi 是否安装
  - bash 是否可用 (Windows)
  - API Key 是否配置
  - stderr 最后几行

### 5.4 优雅关闭

**问题**:用户关闭窗口时,pi 可能还在处理。

**方案**:
```rust
async fn graceful_shutdown(process: &mut Child) {
    // 1. 关闭 stdin (发送 EOF)
    if let Some(stdin) = process.stdin.take() {
        drop(stdin);
    }

    // 2. 等待进程退出 (最多 5s)
    match tokio::time::timeout(Duration::from_secs(5), process.wait()).await {
        Ok(_) => return,
        Err(_) => {
            // 3. 超时,发送 SIGTERM
            let _ = process.kill();

            // 4. 再等 3s
            match tokio::time::timeout(Duration::from_secs(3), process.wait()).await {
                Ok(_) => return,
                Err(_) => {
                    // 5. 强制 SIGKILL (Windows: TerminateProcess)
                    let _ = process.kill();
                }
            }
        }
    }
}
```

## 六、平台差异

### 6.1 Windows

| 问题 | 方案 |
|------|------|
| bash 不可用 | 启动时检测 Git Bash / Cygwin / WSL,提示安装 |
| 路径分隔符 `\` vs `/` | Rust 端统一处理,前端不关心 |
| pi 路径检测 | 先 `where pi`,再常见路径 |
| Ctrl+V 粘贴图片 | Windows 上用 Alt+V(参考 pi keybindings) |
| 进程信号 | Windows 无 SIGTERM,用 TerminateProcess |

### 6.2 macOS

| 问题 | 方案 |
|------|------|
| 路径检测 | `which pi` |
| 全局快捷键 | 后续 Phase 考虑 |
| 沙盒限制 | Tauri 打包时处理 |

### 6.3 Linux

| 问题 | 方案 |
|------|------|
| 路径检测 | `which pi` |
| 系统托盘 | 后续 Phase 考虑 |
| 桌面集成 | .desktop 文件 |

## 七、错误恢复

### 7.1 错误分类

| 错误类型 | 示例 | 恢复策略 |
|---------|------|---------|
| 临时错误 (529/429) | API 过载/限速 | pi 内置 auto_retry 处理 |
| 永久错误 (401/403) | API Key 无效 | 显示错误,引导用户检查配置 |
| 上下文溢出 | token 超限 | pi 内置 auto-compaction 处理 |
| 进程崩溃 | pi 意外退出 | 自动重启 + 会话恢复 |
| 网络断开 | 无网络 | 显示离线提示,重连后自动恢复 |
| JSON 解析错误 | stdout 格式异常 | 跳过错误行,继续解析 |

### 7.2 扩展错误

`extension_error` 事件:
- 显示 error Toast
- 包含扩展路径和错误信息
- 不影响主流程

### 7.3 Extension UI 超时

Dialog 方法带 `timeout` 时:
- 显示倒计时
- 超时后扩展端自动用默认值 resolve
- 前端关闭对话框

## 八、安全

### 8.1 API Key 安全

- pi 的 `auth.json` 和 `models.json` 由 pi 管理
- 桌面应用不直接处理 API Key
- 如需配置 API Key,引导用户使用 pi 的 `/login` 命令(通过 RPC prompt)

### 8.2 扩展安全

- 扩展运行在 pi 进程中,拥有完整系统权限
- 扩展的 `extension_ui_request`(如 confirm)是用户授权的关键机制
- 桌面应用必须正确渲染所有 dialog 方法,不跳过

### 8.3 项目信任

- pi 在 RPC 模式下默认使用 `defaultProjectTrust` 设置
- 桌面应用可通过 `--approve` 或 `--no-approve` 启动参数控制
- 首次打开项目时,如 pi 需要信任确认,会通过扩展 UI 协议发起 confirm 请求
