import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadDocumentToR2 } from '@/lib/r2-storage';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'prontuarios';

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const targetFolder = folder === 'anotacoes' ? 'anotacoes' : 'prontuarios';
    const result = await uploadDocumentToR2(
      buffer,
      file.name,
      file.type || 'application/octet-stream',
      targetFolder
    );

    return NextResponse.json({
      success: true,
      url: result.url,
      name: file.name,
      size: result.size,
      mimeType: file.type || 'application/octet-stream',
    });
  } catch (error) {
    console.error('Erro no upload para Cloudflare R2:', error);
    return NextResponse.json(
      {
        error: 'Falha ao salvar documento no Cloudflare R2',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

