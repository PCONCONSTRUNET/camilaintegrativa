import { getCurrentClient } from '@/lib/auth';
import { getClientPortalData } from '@/lib/repository';
import { buildAnamnesePdf, pdfResponse } from '@/lib/anamnese-pdf';

export async function GET(request: Request) {
  const session = await getCurrentClient();
  if (!session) return Response.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });

  const data = await getClientPortalData(session.clientId);
  const a = data.anamnese;
  if (!a || !a.isCompleted) {
    return Response.json({ error: 'A ficha de anamnese ainda não foi preenchida.' }, { status: 404 });
  }

  const bytes = await buildAnamnesePdf({
    fullName: data.client.name,
    cpf: a.cpf,
    rg: a.rg,
    birthDate: a.birthDate,
    emergencyContactName: a.emergencyContactName ?? data.client.emergencyContactName,
    emergencyContactPhone: a.emergencyContactPhone ?? data.client.emergencyContactPhone,
    emergencyContactRelationship: a.emergencyContactRelationship ?? data.client.emergencyContactRelationship,
    consultationReason: a.consultationReason,
    hasHealthConditions: a.hasHealthConditions,
    healthConditionsDetails: a.healthConditionsDetails,
    hasPsychCare: a.hasPsychCare,
    psychCareDetails: a.psychCareDetails,
    epilepsyHistory: a.hasEpilepsyHistory,
    consentAgreed: a.consentAgreed,
    consentAgreedAt: a.consentAgreedAt,
  });

  const download = new URL(request.url).searchParams.get('download') === '1';
  return pdfResponse(bytes, 'ficha-anamnese-camila-machado.pdf', download);
}

