import { NextResponse } from 'next/server';
import { createClientSessionToken, CLIENT_SESSION_COOKIE } from '@/lib/auth';
import { registerClientAccount } from '@/lib/repository';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email, password, cpf, birthDate } = body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return NextResponse.json({ error: 'Informe seu nome completo (mínimo 3 caracteres).' }, { status: 400 });
    }

    const cleanPhone = (phone ?? '').toString().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Informe um número de WhatsApp válido com DDD.' }, { status: 400 });
    }

    if (!cpf || typeof cpf !== 'string' || cpf.replace(/\D/g, '').length !== 11) {
      return NextResponse.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 });
    }

    if (!birthDate || typeof birthDate !== 'string') {
      return NextResponse.json({ error: 'Informe sua data de nascimento.' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@') || email.trim().length < 5) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    const client = await registerClientAccount({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : null,
      password,
      cpf: cpf.trim(),
      birthDate: birthDate.trim(),
    });

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
    const message = err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
