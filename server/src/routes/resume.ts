import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { validateBody, isPrivateUrl } from '../validate.js';
import { z } from 'zod';

const educationSchema = z.object({
  school: z.string().min(1).max(200),
  degree: z.string().max(100).optional(),
  major: z.string().max(200).optional(),
  start_date: z.string().max(20).optional(),
  end_date: z.string().max(20).optional(),
  gpa: z.string().max(50).optional(),
});

const workExperienceSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  start_date: z.string().max(20).optional(),
  end_date: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
});

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().max(100).optional(),
  start_date: z.string().max(20).optional(),
  end_date: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
  tech_stack: z.array(z.string()).optional(),
});

const certificationSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().max(20).optional(),
  issuer: z.string().max(200).optional(),
});

const resumeSchema = z.object({
  name: z.string().min(1).max(100),
  is_default: z.number().optional(),
  full_name: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().max(200).optional(),
  gender: z.string().max(10).optional(),
  birth_date: z.string().max(20).optional(),
  hometown: z.string().max(100).optional(),
  political_status: z.string().max(50).optional(),
  target_position: z.string().max(200).optional(),
  target_city: z.string().max(100).optional(),
  expected_salary: z.string().max(100).optional(),
  job_type: z.string().max(20).optional(),
  education: z.array(educationSchema).optional(),
  work_experience: z.array(workExperienceSchema).optional(),
  projects: z.array(projectSchema).optional(),
  skills: z.array(z.string()).optional(),
  certifications: z.array(certificationSchema).optional(),
  summary: z.string().max(5000).optional(),
});

function jsonOrNull(v: any): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

function parseJsonArray(v: any): any[] | undefined {
  if (!v) return undefined;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function serializeResume(row: any) {
  return {
    ...row,
    education: parseJsonArray(row.education),
    work_experience: parseJsonArray(row.work_experience),
    projects: parseJsonArray(row.projects),
    skills: parseJsonArray(row.skills),
    certifications: parseJsonArray(row.certifications),
  };
}

const app = new Hono<AppEnv>();

// List resumes
app.get('/', (c) => {
  const userId = c.get('userId');
  const rows = db.prepare(
    'SELECT * FROM resumes WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC'
  ).all(userId) as any[];
  return c.json({ code: 0, data: rows.map(serializeResume) });
});

// Get single resume
app.get('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const row = db.prepare(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as any | undefined;

  if (!row) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  return c.json({ code: 0, data: serializeResume(row) });
});

// Create resume
app.post('/', validateBody(resumeSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.get('validatedBody') as any;

  const id = generateId();
  const now = new Date().toISOString();

  // If setting as default, unset other defaults
  if (body.is_default) {
    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(userId);
  }

  const resume = {
    id,
    user_id: userId,
    name: body.name,
    is_default: body.is_default || 0,
    full_name: body.full_name || null,
    phone: body.phone || null,
    email: body.email || null,
    gender: body.gender || null,
    birth_date: body.birth_date || null,
    hometown: body.hometown || null,
    political_status: body.political_status || null,
    target_position: body.target_position || null,
    target_city: body.target_city || null,
    expected_salary: body.expected_salary || null,
    job_type: body.job_type || null,
    education: jsonOrNull(body.education),
    work_experience: jsonOrNull(body.work_experience),
    projects: jsonOrNull(body.projects),
    skills: jsonOrNull(body.skills),
    certifications: jsonOrNull(body.certifications),
    summary: body.summary || null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO resumes (id, user_id, name, is_default, full_name, phone, email, gender, birth_date, hometown, political_status, target_position, target_city, expected_salary, job_type, education, work_experience, projects, skills, certifications, summary, created_at, updated_at)
     VALUES (@id, @user_id, @name, @is_default, @full_name, @phone, @email, @gender, @birth_date, @hometown, @political_status, @target_position, @target_city, @expected_salary, @job_type, @education, @work_experience, @projects, @skills, @certifications, @summary, @created_at, @updated_at)`
  ).run(resume);

  return c.json({ code: 0, data: serializeResume(resume) }, 201);
});

// Update resume
app.put('/:id', validateBody(resumeSchema.partial()), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.get('validatedBody') as any;

  const existing = db.prepare(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as any;
  if (!existing) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  // If setting as default, unset other defaults
  if (body.is_default) {
    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ? AND id != ?').run(userId, id);
  }

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = [
    'name', 'is_default', 'full_name', 'phone', 'email', 'gender',
    'birth_date', 'hometown', 'political_status', 'target_position',
    'target_city', 'expected_salary', 'job_type', 'summary',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  // Handle JSON fields
  const jsonFields = ['education', 'work_experience', 'projects', 'skills', 'certifications'];
  for (const field of jsonFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(jsonOrNull(body[field]));
    }
  }

  if (fields.length === 0) {
    return c.json({ code: 400, msg: '没有要更新的字段' }, 400);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id, userId);

  db.prepare(
    `UPDATE resumes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...params);

  const updated = db.prepare('SELECT * FROM resumes WHERE id = ?').get(id);
  return c.json({ code: 0, data: serializeResume(updated) });
});

// Delete resume
app.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已删除' });
});

// Set default resume
app.post('/:id/set-default', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = db.prepare(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ?'
  ).get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE resumes SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(id, userId);

  return c.json({ code: 0, msg: '已设为默认' });
});

// Upload PDF for resume
app.post('/:id/upload-pdf', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = db.prepare(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as any;
  if (!existing) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ code: 400, msg: '未选择文件' }, 400);
    }

    if (file.type !== 'application/pdf') {
      return c.json({ code: 400, msg: '只支持 PDF 文件' }, 400);
    }

    // Save to uploads directory
    const uploadDir = `./data/resumes/${id}`;
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(uploadDir, { recursive: true });

    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${uploadDir}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);

    // Create attachment record
    const attachmentId = generateId();
    db.prepare(
      'INSERT INTO resume_attachments (id, resume_id, file_name, file_path, file_size, mime_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run(attachmentId, id, file.name, filePath, buffer.length, file.type);

    // Update resume pdf_file_path
    db.prepare(
      'UPDATE resumes SET pdf_file_path = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(filePath, id);

    return c.json({ code: 0, data: { id: attachmentId, file_name: file.name, file_path: filePath } });
  } catch (e: any) {
    return c.json({ code: 500, msg: `上传失败: ${e.message}` }, 500);
  }
});

// Parse resume PDF with AI
app.post('/:id/parse', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = db.prepare(
    'SELECT * FROM resumes WHERE id = ? AND user_id = ?'
  ).get(id, userId) as any;
  if (!existing) {
    return c.json({ code: 404, msg: '简历不存在' }, 404);
  }

  // Check if PDF exists
  if (!existing.pdf_file_path) {
    return c.json({ code: 400, msg: '请先上传 PDF 简历' }, 400);
  }

  // Get user AI settings
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
  if (!settings || !settings.api_key) {
    return c.json({ code: 400, msg: '请先配置 AI API Key' }, 400);
  }

  try {
    // Read and parse PDF
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const { readFileSync } = await import('fs');
    const pdfBuffer = readFileSync(existing.pdf_file_path);
    const pdfData = await (pdfParse as any)(pdfBuffer);
    const rawText = pdfData.text;

    // Call AI to extract structured data
    const baseUrl = settings.api_base_url || 'https://api.openai.com/v1';
    const model = settings.model || 'gpt-4o-mini';

    if (isPrivateUrl(baseUrl)) {
      return c.json({ code: 400, msg: '不允许访问内网地址' }, 400);
    }

    const prompt = `你是一个简历解析助手。请从以下简历文本中提取结构化信息。

返回 JSON 格式（不要包含其他文本，只返回 JSON）：
{
  "full_name": "姓名",
  "phone": "手机号",
  "email": "邮箱",
  "gender": "性别",
  "birth_date": "出生日期",
  "hometown": "籍贯",
  "target_position": "求职意向职位",
  "target_city": "期望城市",
  "expected_salary": "期望薪资",
  "education": [
    {
      "school": "学校名称",
      "degree": "学历",
      "major": "专业",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "gpa": "GPA/排名"
    }
  ],
  "work_experience": [
    {
      "company": "公司名称",
      "title": "职位",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "description": "工作描述"
    }
  ],
  "projects": [
    {
      "name": "项目名称",
      "role": "角色",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "description": "项目描述",
      "tech_stack": ["技术1", "技术2"]
    }
  ],
  "skills": ["技能1", "技能2"],
  "certifications": [
    {
      "name": "证书名称",
      "date": "获取时间",
      "issuer": "颁发机构"
    }
  ],
  "summary": "自我评价"
}

注意：
- 日期格式统一为 YYYY-MM 或 YYYY.MM
- 如果字段信息不存在，设为 null
- 技能提取具体的技术栈，不要泛泛而谈
- 只返回 JSON，不要其他文字

简历文本：
${rawText.slice(0, 15000)}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ code: 400, msg: `AI 解析失败: ${response.status} ${error}` }, 400);
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || '{}';

    // Parse JSON from reply
    let parsed: any;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = {};
    }

    // Update resume with parsed data
    db.prepare(
      `UPDATE resumes SET
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        gender = COALESCE(?, gender),
        birth_date = COALESCE(?, birth_date),
        hometown = COALESCE(?, hometown),
        target_position = COALESCE(?, target_position),
        target_city = COALESCE(?, target_city),
        expected_salary = COALESCE(?, expected_salary),
        education = COALESCE(?, education),
        work_experience = COALESCE(?, work_experience),
        projects = COALESCE(?, projects),
        skills = COALESCE(?, skills),
        certifications = COALESCE(?, certifications),
        summary = COALESCE(?, summary),
        raw_text = ?,
        parsed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(
      parsed.full_name || null,
      parsed.phone || null,
      parsed.email || null,
      parsed.gender || null,
      parsed.birth_date || null,
      parsed.hometown || null,
      parsed.target_position || null,
      parsed.target_city || null,
      parsed.expected_salary || null,
      jsonOrNull(parsed.education),
      jsonOrNull(parsed.work_experience),
      jsonOrNull(parsed.projects),
      jsonOrNull(parsed.skills),
      jsonOrNull(parsed.certifications),
      parsed.summary || null,
      rawText,
      id,
    );

    const updated = db.prepare('SELECT * FROM resumes WHERE id = ?').get(id);
    return c.json({ code: 0, data: serializeResume(updated) });
  } catch (e: any) {
    return c.json({ code: 500, msg: `解析失败: ${e.message}` }, 500);
  }
});

// Get resume for extension (default resume)
app.get('/extension/default', (c) => {
  const userId = c.get('userId');
  const row = db.prepare(
    'SELECT * FROM resumes WHERE user_id = ? AND is_default = 1 ORDER BY updated_at DESC LIMIT 1'
  ).get(userId) as any;

  if (!row) {
    // Fall back to most recent
    const fallback = db.prepare(
      'SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(userId) as any;

    if (!fallback) {
      return c.json({ code: 404, msg: '请先创建简历' }, 404);
    }
    return c.json({ code: 0, data: serializeResume(fallback) });
  }

  return c.json({ code: 0, data: serializeResume(row) });
});

export default app;
