const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const SETTINGS_COLLECTION = 'user_settings';

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, data } = event;

  switch (action) {
    case 'getSettings':
      return handleGetSettings(OPENID);
    case 'saveSettings':
      return handleSaveSettings(OPENID, data);
    case 'getStats':
      return handleGetStats(OPENID);
    default:
      return { code: -1, msg: `未知操作: ${action}` };
  }
};

async function handleGetSettings(openid) {
  const col = db.collection(SETTINGS_COLLECTION);
  const res = await col.where({ _openid: openid }).get();

  if (res.data.length === 0) {
    // Return default settings
    return {
      code: 0,
      data: {
        apiKey: '',
        apiBaseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        checkFrequency: 'daily',
        notificationsEnabled: true,
      },
    };
  }

  return { code: 0, data: res.data[0] };
}

async function handleSaveSettings(openid, data) {
  const col = db.collection(SETTINGS_COLLECTION);
  const existing = await col.where({ _openid: openid }).get();

  const settings = {
    _openid: openid,
    apiKey: data.apiKey || '',
    apiBaseUrl: data.apiBaseUrl || 'https://api.openai.com/v1',
    model: data.model || 'gpt-4o-mini',
    checkFrequency: data.checkFrequency || 'daily',
    notificationsEnabled: data.notificationsEnabled !== false,
    updated_at: new Date().toISOString(),
  };

  if (existing.data.length > 0) {
    await col.doc(existing.data[0]._id).update({ data: settings });
  } else {
    settings.created_at = new Date().toISOString();
    await col.add({ data: settings });
  }

  return { code: 0, msg: '设置已保存' };
}

async function handleGetStats(openid) {
  // Get counts from all collections
  const [appsRes, remindersRes] = await Promise.all([
    db.collection('applications').where({ _openid: openid }).count(),
    db.collection('reminders').where({ _openid: openid, is_done: false }).count(),
  ]);

  // Get application status breakdown
  const apps = await db.collection('applications')
    .where({ _openid: openid })
    .field({ status: true, created_at: true, updated_at: true })
    .orderBy('updated_at', 'desc')
    .limit(200)
    .get();

  const statusCounts = {};
  let activeCount = 0;
  let thisWeekCount = 0;
  let offerCount = 0;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const activeStatuses = ['applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview'];

  for (const app of apps.data) {
    statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    if (activeStatuses.includes(app.status)) activeCount++;
    if (new Date(app.created_at) >= weekAgo) thisWeekCount++;
    if (app.status === 'offer') offerCount++;
  }

  const recentApps = apps.data.slice(0, 5);

  return {
    code: 0,
    data: {
      total: appsRes.total,
      active: activeCount,
      thisWeek: thisWeekCount,
      offers: offerCount,
      pendingReminders: remindersRes.total,
      statusCounts,
      recentApps,
    },
  };
}
