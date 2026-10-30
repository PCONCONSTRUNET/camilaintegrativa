import { getCurrentUser } from '@/lib/auth';
import { getProntuario } from '@/lib/repository';
import { buildAnamnesePdf, pdfResponse } from '@/lib/anamnese-pdf';

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;
  const data = await getProntuario(clientId, { userId: user.userId, name: user.name });
  if (!data || !data.record) {
    return Response.json({ error: 'Ficha não encontrada.' }, { status: 404 });
  }

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
    consentAgreedAt: r.consentAgreedAt ?? null,
  });

  const download = new URL(request.url).searchParams.get('download') === '1';
  return pdfResponse(bytes, 'ficha-anamnese.pdf', download);
}

