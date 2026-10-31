import { NextResponse } from 'next/server';
import { runScheduledAdminAlertsScan } from '@/lib/admin-push-alerts';

export async function GET(request: Request) {
  try {
    const result = await runScheduledAdminAlertsScan();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao escanear alertas.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

