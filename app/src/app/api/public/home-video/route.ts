import { NextResponse } from 'next/server';
import { getClinicHomeVideoSection } from '@/lib/home-video';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const section = await getClinicHomeVideoSection();
    return NextResponse.json(
      {
        section: {
          ...section,
          videos: section.videos.filter((v) => v.published && v.videoUrl),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[public/home-video] Erro ao carregar vídeos da Home:', error);
    return NextResponse.json({ section: null }, { status: 200 });
  }
}
