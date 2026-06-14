//! pi 子进程管理 + stdout reader

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader, BufWriter};
use tokio::sync::{oneshot, Mutex};

/// 启动 pi --mode rpc 子进程 + 后台 stdout reader
pub async fn spawn_pi_and_reader(
    app_handle: AppHandle,
    pending_commands: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    configured_path: Option<String>,
) -> Result<(BufWriter<tokio::process::ChildStdin>, tokio::process::Child), String> {
    let check = crate::pi_check::find_pi_with_path(configured_path.as_deref());
    if !check.pi_available {
        return Err(if check.errors.is_empty() {
            "无法启动 pi 进程: 未检测到 pi".to_string()
        } else {
            format!("无法启动 pi 进程: {}", check.errors.join("; "))
        });
    }

    let pi_path = check
        .pi_path
        .ok_or_else(|| "无法启动 pi 进程: pi 路径为空".to_string())?;

    let mut last_err = String::new();
    let mut child = None;

    for cmd in [pi_path.as_str()] {
        let mut cmd_builder = tokio::process::Command::new(cmd);
        cmd_builder
            .arg("--mode")
            .arg("rpc")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        // Windows: 隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd_builder.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd_builder.spawn()
        {
            Ok(c) => {
                child = Some(c);
                break;
            }
            Err(e) => {
                last_err = format!("{} (tried {})", e, cmd);
            }
        }
    }

    let mut child = child.ok_or_else(|| format!("无法启动 pi 进程: {}", last_err))?;

    let stdout = child.stdout.take().ok_or("无法获取 pi stdout")?;
    let stdin = child.stdin.take().ok_or("无法获取 pi stdin")?;

    tauri::async_runtime::spawn(stdout_reader_task(
        stdout,
        app_handle.clone(),
        pending_commands,
    ));

    Ok((BufWriter::new(stdin), child))
}

async fn stdout_reader_task(
    stdout: tokio::process::ChildStdout,
    app_handle: AppHandle,
    pending_commands: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        // Parse JSON on blocking thread pool to avoid blocking tokio runtime
        let value: Value = match tokio::task::spawn_blocking(move || serde_json::from_str(&line)).await {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                eprintln!(
                    "[pi stdout] JSON error: {}",
                    e
                );
                continue;
            }
            Err(e) => {
                eprintln!("[pi stdout] spawn_blocking error: {}", e);
                continue;
            }
        };

        match value.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "response" => {
                if let Some(id) = value.get("id").and_then(|i| i.as_str()) {
                    let mut pending_map = pending_commands.lock().await;
                    if let Some(sender) = pending_map.remove(id) {
                        let _ = sender.send(value);
                    }
                }
            }
            "extension_ui_request" => {
                let _ = app_handle.emit("pi-extension-ui-request", &value);
            }
            _ => {
                let _ = app_handle.emit("pi-event", &value);
            }
        }
    }

    // stdin/stdout 已断开 — 清理全局状态，
    // 防止后续 send_command 往已死进程写入导致 "pipe is being closed"
    if let Some(state) = app_handle.try_state::<crate::AppState>() {
        // 清理 stdin writer
        {
            let mut stdin_lock = state.stdin.lock().await;
            *stdin_lock = None;
        }
        // 清理 child handle
        {
            let mut child_lock = state.child.lock().await;
            *child_lock = None;
        }
        // 清理所有 pending commands，让前端快速失败
        {
            let mut pending = pending_commands.lock().await;
            for (_, sender) in pending.drain() {
                let _ = sender.send(serde_json::json!({
                    "type": "response",
                    "success": false,
                    "error": "pi process exited"
                }));
            }
        }
    }

    let _ = app_handle.emit(
        "pi-process-exit",
        serde_json::json!({ "code": serde_json::Value::Null, "reason": "eof" }),
    );
}
