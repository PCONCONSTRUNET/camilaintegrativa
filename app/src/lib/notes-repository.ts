import 'server-only';

import { randomUUID } from 'node:crypto';
import { getDatabase, IDS } from './db';

export type NoteAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64 data url
  createdAt: string;
};

export type NoteFolder = {
  id: string;
  clinicId: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  noteCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteItem = {
  id: string;
  clinicId: string;
  folderId: string | null;
  folderName?: string | null;
  folderColor?: string | null;
  folderIcon?: string | null;
  title: string;
  content: string;
  color: string;
  isPinned: boolean;
  tags: string[];
  attachments: NoteAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type CreateNoteInput = {
  folderId?: string | null;
  title: string;
  content?: string;
  color?: string;
  isPinned?: boolean;
  tags?: string[];
  attachments?: NoteAttachment[];
};

export type UpdateNoteInput = Partial<CreateNoteInput>;

export type CreateFolderInput = {
  name: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
};

export type UpdateFolderInput = Partial<CreateFolderInput>;

let tablesEnsured = false;

export async function ensureNotesTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = getDatabase();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#0f766e',
      icon TEXT DEFAULT 'folder',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      folder_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '#ffffff',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      tags TEXT,
      attachments TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE SET NULL
    );
  `);

  // Migrações preventivas para colunas extras caso já existissem em schemas antigos
  for (const alter of [
    'ALTER TABLE note_folders ADD COLUMN sort_order INTEGER DEFAULT 0',
    'ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE notes ADD COLUMN color TEXT DEFAULT \'#ffffff\'',
    'ALTER TABLE notes ADD COLUMN tags TEXT',
    'ALTER TABLE notes ADD COLUMN attachments TEXT',
  ]) {
    try {
      await db.prepare(alter).run();
    } catch {
      // Já existe
    }
  }

  // Seed inicial caso não existam pastas cadastradas
  const existingFolder = await db.prepare(
    'SELECT id FROM note_folders WHERE clinic_id = ? LIMIT 1'
  ).get<{ id: string }>(IDS.clinic);

  if (!existingFolder) {
    const now = new Date().toISOString();
    const folder1 = randomUUID();
    const folder2 = randomUUID();
    const folder3 = randomUUID();
    const folder4 = randomUUID();

    await db.prepare(`
      INSERT INTO note_folders (id, clinic_id, name, color, icon, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?),
             (?, ?, ?, ?, ?, ?, ?, ?),
             (?, ?, ?, ?, ?, ?, ?, ?),
             (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      folder1, IDS.clinic, 'Protocolos & Roteiros de Hipnose', '#0f766e', 'brain', 1, now, now,
      folder2, IDS.clinic, 'Ideias & Projetos da Clínica', '#b45309', 'sparkles', 2, now, now,
      folder3, IDS.clinic, 'Estudos & Supervisão Clínica', '#1e40af', 'book', 3, now, now,
      folder4, IDS.clinic, 'Anotações Rápidas & Lembretes', '#475569', 'folder', 4, now, now,
    );

    // Notas iniciais demonstrativas
    const note1 = randomUUID();
    const note2 = randomUUID();
    const note3 = randomUUID();

    await db.prepare(`
      INSERT INTO notes (id, clinic_id, folder_id, title, content, color, is_pinned, tags, attachments, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
             (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
             (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      note1,
      IDS.clinic,
      folder1,
      'Roteiro: Indução de Dave Elman Acelerada',
      `Passo a passo prático para atendimentos clínicos:

1. Fixação Ocular & Abertura/Fechamento:
   "Respire profundamente e fixe o olhar em um ponto acima da linha dos olhos..."
2. Relaxamento Físico & Teste dos Olhos:
   "Permita que os músculos das pálpebras relaxem tanto que, enquanto mantiver esse relaxamento, eles simplesmente não abrem..."
3. Fracionamento em 3 etapas (abrir e fechar 3x para duplicar o transe).
4. Relaxamento Mental (Contagem regressiva de 100 até as letras se dissiparem).
5. Sugestionamento Direto & Âncora de Segurança.`,
      '#f0fdf4',
      1,
      JSON.stringify(['indução', 'protocolo', 'elman']),
      null,
      now,
      now,

      note2,
      IDS.clinic,
      folder2,
      'Planejamento: Workshop de Autohipnose para Ansiedade',
      `Ideia de evento vivencial em grupo:

• Duração: 3 horas (Sábado de manhã)
• Vagas: 12 participantes no consultório ou espaço terapêutico
• Conteúdo programático:
  - O que é o transe e desmistificação da hipnose
  - Treinamento da respiração diafragmática com ancoragem
  - Criação do "Lugar Seguro" individual
  - Áudio bônus guiado no WhatsApp
• Valor sugerido: R$ 180,00 por participante com coffee break`,
      '#fefce8',
      0,
      JSON.stringify(['workshop', 'grupo', 'evento']),
      null,
      now,
      now,

      note3,
      IDS.clinic,
      folder4,
      'Checklist de Acolhimento & Primeiro Atendimento',
      `• Checar ficha de anamnese preenchida no portal do paciente
• Explicar detalhadamente o termo de consentimento e sigilo SBHP
• Alinhar expectativa de tratamento e tempo estimado de evolução
• Combinar modelo de pagamento (avulso ou pacote terapêutico)
• Enviar confirmação e endereço via WhatsApp`,
      '#eff6ff',
      1,
      JSON.stringify(['checklist', 'rotina']),
      null,
      now,
      now
    );
  }

  tablesEnsured = true;
}

// ─── FOLDERS ──────────────────────────────────────────────────────────────────

export async function listFolders(clinicId: string = IDS.clinic): Promise<NoteFolder[]> {
  await ensureNotesTables();
  const db = getDatabase();

  type FolderRow = {
    id: string;
    clinic_id: string;
    name: string;
    color: string;
    icon: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
    note_count: number;
  };

  const rows = await db.prepare(`
    SELECT 
      f.*,
      COUNT(n.id) as note_count
    FROM note_folders f
    LEFT JOIN notes n ON n.folder_id = f.id AND n.clinic_id = f.clinic_id
    WHERE f.clinic_id = ?
    GROUP BY f.id
    ORDER BY f.sort_order ASC, f.name ASC
  `).all<FolderRow>(clinicId);

  return rows.map((r) => ({
    id: r.id,
    clinicId: r.clinic_id,
    name: r.name,
    color: r.color || '#0f766e',
    icon: r.icon || 'folder',
    sortOrder: Number(r.sort_order || 0),
    noteCount: Number(r.note_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createFolder(
  clinicId: string = IDS.clinic,
  input: CreateFolderInput
): Promise<NoteFolder> {
  await ensureNotesTables();
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO note_folders (id, clinic_id, name, color, icon, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clinicId,
    input.name.trim(),
    input.color || '#0f766e',
    input.icon || 'folder',
    input.sortOrder ?? 0,
    now,
    now
  );

  return {
    id,
    clinicId,
    name: input.name.trim(),
    color: input.color || '#0f766e',
    icon: input.icon || 'folder',
    sortOrder: input.sortOrder ?? 0,
    noteCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateFolder(
  id: string,
  clinicId: string = IDS.clinic,
  input: UpdateFolderInput
): Promise<NoteFolder | null> {
  await ensureNotesTables();
  const db = getDatabase();
  const existing = await db.prepare(
    'SELECT * FROM note_folders WHERE id = ? AND clinic_id = ?'
  ).get<{ id: string; name: string; color: string; icon: string; sort_order: number; created_at: string }>(id, clinicId);

  if (!existing) return null;

  const now = new Date().toISOString();
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const color = input.color !== undefined ? input.color : existing.color;
  const icon = input.icon !== undefined ? input.icon : existing.icon;
  const sortOrder = input.sortOrder !== undefined ? input.sortOrder : existing.sort_order;

  await db.prepare(`
    UPDATE note_folders
    SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ?
    WHERE id = ? AND clinic_id = ?
  `).run(name, color, icon, sortOrder, now, id, clinicId);

  const countRow = await db.prepare(
    'SELECT COUNT(*) as c FROM notes WHERE folder_id = ? AND clinic_id = ?'
  ).get<{ c: number }>(id, clinicId);

  return {
    id,
    clinicId,
    name,
    color,
    icon,
    sortOrder,
    noteCount: Number(countRow?.c || 0),
    createdAt: existing.created_at,
    updatedAt: now,
  };
}

export async function deleteFolder(
  id: string,
  clinicId: string = IDS.clinic,
  deleteNotes: boolean = false
): Promise<boolean> {
  await ensureNotesTables();
  const db = getDatabase();

  if (deleteNotes) {
    await db.prepare('DELETE FROM notes WHERE folder_id = ? AND clinic_id = ?').run(id, clinicId);
  } else {
    await db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND clinic_id = ?').run(id, clinicId);
  }

  const res = await db.prepare(
    'DELETE FROM note_folders WHERE id = ? AND clinic_id = ?'
  ).run(id, clinicId);

  return res.changes > 0;
}

// ─── NOTES ────────────────────────────────────────────────────────────────────

export async function listNotes(
  clinicId: string = IDS.clinic,
  options?: { folderId?: string | null; query?: string; pinnedOnly?: boolean }
): Promise<NoteItem[]> {
  await ensureNotesTables();
  const db = getDatabase();

  type NoteRow = {
    id: string;
    clinic_id: string;
    folder_id: string | null;
    folder_name: string | null;
    folder_color: string | null;
    folder_icon: string | null;
    title: string;
    content: string;
    color: string | null;
    is_pinned: number;
    tags: string | null;
    attachments: string | null;
    created_at: string;
    updated_at: string;
  };

  const conditions: string[] = ['n.clinic_id = ?'];
  const params: unknown[] = [clinicId];

  if (options?.folderId && options.folderId !== 'all') {
    if (options.folderId === 'none') {
      conditions.push('n.folder_id IS NULL');
    } else {
      conditions.push('n.folder_id = ?');
      params.push(options.folderId);
    }
  }

  if (options?.pinnedOnly) {
    conditions.push('n.is_pinned = 1');
  }

  if (options?.query && options.query.trim()) {
    const q = `%${options.query.trim().toLowerCase()}%`;
    conditions.push('(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ? OR LOWER(COALESCE(n.tags, "")) LIKE ?)');
    params.push(q, q, q);
  }

  const sql = `
    SELECT 
      n.*,
      f.name as folder_name,
      f.color as folder_color,
      f.icon as folder_icon
    FROM notes n
    LEFT JOIN note_folders f ON f.id = n.folder_id AND f.clinic_id = n.clinic_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `;

  const rows = await db.prepare(sql).all<NoteRow>(...params);

  return rows.map((r) => {
    let parsedTags: string[] = [];
    if (r.tags) {
      try {
        const val = JSON.parse(r.tags);
        parsedTags = Array.isArray(val) ? val : [];
      } catch {
        parsedTags = r.tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    let parsedAttachments: NoteAttachment[] = [];
    if (r.attachments) {
      try {
        const val = JSON.parse(r.attachments);
        parsedAttachments = Array.isArray(val) ? val : [];
      } catch {
        parsedAttachments = [];
      }
    }

    return {
      id: r.id,
      clinicId: r.clinic_id,
      folderId: r.folder_id,
      folderName: r.folder_name,
      folderColor: r.folder_color,
      folderIcon: r.folder_icon,
      title: r.title,
      content: r.content || '',
      color: r.color || '#ffffff',
      isPinned: Boolean(r.is_pinned),
      tags: parsedTags,
      attachments: parsedAttachments,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export async function getNoteById(
  id: string,
  clinicId: string = IDS.clinic
): Promise<NoteItem | null> {
  const notes = await listNotes(clinicId);
  return notes.find((n) => n.id === id) || null;
}

export async function createNote(
  clinicId: string = IDS.clinic,
  input: CreateNoteInput
): Promise<NoteItem> {
  await ensureNotesTables();
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  const tagsJson = input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null;
  const attachmentsJson =
    input.attachments && input.attachments.length > 0 ? JSON.stringify(input.attachments) : null;

  await db.prepare(`
    INSERT INTO notes (id, clinic_id, folder_id, title, content, color, is_pinned, tags, attachments, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clinicId,
    input.folderId || null,
    input.title.trim(),
    input.content || '',
    input.color || '#ffffff',
    input.isPinned ? 1 : 0,
    tagsJson,
    attachmentsJson,
    now,
    now
  );

  const created = await getNoteById(id, clinicId);
  if (!created) {
    throw new Error('Falha ao recuperar nota recém-criada.');
  }
  return created;
}

export async function updateNote(
  id: string,
  clinicId: string = IDS.clinic,
  input: UpdateNoteInput
): Promise<NoteItem | null> {
  await ensureNotesTables();
  const db = getDatabase();

  const existing = await db.prepare(
    'SELECT * FROM notes WHERE id = ? AND clinic_id = ?'
  ).get<{
    id: string;
    folder_id: string | null;
    title: string;
    content: string;
    color: string;
    is_pinned: number;
    tags: string | null;
    attachments: string | null;
  }>(id, clinicId);

  if (!existing) return null;

  const now = new Date().toISOString();
  const folderId = input.folderId !== undefined ? (input.folderId || null) : existing.folder_id;
  const title = input.title !== undefined ? input.title.trim() : existing.title;
  const content = input.content !== undefined ? input.content : existing.content;
  const color = input.color !== undefined ? input.color : existing.color;
  const isPinned = input.isPinned !== undefined ? (input.isPinned ? 1 : 0) : existing.is_pinned;
  const tagsJson =
    input.tags !== undefined
      ? (input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null)
      : existing.tags;
  const attachmentsJson =
    input.attachments !== undefined
      ? (input.attachments && input.attachments.length > 0 ? JSON.stringify(input.attachments) : null)
      : existing.attachments;

  await db.prepare(`
    UPDATE notes
    SET folder_id = ?, title = ?, content = ?, color = ?, is_pinned = ?, tags = ?, attachments = ?, updated_at = ?
    WHERE id = ? AND clinic_id = ?
  `).run(
    folderId,
    title,
    content,
    color,
    isPinned,
    tagsJson,
    attachmentsJson,
    now,
    id,
    clinicId
  );

  return getNoteById(id, clinicId);
}

export async function deleteNote(
  id: string,
  clinicId: string = IDS.clinic
): Promise<boolean> {
  await ensureNotesTables();
  const db = getDatabase();

  const res = await db.prepare(
    'DELETE FROM notes WHERE id = ? AND clinic_id = ?'
  ).run(id, clinicId);

  return res.changes > 0;
}

export async function togglePinNote(
  id: string,
  clinicId: string = IDS.clinic
): Promise<boolean> {
  await ensureNotesTables();
  const db = getDatabase();

  const existing = await db.prepare(
    'SELECT is_pinned FROM notes WHERE id = ? AND clinic_id = ?'
  ).get<{ is_pinned: number }>(id, clinicId);

  if (!existing) return false;

  const newPin = existing.is_pinned ? 0 : 1;
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE notes SET is_pinned = ?, updated_at = ? WHERE id = ? AND clinic_id = ?
  `).run(newPin, now, id, clinicId);

  return true;
}

