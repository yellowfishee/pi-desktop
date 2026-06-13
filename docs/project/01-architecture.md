# 系统架构

## 一、整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Tauri 窗口                                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React 前端 (WebView)                                    │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │   │
│  │  │ 会话列表      │  │ 消息面板       │  │ 设置/配置    │  │   │
│  │  │ 左侧侧边栏    │  │ 聊天区域 中部  │  │ 右侧面板    │  │   │
│  │  └──────────────┘  └───────────────┘  └──────────────┘  │   │
│  │                                                          │   │
│  │  Zustand Stores: sessionStore / messageStore / uiStore   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │ tauri::Emitter (事件驱动)             │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tauri Rust 后端                                         │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │  LineDispatcher (stdout 多路复用)                   │  │   │
│  │  │                                                    │  │   │
│  │  │  type=response     → 匹配 pending command Promise  │  │   │
│  │  │  type=extension_    → emit 给前端 + 暂存 pending   │  │   │
│  │  │    ui_request        request                        │  │   │
│  │  │  其他 type         → emit 给前端作为事件            │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌────────────────────┐  ┌───────────────────────────┐  │   │
│  │  │ PiProcessManager   │  │ AppConfig                 │  │   │
│  │  │ 子进程生命周期管理   │  │ 应用配置持久化            │  │   │
│  │  └────────────────────┘  └───────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 二、三通道通信模型

pi RPC 是**请求-响应 + 异步事件流 + 扩展 UI 交互**三通道模型，共享同一个 stdin/stdout：

### 通道 1：命令通道（请求-响应）

```
前端 invoke("send_command", { type: "prompt", ... })
  → Rust 写 stdin: {"type": "prompt", "message": "...", "id": "req-1"}
  → Rust 读 stdout: {"type": "response", "id": "req-1", "command": "prompt", "success": true}
  → Rust 匹配 id，resolve Promise → 前端收到 invoke 返回值
```

- 每个命令可选带 `id` 字段用于请求-响应关联
- Rust 端维护 `HashMap<String, oneshot::Sender>` 追踪 pending commands

### 通道 2：事件通道（异步推送）

```
pi stdout: {"type": "message_update", ...}
  → LineDispatcher 识别为非 response / 非 extension_ui_request
  → app.emit("pi-event", event)
  → 前端 listen("pi-event", callback)
  → Zustand store 更新
```

- Rust 用 `tauri::Emitter` 推送，前端用 `listen()` 监听
- 纯事件驱动，不轮询

### 通道 3：扩展 UI 通道（双向交互）

```
pi stdout: {"type": "extension_ui_request", "id": "uuid-1", "method": "confirm", ...}
  → LineDispatcher 识别为 extension_ui_request
  → app.emit("pi-extension-ui-request", request)
  → 前端渲染对话框，用户操作后
  → 前端 invoke("send_extension_ui_response", { type: "extension_ui_response", id: "uuid-1", confirmed: true })
  → Rust 写 stdin: {"type": "extension_ui_response", "id": "uuid-1", "confirmed": true}
```

- Dialog 方法（select/confirm/input/editor）需要用户交互后回传响应
- Fire-and-forget 方法（notify/setStatus/setWidget/setTitle/set_editor_text）只需前端展示

## 三、JSONL Framing 规则

RPC 使用严格的 JSONL 语义：

- **仅在 `\n` 处分割行**，不在 Unicode 行分隔符（U+2028, U+2029）处分割
- 接受可选的 `\r\n` 输入（strip 尾部 `\r`）
- Rust 端使用 `BufRead::split(b'\n')` 或手动按 `\n` 分割

```rust
// Rust 端 stdout reader 伪代码
let reader = BufReader::new(process.stdout.take());
let mut buffer = String::new();
loop {
    buffer.clear();
    match reader.read_line(&mut buffer) {
        Ok(0) => break, // EOF
        Ok(_) => {
            let line = buffer.strip_suffix('\n').unwrap_or(&buffer);
            let line = line.strip_suffix('\r').unwrap_or(line);
            if !line.is_empty() {
                dispatcher.dispatch(line);
            }
        }
        Err(e) => { /* 处理错误 */ }
    }
}
```

## 四、进程模型

### 方案对比

| 维度 | 单 pi 进程 + switch_session | 每会话独立进程 |
|------|---------------------------|---------------|
| 切换速度 | 快（命令切换，无进程启停） | 慢（需启动新进程） |
| 进程复杂度 | 一个进程长驻，需管理状态一致性 | 进程间隔离，逻辑简单 |
| 内存占用 | 低（一个进程） | 高（多进程） |
| 错误隔离 | 进程崩溃影响所有会话 | 进程崩溃只影响该会话 |
| 多会话并行 | 不支持（同一时刻只有一个活跃会话） | 天然支持 |

### 推荐：单 pi 进程 + switch_session

Phase 1-3 使用单进程模型。Phase 4 多窗口/多会话并行时再考虑多进程。

### 进程生命周期

```
应用启动
  │
  ├─► 检测 pi 是否可用 (which pi / where pi)
  │   └─ 不可用 → 显示安装引导页
  │
  ├─► Windows: 检测 bash 是否可用
  │   └─ 不可用 → 提示安装 Git for Windows
  │
  ├─► 启动 pi --mode rpc [--provider ...] [--model ...]
  │   ├─ 成功 → 发送 get_state 初始化
  │   └─ 失败 → 显示错误诊断页
  │
  ├─► 运行中: 心跳检测 (每 30s 发送 get_state)
  │   ├─ 响应正常 → 继续
  │   └─ 无响应/EOF → 尝试重启 pi 进程
  │
  └─► 应用关闭: 优雅终止
      ├─ 等待当前操作完成 (最多 5s)
      ├─ 关闭 pi stdin (发送 EOF)
      ├─ 等待 pi 进程退出 (最多 3s)
      └─ 强制 kill (超时后)
```

## 五、Rust 端核心模块

### 5.1 PiProcessManager

```rust
/// pi 子进程管理器
pub struct PiProcessManager {
    process: Option<Child>,
    stdin_writer: Option<BufWriter<ChildStdin>>,
    pending_commands: HashMap<String, oneshot::Sender<Value>>,
    is_running: bool,
}

impl PiProcessManager {
    /// 启动 pi RPC 进程
    pub async fn start(&mut self, config: &PiProcessConfig) -> Result<()>;

    /// 发送命令并等待响应
    pub async fn send_command(&mut self, command: Value) -> Result<Value>;

    /// 发送扩展 UI 响应（不等待）
    pub async fn send_extension_ui_response(&mut self, response: Value) -> Result<()>;

    /// 中止当前操作
    pub async fn abort(&mut self) -> Result<Value>;

    /// 优雅终止 pi 进程
    pub async fn shutdown(&mut self) -> Result<()>;

    /// 强制终止 pi 进程
    pub fn force_kill(&mut self);

    /// 检查进程是否存活
    pub fn is_alive(&self) -> bool;
}
```

### 5.2 LineDispatcher

```rust
/// stdout 行分发器
pub struct LineDispatcher {
    pending_commands: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    app_handle: AppHandle,
}

impl LineDispatcher {
    /// 分发一行 JSON
    pub fn dispatch(&self, line: &str) {
        let value: Value = serde_json::from_str(line)?;
        let msg_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match msg_type {
            "response" => {
                // 匹配 pending command
                if let Some(id) = value.get("id").and_then(|i| i.as_str()) {
                    let mut pending = self.pending_commands.lock().await;
                    if let Some(sender) = pending.remove(id) {
                        let _ = sender.send(value);
                    }
                }
            }
            "extension_ui_request" => {
                // 推送给前端渲染扩展对话框
                let _ = self.app_handle.emit("pi-extension-ui-request", &value);
            }
            _ => {
                // 普通 agent 事件
                let _ = self.app_handle.emit("pi-event", &value);
            }
        }
    }
}
```

### 5.3 AppConfig

```rust
/// 应用配置（独立于 pi 的 settings.json）
#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    /// 窗口位置和尺寸
    pub window: WindowConfig,
    /// 侧边栏宽度
    pub sidebar_width: f64,
    /// 侧边栏是否折叠
    pub sidebar_collapsed: bool,
    /// 属性面板是否展开
    pub properties_panel_open: bool,
    /// 主题: "light" | "dark" | "system"
    pub theme: String,
    /// 最后打开的会话文件路径
    pub last_session: Option<String>,
    /// pi 可执行文件路径（自动检测或用户指定）
    pub pi_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WindowConfig {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}
```

## 六、Tauri Commands（IPC API）

Rust 端暴露给前端的 invoke 接口：

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `start_pi` | `PiProcessConfig` | `()` | 启动 pi 进程 |
| `stop_pi` | - | `()` | 停止 pi 进程 |
| `pi_is_running` | - | `bool` | 检查 pi 是否运行 |
| `send_command` | `Value` (RPC command) | `Value` (RPC response) | 发送 RPC 命令并等待响应 |
| `send_extension_ui_response` | `Value` | `()` | 回传扩展 UI 响应 |
| `get_app_config` | - | `AppConfig` | 获取应用配置 |
| `set_app_config` | `AppConfig` | `()` | 保存应用配置 |
| `check_pi_available` | - | `PiCheckResult` | 检测 pi 和 bash 可用性 |
| `list_sessions` | - | `Vec<SessionMeta>` | 扫描文件系统获取会话列表 |

```rust
#[derive(Debug, Serialize)]
pub struct PiCheckResult {
    pub pi_available: bool,
    pub pi_path: Option<String>,
    pub pi_version: Option<String>,
    pub bash_available: bool,  // Windows 专用
    pub bash_path: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionMeta {
    pub file_path: String,
    pub session_id: String,
    pub session_name: Option<String>,
    pub timestamp: String,
    pub message_count: Option<usize>,
    pub cwd: Option<String>,
}
```
