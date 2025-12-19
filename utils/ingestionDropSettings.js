const { getModel } = require('./saasbackend');

const GlobalSetting = getModel('GlobalSetting');

const SETTINGS_VERSION = 1;

function buildSettingKey(projectId) {
  return `PROJECT:${String(projectId)}:INGESTION_DROP_EVENTS_V${SETTINGS_VERSION}`;
}

function defaultConfig() {
  return {
    version: SETTINGS_VERSION,
    enabled: false,
    mode: 'blacklist',
    filters: [],
  };
}

function normalizeMode(value) {
  return value === 'whitelist' ? 'whitelist' : 'blacklist';
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters)) return [];

  return filters
    .map((f) => {
      const key = f && f.key != null ? String(f.key).trim() : '';
      const value = f && f.value != null ? String(f.value).trim() : '';
      return { key, value };
    })
    .filter((f) => Boolean(f.key));
}

async function getDropEventsConfig(projectId) {
  const key = buildSettingKey(projectId);

  const setting = await GlobalSetting.findOne({ key }).lean();
  if (!setting || !setting.value) return defaultConfig();

  try {
    const parsed = JSON.parse(setting.value);
    return {
      version: SETTINGS_VERSION,
      enabled: Boolean(parsed && parsed.enabled),
      mode: normalizeMode(parsed && parsed.mode),
      filters: normalizeFilters(parsed && parsed.filters),
    };
  } catch (e) {
    return defaultConfig();
  }
}

async function saveDropEventsConfig(projectId, input) {
  const key = buildSettingKey(projectId);

  const config = {
    version: SETTINGS_VERSION,
    enabled: Boolean(input && input.enabled),
    mode: normalizeMode(input && input.mode),
    filters: normalizeFilters(input && input.filters),
  };

  const value = JSON.stringify(config);

  const existing = await GlobalSetting.findOne({ key });

  if (existing) {
    existing.type = 'json';
    existing.value = value;
    existing.public = false;
    await existing.save();
    return config;
  }

  await GlobalSetting.create({
    key,
    type: 'json',
    value,
    description: `Project ${String(projectId)} ingestion drop rules (events)` ,
    public: false,
    templateVariables: [],
  });

  return config;
}

function getItemMetadataValue(item, key) {
  if (!item || !key) return undefined;

  if (Object.prototype.hasOwnProperty.call(item, key)) {
    return item[key];
  }

  if (item.properties && typeof item.properties === 'object' && Object.prototype.hasOwnProperty.call(item.properties, key)) {
    return item.properties[key];
  }

  return undefined;
}

function matchesAllFilters(item, filters) {
  if (!filters || !filters.length) return false;

  for (let i = 0; i < filters.length; i += 1) {
    const f = filters[i];
    const v = getItemMetadataValue(item, f.key);
    if (v === undefined || v === null) return false;
    if (String(v) !== String(f.value)) return false;
  }

  return true;
}

function shouldDropEventItem(config, item) {
  if (!config || !config.enabled) return false;

  const matched = matchesAllFilters(item, config.filters);

  if (config.mode === 'blacklist') {
    return matched;
  }

  // whitelist
  return !matched;
}

const dropCounters = new Map();

function incrementDropCounter(projectId, n) {
  const key = String(projectId);
  const current = dropCounters.get(key) || 0;
  dropCounters.set(key, current + (Number(n) || 0));
}

function getDropCounter(projectId) {
  return dropCounters.get(String(projectId)) || 0;
}

function resetDropCounter(projectId) {
  dropCounters.set(String(projectId), 0);
}

module.exports = {
  SETTINGS_VERSION,
  defaultConfig,
  getDropEventsConfig,
  saveDropEventsConfig,
  shouldDropEventItem,
  incrementDropCounter,
  getDropCounter,
  resetDropCounter,
};
