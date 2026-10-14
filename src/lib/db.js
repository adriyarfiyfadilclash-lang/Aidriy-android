import { supabase } from './supabase';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Profil ----------
export async function getProfile(uid) {
  const data = check(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle());
  if (data) return data;
  return check(await supabase.from('profiles').upsert({ id: uid }).select().single());
}
export async function updateProfile(uid, patch) {
  return check(
    await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select()
      .single()
  );
}

// ---------- Percakapan ----------
export async function listConversations() {
  return check(
    await supabase
      .from('conversations')
      .select('id,title,project_id,starred,updated_at,provider,model')
      .order('updated_at', { ascending: false })
      .limit(200)
  );
}
export async function getConversation(id) {
  return check(await supabase.from('conversations').select('*').eq('id', id).maybeSingle());
}
export async function createConversation(row) {
  return check(await supabase.from('conversations').insert(row).select().single());
}
export async function updateConversation(id, patch) {
  return check(
    await supabase
      .from('conversations')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  );
}
export async function deleteConversation(id) {
  check(await supabase.from('conversations').delete().eq('id', id));
}
export async function deleteAllConversations(uid) {
  check(await supabase.from('conversations').delete().eq('user_id', uid));
}

// ---------- Pesan ----------
export async function listMessages(conversationId) {
  return check(
    await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
  );
}
export async function insertMessage(row) {
  return check(await supabase.from('messages').insert(row).select().single());
}
export async function deleteMessage(id) {
  check(await supabase.from('messages').delete().eq('id', id));
}

// ---------- Pencarian ----------
export async function searchChats(q) {
  const term = `%${q.replace(/[%_]/g, '')}%`;
  const [byTitle, byMsg] = await Promise.all([
    supabase.from('conversations').select('id,title,updated_at').ilike('title', term).limit(30),
    supabase.from('messages').select('conversation_id,content').ilike('content', term).limit(60),
  ]);
  const titles = check(byTitle);
  const msgs = check(byMsg);
  const map = new Map();
  for (const c of titles) map.set(c.id, { id: c.id, title: c.title, snippet: '' });
  const missing = [...new Set(msgs.map((m) => m.conversation_id))].filter((id) => !map.has(id));
  if (missing.length) {
    const convs = check(await supabase.from('conversations').select('id,title').in('id', missing));
    for (const c of convs) map.set(c.id, { id: c.id, title: c.title, snippet: '' });
  }
  for (const m of msgs) {
    const item = map.get(m.conversation_id);
    if (item && !item.snippet) {
      const i = m.content.toLowerCase().indexOf(q.toLowerCase());
      item.snippet = m.content.slice(Math.max(0, i - 30), i + 70).replace(/<[^>]+>/g, '').trim();
    }
  }
  return [...map.values()];
}

// ---------- Proyek ----------
export async function listProjects() {
  return check(await supabase.from('projects').select('*').order('updated_at', { ascending: false }));
}
export async function getProject(id) {
  return check(await supabase.from('projects').select('*').eq('id', id).maybeSingle());
}
export async function saveProject(project) {
  const row = {
    name: project.name,
    description: project.description || null,
    instructions: project.instructions || null,
    updated_at: new Date().toISOString(),
  };
  if (project.id) return check(await supabase.from('projects').update(row).eq('id', project.id).select().single());
  return check(await supabase.from('projects').insert(row).select().single());
}
export async function deleteProject(id) {
  check(await supabase.from('projects').delete().eq('id', id));
}

// ---------- Artefak ----------
export async function listArtifacts() {
  return check(
    await supabase
      .from('artifacts')
      .select('id,title,kind,language,conversation_id,updated_at')
      .order('updated_at', { ascending: false })
      .limit(200)
  );
}
export async function getArtifact(id) {
  return check(await supabase.from('artifacts').select('*').eq('id', id).maybeSingle());
}
export async function saveArtifacts(rows) {
  if (!rows.length) return [];
  return check(await supabase.from('artifacts').insert(rows).select());
}
export async function deleteArtifact(id) {
  check(await supabase.from('artifacts').delete().eq('id', id));
}

// ---------- Memori ----------
export async function listMemories() {
  return check(await supabase.from('memories').select('*').order('created_at', { ascending: false }));
}
export async function addMemories(contents) {
  if (!contents.length) return [];
  return check(await supabase.from('memories').insert(contents.map((content) => ({ content }))).select());
}
export async function updateMemory(id, content) {
  return check(await supabase.from('memories').update({ content }).eq('id', id).select().single());
}
export async function deleteMemory(id) {
  check(await supabase.from('memories').delete().eq('id', id));
}
export async function deleteAllMemories(uid) {
  check(await supabase.from('memories').delete().eq('user_id', uid));
}

// ---------- Penggunaan ----------
export async function usageSince(days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = check(
    await supabase.from('messages').select('meta,created_at').eq('role', 'assistant').gte('created_at', since).limit(5000)
  );
  return rows;
}
export async function counts() {
  const [c, m, a, mem] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true }),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('artifacts').select('id', { count: 'exact', head: true }),
    supabase.from('memories').select('id', { count: 'exact', head: true }),
  ]);
  return { conversations: c.count || 0, messages: m.count || 0, artifacts: a.count || 0, memories: mem.count || 0 };
}

// ---------- Lampiran ----------
export async function uploadAttachment(uid, conversationId, file) {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${uid}/${conversationId}/${crypto.randomUUID()}-${safe}`;
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  check(await supabase.storage.from('attachments').upload(path, bytes, { contentType: file.mime, upsert: false }));
  return path;
}
export async function attachmentUrl(path) {
  const data = check(await supabase.storage.from('attachments').createSignedUrl(path, 3600));
  return data.signedUrl;
}

// ---------- Ekspor ----------
export async function exportAll() {
  const [profile, conversations, messages, projects, artifacts, memories] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('conversations').select('*'),
    supabase.from('messages').select('id,conversation_id,role,content,attachments,meta,created_at'),
    supabase.from('projects').select('*'),
    supabase.from('artifacts').select('*'),
    supabase.from('memories').select('*'),
  ]);
  return {
    exported_at: new Date().toISOString(),
    profile: check(profile),
    projects: check(projects),
    conversations: check(conversations),
    messages: check(messages),
    artifacts: check(artifacts),
    memories: check(memories),
  };
}
