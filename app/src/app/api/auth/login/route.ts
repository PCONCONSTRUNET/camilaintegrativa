import { NextResponse } from 'next/server';
import { createSessionToken, credentialsAreValid, SESSION_COOKIE } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    if (!credentialsAreValid(input.email, input.password)) {
      return Response.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
    }
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
