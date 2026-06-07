use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCheckRequest {
    pub command: String,
    pub target_id: Option<String>,
    pub status_url: Option<String>,
    pub profile_dir: Option<String>,
    pub domain: Option<String>,
    pub url: Option<String>,
    pub targets: Option<Vec<BatchTarget>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTarget {
    pub target_id: String,
    pub status_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarCheckResponse {
    pub success: bool,
    pub target_id: Option<String>,
    pub login_state: Option<String>,
    pub page_text: Option<String>,
    pub text_hash: Option<String>,
    pub page_title: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCheckResponse {
    pub results: Vec<SidecarCheckResponse>,
}

fn get_sidecar_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Get app data dir for storing the sidecar
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_default();

    // Also try to find the project root by looking for pnpm-workspace.yaml
    let mut project_root = std::env::current_dir().unwrap_or_default();
    loop {
        if project_root.join("pnpm-workspace.yaml").exists() {
            break;
        }
        if !project_root.pop() {
            project_root = std::env::current_dir().unwrap_or_default();
            break;
        }
    }

    let candidates = vec![
        // Absolute path from project root
        project_root.join("packages/automation/dist/sidecar.mjs"),
        // Development: relative to src-tauri (going up to project root)
        PathBuf::from("../../../packages/automation/dist/sidecar.mjs"),
        // Development: relative to apps/desktop
        PathBuf::from("../../packages/automation/dist/sidecar.mjs"),
        // Development: relative to project root
        PathBuf::from("packages/automation/dist/sidecar.mjs"),
        // App data directory (for production)
        app_data_dir.join("sidecar.mjs"),
        // Resource directory (for bundled app)
        app_handle
            .path()
            .resource_dir()
            .unwrap_or_default()
            .join("sidecar.mjs"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Sidecar script not found. Searched: {:?}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
    ))
}

fn resolve_profile_dir(app_handle: &tauri::AppHandle, profile_dir: &str) -> Result<String, String> {
    let path = PathBuf::from(profile_dir);
    if path.is_absolute() {
        return Ok(profile_dir.to_string());
    }

    // Resolve relative to app data directory
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let resolved = app_data_dir.join(profile_dir);
    // Create the directory if it doesn't exist
    std::fs::create_dir_all(&resolved)
        .map_err(|e| format!("Failed to create profile dir {:?}: {}", resolved, e))?;

    Ok(resolved.to_string_lossy().to_string())
}

#[command]
pub async fn get_app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(dir.to_string_lossy().to_string())
}

#[command]
pub async fn run_sidecar_check(
    app_handle: tauri::AppHandle,
    target_id: String,
    status_url: String,
    profile_dir: String,
) -> Result<SidecarCheckResponse, String> {
    let sidecar_path = get_sidecar_path(&app_handle)?;
    let resolved_profile_dir = resolve_profile_dir(&app_handle, &profile_dir)?;

    eprintln!("[rust] Running sidecar check");
    eprintln!("[rust] Sidecar path: {}", sidecar_path.display());
    eprintln!("[rust] Profile dir: {}", resolved_profile_dir);
    eprintln!("[rust] Status URL: {}", status_url);

    let mut child = Command::new("node")
        .arg(sidecar_path.to_string_lossy().to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let request = SidecarCheckRequest {
        command: "check".to_string(),
        target_id: Some(target_id),
        status_url: Some(status_url),
        profile_dir: Some(resolved_profile_dir),
        domain: None,
        url: None,
        targets: None,
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    eprintln!("[rust] Sending request: {}", request_json);

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(format!("{}\n", request_json).as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close stdin: {}", e))?;
    }

    // Read stderr in background (don't wait for it)
    let stderr = child.stderr.take();
    tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                eprint!("{}", line);
                line.clear();
            }
        }
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Failed to read stdout: {}", e))?;

    eprintln!("[rust] Received response: {}", line.trim());

    let response: SidecarCheckResponse = serde_json::from_str(&line.trim())
        .map_err(|e| format!("Failed to parse sidecar response: {}. Raw: {}", e, line))?;

    // Kill the sidecar process after getting the response
    let _ = child.kill().await;

    Ok(response)
}

#[command]
pub async fn run_sidecar_open_login(
    app_handle: tauri::AppHandle,
    status_url: String,
    profile_dir: String,
) -> Result<SidecarCheckResponse, String> {
    let sidecar_path = get_sidecar_path(&app_handle)?;
    let resolved_profile_dir = resolve_profile_dir(&app_handle, &profile_dir)?;

    // Debug: log the URL being opened
    eprintln!("[sidecar] Opening login for URL: {}", status_url);
    eprintln!("[sidecar] Profile dir: {}", resolved_profile_dir);
    eprintln!("[sidecar] Sidecar path: {}", sidecar_path.display());

    let mut child = Command::new("node")
        .arg(sidecar_path.to_string_lossy().to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let request = SidecarCheckRequest {
        command: "open_login".to_string(),
        target_id: None,
        status_url: Some(status_url),
        profile_dir: Some(resolved_profile_dir),
        domain: None,
        url: None,
        targets: None,
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(format!("{}\n", request_json).as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close stdin: {}", e))?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Failed to read stdout: {}", e))?;

    let response: SidecarCheckResponse = serde_json::from_str(&line.trim())
        .map_err(|e| format!("Failed to parse sidecar response: {}. Raw: {}", e, line))?;

    Ok(response)
}

#[command]
pub async fn run_sidecar_batch_check(
    app_handle: tauri::AppHandle,
    domain: String,
    profile_dir: String,
    targets: Vec<BatchTarget>,
) -> Result<BatchCheckResponse, String> {
    let sidecar_path = get_sidecar_path(&app_handle)?;
    let resolved_profile_dir = resolve_profile_dir(&app_handle, &profile_dir)?;

    eprintln!("[rust] Running batch check for domain: {}", domain);
    eprintln!("[rust] Targets count: {}", targets.len());

    let mut child = Command::new("node")
        .arg(sidecar_path.to_string_lossy().to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let request = SidecarCheckRequest {
        command: "batch_check".to_string(),
        target_id: None,
        status_url: None,
        profile_dir: Some(resolved_profile_dir),
        domain: Some(domain),
        url: None,
        targets: Some(targets),
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    eprintln!("[rust] Sending batch request: {}", request_json);

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(format!("{}\n", request_json).as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close stdin: {}", e))?;
    }

    // Read stderr in background
    let stderr = child.stderr.take();
    tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                eprint!("{}", line);
                line.clear();
            }
        }
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Failed to read stdout: {}", e))?;

    eprintln!("[rust] Received batch response");

    let response: BatchCheckResponse = serde_json::from_str(&line.trim())
        .map_err(|e| format!("Failed to parse batch response: {}. Raw: {}", e, line))?;

    let _ = child.kill().await;

    Ok(response)
}

#[command]
pub async fn run_sidecar_fetch_page(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<SidecarCheckResponse, String> {
    let sidecar_path = get_sidecar_path(&app_handle)?;

    eprintln!("[rust] Fetching page via sidecar: {}", url);

    let mut child = Command::new("node")
        .arg(sidecar_path.to_string_lossy().to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let request = SidecarCheckRequest {
        command: "fetch_page".to_string(),
        target_id: None,
        status_url: None,
        profile_dir: None,
        domain: None,
        url: Some(url),
        targets: None,
    };

    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(format!("{}\n", request_json).as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close stdin: {}", e))?;
    }

    let stderr = child.stderr.take();
    tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                eprint!("{}", line);
                line.clear();
            }
        }
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("Failed to read stdout: {}", e))?;

    let response: SidecarCheckResponse = serde_json::from_str(&line.trim())
        .map_err(|e| format!("Failed to parse sidecar response: {}. Raw: {}", e, line))?;

    let _ = child.kill().await;

    Ok(response)
}
