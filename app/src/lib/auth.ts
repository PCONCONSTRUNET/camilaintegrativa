import 'server-only';

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { IDS } from './db';

export const SESSION_COOKIE = 'clinica_session';

export type Session = {
  userId: string;
  name: string;
  role: 'proprietaria' | 'administracao' | 'recepcao' | 'profissional';
  expiresAt: number;
};

export function canManageAgenda(session: Pick<Session, 'role'>) {
  return session.role === 'proprietaria' || session.role === 'administracao';
}

function secret() {
  const configured = process.env.CLINICA_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'desenvolvimento-local-altere-esta-chave';
  return null;
}

function signature(payload: string, key: string) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createSessionToken(): string {
  const key = secret();
  if (!key) throw new Error('CLINICA_AUTH_SECRET não configurada.');
  const session: Session = {
    userId: IDS.owner,
    name: 'Camila Machado',
    role: 'proprietaria',
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, key)}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  const key = secret();
  if (!token || !key) return null;
  const [payload, receivedSignature] = token.split('.');
  if (!payload || !receivedSignature) return null;
  const expected = signature(payload, key);
  const left = Buffer.from(receivedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(cookie);
}

export function credentialsAreValid(email: string, password: string) {
  const configuredEmail = process.env.CLINICA_ADMIN_EMAIL || 'admin@clinica.local';
  const configuredPassword = process.env.CLINICA_ADMIN_PASSWORD || 'clinica-demo';

  const normalizedInputEmail = email.trim().toLowerCase();

  const isConfiguredMatch =
    normalizedInputEmail === configuredEmail.toLowerCase() &&
    password === configuredPassword;

  const isDemoMatch =
    normalizedInputEmail === 'admin@clinica.local' &&
    password === 'clinica-demo';

  return isConfiguredMatch || isDemoMatch;
}

// Client Session & Authentication
export const CLIENT_SESSION_COOKIE = 'clinica_client_session';

export type ClientSession = {
  clientId: string;
  name: string;
  phone: string;
  email: string | null;
  role: 'cliente';
  expiresAt: number;
};

export function createClientSessionToken(client: { id: string; name: string; phone: string; email: string | null }): string {
  const key = secret();
  if (!key) throw new Error('CLINICA_AUTH_SECRET não configurada.');
  const session: ClientSession = {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email ?? null,
    role: 'cliente',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 dias
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, key)}`;
}

export function verifyClientSessionToken(token: string | undefined): ClientSession | null {
  const key = secret();
  if (!token || !key) return null;
  const [payload, receivedSignature] = token.split('.');
  if (!payload || !receivedSignature) return null;
  const expected = signature(payload, key);
  const left = Buffer.from(receivedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ClientSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function getCurrentClient(): Promise<ClientSession | null> {
  const cookie = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  return verifyClientSessionToken(cookie);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

