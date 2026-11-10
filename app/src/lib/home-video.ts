import 'server-only';

import crypto from 'crypto';
import { getDatabase, IDS } from '@/lib/db';
import { deleteDocumentFromR2 } from '@/lib/r2-storage';

export interface HomeVideoItem {
  id: string;
  title: string;
  subtitle: string;
  videoUrl: string;
  videoName: string;
  videoSize: number;
  published: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface ClinicHomeVideoSection {
  enabled: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  videos: HomeVideoItem[];
  updatedAt: string;
}

export const DEFAULT_SECTION_TITLE = 'Sessões na Prática';
export const DEFAULT_SECTION_SUBTITLE = 'Registros reais de atendimentos no consultório';

let tablesInitialized = false;

export async function ensureHomeVideoTable() {
  if (tablesInitialized) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_home_video (
        clinic_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL DEFAULT 'Sessões & Atendimentos Reais',
        subtitle TEXT NOT NULL DEFAULT 'Assista a registros reais de sessões e transformações compartilhadas pela Dra. Camila Machado',
        video_url TEXT NOT NULL DEFAULT '',
        video_name TEXT NOT NULL DEFAULT '',
        video_size BIGINT NOT NULL DEFAULT 0,
        poster_url TEXT NOT NULL DEFAULT '',
        orientation TEXT NOT NULL DEFAULT 'vertical',
        updated_at TEXT NOT NULL
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_home_videos (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        subtitle TEXT NOT NULL DEFAULT '',
        video_url TEXT NOT NULL,
        video_name TEXT NOT NULL DEFAULT '',
        video_size BIGINT NOT NULL DEFAULT 0,
        published INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    tablesInitialized = true;
  } catch (err) {
    console.error('[home-video] Erro ao inicializar tabelas de vídeos da Home:', err);
  }
}

export async function getClinicHomeVideoSection(): Promise<ClinicHomeVideoSection> {
  await ensureHomeVideoTable();
  const db = getDatabase();

  try {
    const settingsRow = (await db
      .prepare(`
        SELECT enabled, title, subtitle, video_url, video_name, video_size, updated_at
        FROM clinic_home_video
        WHERE clinic_id = ?
      `)
      .get(IDS.clinic)) as
      | {
          enabled: number;
          title: string;
          subtitle: string;
          video_url: string;
          video_name: string;
          video_size: number | string;
          updated_at: string;
        }
      | undefined;

    let videoRows = (await db
      .prepare(`
        SELECT id, title, subtitle, video_url, video_name, video_size, published, display_order, created_at
        FROM clinic_home_videos
        WHERE clinic_id = ?
        ORDER BY display_order ASC, created_at DESC
      `)
      .all(IDS.clinic)) as Array<{
      id: string;
      title: string;
      subtitle: string;
      video_url: string;
      video_name: string;
      video_size: number | string;
      published: number;
      display_order: number;
      created_at: string;
    }>;

    // Migração automática caso já exista um vídeo salvo no formato único anterior
    if (videoRows.length === 0 && settingsRow?.video_url) {
      const now = new Date().toISOString();
      const migratedId = `vid_${crypto.randomUUID().slice(0, 12)}`;
      await db
        .prepare(`
          INSERT INTO clinic_home_videos (
            id, clinic_id, title, subtitle, video_url, video_name, video_size, published, display_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        `)
        .run(
          migratedId,
          IDS.clinic,
          'Sessão na Clínica',
          '',
          settingsRow.video_url,
          settingsRow.video_name || 'video.mp4',
          Number(settingsRow.video_size || 0),
          now,
          now
        );

      // Limpa o campo legado para não migrar novamente se todos forem apagados no futuro
      await db
        .prepare(`UPDATE clinic_home_video SET video_url = '', video_name = '', video_size = 0 WHERE clinic_id = ?`)
        .run(IDS.clinic);

      videoRows = [
        {
          id: migratedId,
          title: 'Sessão na Clínica',
          subtitle: '',
          video_url: settingsRow.video_url,
          video_name: settingsRow.video_name || 'video.mp4',
          video_size: Number(settingsRow.video_size || 0),
          published: 1,
          display_order: 0,
          created_at: now,
        },
      ];
    }

    const videos: HomeVideoItem[] = videoRows.map((r) => ({
      id: r.id,
      title: r.title || '',
      subtitle: r.subtitle || '',
      videoUrl: r.video_url,
      videoName: r.video_name || '',
      videoSize: Number(r.video_size || 0),
      published: Number(r.published) !== 0,
      displayOrder: Number(r.display_order || 0),
      createdAt: r.created_at,
    }));

    const isDefaultOldTitle =
      settingsRow?.title === 'Conheça o Atendimento' ||
      settingsRow?.title === 'Sessões & Atendimentos Reais';
    const isDefaultOldSubtitle =
      settingsRow?.subtitle ===
        'Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa' ||
      settingsRow?.subtitle ===
        'Assista a registros reais de sessões e transformações compartilhadas pela Dra. Camila Machado';

    return {
      enabled: settingsRow ? Number(settingsRow.enabled) !== 0 : true,
      sectionTitle:
        !settingsRow?.title || isDefaultOldTitle ? DEFAULT_SECTION_TITLE : settingsRow.title,
      sectionSubtitle:
        settingsRow?.subtitle === undefined || isDefaultOldSubtitle
          ? DEFAULT_SECTION_SUBTITLE
          : settingsRow.subtitle,
      videos,
      updatedAt: settingsRow?.updated_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[home-video] Erro ao buscar seção de vídeos da Home:', err);
    return {
      enabled: true,
      sectionTitle: DEFAULT_SECTION_TITLE,
      sectionSubtitle: DEFAULT_SECTION_SUBTITLE,
      videos: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function saveClinicHomeVideoSettings(input: {
  enabled?: boolean;
  sectionTitle?: string;
  sectionSubtitle?: string;
}): Promise<ClinicHomeVideoSection> {
  await ensureHomeVideoTable();
  const current = await getClinicHomeVideoSection();
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : current.enabled;
  const sectionTitle =
    input.sectionTitle !== undefined
      ? input.sectionTitle.trim() || DEFAULT_SECTION_TITLE
      : current.sectionTitle;
  const sectionSubtitle =
    input.sectionSubtitle !== undefined ? input.sectionSubtitle.trim() : current.sectionSubtitle;
  const updatedAt = new Date().toISOString();

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO clinic_home_video (
        clinic_id, enabled, title, subtitle, video_url, video_name, video_size, poster_url, orientation, updated_at
      ) VALUES (?, ?, ?, ?, '', '', 0, '', 'vertical', ?)
      ON CONFLICT(clinic_id) DO UPDATE SET
        enabled = excluded.enabled,
        title = excluded.title,
        subtitle = excluded.subtitle,
        updated_at = excluded.updated_at
    `)
    .run(IDS.clinic, enabled ? 1 : 0, sectionTitle, sectionSubtitle, updatedAt);

  return getClinicHomeVideoSection();
}

export async function addClinicHomeVideoItem(input: {
  title?: string;
  subtitle?: string;
  videoUrl: string;
  videoName?: string;
  videoSize?: number;
  published?: boolean;
}): Promise<ClinicHomeVideoSection> {
  await ensureHomeVideoTable();
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = `vid_${crypto.randomUUID().slice(0, 12)}`;

  // Coloca o novo vídeo no topo (menor display_order ou reordena)
  const existing = await getClinicHomeVideoSection();
  const nextOrder = existing.videos.length > 0 ? Math.min(...existing.videos.map((v) => v.displayOrder)) - 1 : 0;

  await db
    .prepare(`
      INSERT INTO clinic_home_videos (
        id, clinic_id, title, subtitle, video_url, video_name, video_size, published, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      IDS.clinic,
      (input.title || '').trim(),
      (input.subtitle || '').trim(),
      input.videoUrl.trim(),
      (input.videoName || '').trim(),
      Number(input.videoSize || 0),
      input.published === false ? 0 : 1,
      nextOrder,
      now,
      now
    );

  return getClinicHomeVideoSection();
}

export async function updateClinicHomeVideoItem(
  id: string,
  input: {
    title?: string;
    subtitle?: string;
    published?: boolean;
    displayOrder?: number;
  }
): Promise<ClinicHomeVideoSection> {
  await ensureHomeVideoTable();
  const db = getDatabase();
  const existing = await getClinicHomeVideoSection();
  const item = existing.videos.find((v) => v.id === id);
  if (!item) return existing;

  const title = input.title !== undefined ? input.title.trim() : item.title;
  const subtitle = input.subtitle !== undefined ? input.subtitle.trim() : item.subtitle;
  const published = input.published !== undefined ? Boolean(input.published) : item.published;
  const displayOrder =
    input.displayOrder !== undefined ? Number(input.displayOrder) : item.displayOrder;
  const now = new Date().toISOString();

  await db
    .prepare(`
      UPDATE clinic_home_videos
      SET title = ?, subtitle = ?, published = ?, display_order = ?, updated_at = ?
      WHERE id = ? AND clinic_id = ?
    `)
    .run(title, subtitle, published ? 1 : 0, displayOrder, now, id, IDS.clinic);

  return getClinicHomeVideoSection();
}

export async function deleteClinicHomeVideoItem(id: string): Promise<ClinicHomeVideoSection> {
  await ensureHomeVideoTable();
  const db = getDatabase();
  const existing = await getClinicHomeVideoSection();
  const item = existing.videos.find((v) => v.id === id);

  if (item?.videoUrl && item.videoUrl.includes('.r2.dev/')) {
    await deleteDocumentFromR2(item.videoUrl).catch(() => null);
  }

  await db
    .prepare(`DELETE FROM clinic_home_videos WHERE id = ? AND clinic_id = ?`)
    .run(id, IDS.clinic);

  return getClinicHomeVideoSection();
}
