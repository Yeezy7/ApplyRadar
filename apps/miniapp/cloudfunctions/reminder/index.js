const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'reminders';

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, data } = event;
  const col = db.collection(COLLECTION);

  switch (action) {
    case 'create':
      return handleCreate(col, OPENID, data);
    case 'list':
      return handleList(col, OPENID, data);
    case 'update':
      return handleUpdate(col, OPENID, data);
    case 'markDone':
      return handleMarkDone(col, OPENID, data);
    case 'delete':
      return handleDelete(col, OPENID, data);
    default:
      return { code: -1, msg: `未知操作: ${action}` };
  }
};

async function handleCreate(col, openid, data) {
  const now = new Date().toISOString();
  const doc = {
    _openid: openid,
    application_id: data.application_id || null,
    title: data.title,
    content: data.content || '',
    reminder_type: data.reminder_type || 'custom',
    remind_at: data.remind_at,
    is_done: false,
    notified_at: null,
    created_by: data.created_by || 'user',
    created_at: now,
    updated_at: now,
  };

  const res = await col.add({ data: doc });
  return { code: 0, data: { _id: res._id, ...doc } };
}

async function handleList(col, openid, data) {
  const { includeDone = false, applicationId } = data || {};
  const conditions = [{ _openid: openid }];

  if (!includeDone) {
    conditions.push({ is_done: false });
  }

  if (applicationId) {
    conditions.push({ application_id: applicationId });
  }

  const where = conditions.length > 1 ? _.and(conditions) : { _openid: openid };

  const res = await col
    .where(where)
    .orderBy('remind_at', 'asc')
    .limit(200)
    .get();

  return { code: 0, data: res.data };
}

async function handleUpdate(col, openid, data) {
  const { id, ...updates } = data;
  updates.updated_at = new Date().toISOString();

  // Verify ownership
  const existing = await col.doc(id).get();
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权修改' };
  }

  await col.doc(id).update({ data: updates });
  return { code: 0, data: { _id: id, ...updates } };
}

async function handleMarkDone(col, openid, data) {
  const existing = await col.doc(data.id).get();
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权修改' };
  }

  await col.doc(data.id).update({
    data: {
      is_done: true,
      updated_at: new Date().toISOString(),
    },
  });
  return { code: 0, msg: '已标记完成' };
}

async function handleDelete(col, openid, data) {
  const existing = await col.doc(data.id).get();
  if (existing.data._openid !== openid) {
    return { code: -1, msg: '无权删除' };
  }

  await col.doc(data.id).remove();
  return { code: 0, msg: '已删除' };
}
