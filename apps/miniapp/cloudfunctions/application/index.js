const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'applications';

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const { action, data } = event;
    const col = db.collection(COLLECTION);

    switch (action) {
      case 'create':
        return handleCreate(col, OPENID, data);
      case 'list':
        return handleList(col, OPENID, data);
      case 'get':
        return handleGet(col, OPENID, data);
      case 'update':
        return handleUpdate(col, OPENID, data);
      case 'delete':
        return handleDelete(col, OPENID, data);
      default:
        return { code: -1, msg: `未知操作: ${action}` };
    }
  } catch (error) {
    return { code: -1, msg: error.message || '投递记录操作失败' };
  }
};

async function handleCreate(col, openid, data) {
  const now = new Date().toISOString();
  const doc = {
    _openid: openid,
    company_name: data.company_name,
    job_title: data.job_title,
    location: data.location || '',
    salary_range: data.salary_range || '',
    job_url: data.job_url || '',
    status_url: data.status_url || '',
    source: data.source || 'manual',
    status: data.status || 'to_apply',
    priority: data.priority || 'medium',
    applied_at: data.applied_at || null,
    deadline_at: data.deadline_at || null,
    notes: data.notes || '',
    created_at: now,
    updated_at: now,
  };

  const res = await col.add({ data: doc });
  return { code: 0, data: { _id: res._id, ...doc } };
}

async function handleList(col, openid, data) {
  const { search, status } = data || {};
  const conditions = [{ _openid: openid }];

  if (status) {
    conditions.push({ status });
  }

  if (search) {
    const reg = db.RegExp({ regexp: search, options: 'i' });
    conditions.push(_.or([
      { company_name: reg },
      { job_title: reg },
      { location: reg },
    ]));
  }

  const where = conditions.length > 1 ? _.and(conditions) : { _openid: openid };

  const res = await col
    .where(where)
    .orderBy('updated_at', 'desc')
    .limit(200)
    .get();

  return { code: 0, data: res.data };
}

async function getOwnedDoc(col, id, openid) {
  const res = await col.doc(id).get();
  if (!res.data) {
    throw new Error('记录不存在');
  }
  if (res.data._openid !== openid) {
    throw new Error('无权访问');
  }
  return res.data;
}

async function handleGet(col, openid, data) {
  const doc = await getOwnedDoc(col, data.id, openid);
  return { code: 0, data: doc };
}

async function handleUpdate(col, openid, data) {
  const { id, ...updates } = data;
  updates.updated_at = new Date().toISOString();

  await getOwnedDoc(col, id, openid);

  await col.doc(id).update({ data: updates });
  return { code: 0, data: { _id: id, ...updates } };
}

async function handleDelete(col, openid, data) {
  await getOwnedDoc(col, data.id, openid);

  await col.doc(data.id).remove();
  return { code: 0, msg: '已删除' };
}
