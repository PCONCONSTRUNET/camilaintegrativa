import { NextResponse } from 'next/server';
import { createClientSessionToken, CLIENT_SESSION_COOKIE } from '@/lib/auth';
import { authenticateClientAccount } from '@/lib/repository';
import { recordAuditLog, extractClientMetadata } from '@/lib/audit';

export async function POST(request: Request) {
  const { ip, userAgent } = extractClientMetadata(request);
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

    // Registro na trilha de auditoria
    await recordAuditLog({
      actorType: 'paciente',
      actorId: client.id,
      actorName: client.name,
      category: 'acesso_login',
      action: 'login_portal_paciente',
      title: 'Acesso ao Portal do Paciente',
      description: `Paciente ${client.name} fez login com sucesso no Portal do Paciente.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: { clientId: client.id, email: client.email, phone: client.phone },
    }).catch(() => null);

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
