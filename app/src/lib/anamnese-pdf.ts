import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type AnamnesePdfInput = {
  fullName: string;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  consultationReason: string | null;
  hasHealthConditions: boolean;
  healthConditionsDetails: string | null;
  hasPsychCare: boolean;
  psychCareDetails: string | null;
  epilepsyHistory?: boolean;
  consentAgreed: boolean;
  consentAgreedAt: string | null;
};

const NAVY = rgb(0.102, 0.227, 0.29);
const GOLD = rgb(0.722, 0.537, 0.165);
const GRAY = rgb(0.39, 0.45, 0.5);
const LIGHT = rgb(0.93, 0.89, 0.84);

/** Remove caracteres fora do WinAnsi (fontes padrão do PDF). */
function clean(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '')
    .replace(/\r?\n/g, ' ');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function formatBirth(value: string | null) {
  if (!value) return 'Não informado';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Não registrado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export async function buildAnamnesePdf(input: AnamnesePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Ficha de Anamnese Digital - Hipnose Clínica');
  pdf.setAuthor('Camila Machado - Hipnose Clínica Multidimensional Integrativa');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png'));
  const logo = await pdf.embedPng(logoBytes);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawHeader(p: PDFPage) {
    const logoWidth = 170;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    p.drawImage(logo, {
      x: (pageWidth - logoWidth) / 2,
      y: pageHeight - margin - logoHeight + 10,
      width: logoWidth,
      height: logoHeight,
    });
    return pageHeight - margin - logoHeight - 8;
  }

  y = drawHeader(page);
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1.2,
    color: GOLD,
  });
  y -= 30;

  const title = 'Ficha de Anamnese Digital - Hipnose Clínica';
  page.drawText(clean(title), {
    x: (pageWidth - bold.widthOfTextAtSize(clean(title), 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: NAVY,
  });
  y -= 18;
  const subtitle = 'Acolhimento e Histórico Clínico Integrativo';
  page.drawText(clean(subtitle), {
    x: (pageWidth - regular.widthOfTextAtSize(clean(subtitle), 10)) / 2,
    y,
    size: 10,
    font: regular,
    color: GRAY,
  });
  y -= 30;

  function ensureSpace(needed: number) {
    if (y - needed < margin + 40) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = drawHeader(page) - 20;
    }
  }

  function field(label: string, value: string) {
    const lines = wrap(value || 'Não informado', regular, 11, contentWidth - 16);
    ensureSpace(16 + lines.length * 15 + 14);
    page.drawText(clean(label), { x: margin, y, size: 9.5, font: bold, color: GOLD });
    y -= 15;
    for (const line of lines) {
      page.drawText(line, { x: margin + 8, y, size: 11, font: regular, color: NAVY });
      y -= 15;
    }
    y -= 8;
  }

  field('1. Nome completo', input.fullName);
  field('2. CPF', input.cpf || '');
  field('3. RG', input.rg || '');
  field('4. Data de nascimento', formatBirth(input.birthDate));

  const emergencyParts = [
    input.emergencyContactName?.trim(),
    input.emergencyContactPhone?.trim() ? `Tel: ${input.emergencyContactPhone.trim()}` : null,
    input.emergencyContactRelationship?.trim() ? `(${input.emergencyContactRelationship.trim()})` : null,
  ].filter(Boolean);
  field(
    'Contato de emergência',
    emergencyParts.length > 0 ? emergencyParts.join(' - ') : 'Não informado',
  );

  field('5. Qual o motivo da consulta?', input.consultationReason || 'Não informado');
  field(
    '6. Possui alguma condição de saúde ou utiliza medicamentos?',
    input.hasHealthConditions
      ? `Sim - ${input.healthConditionsDetails || 'sem detalhes informados'}`
      : 'Não',
  );
  field(
    '7. Faz acompanhamento psicológico ou psiquiátrico?',
    input.hasPsychCare
      ? `Sim${input.psychCareDetails ? ` - ${input.psychCareDetails}` : ''}`
      : 'Não',
  );
  field(
    'Histórico de epilepsia ou convulsão (triagem de segurança SBHP)',
    input.epilepsyHistory ? 'Sim - avaliar conduta antes de qualquer indução.' : 'Não',
  );
  field(
    '8. Está ciente e concorda com o atendimento?',
    input.consentAgreed
      ? 'Sim - o cliente declara estar ciente e concordar com o atendimento de Hipnose Clínica e autoriza o tratamento dos seus dados para fins terapêuticos (LGPD - Lei nº 13.709/2018).'
      : 'Pendente de assinatura.',
  );

  // Bloco de assinatura eletrônica
  const boxLines = input.consentAgreed
    ? [
        `Assinado por: ${input.fullName}`,
        `CPF: ${input.cpf || 'não informado'}`,
        `Data e horário: ${formatDateTime(input.consentAgreedAt)} (horário de Brasília)`,
        'Aceite eletrônico realizado pelo próprio cliente no Portal do Cliente.',
      ]
    : ['Documento ainda não assinado eletronicamente pelo cliente.'];

  const boxHeight = 34 + boxLines.length * 15;
  ensureSpace(boxHeight + 10);
  y -= 6;
  page.drawRectangle({
    x: margin,
    y: y - boxHeight,
    width: contentWidth,
    height: boxHeight,
    color: input.consentAgreed ? rgb(0.94, 0.99, 0.96) : rgb(1, 0.98, 0.92),
    borderColor: input.consentAgreed ? rgb(0.53, 0.88, 0.62) : GOLD,
    borderWidth: 1,
  });
  page.drawText(clean(input.consentAgreed ? 'ASSINADO ELETRONICAMENTE' : 'ASSINATURA PENDENTE'), {
    x: margin + 14,
    y: y - 20,
    size: 10.5,
    font: bold,
    color: input.consentAgreed ? rgb(0.08, 0.33, 0.18) : GOLD,
  });
  let by = y - 38;
  for (const line of boxLines) {
    const wrapped = wrap(line, regular, 10, contentWidth - 28);
    for (const w of wrapped) {
      page.drawText(w, { x: margin + 14, y: by, size: 10, font: regular, color: NAVY });
      by -= 15;
    }
  }

  // Rodapé em todas as páginas
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: margin },
      end: { x: pageWidth - margin, y: margin },
      thickness: 0.6,
      color: LIGHT,
    });
    const footer = `Camila Machado - Hipnose Clínica Multidimensional Integrativa  |  Documento confidencial (LGPD)  |  Página ${i + 1} de ${pages.length}`;
    p.drawText(clean(footer), {
      x: (pageWidth - regular.widthOfTextAtSize(clean(footer), 8)) / 2,
      y: margin - 14,
      size: 8,
      font: regular,
      color: GRAY,
    });
  });

  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

