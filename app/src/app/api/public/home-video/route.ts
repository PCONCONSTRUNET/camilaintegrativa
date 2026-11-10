import { NextResponse } from 'next/server';
import { getClinicHomeVideo } from '@/lib/home-video';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const video = await getClinicHomeVideo();
    return NextResponse.json(
      { video },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[public/home-video] Erro ao carregar vídeo da Home:', error);
    return NextResponse.json({ video: null }, { status: 200 });
  }
}
