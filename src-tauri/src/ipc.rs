//! The Rust side of the renderer contract in `src/shared/api.ts`. Command
//! names and the error shape are pinned by `src/shared/contract/ipc-commands.json`,
//! which the TS adapter tests read too; the commands themselves arrive with
//! TASK-009 onwards.

use serde::{Deserialize, Serialize};

/// Codes a command may reject with; mirrors `BACKEND_ERROR_CODES`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Stale,
    Invalid,
    Io,
}

/// A command rejection; the renderer reads it as `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IpcError {
    pub code: ErrorCode,
    pub message: String,
}

impl IpcError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

/// Every command with its Rust parameter names, in contract order.
pub const COMMANDS: &[(&str, &[&str])] = &[
    ("workspace_load", &[]),
    ("workspace_save", &["workspace"]),
    ("import_pick", &[]),
    ("import_path", &["path"]),
    ("import_url", &["url"]),
    ("import_cancel", &[]),
    ("request_send", &["input"]),
    ("secret_reveal", &["variable_id"]),
    ("preferences_load", &[]),
    ("preferences_save", &["values"]),
];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const CONTRACT: &str = include_str!("../../src/shared/contract/ipc-commands.json");

    fn contract() -> Value {
        serde_json::from_str(CONTRACT).expect("contract fixture is valid JSON")
    }

    /// Tauri turns a camelCase key into the snake_case parameter it is matched to.
    fn snake_case(key: &str) -> String {
        let mut out = String::new();
        for ch in key.chars() {
            if ch.is_ascii_uppercase() {
                out.push('_');
                out.push(ch.to_ascii_lowercase());
            } else {
                out.push(ch);
            }
        }
        out
    }

    #[test]
    fn commands_match_the_contract() {
        let fixture = contract();
        let entries = fixture["commands"].as_object().expect("commands object");
        assert_eq!(entries.len(), COMMANDS.len());
        for entry in entries.values() {
            let name = entry["name"].as_str().expect("command name");
            let (_, params) = COMMANDS
                .iter()
                .find(|(command, _)| *command == name)
                .unwrap_or_else(|| panic!("{name} is missing from COMMANDS"));
            let args = entry["args"].as_array().expect("args array");
            let rust: Vec<&str> = args.iter().map(|arg| arg["rust"].as_str().unwrap()).collect();
            assert_eq!(rust, *params, "parameters of {name}");
            for arg in args {
                assert_eq!(snake_case(arg["js"].as_str().unwrap()), arg["rust"], "argument of {name}");
            }
        }
    }

    #[test]
    fn error_codes_match_the_contract() {
        let codes: Vec<ErrorCode> = serde_json::from_value(contract()["errorCodes"].clone()).unwrap();
        assert_eq!(codes, [ErrorCode::Stale, ErrorCode::Invalid, ErrorCode::Io]);
    }

    #[test]
    fn errors_round_trip_as_the_renderer_reads_them() {
        let sample = contract()["errorSample"].clone();
        let error: IpcError = serde_json::from_value(sample.clone()).unwrap();
        assert_eq!(error, IpcError::new(ErrorCode::Stale, "The workspace changed since it was loaded."));
        assert_eq!(serde_json::to_value(&error).unwrap(), sample);
    }
}
