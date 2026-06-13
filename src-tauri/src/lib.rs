//! Pi Desktop — Tauri 后端入口
//!
//! 模块划分:
//! - config:     应用配置持久化
//! - pi_check:   pi / bash 可用性检测
//! - sessions:   会话扫描 (Project → Session)
//! - pi_process: pi 子进程管理 + stdout reader
//! - commands:   Tauri IPC Commands

mod commands;
mod config;
mod pi_check;
mod pi_process;
mod sessions;

use config::load_config;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::io::BufWriter;
use tokio::process::Child;
use tokio::sync::{oneshot, Mutex};

// ============================================================
// 应用全局状态
// ============================================================

pub struct AppState {
    pub stdin: Arc<Mutex<Option<BufWriter<tokio::process::ChildStdin>>>>,
    pub child: Arc<Mutex<Option<Child>>>,
    pub pending_commands: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    pub config: Arc<Mutex<config::AppConfig>>,
}

// ============================================================
// 应用入口
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let pending_commands = Arc::new(Mutex::new(HashMap::new()));

            let state = AppState {
                stdin: Arc::new(Mutex::new(None)),
                child: Arc::new(Mutex::new(None)),
                pending_commands: pending_commands.clone(),
                config: Arc::new(Mutex::new(load_config())),
            };
            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_pi_available,
            commands::list_sessions,
            commands::read_session_messages,
            commands::delete_session_file,
            commands::delete_project,
            commands::rename_session_file,
            commands::start_pi,
            commands::stop_pi,
            commands::pi_is_running,
            commands::send_command,
            commands::send_extension_ui_response,
            commands::get_app_config,
            commands::set_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
