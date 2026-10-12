// Đọc / ghi chrome.storage.local.
const { normalizeConfig } = globalThis.ALH.config;

export async function loadAll() {
  const raw = await chrome.storage.local.get(['config', 'matchForm', 'uiState', 'detectedChannelId']);
  return {
    config: normalizeConfig(raw.config),
    match: raw.matchForm && typeof raw.matchForm === 'object' ? raw.matchForm : {},
    ui: { tableId: null, dryRun: false, ...(raw.uiState || {}) },
    detectedChannelId: raw.detectedChannelId || '',
  };
}

export const saveConfig = (config) => chrome.storage.local.set({ config });
export const saveMatch = (matchForm) => chrome.storage.local.set({ matchForm });
export const saveUi = (uiState) => chrome.storage.local.set({ uiState });

export function onDetectedChannel(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.detectedChannelId) fn(changes.detectedChannelId.newValue || '');
  });
}
