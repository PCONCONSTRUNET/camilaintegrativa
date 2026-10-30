import { NextResponse } from 'next/server';
import { createClientSessionToken, CLIENT_SESSION_COOKIE } from '@/lib/auth';
import { authenticateClientAccount } from '@/lib/repository';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { identifier, password } = body ?? {};

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return NextResponse.json({ error: 'Informe seu WhatsApp ou E-mail cadastrado.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Informe sua senha de acesso.' }, { status: 400 });
    }

    const client = await authenticateClientAccount(identifier.trim(), password);
    const token = createClientSessionToken(client);
    const response = NextResponse.json({ ok: true, client });

    response.cookies.set(CLIENT_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 dias
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Não foi possível autenticar.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
