//! 应用配置持久化

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub window: WindowConfig,
    pub sidebar_width: f64,
    pub sidebar_collapsed: bool,
    pub properties_panel_open: bool,
    pub theme: String,
    pub font_family: String,
    pub font_size: String,
    pub last_session: Option<String>,
    pub pi_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            window: WindowConfig {
                x: 100.0,
                y: 100.0,
                width: 1200.0,
                height: 800.0,
                maximized: false,
            },
            sidebar_width: 260.0,
            sidebar_collapsed: false,
            properties_panel_open: false,
            theme: "system".to_string(),
            font_family: "system".to_string(),
            font_size: "medium".to_string(),
            last_session: None,
            pi_path: None,
        }
    }
}

fn config_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pi-desktop")
        .join("config.json")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(config) => return config,
                Err(e) => eprintln!("[config] 解析失败: {}", e),
            },
            Err(e) => eprintln!("[config] 读取失败: {}", e),
        }
    }
    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {}", e))?;
    eprintln!("[config] 已保存到 {}", path.display());
    Ok(())
}
