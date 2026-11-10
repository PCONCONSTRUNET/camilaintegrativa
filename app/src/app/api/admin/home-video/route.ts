import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  addClinicHomeVideoItem,
  deleteClinicHomeVideoItem,
  getClinicHomeVideoSection,
  saveClinicHomeVideoSettings,
  updateClinicHomeVideoItem,
} from '@/lib/home-video';
import { createPresignedVideoUploadUrl } from '@/lib/r2-storage';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const section = await getClinicHomeVideoSection();
    return NextResponse.json({ section });
  } catch (error) {
    console.error('[admin/home-video] Erro no GET:', error);
    return NextResponse.json(
      { error: 'Não foi possível carregar os vídeos da Home.' },
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

    if (body?.action === 'add_video') {
      const section = await addClinicHomeVideoItem({
        title: body.title,
        subtitle: body.subtitle,
        videoUrl: String(body.videoUrl || ''),
        videoName: body.videoName,
        videoSize: body.videoSize,
        published: body.published !== false,
      });
      return NextResponse.json({ section });
    }

    if (body?.action === 'update_video') {
      const section = await updateClinicHomeVideoItem(String(body.id || ''), {
        title: body.title,
        subtitle: body.subtitle,
        published: body.published,
        displayOrder: body.displayOrder,
      });
      return NextResponse.json({ section });
    }

    const section = await saveClinicHomeVideoSettings({
      enabled: body.enabled,
      sectionTitle: body.sectionTitle ?? body.title,
      sectionSubtitle: body.sectionSubtitle ?? body.subtitle,
    });

    return NextResponse.json({ section });
  } catch (error) {
    console.error('[admin/home-video] Erro no POST:', error);
    return NextResponse.json(
      {
        error: 'Não foi possível salvar os vídeos da Home.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id') || '';
    if (!id) {
      return NextResponse.json({ error: 'Informe o ID do vídeo.' }, { status: 400 });
    }

    const section = await deleteClinicHomeVideoItem(id);
    return NextResponse.json({ section });
  } catch (error) {
    console.error('[admin/home-video] Erro no DELETE:', error);
    return NextResponse.json(
      { error: 'Não foi possível remover o vídeo.' },
      { status: 500 }
    );
  }
}
