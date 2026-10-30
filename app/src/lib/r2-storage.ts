import 'server-only';

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '8d0c788721acdf27e6a852342b117698';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '08ac60321df6a5a5bb595a653962a26e';
const secretAccessKey =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  'ff1ea2b22c2fdab3ec24fd8280e14b88950ef8e97d24f3ffbf4d7c85729814f6';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'clinica-documentos';
const endpoint =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  `https://${accountId}.r2.cloudflarestorage.com`;
const publicUrl =
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  'https://pub-9f39e9ac65654e67bc5783b29fd7df6c.r2.dev';

let s3ClientInstance: S3Client | null = null;

function getR2Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Faz upload de um documento (PDF, DOCX, etc.) para o Cloudflare R2
 */
export async function uploadDocumentToR2(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  folder: 'prontuarios' | 'anotacoes' = 'prontuarios'
): Promise<{ url: string; key: string; size: number }> {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const ext = originalFilename.includes('.')
    ? '.' + originalFilename.split('.').pop()!.toLowerCase()
    : '';

  const safeBaseName = originalFilename
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 40);

  const key = `${folder}/${timestamp}-${safeBaseName || 'doc'}-${randomId}${ext}`;
  const s3 = getR2Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    })
  );

  const finalPublicUrl = `${publicUrl}/${key}`;

  return {
    url: finalPublicUrl,
    key: key,
    size: buffer.length,
  };
}

/**
 * Remove um documento do Cloudflare R2
 */
export async function deleteDocumentFromR2(urlOrKey: string): Promise<void> {
  if (!urlOrKey) return;

  let key = urlOrKey;
  if (urlOrKey.startsWith('http')) {
    key = urlOrKey.replace(`${publicUrl}/`, '');
  }

  const s3 = getR2Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );
}

