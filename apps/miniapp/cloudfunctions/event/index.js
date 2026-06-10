const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'application_events';

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, data } = event;
  const col = db.collection(COLLECTION);

  switch (action) {
    case 'create':
      return handleCreate(col, OPENID, data);
    case 'listByApplication':
      return handleListByApplication(col, OPENID, data);
    case 'listAll':
      return handleListAll(col, OPENID, data);
    default:
      return { code: -1, msg: `未知操作: ${action}` };
  }
};

async function handleCreate(col, openid, data) {
  const doc = {
    _openid: openid,
    application_id: data.application_id,
    event_type: data.event_type,
    title: data.title,
    content: data.content || '',
    old_status: data.old_status || null,
    new_status: data.new_status || null,
    handled_at: null,
    handled_action: null,
    event_time: data.event_time || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const res = await col.add({ data: doc });
  return { code: 0, data: { _id: res._id, ...doc } };
}

async function handleListByApplication(col, openid, data) {
  const res = await col
    .where({
      _openid: openid,
      application_id: data.application_id,
    })
    .orderBy('event_time', 'desc')
    .limit(100)
    .get();

  return { code: 0, data: res.data };
}

async function handleListAll(col, openid, data) {
  const { limit = 50 } = data || {};
  const res = await col
    .where({ _openid: openid })
    .orderBy('event_time', 'desc')
    .limit(limit)
    .get();

  return { code: 0, data: res.data };
}
