import { NextResponse } from 'next/server';
import { createSessionToken, credentialsAreValid, SESSION_COOKIE } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';
import { recordAuditLog, extractClientMetadata } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const { ip, userAgent } = extractClientMetadata(request);

    if (!credentialsAreValid(input.email, input.password)) {
      await recordAuditLog({
        actorType: 'sistema',
        actorName: input.email || 'Usuário Desconhecido',
        category: 'seguranca',
        action: 'falha_login_admin',
        title: 'Tentativa de Login Falhou',
        description: `Tentativa de login com credenciais incorretas para o e-mail: ${input.email}.`,
        ipAddress: ip,
        userAgent,
        severity: 'aviso',
        details: { email: input.email },
      }).catch(() => null);
      return Response.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
    }

    await recordAuditLog({
      actorType: 'admin',
      actorName: 'Camila Machado (Administradora)',
      category: 'acesso_login',
      action: 'login_sucesso_admin',
      title: 'Login Administrativo Realizado',
      description: `Autenticação bem-sucedida no Painel da Clínica para ${input.email}.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: { email: input.email },
    }).catch(() => null);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
