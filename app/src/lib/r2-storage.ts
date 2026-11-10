import 'server-only';

import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
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

let corsConfigured = false;

export async function ensureR2BucketCors(): Promise<void> {
  if (corsConfigured) return;
  try {
    const s3 = getR2Client();
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
              AllowedOrigins: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
    corsConfigured = true;
  } catch (err) {
    console.warn('[r2-storage] Falha ao garantir CORS no bucket:', err);
  }
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Gera uma URL assinada (Presigned PUT) para upload direto do navegador para o Cloudflare R2,
 * permitindo enviar vídeos grandes (ex: 20MB - 300MB) sem passar pelo limite de 4.5MB da Vercel.
 */
export async function createPresignedVideoUploadUrl(
  originalFilename: string,
  _mimeType = 'video/mp4'
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  await ensureR2BucketCors();

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const ext = originalFilename.includes('.')
    ? '.' + originalFilename.split('.').pop()!.toLowerCase()
    : '.mp4';

  const safeBaseName = originalFilename
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 40);

  const key = `videos-home/${timestamp}-${safeBaseName || 'video'}-${randomId}${ext}`;
  const parsedEndpoint = new URL(endpoint);
  const host = parsedEndpoint.host;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = [dateStamp, region, service, 'aws4_request'].join('/');
  const canonicalUri =
    '/' +
    bucketName +
    '/' +
    key
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '3600',
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  const finalPublicUrl = `${publicUrl}/${key}`;

  return {
    uploadUrl,
    publicUrl: finalPublicUrl,
    key,
  };
}

/**
 * Faz upload de um documento (PDF, DOCX, etc.) para o Cloudflare R2
 */
export async function uploadDocumentToR2(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  folder: 'prontuarios' | 'anotacoes' | 'videos-home' = 'prontuarios'
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

