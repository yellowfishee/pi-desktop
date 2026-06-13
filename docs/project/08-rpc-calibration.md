# RPC 校准报告

基于 pi v0.79.1 实际输出校准，对比 `04-rpc-protocol.md` 中的类型定义。

## 一、与文档一致的字段（无需修改）

| 项目 | 状态 |
|------|------|
| `response` 的 `id` / `type` / `command` / `success` / `error` | ✅ 一致 |
| `agent_start` / `agent_end` 结构 | ✅ 一致 |
| `turn_start` / `turn_end` 结构 | ✅ 一致 |
| `message_start` / `message_end` 的 `message` 字段 | ✅ 一致 |
| `message_update.assistantMessageEvent.type` 枚举值 | ✅ 一致 |
| `message_update.assistantMessageEvent.contentIndex` | ✅ 一致 |
| `text_start` / `text_delta` / `text_end` 的 `delta` / `content` | ✅ 一致 |
| `toolcall_start` / `toolcall_delta` / `toolcall_end` 基本结构 | ✅ 一致 |
| `tool_execution_start` / `tool_execution_end` 结构 | ✅ 一致 |
| `extension_ui_request` 的 `id` / `type` / `method` | ✅ 一致 |
| `UserMessage.content` 为 `(TextContent | ImageContent)[]` | ✅ 一致 |
| `AssistantMessage.content` 为内容块数组 | ✅ 一致 |
| `ToolResultMessage` 的 `toolCallId` / `toolName` / `content` / `isError` | ✅ 一致 |
| `get_state` 返回字段 | ✅ 一致 |
| `get_session_stats` 返回字段 | ✅ 一致 |
| `get_messages` 返回字段 | ✅ 一致 |
| `get_available_models` 返回字段 | ✅ 一致 |
| `get_commands` 返回字段 | ✅ 一致 |

## 二、需要补充的字段（文档遗漏）

### 2.1 `AssistantMessage` 新增字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `responseId` | `string` | Provider 返回的响应 ID | `"cht000d5a8f@dx19ec1d31e5eb87f702"` |

文档中的 `AssistantMessage` 类型未包含 `responseId`。此字段在每个 `message_update` 的 `partial` 和 `message_end` 中都存在。

### 2.2 `ToolCall` 新增字段（流式中）

| 字段 | 类型 | 说明 | 出现场景 |
|------|------|------|---------|
| `partialArgs` | `string` | 正在流式构建的参数 JSON 片段 | 仅在 `toolcall_start` 和 `toolcall_delta` 期间 |
| `streamIndex` | `number` | 流式索引 | 仅在 `toolcall_start` 时 |

**实际 `toolcall_start` 时的 `message.content[0]` 形状**：

```json
{
  "type": "toolCall",
  "id": "call_bc231022a1fc47fa82674e73",
  "name": "read",
  "arguments": {},
  "partialArgs": "{",
  "streamIndex": 0
}
```

**`toolcall_end` 时**：`partialArgs` 和 `streamIndex` 消失，`arguments` 被填充为完整对象。

### 2.3 `Model` 对象新增字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `compat` | `object` | Provider 兼容性配置 | `{"maxTokensField": "max_tokens", "thinkingFormat": "deepseek"}` |
| `thinkingLevelMap` | `object` | 模型特定 thinking 级别映射 | `{"minimal": null, "low": null, "medium": null, "high": "high", "xhigh": "max"}` |

文档中的 `ModelInfo` 类型定义了基本字段但遗漏了 `compat` 和 `thinkingLevelMap`。这两个字段对前端很重要：
- `compat.maxTokensField` 影响模型参数展示
- `thinkingLevelMap` 中值为 `null` 的级别表示不支持，前端应隐藏/禁用

### 2.4 `get_commands` 返回的命令新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `sourceInfo` | `object` | 命令来源详细信息 |

```json
{
  "sourceInfo": {
    "path": "C:\\Users\\...\\index.ts",
    "source": "npm:pi-subagents",
    "scope": "user",
    "origin": "package",
    "baseDir": "C:\\Users\\...\\pi-subagents"
  }
}
```

文档中 `get_commands` 的命令只有 `name` / `description` / `source` / `location` / `path`，实际返回的是 `sourceInfo` 而非 `location` + `path`。

### 2.5 `agent_end` 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `willRetry` | `boolean` | 是否将自动重试 |

## 三、`extension_ui_request` 实际观察到的字段

### 3.1 `setStatus`

```json
{
  "type": "extension_ui_request",
  "id": "uuid",
  "method": "setStatus",
  "statusKey": "pi-speeed",
  "statusText": "\u001b[38;2;102;102;102mlast -- tok/s\u001b[39m"
}
```

**关键发现**：`statusText` 可能包含 **ANSI 转义码**（如颜色码 `\u001b[38;2;102;102;102m`）。前端需要 strip ANSI 或转换为 HTML。

### 3.2 `setWidget`

```json
{
  "type": "extension_ui_request",
  "id": "uuid",
  "method": "setWidget",
  "widgetKey": "subagent-async"
}
```

**关键发现**：清除 widget 时只发 `widgetKey` 不发 `widgetLines`（等价于 `widgetLines: undefined`）。设置 widget 时应包含 `widgetLines` 和 `widgetPlacement`。

### 3.3 `notify`

```json
{
  "type": "extension_ui_request",
  "id": "uuid",
  "method": "notify",
  "message": "TPS 19.3 tok/s · TTFT 15.1s · 16.9s · in 11.7K · out 35",
  "notifyType": "info"
}
```

✅ 与文档一致。

## 四、`tool_execution_end` 的 `result` 结构

```json
{
  "type": "tool_execution_end",
  "toolCallId": "call_bc231022a1fc47fa82674e73",
  "toolName": "read",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "file content here..."
      }
    ]
  },
  "isError": false
}
```

**关键发现**：`result` 中**没有 `details` 字段**（至少对 `read` 工具如此）。文档中说 `result` 有 `details`，但实际 read 工具的 result 不包含它。`details` 可能只在某些工具（如 `edit` 的 diff）中出现。

## 五、`prompt` 命令失败时的响应

```json
{
  "id": "cal-tool-1",
  "type": "response",
  "command": "prompt",
  "success": false,
  "error": "No API key found for deepseek.\n\nUse /login to log into a provider..."
}
```

✅ 与文档一致：`success: false` + `error` 字符串。

## 六、启动时的 `extension_ui_request` 风暴

pi 启动后会立即发出大量 `extension_ui_request`（setStatus / setWidget），来自各种扩展（pi-subagents, pi-mcp-adapter, pi-themes, pi-powerline-footer, pi-speeed 等）。

**对前端的影响**：
- 前端必须在 pi 启动后立即准备好处理 `extension_ui_request`
- 这些请求可能在 `get_state` 响应之前到达
- 建议前端在 EventConsumer 初始化时就注册 `pi-extension-ui-request` 监听器

## 七、文档需更新的条目

| 文件 | 位置 | 修改内容 |
|------|------|---------|
| `04-rpc-protocol.md` | 4.3 AssistantMessage | 新增 `responseId?: string` 字段 |
| `04-rpc-protocol.md` | 4.3 ToolCall | 新增流式字段 `partialArgs?: string` / `streamIndex?: number` |
| `04-rpc-protocol.md` | ModelInfo | 新增 `compat?: object` / `thinkingLevelMap?: object` |
| `04-rpc-protocol.md` | get_commands | `location` + `path` → `sourceInfo: { path, source, scope, origin, baseDir }` |
| `04-rpc-protocol.md` | agent_end | 新增 `willRetry: boolean` |
| `03-components.md` | StatusBar | setStatus 的 statusText 可能含 ANSI 码，需 strip |
| `06-edge-cases.md` | 进程启动 | 启动时立即收到大量 extension_ui_request |
