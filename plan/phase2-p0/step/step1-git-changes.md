# Step 1: Git Changes 面板增强

## 目标

将 ChangesPanel 从「只读 diff 查看器」升级为「交互式 Git 操作面板」。

---

## 子步骤

### Step 1.1: Rust 后端 — git 操作 commands

**新增 Tauri Commands**（在 `commands.rs` 中）：

#### `stage_files`
- 输入：`{ dirName: string, files: string[] }`
- 实现：`git add -- <files...>` 在 project_dir 执行
- 输出：`{ success: boolean }`

#### `unstage_files`
- 输入：`{ dirName: string, files: string[] }`
- 实现：`git reset HEAD -- <files...>`（未 tracked 的文件只 reset，不恢复内容）
- 输出：`{ success: boolean }`

#### `discard_changes`
- 输入：`{ dirName: string, files: string[], staged: boolean }`
- 实现：
  - staged=true: `git reset HEAD -- <files>` + `git checkout -- <files>`
  - staged=false: `git checkout -- <files>`
- 输出：`{ success: boolean }`
- ⚠️ 需要确认对话框（前端处理）

#### `git_commit`
- 输入：`{ dirName: string, message: string, files?: string[] }`
- 实现：
  - 如有 files：`git commit -m <message> -- <files>`
  - 否则：`git commit -m <message>`
- 输出：`{ success: boolean, hash?: string, error?: string }`

**前端 API 层**（`tauri.ts`）：
- `stageFiles(dirName, files)`
- `unstageFiles(dirName, files)`
- `discardChanges(dirName, files, staged)`
- `gitCommit(dirName, message, files?)`

**注册到 `main.rs`** invoke_handler。

#### 验收标准
- [ ] `cargo check` 通过
- [ ] 4 个 command 函数编译无 error
- [ ] 已注册到 `generate_handler![]`

---

### Step 1.2: ChangesPanel — 文件级操作 UI

**改动范围**：`src/components/panels/ChangesPanel.tsx`

#### 文件列表增强
- 每个文件行左侧加 **checkbox**（`<input type="checkbox">`）
- 顶部工具栏：
  - 全选 checkbox
  - Stage / Unstage 按钮
  - Discard 按钮（红色，危险操作）
  - "暂存区" / "工作区" Tab 切换（`staged` vs `unstaged` files）
- 根据文件状态显示不同的操作按钮：
  - `??` (untracked): 仅显示 Stage
  - ` M` (modified unstaged): Stage + Discard
  - `M ` (staged): Unstage
  - `A ` (staged added): Unstage
  - `D `: Unstage
  - `AM`/`MM`: Stage + Unstage

#### 状态管理
- `useState` 管理：`selectedFiles: Set<string>`, `activeFilter: 'unstaged' | 'staged' | 'all'`
- stage/unstage/discard 操作后自动 `listGitChanges` 刷新数据

#### 验收标准
- [ ] 文件列表有 checkbox，支持点击选中/取消
- [ ] 全选 checkbox 功能正常
- [ ] Stage/Unstage 按钮按文件状态正确显示
- [ ] 操作后自动刷新变更列表
- [ ] 错误提示 toast

---

### Step 1.3: Commit 对话框

**新增组件**：`src/components/panels/CommitDialog.tsx`

#### 功能
- Modal 对话框（复用 SettingsPanel 的遮罩模式）
- 输入：commit message（`<textarea>`）
- 显示：即将提交的文件列表（从选中文件或 staged 文件读取）
- 按钮：Commit / Cancel
- 提交中：loading 状态 + 按钮 disabled
- 提交后：toast 提示 + 自动刷新变更列表

#### 入口
- ChangesPanel 顶部工具栏「Commit」按钮
- 仅在 staged 文件 > 0 时可用（或允许 `git commit -a`）

#### 验收标准
- [ ] 对话框 UI（遮罩 + 动画 + ESC 关闭）
- [ ] commit message 输入
- [ ] 提交成功 toast + 刷新
- [ ] 提交失败显示错误信息
- [ ] loading 状态

---

## 接口设计

### Rust 端

```rust
#[tauri::command]
pub async fn stage_files(dir_name: String, files: Vec<String>) -> Result<Value, String>

#[tauri::command]
pub async fn unstage_files(dir_name: String, files: Vec<String>) -> Result<Value, String>

#[tauri::command]
pub async fn discard_changes(dir_name: String, files: Vec<String>, staged: bool) -> Result<Value, String>

#[tauri::command]
pub async fn git_commit(dir_name: String, message: String, files: Option<Vec<String>>) -> Result<Value, String>
```

### 前端

```ts
async function stageFiles(dirName: string, files: string[]): Promise<void>
async function unstageFiles(dirName: string, files: string[]): Promise<void>
async function discardChanges(dirName: string, files: string[], staged: boolean): Promise<void>
async function gitCommit(dirName: string, message: string, files?: string[]): Promise<{ hash?: string }>
```

## 依赖
- Step 1.1 → Step 1.2 → Step 1.3（线性依赖）
- **不依赖 Step 2 或 Step 3**
