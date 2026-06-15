# Step 3: 重构组件中的硬编码字号

## 任务
将 text-[13px] 等硬编码值替换为语义化 Tailwind 类，统一 MarkdownContent、MessageBubble、MessageInput 等核心组件。

## 需要修改的文件
- src/components/chat/MessageBubble.tsx
- src/components/chat/MarkdownContent.tsx
- src/components/chat/MessageInput.tsx
- src/components/chat/ChatPanel.tsx
- src/components/panels/SettingsPanel.tsx
- src/components/layout/TitleBar.tsx
- src/components/panels/ChangesPanel.tsx
- src/components/panels/DiagnosticsPanel.tsx
- src/components/panels/CommitDialog.tsx
- src/components/shared/Confirm.tsx
- src/components/shared/ContextMenu.tsx
- src/components/shared/ExtensionDialogModal.tsx
- src/components/shared/NotificationStack.tsx
- src/components/screens/WelcomeScreen.tsx

## 映射规则
| 原值 | 替换为 | 说明 |
|------|--------|------|
| text-[13px] | text-sm | 13px 正文 |
| text-[14px] | text-base | 14px 正文 |
| text-xs (硬编码12px) | text-xs | 12px 辅助文字 |
| text-sm (硬编码14px) | text-base | 14px 正文 |

## 验收标准
- [ ] 所有组件中无 text-[13px]、text-[14px] 等硬编码字号
- [ ] 语义化类名使用正确
- [ ] 暗/亮主题下显示正常
