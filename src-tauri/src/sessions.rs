//! 会话扫描 — Project → Session 两级结构

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::BufRead;
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
pub struct SessionMeta {
    pub file_path: String,
    pub session_id: String,
    pub session_name: Option<String>,
    pub timestamp: String,
    pub message_count: Option<usize>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectMeta {
    pub name: String,
    pub path: String,
    pub dir_name: String,
    pub sessions: Vec<SessionMeta>,
}

/// Cached scan result with TTL (5 seconds)
static SCAN_CACHE: std::sync::Mutex<Option<(std::time::Instant, Vec<ProjectMeta>)>> = std::sync::Mutex::new(None);
const SCAN_TTL_SECS: u64 = 5;

pub fn scan_projects() -> Vec<ProjectMeta> {
    // Check cache first
    if let Ok(cache) = SCAN_CACHE.lock() {
        if let Some((timestamp, ref data)) = *cache {
            if timestamp.elapsed().as_secs() < SCAN_TTL_SECS {
                return data.clone();
            }
        }
    }

    let result = scan_projects_uncached();

    // Update cache
    if let Ok(mut cache) = SCAN_CACHE.lock() {
        *cache = Some((Instant::now(), result.clone()));
    }

    result
}

/// Force a fresh scan, bypassing cache (used after mutations like delete/rename)
pub fn invalidate_scan_cache() {
    if let Ok(mut cache) = SCAN_CACHE.lock() {
        *cache = None;
    }
}

fn scan_projects_uncached() -> Vec<ProjectMeta> {
    let sessions_dir = match dirs::home_dir() {
        Some(h) => h.join(".pi").join("agent").join("sessions"),
        None => return Vec::new(),
    };

    if !sessions_dir.exists() {
        return Vec::new();
    }

    let mut projects: HashMap<(String, String), Vec<SessionMeta>> = HashMap::new();

    for entry in walkdir::WalkDir::new(&sessions_dir)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }

        let file_path = path.to_string_lossy().to_string();
        let session_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let (project_name, dir_name) = path
            .parent()
            .and_then(|p| p.strip_prefix(&sessions_dir).ok())
            .map(|rel| {
                let raw = rel.to_string_lossy().to_string();
                let name = extract_project_name(&decode_project_path(&raw));
                (name, raw)
            })
            .unwrap_or_else(|| ("默认项目".to_string(), String::new()));

        let timestamp = path
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            })
            .unwrap_or_default();

        let session_name = read_session_name(&path);

        projects
            .entry((project_name, dir_name))
            .or_default()
            .push(SessionMeta {
                file_path,
                session_id,
                session_name,
                timestamp,
                message_count: None,
                cwd: None,
            });
    }

    let mut result: Vec<ProjectMeta> = projects
        .into_iter()
        .map(|((name, dir_name), mut sessions)| {
            sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
            ProjectMeta {
                name: name.clone(),
                path: decode_project_path(&dir_name),
                dir_name: dir_name.clone(),
                sessions,
            }
        })
        .collect();

    result.sort_by(|a, b| {
        let a_ts = a.sessions.first().map(|s| &s.timestamp);
        let b_ts = b.sessions.first().map(|s| &s.timestamp);
        b_ts.cmp(&a_ts)
    });

    result
}

/// 从 session 文件中提取名称：session_info > 首条用户消息
fn read_session_name(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut first_user_msg: Option<String> = None;

    for line in reader.lines().take(200) {
        let line = line.ok()?;
        let val: Value = serde_json::from_str(&line).ok()?;
        let entry_type = val.get("type").and_then(|t| t.as_str());

        if entry_type == Some("session_info") {
            return val
                .get("name")
                .and_then(|n| n.as_str())
                .map(|s| s.to_string());
        }

        if first_user_msg.is_none() && entry_type == Some("message") {
            if let Some(msg) = val.get("message") {
                if msg.get("role").and_then(|r| r.as_str()) == Some("user") {
                    if let Some(content) = msg.get("content") {
                        let text = extract_text(content);
                        if !text.is_empty() {
                            let truncated: String = text.chars().take(60).collect();
                            first_user_msg = Some(if text.len() > 60 {
                                format!("{}…", truncated)
                            } else {
                                truncated
                            });
                        }
                    }
                }
            }
        }
    }

    first_user_msg
}

fn extract_text(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    if let Some(arr) = content.as_array() {
        return arr
            .iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");
    }
    String::new()
}

/// 解码 pi 的路径编码: "--E--workspace-github-pi_desktop--" → "E:\\workspace\\github\\pi_desktop"
pub fn decode_project_path(encoded: &str) -> String {
    let inner = encoded
        .strip_prefix("--")
        .and_then(|s| s.strip_suffix("--"))
        .unwrap_or(encoded);

    if inner.len() < 2 {
        return inner.to_string();
    }

    let chars: Vec<char> = inner.chars().collect();
    if chars.len() > 1 && chars[1] == '-' {
        let drive = chars[0];
        let rest: String = chars[2..].iter().collect();
        format!("{}:\\{}", drive, rest.replace('-', "\\"))
    } else {
        inner.replace('-', "\\")
    }
}

/// 从路径中取最后一级目录名
fn extract_project_name(path: &str) -> String {
    let cleaned = path.trim_end_matches('\\').trim_end_matches('/');
    cleaned
        .rsplit(&['\\', '/'][..])
        .next()
        .unwrap_or(cleaned)
        .to_string()
}
