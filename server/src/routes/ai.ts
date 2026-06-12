import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';

const app = new Hono<AppEnv>();

// Test AI connection
app.post('/test-connection', async (c) => {
  const userId = c.get('userId');

  // Get user settings
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings || !settings.api_key) {
    return c.json({ code: 400, msg: '请先配置 API Key' }, 400);
  }

  try {
    const baseUrl = settings.api_base_url || 'https://api.openai.com/v1';
    const model = settings.model || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ code: 400, msg: `API 连接失败: ${response.status} ${error}` }, 400);
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || '';

    return c.json({
      code: 0,
      data: {
        success: true,
        message: `连接成功！模型: ${model}`,
        model,
        reply,
      },
    });
  } catch (e: any) {
    return c.json({ code: 400, msg: `连接失败: ${e.message}` }, 400);
  }
});

// Parse job description with AI
app.post('/parse-jd', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings || !settings.api_key) {
    return c.json({ code: 400, msg: '请先配置 API Key' }, 400);
  }

  try {
    const baseUrl = settings.api_base_url || 'https://api.openai.com/v1';
    const model = settings.model || 'gpt-4o-mini';

    const prompt = `请从以下职位描述中提取信息，返回 JSON 格式：
{
  "company_name": "公司名称",
  "job_title": "职位名称",
  "location": "工作地点",
  "salary_range": "薪资范围",
  "requirements": "主要要求"
}

职位描述：
${body.text}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ code: 400, msg: `AI 解析失败: ${response.status}` }, 400);
    }

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || '{}';

    // Try to parse JSON from reply
    let parsed;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = {};
    }

    return c.json({
      code: 0,
      data: parsed,
    });
  } catch (e: any) {
    return c.json({ code: 400, msg: `AI 解析失败: ${e.message}` }, 400);
  }
});

export default app;
