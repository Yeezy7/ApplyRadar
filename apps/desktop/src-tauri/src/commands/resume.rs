use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::Manager;
use tauri::State;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Resume {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub is_default: i32,
    pub full_name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
    pub hometown: Option<String>,
    pub political_status: Option<String>,
    pub target_position: Option<String>,
    pub target_city: Option<String>,
    pub expected_salary: Option<String>,
    pub job_type: Option<String>,
    pub education: Option<String>,
    pub work_experience: Option<String>,
    pub projects: Option<String>,
    pub skills: Option<String>,
    pub certifications: Option<String>,
    pub summary: Option<String>,
    pub pdf_file_path: Option<String>,
    pub raw_text: Option<String>,
    pub parsed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateResumeInput {
    pub name: String,
    pub is_default: Option<i32>,
    pub full_name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
    pub hometown: Option<String>,
    pub political_status: Option<String>,
    pub target_position: Option<String>,
    pub target_city: Option<String>,
    pub expected_salary: Option<String>,
    pub job_type: Option<String>,
    pub education: Option<String>,
    pub work_experience: Option<String>,
    pub projects: Option<String>,
    pub skills: Option<String>,
    pub certifications: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateResumeInput {
    pub name: Option<String>,
    pub is_default: Option<i32>,
    pub full_name: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub gender: Option<Option<String>>,
    pub birth_date: Option<Option<String>>,
    pub hometown: Option<Option<String>>,
    pub political_status: Option<Option<String>>,
    pub target_position: Option<Option<String>>,
    pub target_city: Option<Option<String>>,
    pub expected_salary: Option<Option<String>>,
    pub job_type: Option<Option<String>>,
    pub education: Option<Option<String>>,
    pub work_experience: Option<Option<String>>,
    pub projects: Option<Option<String>>,
    pub skills: Option<Option<String>>,
    pub certifications: Option<Option<String>>,
    pub summary: Option<Option<String>>,
}

#[command]
pub async fn create_resume(
    state: State<'_, AppState>,
    input: CreateResumeInput,
) -> Result<Resume, String> {
    if input.name.trim().is_empty() {
        return Err("简历名称不能为空".to_string());
    }

    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let is_default = input.is_default.unwrap_or(0);

    // If setting as default, unset other defaults
    if is_default == 1 {
        sqlx::query("UPDATE resumes SET is_default = 0")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO resumes (id, user_id, name, is_default, full_name, phone, email, gender, birth_date, hometown, political_status, target_position, target_city, expected_salary, job_type, education, work_experience, projects, skills, certifications, summary, created_at, updated_at) VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.name)
    .bind(is_default)
    .bind(&input.full_name)
    .bind(&input.phone)
    .bind(&input.email)
    .bind(&input.gender)
    .bind(&input.birth_date)
    .bind(&input.hometown)
    .bind(&input.political_status)
    .bind(&input.target_position)
    .bind(&input.target_city)
    .bind(&input.expected_salary)
    .bind(&input.job_type)
    .bind(&input.education)
    .bind(&input.work_experience)
    .bind(&input.projects)
    .bind(&input.skills)
    .bind(&input.certifications)
    .bind(&input.summary)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_resume_inner(pool, &id).await
}

#[command]
pub async fn list_resumes(
    state: State<'_, AppState>,
) -> Result<Vec<Resume>, String> {
    let pool = &state.db;
    let rows = sqlx::query_as::<_, Resume>(
        "SELECT * FROM resumes ORDER BY is_default DESC, updated_at DESC"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub async fn get_resume(
    state: State<'_, AppState>,
    id: String,
) -> Result<Resume, String> {
    let pool = &state.db;
    get_resume_inner(pool, &id).await
}

async fn get_resume_inner(pool: &SqlitePool, id: &str) -> Result<Resume, String> {
    sqlx::query_as::<_, Resume>("SELECT * FROM resumes WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "简历不存在".to_string())
}

#[command]
pub async fn update_resume(
    state: State<'_, AppState>,
    id: String,
    input: UpdateResumeInput,
) -> Result<Resume, String> {
    let pool = &state.db;

    // Check exists
    let existing = sqlx::query_as::<_, Resume>("SELECT * FROM resumes WHERE id = ?")
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "简历不存在".to_string())?;

    // If setting as default, unset other defaults
    if input.is_default == Some(1) {
        sqlx::query("UPDATE resumes SET is_default = 0 WHERE id != ?")
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let mut sets = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    // Handle name separately (it's Option<String>, not Option<Option<String>>)
    if let Some(name) = input.name {
        sets.push("name = ?".to_string());
        binds.push(name);
    }

    macro_rules! maybe_set {
        ($field:ident, $col:expr) => {
            if let Some(val) = input.$field {
                sets.push(format!("{} = ?", $col));
                binds.push(val.unwrap_or_default());
            }
        };
    }

    maybe_set!(full_name, "full_name");
    maybe_set!(phone, "phone");
    maybe_set!(email, "email");
    maybe_set!(gender, "gender");
    maybe_set!(birth_date, "birth_date");
    maybe_set!(hometown, "hometown");
    maybe_set!(political_status, "political_status");
    maybe_set!(target_position, "target_position");
    maybe_set!(target_city, "target_city");
    maybe_set!(expected_salary, "expected_salary");
    maybe_set!(job_type, "job_type");
    maybe_set!(education, "education");
    maybe_set!(work_experience, "work_experience");
    maybe_set!(projects, "projects");
    maybe_set!(skills, "skills");
    maybe_set!(certifications, "certifications");
    maybe_set!(summary, "summary");

    if input.is_default.is_some() {
        sets.push("is_default = ?".to_string());
        binds.push(input.is_default.unwrap_or(0).to_string());
    }

    if sets.is_empty() {
        return Ok(existing);
    }

    sets.push("updated_at = datetime('now')".to_string());
    binds.push(id.clone());

    let sql = format!("UPDATE resumes SET {} WHERE id = ?", sets.join(", "));

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query.execute(pool).await.map_err(|e| e.to_string())?;

    get_resume_inner(pool, &id).await
}

#[command]
pub async fn delete_resume(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let pool = &state.db;
    let result = sqlx::query("DELETE FROM resumes WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("简历不存在".to_string());
    }

    Ok(())
}

#[command]
pub async fn set_default_resume(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let pool = &state.db;

    let existing = sqlx::query_as::<_, Resume>("SELECT * FROM resumes WHERE id = ?")
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "简历不存在".to_string())?;

    let _ = existing;

    sqlx::query("UPDATE resumes SET is_default = 0")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE resumes SET is_default = 1, updated_at = datetime('now') WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn upload_resume_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let pool = &state.db;

    // Check exists
    let _existing = sqlx::query_as::<_, Resume>("SELECT * FROM resumes WHERE id = ?")
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "简历不存在".to_string())?;

    // Show file dialog
    let file_path = app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file()
        .ok_or_else(|| "未选择文件".to_string())?;

    let path_str = file_path.to_string();

    // Read file
    let pdf_bytes = std::fs::read(&path_str).map_err(|e| format!("读取文件失败: {}", e))?;

    // Save to app data dir
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resume_dir = data_dir.join("resumes").join(&id);
    std::fs::create_dir_all(&resume_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let file_name = std::path::Path::new(&path_str)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let dest_path = resume_dir.join(&file_name);
    std::fs::write(&dest_path, &pdf_bytes).map_err(|e| format!("保存文件失败: {}", e))?;

    let dest_str = dest_path.to_string_lossy().to_string();

    // Update resume
    sqlx::query("UPDATE resumes SET pdf_file_path = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&dest_str)
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(dest_str)
}

#[command]
pub async fn parse_resume_pdf(
    state: State<'_, AppState>,
    id: String,
) -> Result<Resume, String> {
    let pool = &state.db;

    let existing = sqlx::query_as::<_, Resume>("SELECT * FROM resumes WHERE id = ?")
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "简历不存在".to_string())?;

    let pdf_path = existing.pdf_file_path.ok_or_else(|| "请先上传 PDF 简历".to_string())?;

    // Read PDF and extract text
    let pdf_bytes = std::fs::read(&pdf_path).map_err(|e| format!("读取 PDF 失败: {}", e))?;

    // Use a simple text extraction approach
    // For a production app, you'd use a proper PDF library
    let raw_text = extract_pdf_text(&pdf_bytes)?;

    // Call AI to extract structured data
    let settings = sqlx::query_as::<_, (String, String, String)>(
        "SELECT api_key, api_base_url, model FROM settings LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (api_key, api_base_url, model) = settings.ok_or_else(|| "请先配置 AI API Key".to_string())?;

    if api_key.is_empty() {
        return Err("请先配置 AI API Key".to_string());
    }

    let prompt = format!(
        "你是一个简历解析助手。请从以下简历文本中提取结构化信息。\n\n返回 JSON 格式（不要包含其他文本，只返回 JSON）：\n{{\n  \"full_name\": \"姓名\",\n  \"phone\": \"手机号\",\n  \"email\": \"邮箱\",\n  \"gender\": \"性别\",\n  \"birth_date\": \"出生日期\",\n  \"hometown\": \"籍贯\",\n  \"target_position\": \"求职意向职位\",\n  \"target_city\": \"期望城市\",\n  \"expected_salary\": \"期望薪资\",\n  \"education\": [{{\"school\": \"学校名称\", \"degree\": \"学历\", \"major\": \"专业\", \"start_date\": \"YYYY-MM\", \"end_date\": \"YYYY-MM\", \"gpa\": \"GPA/排名\"}}],\n  \"work_experience\": [{{\"company\": \"公司名称\", \"title\": \"职位\", \"start_date\": \"YYYY-MM\", \"end_date\": \"YYYY-MM\", \"description\": \"工作描述\"}}],\n  \"projects\": [{{\"name\": \"项目名称\", \"role\": \"角色\", \"start_date\": \"YYYY-MM\", \"end_date\": \"YYYY-MM\", \"description\": \"项目描述\", \"tech_stack\": [\"技术1\"]}}],\n  \"skills\": [\"技能1\", \"技能2\"],\n  \"certifications\": [{{\"name\": \"证书名称\", \"date\": \"获取时间\", \"issuer\": \"颁发机构\"}}],\n  \"summary\": \"自我评价\"\n}}\n\n注意：日期格式统一为 YYYY-MM。如果字段信息不存在，设为 null。只返回 JSON。\n\n简历文本：\n{}",
        &raw_text[..raw_text.len().min(15000)]
    );

    let response = reqwest::Client::new()
        .post(format!("{}/chat/completions", api_base_url))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 3000,
        }))
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {}", e))?;

    let data: serde_json::Value = response.json().await.map_err(|e| format!("解析 AI 响应失败: {}", e))?;
    let reply = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("{}");

    // Parse JSON from reply
    let parsed: serde_json::Value = serde_json::from_str(
        reply.trim().trim_start_matches("```json").trim_end_matches("```").trim()
    ).unwrap_or(serde_json::Value::Null);

    let full_name = parsed["full_name"].as_str().map(|s| s.to_string());
    let phone = parsed["phone"].as_str().map(|s| s.to_string());
    let email = parsed["email"].as_str().map(|s| s.to_string());
    let gender = parsed["gender"].as_str().map(|s| s.to_string());
    let birth_date = parsed["birth_date"].as_str().map(|s| s.to_string());
    let hometown = parsed["hometown"].as_str().map(|s| s.to_string());
    let target_position = parsed["target_position"].as_str().map(|s| s.to_string());
    let target_city = parsed["target_city"].as_str().map(|s| s.to_string());
    let expected_salary = parsed["expected_salary"].as_str().map(|s| s.to_string());
    let education = parsed.get("education").map(|v| v.to_string());
    let work_experience = parsed.get("work_experience").map(|v| v.to_string());
    let projects = parsed.get("projects").map(|v| v.to_string());
    let skills = parsed.get("skills").map(|v| v.to_string());
    let certifications = parsed.get("certifications").map(|v| v.to_string());
    let summary = parsed["summary"].as_str().map(|s| s.to_string());

    sqlx::query(
        "UPDATE resumes SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email), gender = COALESCE(?, gender), birth_date = COALESCE(?, birth_date), hometown = COALESCE(?, hometown), target_position = COALESCE(?, target_position), target_city = COALESCE(?, target_city), expected_salary = COALESCE(?, expected_salary), education = COALESCE(?, education), work_experience = COALESCE(?, work_experience), projects = COALESCE(?, projects), skills = COALESCE(?, skills), certifications = COALESCE(?, certifications), summary = COALESCE(?, summary), raw_text = ?, parsed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .bind(&full_name)
    .bind(&phone)
    .bind(&email)
    .bind(&gender)
    .bind(&birth_date)
    .bind(&hometown)
    .bind(&target_position)
    .bind(&target_city)
    .bind(&expected_salary)
    .bind(&education)
    .bind(&work_experience)
    .bind(&projects)
    .bind(&skills)
    .bind(&certifications)
    .bind(&summary)
    .bind(&raw_text)
    .bind(&id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_resume_inner(pool, &id).await
}

#[command]
pub async fn get_default_resume(
    state: State<'_, AppState>,
) -> Result<Resume, String> {
    let pool = &state.db;

    let row = sqlx::query_as::<_, Resume>(
        "SELECT * FROM resumes WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some(r) => Ok(r),
        None => {
            // Fall back to most recent
            sqlx::query_as::<_, Resume>(
                "SELECT * FROM resumes ORDER BY updated_at DESC LIMIT 1"
            )
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "请先创建简历".to_string())
        }
    }
}

fn extract_pdf_text(pdf_bytes: &[u8]) -> Result<String, String> {
    // Simple text extraction from PDF
    // This is a basic implementation - look for text between stream markers
    let text = String::from_utf8_lossy(pdf_bytes);

    // Try to find readable text content
    let mut result = String::new();
    let mut in_text = false;
    let mut buffer = String::new();

    for line in text.lines() {
        if line.contains("BT") {
            in_text = true;
            buffer.clear();
        } else if line.contains("ET") {
            in_text = false;
            if !buffer.trim().is_empty() {
                result.push_str(&buffer);
                result.push('\n');
            }
            buffer.clear();
        } else if in_text {
            // Extract text from PDF text operators
            if let Some(start) = line.find('(') {
                if let Some(end) = line.rfind(')') {
                    if start < end {
                        let text_content = &line[start + 1..end];
                        buffer.push_str(text_content);
                    }
                }
            }
        }
    }

    // If no text found, return a message
    if result.trim().is_empty() {
        return Err("无法从 PDF 中提取文本，请手动填写简历信息".to_string());
    }

    Ok(result)
}
