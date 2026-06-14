# Step 3: 虚拟滚动

## 目标

当前消息列表一次性渲染全部 DOM 节点。当会话有数百条消息时，性能会显著下降。使用 `@tanstack/react-virtual` 实现虚拟滚动，仅渲染可视区域内的消息气泡。

---

## 子步骤

### Step 3.1: 集成 @tanstack/react-virtual

**改动范围**：`src/components/chat/ChatPanel.tsx`

#### 当前状态
- `messages.map(...)` 直接渲染所有 `<MessageBubble>`
- 自动滚动通过 `scrollRef` + `bottomRef` 的 `scrollIntoView` 实现

#### 集成方案

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function ChatPanel() {
  const messages = useMessageStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200, // 估计每条消息高度 200px
    overscan: 5,             // 上下各预渲染 5 条
  });

  const virtualItems = virtualizer.getVirtualItems();

  // 渲染
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((virtualItem) => {
          const msg = messages[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageBubble message={msg} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

#### 注意事项
1. **measureElement 回调** — 每条消息气泡的实际高度可能不同（纯文本 vs 工具调用展开 vs 代码块）。需要设置 `measureElement` ref 让 `@tanstack/react-virtual` 动态测量真实高度。

2. **占位高度** — `estimateSize` 应该给一个合理的默认值（200px），虚拟滚动会在渲染后通过 `measureElement` 修正。

3. **overscan** — 设为 5 保证快速滚动时不会看到白屏。

4. **空状态 / loading 状态** — 保留现有的空消息提示和会话加载 spinner。

#### 验收标准
- [ ] 消息列表使用虚拟滚动，DOM 中仅渲染可视 + overscan 区域的消息
- [ ] 滚动流畅，无白屏或跳动
- [ ] 不同高度消息气泡（含展开的工具卡片）正常渲染
- [ ] 空消息状态和 loading 状态正常工作
- [ ] `pnpm tsc` 类型检查通过

---

### Step 3.2: 自动滚动行为适配

#### 问题
当前使用 `bottomRef.scrollIntoView()` 实现「自动滚动到底部」。虚拟滚动下无 `bottomRef`，需要改用 `virtualizer.scrollToIndex()`。

#### 方案

```ts
// 自动滚动到底部（流式输出时）
useEffect(() => {
  if (!shouldAutoScrollRef.current) return;
  const lastIndex = messages.length - 1;
  if (lastIndex < 0) return;

  // 使用 requestAnimationFrame 防抖
  if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  scrollFrameRef.current = requestAnimationFrame(() => {
    scrollFrameRef.current = null;
    virtualizer.scrollToIndex(lastIndex, {
      align: 'end',
      behavior: isStreaming ? 'auto' : 'smooth',
    });
  });
}, [messages.length, isStreaming]);

// "回到底部" 按钮
const scrollToBottom = useCallback(() => {
  shouldAutoScrollRef.current = true;
  virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
  setShowScrollButton(false);
}, [messages.length]);
```

#### 判断"是否在底部"
- 用 `virtualizer.scrollOffset` + `virtualizer.getTotalSize()` 计算
- 或检查最后一个 virtual item 是否在可视区：
  ```ts
  const lastItem = virtualizer.getVirtualItems().at(-1);
  const isAtBottom = lastItem
    ? lastItem.end <= (scrollRef.current?.clientHeight ?? 0) + 100
    : true;
  ```

#### 验收标准
- [ ] 流式输出时自动滚动跟随最新内容
- [ ] 用户手动上滚后暂停自动滚动
- [ ] "回到底部" 按钮功能正常
- [ ] 发送新消息后从头开始自动滚动
