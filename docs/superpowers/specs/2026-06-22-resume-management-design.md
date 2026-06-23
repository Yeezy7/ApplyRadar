# 简历管理 + 浏览器扩展自动填写 设计文档

## 1. 功能概述

为 ApplyRadar 新增「简历管理」模块，支持：
- 上传 PDF 简历 → AI 自动解析为结构化数据
- 手动编辑/补充简历信息
- 浏览器扩展在招聘网站自动填写表单

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    用户界面层                              │
├──────────────────┬──────────────────┬───────────────────┤
│   Web 端页面      │  桌面端页面       │   浏览器扩展       │
│  (React+TS)      │  (React+Tauri)   │   (Chrome MV3)    │
└────────┬─────────┴────────┬─────────┴────────┬──────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                    数据层                                │
├──────────────────┬──────────────────┬───────────────────┤
│   云端 API        │   本地 SQLite     │   Chrome Storage   │
│  (Hono+SQLite)   │  (sqlx)          │   (简历缓存)       │
└──────────────────┴──────────────────┴───────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    服务层                                │
├──────────────────┬──────────────────┬───────────────────┤
│   PDF 解析        │   AI 简历提取     │   表单识别         │
│  (pdf-parse)     │  (OpenAI API)    │  (DOM分析+AI)      │
└──────────────────┴──────────────────┴───────────────────┘
```

## 3. 数据模型

### 3.1 简历主表 resumes

```sql
CREATE TABLE resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,                    -- 简历名称，如 "2026校招简历"
  is_default INTEGER DEFAULT 0,         -- 是否为默认简历
  -- 基本信息
  full_name TEXT,
  phone TEXT,
  email TEXT,
  gender TEXT,
  birth_date TEXT,
  hometown TEXT,
  political_status TEXT,
  -- 求职意向
  target_position TEXT,
  target_city TEXT,
  expected_salary TEXT,
  job_type TEXT,                         -- full_time/intern/contract
  -- 教育经历（JSON 数组）
  education JSON,                        -- [{school, degree, major, start_date, end_date, gpa}]
  -- 工作经历（JSON 数组）
  work_experience JSON,                  -- [{company, title, start_date, end_date, description}]
  -- 项目经历（JSON 数组）
  projects JSON,                         -- [{name, role, start_date, end_date, description, tech_stack}]
  -- 技能
  skills JSON,                           -- ["JavaScript", "React", "Python"]
  -- 证书
  certifications JSON,                   -- [{name, date, issuer}]
  -- 自我评价
  summary TEXT,
  -- 元数据
  pdf_file_path TEXT,                    -- PDF 文件存储路径
  raw_text TEXT,                         -- PDF 解析的原始文本
  parsed_at TEXT,                        -- 解析时间
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.2 简历附件表 resume_attachments

```sql
CREATE TABLE resume_attachments (
  id TEXT PRIMARY KEY,
  resume_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'application/pdf',
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
);
```

### 3.3 表单模板表 form_templates

```sql
CREATE TABLE form_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,                  -- 网站域名，如 "zhipin.com"
  site_name TEXT,                        -- 网站名称
  -- 字段映射 JSON
  field_mappings JSON NOT NULL,          -- {resume_field: css_selector}
  -- 示例：
  -- {
  --   "full_name": "input[name='realname']",
  --   "phone": "input[name='mobile']",
  --   "email": "input[name='email']",
  --   "education[0].school": "select[name='school'] + input"
  -- }
  is_ai_generated INTEGER DEFAULT 0,     -- 是否由 AI 生成
  confidence REAL,                       -- AI 识别置信度
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 4. API 设计

### 4.1 简历 CRUD

```
GET    /api/resumes              -- 列表
GET    /api/resumes/:id          -- 详情
POST   /api/resumes              -- 创建
PUT    /api/resumes/:id          -- 更新
DELETE /api/resumes/:id          -- 删除
POST   /api/resumes/:id/set-default  -- 设为默认
```

### 4.2 PDF 上传与解析

```
POST   /api/resumes/:id/upload-pdf    -- 上传 PDF 附件
POST   /api/resumes/:id/parse         -- 触发 AI 解析
GET    /api/resumes/:id/parse-status  -- 查询解析状态
```

**解析流程：**
1. 用户上传 PDF → 后端存储文件
2. 后端用 `pdf-parse` 提取文本
3. 调用 AI API 提取结构化数据
4. 返回解析结果，用户确认/编辑后保存

### 4.3 表单模板

```
GET    /api/form-templates            -- 列表
POST   /api/form-templates            -- 创建/更新
DELETE /api/form-templates/:id        -- 删除
POST   /api/form-templates/recognize  -- AI 识别页面表单
```

### 4.4 扩展专用 API

```
GET    /api/extension/resume          -- 获取用户默认简历
POST   /api/extension/fill-form       -- 获取填写数据（按网站模板）
```

## 5. 浏览器扩展设计

### 5.1 核心流程

```
用户打开招聘网站
    │
    ▼
Content Script 注入
    │
    ▼
检测到表单页面？
    ├── 否 → 不做任何事
    │
    ▼ 是
查询本地缓存的表单模板
    │
    ├── 有模板 → 直接使用
    │
    ▼ 无模板
发送消息给 Background
    │
    ▼
Background 调用 AI 识别 API
    │
    ├── AI 可用 → AI 分析 DOM 生成模板
    │
    ▼ AI 不可用
降级到规则匹配
    │
    ▼
Content Script 显示填充按钮
    │
    ▼ 用户点击
按模板填充表单字段
```

### 5.2 表单识别（无 AI 降级）

**规则匹配策略：**

1. **input 属性匹配**
   ```javascript
   const FIELD_PATTERNS = {
     full_name: {
       selectors: ["input[name*='name']", "input[name*='姓名']"],
       labels: ["姓名", "名字", "真实姓名", "name"],
     },
     phone: {
       selectors: ["input[type='tel']", "input[name*='phone']", "input[name*='mobile']"],
       labels: ["手机", "电话", "phone", "mobile"],
     },
     email: {
       selectors: ["input[type='email']", "input[name*='email']"],
       labels: ["邮箱", "邮件", "email"],
     },
     // ... 更多字段
   };
   ```

2. **label 文本匹配**
   - 查找 input 的 `<label>` 关联
   - 查找相邻文本节点
   - 查找 placeholder 属性

3. **表单结构分析**
   - 识别表单分组（基本信息、教育经历等）
   - 识别重复结构（多段工作经历）

### 5.3 扩展弹窗 UI

```
┌─────────────────────────────────┐
│  ApplyRadar 填写助手             │
├─────────────────────────────────┤
│  检测到表单：个人信息              │
│  匹配简历：2026校招简历           │
│                                 │
│  ☑ 姓名        张三              │
│  ☑ 手机        138xxxx          │
│  ☑ 邮箱        zhangsan@xx.com  │
│  ☐ 身份证号    （未匹配）          │
│                                 │
│  [全选]  [填写选中字段]           │
└─────────────────────────────────┘
```

## 6. AI 解析 Prompt 设计

### 6.1 PDF 简历解析 Prompt

```
你是一个简历解析助手。请从以下简历文本中提取结构化信息。

返回 JSON 格式：
{
  "full_name": "姓名",
  "phone": "手机号",
  "email": "邮箱",
  "gender": "性别",
  "birth_date": "出生日期",
  "education": [
    {
      "school": "学校名称",
      "degree": "学历",
      "major": "专业",
      "start_date": "开始时间",
      "end_date": "结束时间",
      "gpa": "GPA/排名"
    }
  ],
  "work_experience": [...],
  "projects": [...],
  "skills": ["技能1", "技能2"],
  "certifications": [...],
  "summary": "自我评价"
}

注意：
- 日期格式统一为 YYYY-MM 或 YYYY.MM
- 如果字段信息不存在，设为 null
- 技能提取具体的技术栈，不要泛泛而谈
```

### 6.2 表单识别 Prompt

```
分析以下网页 DOM 结构，识别表单字段并匹配简历数据。

返回 JSON 格式：
{
  "form_type": "个人信息/教育经历/工作经历",
  "fields": [
    {
      "selector": "CSS 选择器",
      "label": "字段标签",
      "type": "text/select/radio/checkbox",
      "resume_field": "对应的简历字段",
      "confidence": 0.95
    }
  ]
}

简历可用字段：
{resume_fields_json}
```

## 7. 实现步骤

### Phase 1: 简历管理页面（Web + 桌面端）
1. 后端：简历 CRUD API + PDF 上传接口
2. 后端：PDF 解析服务（pdf-parse）
3. 后端：AI 简历提取服务
4. Web 端：简历管理页面组件
5. 桌面端：简历管理页面组件
6. 数据库：创建简历相关表

### Phase 2: 浏览器扩展增强
1. 扩展：从云端/本地获取简历数据
2. 扩展：表单检测与识别（规则匹配）
3. 扩展：AI 表单识别（可选）
4. 扩展：表单填充逻辑
5. 扩展：填充确认弹窗 UI

### Phase 3: 数据同步
1. 桌面端本地简历 → 云端同步
2. 扩展从云端获取最新简历

## 8. 文件结构

```
server/src/routes/
  ├── resume.ts           -- 简历 CRUD API
  ├── resume-parse.ts     -- PDF 解析 API
  └── form-template.ts    -- 表单模板 API

apps/web/src/pages/
  └── ResumePage.tsx      -- 简历管理页面

apps/desktop/src/pages/
  └── ResumePage.tsx      -- 简历管理页面

apps/extension/
  ├── background/
  │   └── service-worker.js  -- 增加 AI 识别逻辑
  ├── content/
  │   ├── content.js         -- 增加表单检测与填充
  │   ├── form-detector.js   -- 表单识别模块
  │   └── form-filler.js     -- 表单填充模块
  └── lib/
      └── resume.js          -- 简历数据获取
```

## 9. 桌面端实现细节

### 9.1 文件上传（Tauri）

桌面端使用 Tauri Dialog Plugin 选择文件，然后读取文件内容上传：

```rust
// apps/desktop/src-tauri/src/commands/resume.rs

#[tauri::command]
pub async fn upload_resume_pdf(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppState>,
    resume_id: String,
) -> Result<String, String> {
    // 1. 使用 dialog 选择文件
    let file_path = dialog::blocking::FileDialogBuilder::new()
        .add_filter("PDF", &["pdf"])
        .pick_file()
        .ok_or("未选择文件")?;

    // 2. 读取文件内容
    let pdf_bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;

    // 3. 保存到应用数据目录
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resume_dir = data_dir.join("resumes").join(&resume_id);
    std::fs::create_dir_all(&resume_dir).map_err(|e| e.to_string())?;

    let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();
    let dest_path = resume_dir.join(&file_name);
    std::fs::write(&dest_path, &pdf_bytes).map_err(|e| e.to_string())?;

    // 4. 保存附件记录到数据库
    let attachment_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO resume_attachments (id, resume_id, file_name, file_path, file_size, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&attachment_id)
    .bind(&resume_id)
    .bind(&file_name)
    .bind(dest_path.to_string_lossy().to_string())
    .bind(pdf_bytes.len() as i64)
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&*db.db)
    .await
    .map_err(|e| e.to_string())?;

    // 5. 更新简历的 pdf_file_path
    sqlx::query("UPDATE resumes SET pdf_file_path = ?, updated_at = ? WHERE id = ?")
        .bind(dest_path.to_string_lossy().to_string())
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&resume_id)
        .execute(&*db.db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(attachment_id)
}
```

### 9.2 数据同步策略

```
桌面端本地优先同步：
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  本地 SQLite  │ ──→ │  云端 API     │ ──→ │  Web 端      │
│  (写入优先)   │ ←── │  (同步中心)   │ ←── │  (读取)      │
└──────────────┘     └──────────────┘     └──────────────┘

同步时机：
1. 简历保存后立即尝试同步（后台）
2. 应用启动时拉取云端最新数据
3. 扩展请求时从云端获取

冲突解决：
- 以 updated_at 较新的版本为准
- 同一设备的修改优先级更高
```

### 9.3 Tauri Commands 新增

```rust
// 简历相关 commands
resume::create_resume
resume::list_resumes
resume::get_resume
resume::update_resume
resume::delete_resume
resume::set_default_resume
resume::upload_resume_pdf
resume::parse_resume_pdf        // 调用 AI 解析
resume::get_resume_for_extension // 扩展专用接口
```

## 10. 关键类型定义

```typescript
// packages/shared/src/types.ts 新增

export interface Resume {
  id: string;
  user_id: string;
  name: string;
  is_default: number;
  full_name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  birth_date?: string;
  hometown?: string;
  target_position?: string;
  target_city?: string;
  expected_salary?: string;
  job_type?: string;
  education?: EducationEntry[];
  work_experience?: WorkExperienceEntry[];
  projects?: ProjectEntry[];
  skills?: string[];
  certifications?: CertificationEntry[];
  summary?: string;
  pdf_file_path?: string;
  raw_text?: string;
  parsed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EducationEntry {
  school: string;
  degree: string;
  major: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
}

export interface WorkExperienceEntry {
  company: string;
  title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface ProjectEntry {
  name: string;
  role?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  tech_stack?: string[];
}

export interface CertificationEntry {
  name: string;
  date?: string;
  issuer?: string;
}

export interface FormTemplate {
  id: string;
  user_id: string;
  domain: string;
  site_name?: string;
  field_mappings: Record<string, string>;
  is_ai_generated: number;
  confidence?: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}
```
