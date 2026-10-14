// Penghubung ke penyedia AI. Semua permintaan langsung dari HP ke penyedia
// memakai API key milik pengguna sendiri.

export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    short: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    short: 'Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    short: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    models: [
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini' },
      { id: 'gpt-5-nano', label: 'GPT-5 nano' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    short: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-…',
    models: [
      { id: 'openrouter/auto', label: 'Otomatis (OpenRouter)' },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    ],
  },
};

export const EFFORTS = [
  { id: 'off', label: 'Cepat' },
  { id: 'medium', label: 'Sedang' },
  { id: 'high', label: 'Tinggi' },
];

export function effortLabel(id) {
  return EFFORTS.find((e) => e.id === id)?.label || 'Sedang';
}

export function modelsFor(provider, cache) {
  const fetched = cache?.[provider];
  if (fetched && fetched.length) return fetched;
  return PROVIDERS[provider]?.models || [];
}

export function shortModelName(provider, model, cache) {
  const found = modelsFor(provider, cache).find((m) => m.id === model);
  let label = found?.label || model || 'Pilih model';
  label = label.replace(/^Claude\s+/i, '').replace(/^Google:\s*/i, '');
  if (label.length > 22) label = label.slice(0, 21) + '…';
  return label;
}

// ---------- Daftar model langsung dari penyedia ----------
export async function fetchModels(provider, key) {
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: anthropicHeaders(key),
    });
    await ensureOk(res);
    const j = await res.json();
    return (j.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
  }
  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`
    );
    await ensureOk(res);
    const j = await res.json();
    return (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .filter((m) => /gemini/i.test(m.name) && !/embedding|aqa|tts|image/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    await ensureOk(res);
    const j = await res.json();
    return (j.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d|chatgpt)/.test(id))
      .filter((id) => !/audio|realtime|tts|transcribe|image|embedding|search|instruct/.test(id))
      .sort()
      .reverse()
      .map((id) => ({ id, label: id }));
  }
  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    await ensureOk(res);
    const j = await res.json();
    return [{ id: 'openrouter/auto', label: 'Otomatis (OpenRouter)' }].concat(
      (j.data || []).map((m) => ({ id: m.id, label: m.name || m.id }))
    );
  }
  return [];
}

// ---------- Utilitas ----------
function anthropicHeaders(key) {
  return {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

export class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function ensureOk(res) {
  if (res.ok) return;
  let msg = `HTTP ${res.status}`;
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      const e = Array.isArray(j) ? j[0]?.error : j.error;
      msg = (typeof e === 'string' ? e : e?.message) || j.message || t.slice(0, 300) || msg;
    } catch {
      if (t) msg = t.slice(0, 300);
    }
  } catch {
    /* abaikan */
  }
  if (res.status === 401 || res.status === 403) msg = `API key ditolak (${res.status}). ${msg}`;
  if (res.status === 429) msg = `Batas pemakaian tercapai (429). ${msg}`;
  throw new ProviderError(msg, res.status);
}

async function* sseEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* potongan tidak lengkap */
      }
    }
  }
}

// Gabungkan pesan berurutan dengan peran yang sama (misal setelah error).
function mergeTurns(history) {
  const out = [];
  for (const m of history) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.text = [last.text, m.text].filter(Boolean).join('\n\n');
      last.attachments = [...(last.attachments || []), ...(m.attachments || [])];
    } else {
      out.push({ ...m, attachments: [...(m.attachments || [])] });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function fileNote(a) {
  return `[Lampiran "${a.name}" sudah dikirim sebelumnya dan tidak tersedia lagi untuk dibaca ulang]`;
}

function textFile(a) {
  return `<file name="${a.name}">\n${a.text}\n</file>`;
}

const dataUrl = (a) => `data:${a.mime};base64,${a.data}`;

// ---------- Anthropic ----------
function anthropicMessages(history) {
  return history.map((m) => {
    if (m.role === 'assistant') return { role: 'assistant', content: m.text || '…' };
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.kind === 'text' && a.text) parts.push({ type: 'text', text: textFile(a) });
      else if (a.kind === 'image' && a.data)
        parts.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
      else if (a.kind === 'pdf' && a.data)
        parts.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: a.data },
          title: a.name,
        });
      else parts.push({ type: 'text', text: fileNote(a) });
    }
    if (m.text) parts.push({ type: 'text', text: m.text });
    if (!parts.length) parts.push({ type: 'text', text: '…' });
    return { role: 'user', content: parts };
  });
}

async function streamAnthropic(o, cb) {
  const body = {
    model: o.model,
    max_tokens: 8192,
    system: o.system,
    messages: anthropicMessages(o.history),
    stream: true,
  };
  if (o.effort !== 'off') {
    const budget = o.effort === 'high' ? 16000 : 5000;
    body.thinking = { type: 'enabled', budget_tokens: budget };
    body.max_tokens = budget + 12000;
  }
  if (o.webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(o.apiKey),
    body: JSON.stringify(body),
    signal: o.signal,
  });
  await ensureOk(res);
  const usage = { input: 0, output: 0 };
  for await (const ev of sseEvents(res)) {
    if (ev.type === 'message_start') {
      const u = ev.message?.usage || {};
      usage.input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    } else if (ev.type === 'content_block_start') {
      const b = ev.content_block;
      if (b?.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r.url) cb.onSource({ url: r.url, title: r.title || r.url });
      } else if (b?.type === 'server_tool_use') {
        cb.onStatus?.('Mencari di web…');
      }
    } else if (ev.type === 'content_block_delta') {
      const d = ev.delta;
      if (d?.type === 'text_delta') cb.onText(d.text);
      else if (d?.type === 'thinking_delta') cb.onThinking(d.thinking);
    } else if (ev.type === 'message_delta') {
      if (ev.usage?.output_tokens) usage.output = ev.usage.output_tokens;
    } else if (ev.type === 'error') {
      throw new ProviderError(ev.error?.message || 'Terjadi kesalahan dari Anthropic');
    }
  }
  return { usage };
}

// ---------- Google Gemini ----------
function geminiContents(history) {
  return history.map((m) => {
    if (m.role === 'assistant') return { role: 'model', parts: [{ text: m.text || '…' }] };
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.kind === 'text' && a.text) parts.push({ text: textFile(a) });
      else if ((a.kind === 'image' || a.kind === 'pdf') && a.data)
        parts.push({ inline_data: { mime_type: a.mime, data: a.data } });
      else parts.push({ text: fileNote(a) });
    }
    if (m.text) parts.push({ text: m.text });
    if (!parts.length) parts.push({ text: '…' });
    return { role: 'user', parts };
  });
}

async function streamGemini(o, cb) {
  const body = {
    contents: geminiContents(o.history),
    systemInstruction: { parts: [{ text: o.system }] },
    generationConfig: {},
  };
  if (o.effort !== 'off') {
    body.generationConfig.thinkingConfig = {
      thinkingBudget: o.effort === 'high' ? 16384 : 4096,
      includeThoughts: true,
    };
  }
  if (o.webSearch) body.tools = [{ google_search: {} }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    o.model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(o.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  await ensureOk(res);
  const usage = { input: 0, output: 0 };
  const seen = new Set();
  for await (const ev of sseEvents(res)) {
    if (ev.error) throw new ProviderError(ev.error.message || 'Terjadi kesalahan dari Gemini');
    const cand = ev.candidates?.[0];
    for (const p of cand?.content?.parts || []) {
      if (typeof p.text !== 'string') continue;
      if (p.thought) cb.onThinking(p.text);
      else cb.onText(p.text);
    }
    for (const g of cand?.groundingMetadata?.groundingChunks || []) {
      const w = g.web;
      if (w?.uri && !seen.has(w.uri)) {
        seen.add(w.uri);
        cb.onSource({ url: w.uri, title: w.title || w.uri });
      }
    }
    if (ev.usageMetadata) {
      usage.input = ev.usageMetadata.promptTokenCount || usage.input;
      usage.output =
        (ev.usageMetadata.candidatesTokenCount || 0) + (ev.usageMetadata.thoughtsTokenCount || 0) || usage.output;
    }
  }
  return { usage };
}

// ---------- OpenAI (Responses API) ----------
function openaiInput(history) {
  return history.map((m) => {
    if (m.role === 'assistant')
      return { role: 'assistant', content: [{ type: 'output_text', text: m.text || '…' }] };
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.kind === 'text' && a.text) parts.push({ type: 'input_text', text: textFile(a) });
      else if (a.kind === 'image' && a.data) parts.push({ type: 'input_image', image_url: dataUrl(a) });
      else if (a.kind === 'pdf' && a.data) parts.push({ type: 'input_file', filename: a.name, file_data: dataUrl(a) });
      else parts.push({ type: 'input_text', text: fileNote(a) });
    }
    if (m.text) parts.push({ type: 'input_text', text: m.text });
    if (!parts.length) parts.push({ type: 'input_text', text: '…' });
    return { role: 'user', content: parts };
  });
}

const isOpenAIReasoning = (model) => /^(gpt-5|o\d)/.test(model);

async function streamOpenAI(o, cb) {
  const body = {
    model: o.model,
    instructions: o.system,
    input: openaiInput(o.history),
    stream: true,
  };
  if (o.effort !== 'off' && isOpenAIReasoning(o.model)) {
    body.reasoning = { effort: o.effort === 'high' ? 'high' : 'medium', summary: 'auto' };
  }
  if (o.webSearch) body.tools = [{ type: 'web_search' }];
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  await ensureOk(res);
  const usage = { input: 0, output: 0 };
  for await (const ev of sseEvents(res)) {
    switch (ev.type) {
      case 'response.output_text.delta':
        cb.onText(ev.delta || '');
        break;
      case 'response.reasoning_summary_text.delta':
        cb.onThinking(ev.delta || '');
        break;
      case 'response.reasoning_summary_part.done':
        cb.onThinking('\n\n');
        break;
      case 'response.web_search_call.in_progress':
      case 'response.web_search_call.searching':
        cb.onStatus?.('Mencari di web…');
        break;
      case 'response.output_text.annotation.added': {
        const a = ev.annotation;
        if (a?.type === 'url_citation' && a.url) cb.onSource({ url: a.url, title: a.title || a.url });
        break;
      }
      case 'response.completed': {
        const u = ev.response?.usage;
        if (u) {
          usage.input = u.input_tokens || 0;
          usage.output = u.output_tokens || 0;
        }
        break;
      }
      case 'response.failed':
        throw new ProviderError(ev.response?.error?.message || 'Permintaan ke OpenAI gagal');
      case 'error':
        throw new ProviderError(ev.message || ev.error?.message || 'Terjadi kesalahan dari OpenAI');
      default:
        break;
    }
  }
  return { usage };
}

// ---------- OpenRouter (format chat completions) ----------
function openrouterMessages(system, history) {
  const msgs = [{ role: 'system', content: system }];
  for (const m of history) {
    if (m.role === 'assistant') {
      msgs.push({ role: 'assistant', content: m.text || '…' });
      continue;
    }
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.kind === 'text' && a.text) parts.push({ type: 'text', text: textFile(a) });
      else if (a.kind === 'image' && a.data) parts.push({ type: 'image_url', image_url: { url: dataUrl(a) } });
      else if (a.kind === 'pdf' && a.data) parts.push({ type: 'file', file: { filename: a.name, file_data: dataUrl(a) } });
      else parts.push({ type: 'text', text: fileNote(a) });
    }
    if (m.text) parts.push({ type: 'text', text: m.text });
    if (!parts.length) parts.push({ type: 'text', text: '…' });
    msgs.push({ role: 'user', content: parts });
  }
  return msgs;
}

async function streamOpenRouter(o, cb) {
  const body = {
    model: o.model,
    messages: openrouterMessages(o.system, o.history),
    stream: true,
    usage: { include: true },
  };
  if (o.effort !== 'off') body.reasoning = { effort: o.effort === 'high' ? 'high' : 'medium' };
  if (o.webSearch) body.plugins = [{ id: 'web' }];
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${o.apiKey}`,
      'content-type': 'application/json',
      'X-Title': 'A.I.DRIY',
    },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  await ensureOk(res);
  const usage = { input: 0, output: 0 };
  const seen = new Set();
  for await (const ev of sseEvents(res)) {
    if (ev.error) throw new ProviderError(ev.error.message || 'Terjadi kesalahan dari OpenRouter');
    const d = ev.choices?.[0]?.delta;
    if (d?.reasoning) cb.onThinking(d.reasoning);
    if (d?.content) cb.onText(d.content);
    for (const a of d?.annotations || []) {
      const c = a.url_citation;
      if (c?.url && !seen.has(c.url)) {
        seen.add(c.url);
        cb.onSource({ url: c.url, title: c.title || c.url });
      }
    }
    if (ev.usage) {
      usage.input = ev.usage.prompt_tokens || 0;
      usage.output = ev.usage.completion_tokens || 0;
    }
  }
  return { usage };
}

const STREAMERS = {
  anthropic: streamAnthropic,
  gemini: streamGemini,
  openai: streamOpenAI,
  openrouter: streamOpenRouter,
};

/**
 * Kirim percakapan dan terima jawaban sedikit demi sedikit.
 * Jika model menolak fitur tambahan (berpikir / pencarian web), dicoba ulang tanpa fitur itu.
 */
export async function streamChat(opts, callbacks) {
  const run = STREAMERS[opts.provider];
  if (!run) throw new ProviderError('Penyedia tidak dikenal');
  const cb = {
    onText: () => {},
    onThinking: () => {},
    onSource: () => {},
    onStatus: () => {},
    onNotice: () => {},
    ...callbacks,
  };
  const base = { ...opts, history: mergeTurns(opts.history) };
  let produced = false;
  const guarded = {
    ...cb,
    onText: (t) => {
      if (t) produced = true;
      cb.onText(t);
    },
  };
  const attempts = [base];
  if (base.effort !== 'off') attempts.push({ ...base, effort: 'off' });
  if (base.webSearch) attempts.push({ ...base, effort: 'off', webSearch: false });

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const out = await run(attempts[i], guarded);
      if (i > 0) {
        const dropped = [];
        if (base.effort !== 'off' && attempts[i].effort === 'off') dropped.push('mode berpikir');
        if (base.webSearch && !attempts[i].webSearch) dropped.push('pencarian web');
        if (dropped.length) cb.onNotice(`Model ini tidak mendukung ${dropped.join(' dan ')}, jadi dijawab tanpa fitur itu.`);
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') throw e;
      // Hanya coba ulang bila permintaan ditolak (400) sebelum ada teks yang keluar.
      if (produced || !(e instanceof ProviderError) || e.status !== 400) throw e;
    }
  }
  throw lastErr;
}
