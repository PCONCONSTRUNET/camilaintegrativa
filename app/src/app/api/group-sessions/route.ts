import { NextResponse } from 'next/server';
import { listGroupSessions } from '@/lib/repository';

export async function GET() {
  const sessions = await listGroupSessions({ status: 'ativo', published: true });
  return NextResponse.json({ sessions });
}

