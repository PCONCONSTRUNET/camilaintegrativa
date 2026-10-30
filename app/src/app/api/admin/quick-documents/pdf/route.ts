import { getCurrentUser } from '@/lib/auth';
import {
  buildDeclaracaoPdf,
  buildReciboPdf,
  buildTermoConsentimentoPdf,
} from '@/lib/quick-documents-pdf';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const docType = body.type as 'declaracao' | 'recibo' | 'termo';
    let bytes: Uint8Array;
    let filename = 'documento.pdf';

    if (docType === 'declaracao') {
      bytes = await buildDeclaracaoPdf({
        clientName: body.clientName || 'Paciente',
        clientCpf: body.clientCpf || null,
        date: body.date || new Date().toISOString().slice(0, 10),
        startTime: body.startTime || '14:00',
        endTime: body.endTime || '15:00',
        serviceName: body.serviceName || 'Atendimento Terapêutico',
        notes: body.notes || null,
      });
      filename = `declaracao-${(body.clientName || 'paciente').toLowerCase().replace(/\s+/g, '-')}.pdf`;
    } else if (docType === 'recibo') {
      bytes = await buildReciboPdf({
        clientName: body.clientName || 'Paciente',
        clientCpf: body.clientCpf || null,
        amountCents: Number(body.amountCents || 0),
        paymentMethod: body.paymentMethod || 'PIX',
        serviceName: body.serviceName || 'Hipnose Clínica Integrativa',
        sessionDate: body.sessionDate || body.date || null,
        paymentDate: body.paymentDate || body.date || null,
        receiptNumber: body.receiptNumber || null,
        notes: body.notes || null,
      });
      filename = `recibo-${(body.clientName || 'paciente').toLowerCase().replace(/\s+/g, '-')}.pdf`;
    } else if (docType === 'termo') {
      bytes = await buildTermoConsentimentoPdf({
        clientName: body.clientName || 'Paciente',
        clientCpf: body.clientCpf || null,
        clientBirthDate: body.clientBirthDate || null,
        clientPhone: body.clientPhone || null,
        serviceName: body.serviceName || null,
        date: body.date || null,
      });
      filename = `termo-consentimento-${(body.clientName || 'paciente').toLowerCase().replace(/\s+/g, '-')}.pdf`;
    } else {
      return Response.json({ error: 'Tipo de documento inválido.' }, { status: 400 });
    }

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[quick-documents/pdf] Error:', err);
    return Response.json({ error: 'Erro ao gerar documento PDF.' }, { status: 500 });
  }
}

