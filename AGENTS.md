# Project Instructions

This file provides context for AI assistants working on this project.

## Project Type: Unknown

<!-- Add build/test commands here -->

### Documentation

See README.md for project overview.

### Version Control

This project uses Git. See .gitignore for excluded files.

## Guidelines

- Follow existing code style and patterns
- Write tests for new functionality
- Keep changes focused and atomic
- Document public APIs

## Important Notes

- 当你准备调用superpower写计划时，请优先考虑这个方案：
  - 1. 在根目录的 plan 文件夹中，以名字建立计划
  - 1. 做index.md，简要描述这次计划，以及你的步骤链路，然后附上Todo
  - 1. 然后在该文件下的step子文件夹，描述各Todo的实施链路，以及验收标准
  - 1. 当实施计划出现变动时，请查看是否需要联动修改

## 功能开发工作流程

当需要增加新功能时，必须遵循以下流程：

### 1. 制定计划
- 在 `plan/` 目录下创建计划文件夹
- 编写 `index.md`：功能概述、步骤链路、Todo 清单
- 在 `step/` 子文件夹中编写每个步骤的详细实施文档
- 包含：接口设计、数据库设计、验收标准等
- **计划完成后，等待用户审核确认再开始实施**

### 2. 创建分支
- 从 main/master 分支创建功能分支
- 分支命名规范：`feature/{功能名称}`（如 `feature/merchant-settlement`）
- 命令：`git checkout -b feature/{功能名称}`

### 3. 按步骤实施
- 按照计划中的步骤顺序实施
- **每完成一个步骤，必须提交一次**
- 提交信息格式：`feat: {功能名称} - {步骤描述}`
- 示例：`feat: 商户入驻 - 数据库设计`
- **每次提交后，等待用户审核通过再继续下一步骤**

### 4. 审核确认
- 用户可以通过以下方式审核：
  - `git log --oneline`：查看提交历史
  - `git diff HEAD~1`：查看最近一次改动
  - `git diff main..feature/{分支名}`：查看所有改动
- 用户确认 OK 后，继续下一步骤
- 如有问题，及时调整并重新提交

### 5. 完成合并
- 所有步骤完成后，用户最终审核
- 审核通过后，合并到主分支

### 示例流程
```
步骤 1：数据库设计
    ├── 我：编写 SQL 文件
    ├── 我：git commit -m "feat: 商户入驻 - 数据库设计"
    ├── 你：查看 diff，审核
    └── 你：确认 OK → 继续步骤 2

步骤 2：入驻申请接口
    ├── 我：编写后端接口
    ├── 我：git commit -m "feat: 商户入驻 - 入驻申请接口"
    ├── 你：查看 diff，审核
    └── 你：确认 OK → 继续步骤 3

... 以此类推
```
<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "How does X reach/become Y? / trace the flow from X to Y" | `codegraph_trace` (one call = the whole path, incl. callback/React/JSX dynamic hops) |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. For a specific **flow** ("how does X reach Y") start with `codegraph_trace` from→to — one call returns the whole path with dynamic hops bridged — then ONE `codegraph_explore` for the bodies; don't rebuild the path with `codegraph_search` + `codegraph_callers`. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag — check the staleness banner, don't guess a wait.** When a codegraph response starts with "⚠️ Some files referenced below were edited since the last index sync…", the listed files are pending re-index — Read those specific files for accurate content. Files NOT in that banner are fresh and codegraph is authoritative for them. `codegraph_status` also lists pending files under "Pending sync".

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph initialized. Want me to run `codegraph init -i` to build the index?"*
<!-- CODEGRAPH_END -->
