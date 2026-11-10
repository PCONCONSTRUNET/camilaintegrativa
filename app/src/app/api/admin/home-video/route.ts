import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getClinicHomeVideo,
  removeClinicHomeVideoFile,
  saveClinicHomeVideo,
} from '@/lib/home-video';
import { createPresignedVideoUploadUrl } from '@/lib/r2-storage';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const video = await getClinicHomeVideo();
    return NextResponse.json({ video });
  } catch (error) {
    console.error('[admin/home-video] Erro no GET:', error);
    return NextResponse.json(
      { error: 'Não foi possível carregar as configurações do vídeo da Home.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    if (body?.action === 'presign') {
      const fileName = String(body.fileName || 'video.mp4');
      const mimeType = String(body.mimeType || 'video/mp4');
      const presigned = await createPresignedVideoUploadUrl(fileName, mimeType);
      return NextResponse.json(presigned);
    }

    const video = await saveClinicHomeVideo({
      enabled: body.enabled,
      title: body.title,
      subtitle: body.subtitle,
      videoUrl: body.videoUrl,
      videoName: body.videoName,
      videoSize: body.videoSize,
      posterUrl: body.posterUrl,
      orientation: body.orientation,
    });

    return NextResponse.json({ video });
  } catch (error) {
    console.error('[admin/home-video] Erro no POST:', error);
    return NextResponse.json(
      {
        error: 'Não foi possível salvar o vídeo da Home.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const video = await removeClinicHomeVideoFile();
    return NextResponse.json({ video });
  } catch (error) {
    console.error('[admin/home-video] Erro no DELETE:', error);
    return NextResponse.json(
      { error: 'Não foi possível remover o vídeo.' },
      { status: 500 }
    );
  }
}
