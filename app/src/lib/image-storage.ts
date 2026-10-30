/**
 * Supabase Storage — Utilitário de Compressão & Upload de Imagens
 *
 * Regras:
 *  - Imagens (image/*) são SEMPRE comprimidas no navegador antes do upload
 *  - Dimensão máxima: 1920px (mantém proporção original perfeita)
 *  - Qualidade JPEG: 82% (visualmente idêntico ao original, arquivo ~80-90% menor)
 *  - Fundo branco preenchido para evitar transparência preta em PNGs
 *  - Upload para o bucket público 'clinica-imagens' do Supabase Storage
 *  - O banco de dados salva APENAS a URL pública permanente (zero base64 pesado)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://phhsdjeduxahoeridpec.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaHNkamVkdXhhaG9lcmlkcGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzQ5NzEsImV4cCI6MjEwODIxMDk3MX0.HkEDmCPl7ce_5XZP0r8j00EtrXCni6EyPkZFWVBJOA4';

export const IMAGE_BUCKET = 'clinica-imagens';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseStorageClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseInstance;
}

/**
 * Comprime uma imagem usando Canvas API nativa do navegador.
 * Redimensiona até 1920px mantendo aspect ratio e re-encoda para JPEG 82%.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context não disponível'));
        return;
      }

      // Preenchimento de fundo branco para evitar artefatos em PNGs transparentes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao gerar Blob comprimido'));
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao decodificar imagem para compressão'));
    };

    img.src = objectUrl;
  });
}

/**
 * Upload de imagem para o Supabase Storage com compressão automática.
 * Retorna a URL pública, nome salvo e redução em bytes.
 */
export async function uploadImageToStorage(
  file: File,
  folder: 'anotacoes' | 'prontuarios' | 'servicos' | 'sessoes-grupo' = 'anotacoes'
): Promise<{ url: string; fileName: string; sizeBefore: number; sizeAfter: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Arquivo não é uma imagem: ${file.name} (${file.type})`);
  }

  const sizeBefore = file.size;
  const compressedBlob = await compressImage(file);
  const sizeAfter = compressedBlob.size;

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const safeBaseName = file.name
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 30);

  const fileName = `${folder}/${timestamp}-${safeBaseName || 'img'}-${randomId}.jpg`;
  const supabase = getSupabaseStorageClient();

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(fileName, compressedBlob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) {
    throw new Error(`Erro ao enviar para o Supabase Storage: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(fileName);

  return {
    url: urlData.publicUrl,
    fileName,
    sizeBefore,
    sizeAfter,
  };
}

/**
 * Remove imagem do storage caso seja deletada pelo usuário.
 */
export async function deleteImageFromStorage(urlOrPath: string): Promise<void> {
  if (!urlOrPath) return;

  let filePath = urlOrPath;
  if (urlOrPath.includes(`/${IMAGE_BUCKET}/`)) {
    const parts = urlOrPath.split(`/${IMAGE_BUCKET}/`);
    if (parts[1]) filePath = parts[1];
  }

  const supabase = getSupabaseStorageClient();
  await supabase.storage.from(IMAGE_BUCKET).remove([filePath]);
}

/**
 * Helper para obter URL segura de visualização de anexo:
 * Se já for URL (http/https), usa direto. Se for base64 legado, monta com data uri.
 */
export function getSafeFileUrl(item: { data: string; mimeType?: string }): string {
  if (!item || !item.data) return '';
  if (item.data.startsWith('http://') || item.data.startsWith('https://')) {
    return item.data;
  }
  if (item.data.startsWith('data:')) {
    return item.data;
  }
  return `data:${item.mimeType || 'application/octet-stream'};base64,${item.data}`;
}
