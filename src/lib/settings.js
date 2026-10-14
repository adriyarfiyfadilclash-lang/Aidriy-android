const KEY = 'aidriy.settings.v1';

export const DEFAULTS = {
  theme: 'system', // system | light | dark
  font: 'default', // default | system
  haptics: true,
  webSearch: true,
  artifacts: true,
  memory: true,
  effort: 'medium', // off | medium | high
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  keys: { anthropic: '', gemini: '', openai: '', openrouter: '' },
  voice: { lang: 'id-ID', rate: 1, autoListen: true },
  modelCache: {},
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...s,
      keys: { ...DEFAULTS.keys, ...(s.keys || {}) },
      voice: { ...DEFAULTS.voice, ...(s.voice || {}) },
      modelCache: s.modelCache || {},
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage penuh atau tidak tersedia */
  }
}
