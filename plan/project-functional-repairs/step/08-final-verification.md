# 步骤 8：全量验收与当前说明

## 目标

确认全部修复在支持的平台边界内可构建、可测试，并让 README 只描述当前已实现行为。

## 验证链路

1. 执行前端单元和组件测试。
2. 执行 TypeScript 生产构建。
3. 执行 Rust 单元测试、`cargo check` 和严格 Clippy。
4. 执行项目静态诊断，处理本次修改引入的全部错误和警告。
5. 执行依赖审计并记录无法由当前依赖版本消除的结果。
6. 手动验证单窗口启动、会话切换、分支会话、Git 操作、设置恢复和首次启动。
7. 手动验证两个窗口使用不同会话、独立重启和独立关闭。
8. 更新 README 的功能列表、测试命令和已知限制。

## 验收标准

- `pnpm test --run` 通过。
- `pnpm build` 通过。
- `cargo test --manifest-path src-tauri/Cargo.toml` 通过。
- `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` 通过。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 通过。
- 本次修改文件没有阻塞诊断。
- README 不再声明未接通的能力。
- Git 工作区只包含计划内文件。
