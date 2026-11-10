import 'server-only';

import { getDatabase, IDS } from '@/lib/db';
import { deleteDocumentFromR2 } from '@/lib/r2-storage';

export type HomeVideoOrientation = 'auto' | 'vertical' | 'horizontal';

export interface ClinicHomeVideoConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  videoUrl: string;
  videoName: string;
  videoSize: number;
  posterUrl: string;
  orientation: HomeVideoOrientation;
  updatedAt: string;
}

export const DEFAULT_CLINIC_HOME_VIDEO: ClinicHomeVideoConfig = {
  enabled: true,
  title: 'Conheça o Atendimento',
  subtitle: 'Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa',
  videoUrl: '',
  videoName: '',
  videoSize: 0,
  posterUrl: '',
  orientation: 'auto',
  updatedAt: new Date(0).toISOString(),
};

let tableInitialized = false;

export async function ensureHomeVideoTable() {
  if (tableInitialized) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_home_video (
        clinic_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL DEFAULT 'Conheça o Atendimento',
        subtitle TEXT NOT NULL DEFAULT 'Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa',
        video_url TEXT NOT NULL DEFAULT '',
        video_name TEXT NOT NULL DEFAULT '',
        video_size BIGINT NOT NULL DEFAULT 0,
        poster_url TEXT NOT NULL DEFAULT '',
        orientation TEXT NOT NULL DEFAULT 'auto',
        updated_at TEXT NOT NULL
      )
    `);
    tableInitialized = true;
  } catch (err) {
    console.error('[home-video] Erro ao inicializar tabela clinic_home_video:', err);
  }
}

export async function getClinicHomeVideo(): Promise<ClinicHomeVideoConfig> {
  await ensureHomeVideoTable();
  try {
    const db = getDatabase();
    const row = (await db
      .prepare(`
        SELECT enabled, title, subtitle, video_url, video_name, video_size, poster_url, orientation, updated_at
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
          poster_url: string;
          orientation: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return DEFAULT_CLINIC_HOME_VIDEO;
    }

    const orientation: HomeVideoOrientation =
      row.orientation === 'vertical' || row.orientation === 'horizontal'
        ? row.orientation
        : 'auto';

    return {
      enabled: Number(row.enabled) !== 0,
      title: row.title || DEFAULT_CLINIC_HOME_VIDEO.title,
      subtitle: row.subtitle ?? DEFAULT_CLINIC_HOME_VIDEO.subtitle,
      videoUrl: row.video_url || '',
      videoName: row.video_name || '',
      videoSize: Number(row.video_size || 0),
      posterUrl: row.poster_url || '',
      orientation,
      updatedAt: row.updated_at || DEFAULT_CLINIC_HOME_VIDEO.updatedAt,
    };
  } catch (err) {
    console.error('[home-video] Erro ao carregar configuração do vídeo da Home:', err);
    return DEFAULT_CLINIC_HOME_VIDEO;
  }
}

export async function saveClinicHomeVideo(
  input: Partial<Omit<ClinicHomeVideoConfig, 'updatedAt'>>
): Promise<ClinicHomeVideoConfig> {
  await ensureHomeVideoTable();
  const current = await getClinicHomeVideo();

  const nextVideoUrl =
    input.videoUrl !== undefined ? input.videoUrl.trim() : current.videoUrl;

  // Se substituiu um vídeo do R2 por outro diferente, limpa o arquivo antigo do R2
  if (
    current.videoUrl &&
    current.videoUrl !== nextVideoUrl &&
    current.videoUrl.includes('.r2.dev/videos-home/')
  ) {
    await deleteDocumentFromR2(current.videoUrl).catch(() => null);
  }

  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : current.enabled;
  const title =
    input.title !== undefined
      ? input.title.trim() || DEFAULT_CLINIC_HOME_VIDEO.title
      : current.title;
  const subtitle =
    input.subtitle !== undefined ? input.subtitle.trim() : current.subtitle;
  const videoName =
    input.videoName !== undefined ? input.videoName.trim() : current.videoName;
  const videoSize =
    input.videoSize !== undefined ? Number(input.videoSize || 0) : current.videoSize;
  const posterUrl =
    input.posterUrl !== undefined ? input.posterUrl.trim() : current.posterUrl;
  const orientation: HomeVideoOrientation =
    input.orientation === 'vertical' || input.orientation === 'horizontal' || input.orientation === 'auto'
      ? input.orientation
      : current.orientation;
  const updatedAt = new Date().toISOString();

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO clinic_home_video (
        clinic_id, enabled, title, subtitle, video_url, video_name, video_size, poster_url, orientation, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(clinic_id) DO UPDATE SET
        enabled = excluded.enabled,
        title = excluded.title,
        subtitle = excluded.subtitle,
        video_url = excluded.video_url,
        video_name = excluded.video_name,
        video_size = excluded.video_size,
        poster_url = excluded.poster_url,
        orientation = excluded.orientation,
        updated_at = excluded.updated_at
    `)
    .run(
      IDS.clinic,
      enabled ? 1 : 0,
      title,
      subtitle,
      nextVideoUrl,
      videoName,
      videoSize,
      posterUrl,
      orientation,
      updatedAt
    );

  return {
    enabled,
    title,
    subtitle,
    videoUrl: nextVideoUrl,
    videoName,
    videoSize,
    posterUrl,
    orientation,
    updatedAt,
  };
}

export async function removeClinicHomeVideoFile(): Promise<ClinicHomeVideoConfig> {
  const current = await getClinicHomeVideo();
  if (current.videoUrl && current.videoUrl.includes('.r2.dev/')) {
    await deleteDocumentFromR2(current.videoUrl).catch(() => null);
  }
  return saveClinicHomeVideo({
    videoUrl: '',
    videoName: '',
    videoSize: 0,
  });
}
