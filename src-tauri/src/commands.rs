//! Tauri Commands — 前端 invoke 接口

use crate::config::{self, AppConfig};
use crate::pi_check::{find_pi, PiCheckResult};
use crate::pi_process::spawn_pi_and_reader;
use crate::sessions::{decode_project_path, scan_projects, ProjectMeta};
use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct GitChangeFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub preview: String,
}

#[derive(Debug, Serialize)]
pub struct GitChanges {
    pub branch: String,
    pub root: String,
    pub files: Vec<GitChangeFile>,
}

// ============================================================
// pi / 会话命令
// ============================================================

#[tauri::command]
pub async fn check_pi_available() -> Result<PiCheckResult, String> {
    Ok(find_pi())
}

#[tauri::command]
pub async fn list_sessions() -> Result<Vec<ProjectMeta>, String> {
    Ok(scan_projects())
}

#[tauri::command]
pub async fn list_git_changes(dir_name: String) -> Result<GitChanges, String> {
    let project_path = decode_project_path(&dir_name);
    let project_dir = Path::new(&project_path);
    if !project_dir.exists() {
        return Err(format!("项目目录不存在: {}", project_path));
    }

    let root = run_git(project_dir, &["rev-parse", "--show-toplevel"])?;
    let root = root.trim().to_string();
    if root.is_empty() {
        return Err("当前项目不是 Git 仓库".into());
    }

    let branch = run_git(Path::new(&root), &["branch", "--show-current"])
        .unwrap_or_default()
        .trim()
        .to_string();
    let branch = if branch.is_empty() {
        run_git(Path::new(&root), &["rev-parse", "--short", "HEAD"])
            .unwrap_or_else(|_| "detached".into())
            .trim()
            .to_string()
    } else {
        branch
    };

    let status_output = run_git(
        Path::new(&root),
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )?;
    let numstat_output = run_git(Path::new(&root), &["diff", "--numstat", "HEAD", "--"])?;
    let numstat = parse_numstat(&numstat_output);

    let mut files = Vec::new();
    for line in status_output.lines() {
        if line.len() < 4 {
            continue;
        }
        let code = line[..2].to_string();
        let raw_path = line[3..].trim().to_string();
        let (old_path, path) = parse_status_path(&raw_path);
        let (additions, deletions) = numstat.get(&path).copied().unwrap_or((0, 0));
        let preview = build_diff_preview(Path::new(&root), &path, &code);

        files.push(GitChangeFile {
            path,
            old_path,
            status: code,
            additions,
            deletions,
            preview,
        });
    }

    Ok(GitChanges {
        branch,
        root,
        files,
    })
}

#[tauri::command]
pub async fn read_session_messages(session_path: String) -> Result<Vec<Value>, String> {
    let file = std::fs::File::open(&session_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut messages: Vec<Value> = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("读取行失败: {}", e))?;
        if let Ok(val) = serde_json::from_str::<Value>(&line) {
            if val.get("type").and_then(|t| t.as_str()) == Some("message") {
                if let Some(msg) = val.get("message") {
                    messages.push(msg.clone());
                }
            }
        }
    }

    Ok(messages)
}

#[tauri::command]
pub async fn delete_session_file(session_path: String) -> Result<(), String> {
    std::fs::remove_file(&session_path).map_err(|e| format!("删除失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_project(dir_name: String) -> Result<(), String> {
    let sessions_dir = dirs::home_dir()
        .ok_or("无法获取 home 目录")?
        .join(".pi")
        .join("agent")
        .join("sessions");
    let project_dir = sessions_dir.join(&dir_name);
    if !project_dir.exists() {
        return Err("项目目录不存在".into());
    }
    std::fs::remove_dir_all(&project_dir).map_err(|e| format!("删除项目失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn rename_session_file(session_path: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("名称不能为空".into());
    }

    let content =
        std::fs::read_to_string(&session_path).map_err(|e| format!("无法读取文件: {}", e))?;

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut found = false;
    let now = chrono::Utc::now().to_rfc3339();
    let new_id = format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );

    for line in &mut lines {
        if let Ok(mut val) = serde_json::from_str::<Value>(line) {
            if val.get("type").and_then(|t| t.as_str()) == Some("session_info") {
                val["name"] = Value::String(name.clone());
                *line = serde_json::to_string(&val).unwrap_or_else(|_| line.clone());
                found = true;
                break;
            }
        }
    }

    if !found {
        let entry = serde_json::json!({
            "type": "session_info",
            "id": new_id,
            "parentId": null,
            "timestamp": now,
            "name": name,
        });
        lines.push(serde_json::to_string(&entry).unwrap_or_default());
    }

    std::fs::write(&session_path, lines.join("\n") + "\n")
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

// ============================================================
// pi 进程生命周期
// ============================================================

#[tauri::command]
pub async fn start_pi(
    app_handle: AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let mut child_lock = state.child.lock().await;
    if child_lock.is_some() {
        return Ok(());
    }

    match spawn_pi_and_reader(app_handle, state.pending_commands.clone()).await {
        Ok((stdin_writer, child)) => {
            let mut stdin_lock = state.stdin.lock().await;
            *stdin_lock = Some(stdin_writer);
            *child_lock = Some(child);
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn stop_pi(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    {
        let mut stdin_lock = state.stdin.lock().await;
        if let Some(mut writer) = stdin_lock.take() {
            use tokio::io::AsyncWriteExt;
            let _ = writer.write_all(b"{\"type\":\"abort\"}\n").await;
            let _ = writer.flush().await;
        }
    }

    let mut child_lock = state.child.lock().await;
    if let Some(mut child) = child_lock.take() {
        match tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await {
            Ok(_) => {}
            Err(_) => {
                let _ = child.kill().await;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn pi_is_running(state: tauri::State<'_, crate::AppState>) -> Result<bool, String> {
    let child_lock = state.child.lock().await;
    Ok(child_lock.is_some())
}

// ============================================================
// RPC 通信
// ============================================================

#[tauri::command]
pub async fn send_command(
    state: tauri::State<'_, crate::AppState>,
    command: Value,
) -> Result<Value, String> {
    use tokio::io::AsyncWriteExt;
    use tokio::sync::oneshot;

    let id = command
        .get("id")
        .and_then(|i| i.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("req-{}", uuid_simple()));

    let mut cmd = command.clone();
    if cmd.get("id").is_none() {
        cmd["id"] = Value::String(id.clone());
    }

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = state.pending_commands.lock().await;
        pending.insert(id.clone(), tx);
    }

    {
        let mut stdin_lock = state.stdin.lock().await;
        let writer = stdin_lock.as_mut().ok_or("pi 进程未运行")?;
        let line = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
        writer
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        writer.write_all(b"\n").await.map_err(|e| e.to_string())?;
        writer.flush().await.map_err(|e| e.to_string())?;
    }

    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(response)) => Ok(response),
        Ok(Err(_)) => Err("命令响应通道已关闭".to_string()),
        Err(_) => {
            let mut pending = state.pending_commands.lock().await;
            pending.remove(&id);
            Err("命令超时 (30s)".to_string())
        }
    }
}

#[tauri::command]
pub async fn send_extension_ui_response(
    state: tauri::State<'_, crate::AppState>,
    response: Value,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let mut stdin_lock = state.stdin.lock().await;
    let writer = stdin_lock.as_mut().ok_or("pi 进程未运行")?;
    let line = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    writer
        .write_all(line.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    writer.write_all(b"\n").await.map_err(|e| e.to_string())?;
    writer.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// 应用配置
// ============================================================

#[tauri::command]
pub async fn get_app_config(state: tauri::State<'_, crate::AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

#[tauri::command]
pub async fn set_app_config(
    state: tauri::State<'_, crate::AppState>,
    config: AppConfig,
) -> Result<(), String> {
    let mut current = state.config.lock().await;
    *current = config.clone();
    drop(current);
    config::save_config(&config)
}

// ============================================================
// 工具函数
// ============================================================

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", ts)
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("无法执行 git: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("git {:?} 执行失败", args)
        } else {
            err
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_numstat(output: &str) -> std::collections::HashMap<String, (usize, usize)> {
    let mut stats = std::collections::HashMap::new();
    for line in output.lines() {
        let mut parts = line.split('\t');
        let additions = parts.next().and_then(parse_num).unwrap_or(0);
        let deletions = parts.next().and_then(parse_num).unwrap_or(0);
        if let Some(path) = parts.next() {
            let (_, new_path) = parse_status_path(path.trim());
            stats.insert(new_path, (additions, deletions));
        }
    }
    stats
}

fn parse_num(value: &str) -> Option<usize> {
    value.parse::<usize>().ok()
}

fn parse_status_path(raw: &str) -> (Option<String>, String) {
    if let Some((old_path, new_path)) = raw.split_once(" -> ") {
        (Some(clean_git_path(old_path)), clean_git_path(new_path))
    } else {
        (None, clean_git_path(raw))
    }
}

fn clean_git_path(path: &str) -> String {
    path.trim().trim_matches('"').replace("\\\"", "\"")
}

fn build_diff_preview(root: &Path, path: &str, status: &str) -> String {
    if status == "??" {
        return build_untracked_preview(root, path);
    }

    let unstaged = run_git(root, &["diff", "--", path]).unwrap_or_default();
    if !unstaged.trim().is_empty() {
        return unstaged;
    }

    run_git(root, &["diff", "--cached", "--", path]).unwrap_or_default()
}

fn build_untracked_preview(root: &Path, path: &str) -> String {
    let full_path = root.join(path);
    let Ok(content) = std::fs::read_to_string(full_path) else {
        return String::new();
    };

    content
        .lines()
        .take(80)
        .map(|line| format!("+{}", line))
        .collect::<Vec<_>>()
        .join("\n")
}
