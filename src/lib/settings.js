import { setCustomEndpoints } from './providers';

const KEY = 'aidriy.settings.v1';

export const DEFAULTS = {
  theme: 'system', // system | light | dark
  font: 'default', // default | system
  accent: 'terracotta',
  personalization: null, // salinan lokal; sumber utama di profiles.settings.personalization
  haptics: true,
  webSearch: true,
  imageSearch: true,
  artifacts: true,
  memory: true,
  effort: 'medium', // off | medium | high
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  keys: { anthropic: '', gemini: '', openai: '', openrouter: '', nvidia: '' },
  voice: { lang: 'id-ID', rate: 1, autoListen: true, engine: 'device', nvidiaVoice: null },
  imageModel: 'flux.2-klein-4b',
  translateTarget: 'en',
  modelCache: {},
  customEndpoints: [], // [{ id, name, baseUrl, format, authStyle, connection, noKey, models: [{id,label}] }]
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    setCustomEndpoints(s.customEndpoints);
    return {
      ...DEFAULTS,
      ...s,
      keys: { ...DEFAULTS.keys, ...(s.keys || {}) },
      voice: { ...DEFAULTS.voice, ...(s.voice || {}) },
      modelCache: s.modelCache || {},
      customEndpoints: Array.isArray(s.customEndpoints) ? s.customEndpoints : [],
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  setCustomEndpoints(s.customEndpoints);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage penuh atau tidak tersedia */
  }
}
