import { NextResponse } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { anamneseDigitalSchema } from '@/lib/validation';
import { getClientPortalData, saveClientAnamneseDigital } from '@/lib/repository';

export async function GET() {
  try {
    const session = await getCurrentClient();
    if (!session) {
      return NextResponse.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });
    }

    const data = await getClientPortalData(session.clientId);
    return NextResponse.json({
      anamnese: data.anamnese,
      client: data.client,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar dados da anamnese.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentClient();
    if (!session) {
      return NextResponse.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });
    }

    const body = await request.json();
    const input = anamneseDigitalSchema.parse(body);

    await saveClientAnamneseDigital(session.clientId, input);

    return NextResponse.json({
      success: true,
      message: 'Ficha de anamnese salva e confirmada com sucesso!',
    });
  } catch (err: unknown) {
    console.error('[anamnese POST]', err);
    const message = err instanceof Error ? err.message : 'Dados inválidos para a anamnese.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

