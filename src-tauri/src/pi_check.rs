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

pub fn find_pi_with_path(preferred_path: Option<&str>) -> PiCheckResult {
    let mut result = PiCheckResult {
        pi_available: false,
        pi_path: None,
        pi_version: None,
        bash_available: true,
        bash_path: None,
        errors: Vec::new(),
    };

    check_bash(&mut result);
    check_pi(&mut result, preferred_path);

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

        let mut where_cmd = Command::new("where");
        where_cmd.arg("bash");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            where_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        if let Ok(output) = where_cmd.output() {
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

fn check_pi(result: &mut PiCheckResult, preferred_path: Option<&str>) {
    debug_log("=== check_pi started ===");

    // 1. 先检查本次调用传入的路径，设置页检测时不依赖异步配置保存
    if let Some(path) = normalize_candidate_path(preferred_path) {
        debug_log(&format!("preferred pi_path: {}", path));
        if try_pi_command(&path, result, &path, "preferred") {
            return;
        }
    }

    // 2. 检查配置文件中是否有自定义路径
    let config_path = get_config_pi_path();
    debug_log(&format!("config pi_path: {:?}", config_path));

    if let Some(ref path) = config_path {
        if try_pi_command(path, result, path, "config") {
            return;
        }
    }

    // 3. 自动查找
    let found_path = find_pi_path();
    debug_log(&format!("found_path: {:?}", found_path));

    if let Some(ref p) = found_path {
        if try_pi_command(p, result, p, "auto-detect") {
            return;
        }
    }

    // 4. 尝试 PATH 中的命令
    let pi_candidates: &[&str] = if cfg!(target_os = "windows") {
        &["pi", "pi.cmd", "pi.exe"]
    } else {
        &["pi"]
    };

    for cmd in pi_candidates {
        if try_pi_command(cmd, result, cmd, "PATH") {
            return;
        }
    }
    debug_log("pi not available after all attempts");
}

fn normalize_candidate_path(path: Option<&str>) -> Option<String> {
    let trimmed = path?.trim().trim_matches('"').trim_matches('\'').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub fn try_pi_command(command_path: &str, result: &mut PiCheckResult, reported_path: &str, source: &str) -> bool {
    if command_path.contains(std::path::MAIN_SEPARATOR) || command_path.contains('/') || command_path.contains('\\') {
        let path_obj = std::path::Path::new(command_path);
        if !path_obj.exists() {
            result.errors.push(format!("pi 路径不存在: {}", command_path));
            return false;
        }
    }

    let mut command = Command::new(command_path);
    command.arg("--version");

    // Windows: 隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    debug_log(&format!("trying {} path: {:?}", source, command));

    match command.output() {
        Ok(output) => {
            debug_log(&format!("status: {}, stdout: {:?}, stderr: {:?}",
                output.status,
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ));
            if output.status.success() {
                result.pi_available = true;
                result.pi_version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                result.pi_path = Some(reported_path.to_string());
                debug_log(&format!("pi found via {}!", source));
                true
            } else {
                result.errors.push(format!(
                    "{} --version 退出码异常: {} {}",
                    command_path,
                    output.status,
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
                false
            }
        }
        Err(e) => {
            debug_log(&format!("command error: {}", e));
            result.errors.push(format!("执行 {} 失败: {}", command_path, e));
            false
        }
    }
}

fn get_config_pi_path() -> Option<String> {
    let config_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pi-desktop")
        .join("config.json");

    if !config_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&config_path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    config.get("pi_path")?.as_str().map(|s| s.to_string())
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

    // Windows: 检查常见安装路径
    #[cfg(target_os = "windows")]
    {
        let home = dirs::home_dir().unwrap_or_default();
        debug_log(&format!("home dir: {:?}", home));

        // 构建候选路径列表（优先查找真正的可执行文件，跳过 shim）
        let mut candidates: Vec<std::path::PathBuf> = Vec::new();

        // SCOOP 环境变量（优先查找 apps 目录下的真实路径）
        if let Ok(scoop_dir) = std::env::var("SCOOP") {
            debug_log(&format!("SCOOP env: {}", scoop_dir));
            let scoop_path = std::path::PathBuf::from(&scoop_dir);
            candidates.push(scoop_path.join("apps").join("pi-coding-agent").join("current").join("pi.exe"));
            candidates.push(scoop_path.join("apps").join("pi").join("current").join("pi.exe"));
        } else {
            debug_log("SCOOP env not set");
        }

        // 默认 scoop 路径（优先查找 apps 目录下的真实路径）
        candidates.push(home.join("scoop").join("apps").join("pi-coding-agent").join("current").join("pi.exe"));
        candidates.push(home.join("scoop").join("apps").join("pi").join("current").join("pi.exe"));

        // npm global
        candidates.push(home.join("AppData").join("Roaming").join("npm").join("pi.cmd"));
        candidates.push(home.join("AppData").join("Roaming").join("npm").join("pi.exe"));

        // 最后才尝试 shim（可能在 Tauri 打包后无法正常工作）
        if let Ok(scoop_dir) = std::env::var("SCOOP") {
            let scoop_path = std::path::PathBuf::from(&scoop_dir);
            candidates.push(scoop_path.join("shims").join("pi.exe"));
        }
        candidates.push(home.join("scoop").join("shims").join("pi.exe"));

        for path in &candidates {
            debug_log(&format!("checking: {:?} exists={}", path, path.exists()));
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    // 2. 尝试 where/which
    #[cfg(target_os = "windows")]
    {
        let mut where_cmd = Command::new("where");
        where_cmd.arg("pi");
        {
            use std::os::windows::process::CommandExt;
            where_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        if let Ok(output) = where_cmd.output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .map(|s| s.trim().to_string())
                    .filter(|p| !p.is_empty() && std::path::Path::new(p).exists());
                if path.is_some() {
                    return path;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("which").arg("pi").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .map(|s| s.trim().to_string())
                    .filter(|p| !p.is_empty() && std::path::Path::new(p).exists());
                if path.is_some() {
                    return path;
                }
            }
        }
    }

    None
}
