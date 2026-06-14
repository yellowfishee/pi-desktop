//! pi / bash 可用性检测

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct PiCheckResult {
    pub pi_available: bool,
    pub pi_path: Option<String>,
    pub pi_version: Option<String>,
    pub bash_available: bool,
    pub bash_path: Option<String>,
    pub errors: Vec<String>,
}

pub fn find_pi() -> PiCheckResult {
    let mut result = PiCheckResult {
        pi_available: false,
        pi_path: None,
        pi_version: None,
        bash_available: true,
        bash_path: None,
        errors: Vec::new(),
    };

    check_bash(&mut result);
    check_pi(&mut result);

    result
}

fn check_bash(result: &mut PiCheckResult) {
    #[cfg(not(target_os = "windows"))]
    return;

    #[cfg(target_os = "windows")]
    {
        result.bash_available = false;

        let bash_paths = [
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ];
        for p in &bash_paths {
            if std::path::Path::new(p).exists() {
                result.bash_available = true;
                result.bash_path = Some(p.to_string());
                return;
            }
        }

        if let Ok(output) = Command::new("where").arg("bash").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    result.bash_available = true;
                    result.bash_path = Some(path);
                    return;
                }
            }
        }

        if let Some(home) = dirs::home_dir() {
            for sub in &["msys2", "git"] {
                let p = home
                    .join("scoop")
                    .join("apps")
                    .join(sub)
                    .join("current")
                    .join("usr")
                    .join("bin")
                    .join("bash.exe");
                if p.exists() {
                    result.bash_available = true;
                    result.bash_path = Some(p.to_string_lossy().to_string());
                    return;
                }
            }
        }

        result.errors.push(
            "Windows 上未检测到 bash，请安装 Git for Windows 或通过 scoop 安装 git/msys2"
                .to_string(),
        );
    }
}

fn check_pi(result: &mut PiCheckResult) {
    debug_log("=== check_pi started ===");

    let pi_candidates: &[&str] = if cfg!(target_os = "windows") {
        &["pi", "pi.cmd", "pi.exe"]
    } else {
        &["pi"]
    };

    let found_path = find_pi_path();
    debug_log(&format!("found_path: {:?}", found_path));

    for cmd in pi_candidates {
        let mut command = if let Some(ref p) = found_path {
            Command::new(p)
        } else {
            Command::new(cmd)
        };
        command.arg("--version");

        debug_log(&format!("trying command: {:?}", command));
        match command.output() {
            Ok(output) => {
                debug_log(&format!("status: {}, stdout: {:?}, stderr: {:?}",
                    output.status,
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                ));
                if output.status.success() {
                    result.pi_available = true;
                    result.pi_version =
                        Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                    result.pi_path = found_path.or_else(|| Some(cmd.to_string()));
                    debug_log("pi found successfully!");
                    return;
                }
            }
            Err(e) => {
                debug_log(&format!("command error: {}", e));
                result.errors.push(format!("执行 {} 失败: {}", cmd, e));
            }
            _ => continue,
        }
    }
    debug_log("pi not available after all attempts");
}

fn debug_log(msg: &str) {
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let log_path = std::path::PathBuf::from(&home).join("pi-desktop-debug.log");
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(f, "[{}] {}", timestamp, msg)
            });
    }
}

fn find_pi_path() -> Option<String> {
    debug_log("=== find_pi_path started ===");

    // 1. 尝试 where/which
    let cmd = if cfg!(target_os = "windows") {
        Command::new("where").arg("pi").output()
    } else {
        Command::new("which").arg("pi").output()
    };

    debug_log(&format!("where/which result: {:?}", cmd));

    let from_where = cmd.ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string())
        })
        .filter(|p| !p.is_empty() && std::path::Path::new(p).exists());

    debug_log(&format!("from_where: {:?}", from_where));

    if from_where.is_some() {
        return from_where;
    }

    // 2. Windows: 检查常见安装路径
    #[cfg(target_os = "windows")]
    {
        let home = dirs::home_dir().unwrap_or_default();
        debug_log(&format!("home dir: {:?}", home));

        let candidates = vec![
            // Scoop shims
            home.join("scoop/shims/pi.exe"),
            // Scoop apps
            home.join("scoop/apps/pi/current/pi.exe"),
            // npm global
            home.join("AppData/Roaming/npm/pi.cmd"),
            home.join("AppData/Roaming/npm/pi.exe"),
        ];

        // 也检查 SCOOP 环境变量
        if let Ok(scoop_dir) = std::env::var("SCOOP") {
            debug_log(&format!("SCOOP env: {}", scoop_dir));
            let scoop_path = std::path::PathBuf::from(&scoop_dir);
            let mut extra = vec![
                scoop_path.join("shims/pi.exe"),
                scoop_path.join("apps/pi/current/pi.exe"),
            ];
            extra.extend(candidates);
            for p in &extra {
                debug_log(&format!("checking: {:?} exists={}", p, p.exists()));
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        } else {
            debug_log("SCOOP env not set");
            for p in &candidates {
                debug_log(&format!("checking: {:?} exists={}", p, p.exists()));
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }

    debug_log("pi not found");
    None
}
