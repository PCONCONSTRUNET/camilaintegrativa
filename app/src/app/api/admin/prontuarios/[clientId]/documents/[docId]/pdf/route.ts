import { getCurrentUser } from '@/lib/auth';
import { getProntuario } from '@/lib/repository';
import { buildAnamnesePdf, pdfResponse } from '@/lib/anamnese-pdf';
import { buildDocumentPdf } from '@/lib/document-pdf';

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string; docId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId, docId } = await context.params;
  const data = await getProntuario(clientId, { userId: user.userId, name: user.name });
  const doc = data?.documents.find((d) => d.id === docId);
  if (!data || !doc) {
    return Response.json({ error: 'Documento não encontrado.' }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get('download') === '1';
  const safeName =
    doc.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() ||
    'documento';

  // Termo de consentimento + anamnese: gera a ficha completa
  if (doc.documentType === 'termo_consentimento' && data.record) {
    const r = data.record;
    const firstEc = r.emergencyContacts?.[0];
    const bytes = await buildAnamnesePdf({
      fullName: data.client.name,
      cpf: r.cpf ?? null,
      rg: r.rg ?? null,
      birthDate: r.birthDate ?? null,
      emergencyContactName: r.emergencyContactName ?? firstEc?.name ?? null,
      emergencyContactPhone: r.emergencyContactPhone ?? firstEc?.phone ?? null,
      emergencyContactRelationship: r.emergencyContactRelationship ?? firstEc?.relationship ?? null,
      consultationReason: r.consultationReason ?? r.chiefComplaint ?? null,
      hasHealthConditions: Boolean(r.hasHealthConditions),
      healthConditionsDetails: r.healthConditionsDetails ?? r.healthHistory ?? null,
      hasPsychCare: Boolean(r.hasPsychCare),
      psychCareDetails: r.psychCareDetails ?? null,
      epilepsyHistory: Boolean(r.epilepsyHistory),
      consentAgreed: Boolean(r.consentAgreed),
      consentAgreedAt: r.consentAgreedAt ?? doc.signedAt ?? null,
    });
    return pdfResponse(bytes, `${safeName}.pdf`, download);
  }

  const bytes = await buildDocumentPdf({
    title: doc.title,
    typeLabel: doc.documentTypeLabel || doc.documentType,
    status: doc.status,
    content: doc.content,
    signedAt: doc.signedAt,
    createdAt: doc.createdAt,
    clientName: data.client.name,
    clientCpf: data.record?.cpf ?? null,
  });
  return pdfResponse(bytes, `${safeName}.pdf`, download);
}
