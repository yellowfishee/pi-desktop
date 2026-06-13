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
    let pi_candidates: &[&str] = if cfg!(target_os = "windows") {
        &["pi", "pi.cmd", "pi.exe"]
    } else {
        &["pi"]
    };

    let found_path = find_pi_path();

    for cmd in pi_candidates {
        let mut command = if let Some(ref p) = found_path {
            Command::new(p)
        } else {
            Command::new(cmd)
        };
        command.arg("--version");

        match command.output() {
            Ok(output) if output.status.success() => {
                result.pi_available = true;
                result.pi_version =
                    Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                result.pi_path = found_path.or_else(|| Some(cmd.to_string()));
                return;
            }
            _ => continue,
        }
    }
}

fn find_pi_path() -> Option<String> {
    let cmd = if cfg!(target_os = "windows") {
        Command::new("where").arg("pi").output()
    } else {
        Command::new("which").arg("pi").output()
    };

    cmd.ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string())
        })
        .filter(|p| !p.is_empty() && std::path::Path::new(p).exists())
}
