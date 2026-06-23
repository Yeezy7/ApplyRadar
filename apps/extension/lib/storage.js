const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  SERVER_URL: 'server_url',
  SYNCED_DOMAINS: 'synced_domains',
  CACHED_TARGETS: 'cached_targets',
  LAST_SYNC: 'last_sync_times',
  SYNC_INTERVAL: 'sync_interval',
  CACHED_RESUME: 'cached_resume',
};

export async function getServerUrl() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SERVER_URL);
  return result[STORAGE_KEYS.SERVER_URL] || 'http://8.148.84.224';
}

export async function setServerUrl(url) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_URL]: url });
}

export async function getToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TOKEN);
  return result[STORAGE_KEYS.TOKEN] || '';
}

export async function setToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TOKEN]: token });
}

export async function isLoggedIn() {
  const token = await getToken();
  return !!token;
}

export async function getSyncedDomains() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SYNCED_DOMAINS);
  return result[STORAGE_KEYS.SYNCED_DOMAINS] || [];
}

export async function setSyncedDomains(domains) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SYNCED_DOMAINS]: domains });
}

export async function addSyncedDomain(domain) {
  const domains = await getSyncedDomains();
  if (!domains.includes(domain)) {
    domains.push(domain);
    await setSyncedDomains(domains);
  }
}

export async function removeSyncedDomain(domain) {
  const domains = await getSyncedDomains();
  const filtered = domains.filter(d => d !== domain);
  await setSyncedDomains(filtered);
}

export async function getCachedTargets() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CACHED_TARGETS);
  return result[STORAGE_KEYS.CACHED_TARGETS] || [];
}

export async function setCachedTargets(targets) {
  await chrome.storage.local.set({ [STORAGE_KEYS.CACHED_TARGETS]: targets });
}

export async function getLastSyncTimes() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_SYNC);
  return result[STORAGE_KEYS.LAST_SYNC] || {};
}

export async function setLastSyncTime(domain, time) {
  const times = await getLastSyncTimes();
  times[domain] = time;
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: times });
}

export async function getSyncInterval() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_INTERVAL);
  return result[STORAGE_KEYS.SYNC_INTERVAL] || 5 * 60 * 1000;
}

export async function setSyncInterval(ms) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_INTERVAL]: ms });
}

export async function getCachedResume() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CACHED_RESUME);
  return result[STORAGE_KEYS.CACHED_RESUME] || null;
}

export async function setCachedResume(resume) {
  await chrome.storage.local.set({ [STORAGE_KEYS.CACHED_RESUME]: resume });
}

export async function clearCachedResume() {
  await chrome.storage.local.remove(STORAGE_KEYS.CACHED_RESUME);
}
