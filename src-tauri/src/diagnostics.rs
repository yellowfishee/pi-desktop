//! pi 进程诊断数据

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PiDiagnostics {
    pub running: bool,
    pub pid: Option<u32>,
    pub start_time: Option<DateTime<Utc>>,
    pub uptime_secs: Option<u64>,
    pub heartbeat_count: u64,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub crash_count: u64,
    pub last_crash_time: Option<DateTime<Utc>>,
    pub last_crash_error: Option<String>,
}

impl Default for PiDiagnostics {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            start_time: None,
            uptime_secs: None,
            heartbeat_count: 0,
            last_heartbeat: None,
            crash_count: 0,
            last_crash_time: None,
            last_crash_error: None,
        }
    }
}
