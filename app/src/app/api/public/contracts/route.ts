import { NextRequest } from 'next/server';
import {
  getContractTemplate,
  getContractByToken,
  recordSignedContract,
  signPendingContractByToken,
} from '@/lib/contracts';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { errorResponse } from '@/lib/http';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim() || '';
    const template = await getContractTemplate();

    if (!token) {
      return Response.json({ template, contract: null });
    }

    const contract = await getContractByToken(token);
    if (!contract) {
      return Response.json(
        { error: 'Link de contrato não encontrado ou removido.', template, contract: null },
        { status: 404 }
      );
    }

    return Response.json({ template, contract });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const cleanCpf = String(body.cpf ?? '').replace(/\D/g, '');
    const cleanPhone = String(body.phone ?? '').replace(/\D/g, '');
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const serviceName = typeof body.serviceName === 'string' ? body.serviceName.trim() : '';
    const sessionDate = typeof body.sessionDate === 'string' ? body.sessionDate.trim() : '';
    const sessionTime = typeof body.sessionTime === 'string' ? body.sessionTime.trim() : '';
    const modality = typeof body.modality === 'string' ? body.modality.trim() : 'presencial';
    const accepted = Boolean(body.accepted);

    if (!accepted) {
      return Response.json(
        { error: 'É necessário concordar com os termos do contrato para assinar.' },
        { status: 400 }
      );
    }

    if (name.length < 3) {
      return Response.json({ error: 'Informe seu nome completo.' }, { status: 400 });
    }

    if (cleanCpf.length !== 11) {
      return Response.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 });
    }

    const { ip, userAgent } = extractClientMetadata(request);

    let contract;
    if (token) {
      const existing = await getContractByToken(token);
      if (!existing) {
        return Response.json({ error: 'Link de contrato não encontrado ou inválido.' }, { status: 404 });
      }
      if (existing.status === 'assinado') {
        return Response.json({ contract: existing, alreadySigned: true });
      }
      contract = await signPendingContractByToken(token, {
        clientName: name,
        clientCpf: cleanCpf,
        clientPhone: cleanPhone,
        clientEmail: email,
        serviceName: serviceName || existing.serviceName,
        sessionDate: sessionDate || existing.sessionDate,
        sessionTime: sessionTime || existing.sessionTime,
        modality: modality || existing.modality,
        ipAddress: ip,
        userAgent,
      });
    } else {
      contract = await recordSignedContract({
        origin: 'avulso',
        clientName: name,
        clientCpf: cleanCpf,
        clientPhone: cleanPhone,
        clientEmail: email,
        serviceName: serviceName || 'Atendimento Terapêutico',
        sessionDate: sessionDate || new Date().toISOString().slice(0, 10),
        sessionTime,
        modality,
        ipAddress: ip,
        userAgent,
      });
    }

    await recordAuditLog({
      actorType: 'paciente',
      actorId: contract.clientId,
      actorName: contract.clientName,
      category: 'consentimento_lgpd',
      action: 'assinatura_contrato_avulso',
      title: 'Contrato Assinado Eletronicamente (Avulso / WhatsApp)',
      description: `O(A) cliente ${contract.clientName} (CPF final ${contract.clientCpf.slice(-4)}) assinou o contrato "${contract.contractTitle}" via link externo.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: {
        contractId: contract.id,
        token: contract.token,
        origin: contract.origin,
        serviceName: contract.serviceName,
        sessionDate: contract.sessionDate,
        sessionTime: contract.sessionTime,
      },
    }).catch(() => null);

    return Response.json({ contract }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

