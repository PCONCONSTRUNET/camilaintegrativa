import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { PROFESSIONAL_INFO } from '@/lib/domain';

const NAVY = rgb(0.102, 0.227, 0.29);
const GOLD = rgb(0.722, 0.537, 0.165);
const GRAY = rgb(0.39, 0.45, 0.5);
const DARK = rgb(0.09, 0.12, 0.15);

function clean(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '');
}

function wrapParagraphs(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function numberToCurrencyWords(amountCents: number): string {
  const reais = Math.floor(amountCents / 100);
  const centavos = amountCents % 100;

  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dezenasEspeciais: Record<number, string> = {
    10: 'dez',
    11: 'onze',
    12: 'doze',
    13: 'treze',
    14: 'quatorze',
    15: 'quinze',
    16: 'dezesseis',
    17: 'dezessete',
    18: 'dezoito',
    19: 'dezenove',
  };
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function trioParaExtenso(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'cem';
    const c = Math.floor(num / 100);
    const d = Math.floor((num % 100) / 10);
    const u = num % 10;
    const partes: string[] = [];
    if (c > 0) partes.push(centenas[c]);
    const resto = num % 100;
    if (resto >= 10 && resto <= 19) {
      partes.push(dezenasEspeciais[resto]);
    } else {
      if (d > 0) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(' e ');
  }

  let textoReais = '';
  if (reais === 0) {
    textoReais = 'zero reais';
  } else if (reais === 1) {
    textoReais = 'um real';
  } else if (reais < 1000) {
    textoReais = `${trioParaExtenso(reais)} reais`;
  } else if (reais < 1000000) {
    const milhar = Math.floor(reais / 1000);
    const resto = reais % 1000;
    const txtMilhar = milhar === 1 ? 'um mil' : `${trioParaExtenso(milhar)} mil`;
    if (resto === 0) {
      textoReais = `${txtMilhar} reais`;
    } else if (resto < 100 || resto % 100 === 0) {
      textoReais = `${txtMilhar} e ${trioParaExtenso(resto)} reais`;
    } else {
      textoReais = `${txtMilhar}, ${trioParaExtenso(resto)} reais`;
    }
  } else {
    textoReais = `${reais.toLocaleString('pt-BR')} reais`;
  }

  if (centavos > 0) {
    const txtCentavos = centavos === 1 ? 'um centavo' : `${trioParaExtenso(centavos)} centavos`;
    return `${textoReais} e ${txtCentavos}`;
  }
  return textoReais;
}

export type DeclaracaoInput = {
  clientName: string;
  clientCpf?: string | null;
  date: string; // YYYY-MM-DD or DD/MM/YYYY
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  serviceName?: string | null;
  notes?: string | null;
};

export type ReciboInput = {
  clientName: string;
  clientCpf?: string | null;
  amountCents: number;
  paymentMethod: string;
  serviceName: string;
  sessionDate?: string | null;
  paymentDate?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
};

export type TermoConsentimentoInput = {
  clientName: string;
  clientCpf?: string | null;
  clientBirthDate?: string | null;
  clientPhone?: string | null;
  serviceName?: string | null;
  date?: string | null;
};

function formatPtBrDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
  }
  const cleanStr = isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T12:00:00Z`;
  const d = new Date(cleanStr);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(d);
}

function formatShortDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
  }
  const cleanStr = isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T12:00:00Z`;
  const d = new Date(cleanStr);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d);
}

async function createBaseDocument() {
  const pdf = await PDFDocument.create();
  pdf.setAuthor('Camila Machado - Hipnose Clínica Integrativa');
  pdf.setCreator('Clínica Camila Machado');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let logoImage = null;
  try {
    const logoBytes = await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png'));
    logoImage = await pdf.embedPng(logoBytes);
  } catch {
    // fallback if logo missing
  }

  const W = 595.28; // A4
  const H = 841.89;
  const M = 48;
  const contentWidth = W - M * 2;

  const drawHeader = (page: PDFPage, docTitle: string) => {
    let topY = H - 36;
    if (logoImage) {
      const lw = 150;
      const lh = (logoImage.height / logoImage.width) * lw;
      page.drawImage(logoImage, { x: (W - lw) / 2, y: topY - lh, width: lw, height: lh });
      topY = topY - lh - 10;
    } else {
      const clinicName = 'CLÍNICA CAMILA MACHADO';
      page.drawText(clean(clinicName), {
        x: (W - bold.widthOfTextAtSize(clinicName, 14)) / 2,
        y: topY,
        size: 14,
        font: bold,
        color: NAVY,
      });
      topY -= 20;
    }

    const sub = clean(`${PROFESSIONAL_INFO.title} • ${PROFESSIONAL_INFO.credentialCode}`);
    page.drawText(sub, {
      x: (W - regular.widthOfTextAtSize(sub, 8.5)) / 2,
      y: topY,
      size: 8.5,
      font: regular,
      color: GRAY,
    });
    topY -= 12;

    page.drawLine({ start: { x: M, y: topY }, end: { x: W - M, y: topY }, thickness: 1.5, color: GOLD });
    topY -= 26;

    const t = clean(docTitle.toUpperCase());
    page.drawText(t, {
      x: (W - bold.widthOfTextAtSize(t, 14)) / 2,
      y: topY,
      size: 14,
      font: bold,
      color: NAVY,
    });
    topY -= 24;

    return topY;
  };

  const drawFooterAndSignatures = (page: PDFPage, options?: { showClientSignature?: boolean; clientName?: string }) => {
    let signY = 120;
    if (options?.showClientSignature) {
      // Duas assinaturas lado a lado
      const halfW = (contentWidth - 30) / 2;
      const x1 = M;
      const x2 = M + halfW + 30;

      // Paciente
      page.drawLine({ start: { x: x1, y: signY }, end: { x: x1 + halfW, y: signY }, thickness: 0.8, color: GRAY });
      const cLabel = clean(options.clientName || 'Assinatura do(a) Paciente / Responsável');
      page.drawText(cLabel, {
        x: x1 + (halfW - regular.widthOfTextAtSize(cLabel, 8.5)) / 2,
        y: signY - 14,
        size: 8.5,
        font: regular,
        color: DARK,
      });

      // Profissional
      page.drawLine({ start: { x: x2, y: signY }, end: { x: x2 + halfW, y: signY }, thickness: 0.8, color: GRAY });
      const pLabel = clean(PROFESSIONAL_INFO.name);
      const pCred = clean(PROFESSIONAL_INFO.credentialCode);
      page.drawText(pLabel, {
        x: x2 + (halfW - bold.widthOfTextAtSize(pLabel, 9)) / 2,
        y: signY - 14,
        size: 9,
        font: bold,
        color: NAVY,
      });
      page.drawText(pCred, {
        x: x2 + (halfW - regular.widthOfTextAtSize(pCred, 8)) / 2,
        y: signY - 26,
        size: 8,
        font: regular,
        color: GRAY,
      });
    } else {
      // Apenas assinatura da profissional centralizada
      const lineWidth = 220;
      const lineX = (W - lineWidth) / 2;
      page.drawLine({ start: { x: lineX, y: signY }, end: { x: lineX + lineWidth, y: signY }, thickness: 0.9, color: GRAY });

      const pLabel = clean(PROFESSIONAL_INFO.name);
      page.drawText(pLabel, {
        x: (W - bold.widthOfTextAtSize(pLabel, 10)) / 2,
        y: signY - 16,
        size: 10,
        font: bold,
        color: NAVY,
      });

      const pTitle = clean(PROFESSIONAL_INFO.title);
      page.drawText(pTitle, {
        x: (W - regular.widthOfTextAtSize(pTitle, 8)) / 2,
        y: signY - 28,
        size: 8,
        font: regular,
        color: GRAY,
      });

      const pCred = clean(`${PROFESSIONAL_INFO.credentialCode} • ${PROFESSIONAL_INFO.society}`);
      page.drawText(pCred, {
        x: (W - regular.widthOfTextAtSize(pCred, 7.5)) / 2,
        y: signY - 39,
        size: 7.5,
        font: regular,
        color: GRAY,
      });
    }

    // Rodapé legal
    const footerText = clean(
      `${PROFESSIONAL_INFO.name} • ${PROFESSIONAL_INFO.city} • Documento Clínico Emitido Digitalmente`
    );
    page.drawText(footerText, {
      x: (W - regular.widthOfTextAtSize(footerText, 7.5)) / 2,
      y: 28,
      size: 7.5,
      font: regular,
      color: GRAY,
    });
  };

  return { pdf, regular, bold, italic, W, H, M, contentWidth, drawHeader, drawFooterAndSignatures };
}

// ============================================================================
// 1. DECLARAÇÃO DE COMPARECIMENTO / ATESTADO
// ============================================================================
export async function buildDeclaracaoPdf(input: DeclaracaoInput): Promise<Uint8Array> {
  const { pdf, regular, bold, W, M, contentWidth, drawHeader, drawFooterAndSignatures } = await createBaseDocument();
  pdf.setTitle(`Declaração de Comparecimento - ${clean(input.clientName)}`);

  const page = pdf.addPage([W, 841.89]);
  let y = drawHeader(page, 'Declaração de Comparecimento');

  const dataExtenso = formatPtBrDate(input.date);
  const dataCurta = formatShortDate(input.date);
  const cpfText = input.clientCpf ? `, portador(a) do CPF nº ${input.clientCpf}` : '';
  const serviceText = input.serviceName ? ` (${input.serviceName})` : '';

  const textoPrincipal =
    `Declaro para os devidos fins de comprovação que o(a) Sr.(a) ${input.clientName.trim()}${cpfText}, ` +
    `compareceu a este consultório no dia ${dataCurta}, no período compreendido entre ${input.startTime} e ${input.endTime}, ` +
    `para realização de atendimento terapêutico integrativo especializado${serviceText}.`;

  for (const line of wrapParagraphs(textoPrincipal, regular, 11.5, contentWidth)) {
    page.drawText(line, { x: M, y, size: 11.5, font: regular, color: DARK });
    y -= 20;
  }

  y -= 10;

  if (input.notes && input.notes.trim()) {
    page.drawText('Observações clínicas complementares:', { x: M, y, size: 10, font: bold, color: NAVY });
    y -= 16;
    for (const line of wrapParagraphs(input.notes.trim(), regular, 10, contentWidth)) {
      page.drawText(line, { x: M, y, size: 10, font: regular, color: DARK });
      y -= 15;
    }
    y -= 10;
  }

  const finalidade = 'Por ser a expressão da verdade, firmo a presente declaração para que produza os efeitos legais cabíveis.';
  for (const line of wrapParagraphs(finalidade, regular, 11, contentWidth)) {
    page.drawText(line, { x: M, y, size: 11, font: regular, color: DARK });
    y -= 18;
  }

  y -= 25;
  const localData = `${PROFESSIONAL_INFO.city}, ${dataExtenso}.`;
  page.drawText(clean(localData), { x: M, y, size: 10.5, font: regular, color: NAVY });

  drawFooterAndSignatures(page);

  return pdf.save();
}

// ============================================================================
// 2. RECIBO PARA REEMBOLSO / IRPF (TIMBRADO COM CRT-SBHP)
// ============================================================================
export async function buildReciboPdf(input: ReciboInput): Promise<Uint8Array> {
  const { pdf, regular, bold, W, M, contentWidth, drawHeader, drawFooterAndSignatures } = await createBaseDocument();
  pdf.setTitle(`Recibo Terapêutico - ${clean(input.clientName)}`);

  const page = pdf.addPage([W, 841.89]);
  let y = drawHeader(page, 'Recibo de Pagamento de Honorários');

  // Box de Destaque com Valor
  const valorFormatado = (input.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const valorExtenso = numberToCurrencyWords(input.amountCents);

  // Moldura do Valor
  page.drawRectangle({
    x: M,
    y: y - 48,
    width: contentWidth,
    height: 52,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: GOLD,
    borderWidth: 1.5,
  });

  const valLabel = 'VALOR:';
  page.drawText(valLabel, { x: M + 16, y: y - 28, size: 10, font: bold, color: GRAY });
  page.drawText(valorFormatado, { x: M + 68, y: y - 30, size: 16, font: bold, color: NAVY });

  if (input.receiptNumber) {
    const rNum = clean(`Nº ${input.receiptNumber}`);
    page.drawText(rNum, { x: W - M - bold.widthOfTextAtSize(rNum, 10) - 16, y: y - 28, size: 10, font: bold, color: GRAY });
  }

  y -= 68;

  const cpfText = input.clientCpf ? `, inscrito(a) no CPF sob o nº ${input.clientCpf}` : '';
  const dataPagto = formatShortDate(input.paymentDate || input.sessionDate);

  const textoRecibo =
    `Recebi do(a) Sr.(a) ${input.clientName.trim()}${cpfText}, a importância de ${valorFormatado} ` +
    `(${valorExtenso}), referente à prestação de serviços de ${input.serviceName || 'Atendimento em Hipnose Clínica Integrativa'}, ` +
    `com quitação realizada via ${input.paymentMethod.toUpperCase()} na data de ${dataPagto}.`;

  for (const line of wrapParagraphs(textoRecibo, regular, 11, contentWidth)) {
    page.drawText(line, { x: M, y, size: 11, font: regular, color: DARK });
    y -= 19;
  }

  y -= 12;

  // Quadro de Dados do Prestador / Clínico
  page.drawRectangle({
    x: M,
    y: y - 76,
    width: contentWidth,
    height: 74,
    color: rgb(0.98, 0.99, 1.0),
    borderColor: rgb(0.85, 0.9, 0.95),
    borderWidth: 1,
  });

  const pBoxY = y - 18;
  page.drawText('DADOS DA PROFISSIONAL EMISSORA (CRT-SBHP/SC):', { x: M + 14, y: pBoxY, size: 8.5, font: bold, color: NAVY });
  page.drawText(`Profissional: ${PROFESSIONAL_INFO.name}`, { x: M + 14, y: pBoxY - 14, size: 9, font: bold, color: DARK });
  page.drawText(`Especialidade: ${PROFESSIONAL_INFO.title}`, { x: M + 14, y: pBoxY - 26, size: 8.5, font: regular, color: DARK });
  page.drawText(`Registro Profissional: ${PROFESSIONAL_INFO.credentialCode} • ${PROFESSIONAL_INFO.society}`, { x: M + 14, y: pBoxY - 38, size: 8.5, font: regular, color: DARK });
  page.drawText(`Finalidade: Válido para fins de declaração no Imposto de Renda (IRPF) e solicitação de reembolso.`, { x: M + 14, y: pBoxY - 50, size: 8, font: regular, color: GRAY });

  y -= 100;

  if (input.notes && input.notes.trim()) {
    page.drawText(`Observação: ${clean(input.notes.trim())}`, { x: M, y, size: 9, font: regular, color: GRAY });
    y -= 20;
  }

  const dataExtenso = formatPtBrDate(input.paymentDate || input.sessionDate);
  const localData = `${PROFESSIONAL_INFO.city}, ${dataExtenso}.`;
  page.drawText(clean(localData), { x: M, y, size: 10.5, font: regular, color: NAVY });

  drawFooterAndSignatures(page);

  return pdf.save();
}

// ============================================================================
// 3. TERMO DE CONSENTIMENTO LIVRE, ESCLARECIDO & SIGILO (LGPD)
// ============================================================================
export async function buildTermoConsentimentoPdf(input: TermoConsentimentoInput): Promise<Uint8Array> {
  const { pdf, regular, bold, W, M, contentWidth, drawHeader, drawFooterAndSignatures } = await createBaseDocument();
  pdf.setTitle(`Termo de Consentimento e Sigilo - ${clean(input.clientName)}`);

  const page = pdf.addPage([W, 841.89]);
  let y = drawHeader(page, 'Termo de Consentimento e Sigilo Terapêutico (LGPD)');

  // Identificação do Paciente
  const cpfStr = input.clientCpf ? `  |  CPF: ${input.clientCpf}` : '';
  const nascStr = input.clientBirthDate ? `  |  Nascimento: ${formatShortDate(input.clientBirthDate)}` : '';
  const foneStr = input.clientPhone ? `  |  Tel: ${input.clientPhone}` : '';

  const idText = `Paciente: ${input.clientName}${cpfStr}${nascStr}${foneStr}`;
  page.drawText(clean(idText), { x: M, y, size: 9.5, font: bold, color: NAVY });
  y -= 18;

  const clausulas = [
    {
      titulo: '1. NATUREZA DO ATENDIMENTO TERAPÊUTICO',
      texto:
        'A Hipnose Clínica Multidimensional Integrativa e as Práticas Integrativas são abordagens terapêuticas ' +
        'complementares voltadas ao bem-estar emocional, autoconhecimento e alívio de queixas psicossomáticas, ' +
        'não substituindo tratamentos médicos, psiquiátricos ou farmacológicos previamente prescritos.',
    },
    {
      titulo: '2. SIGILO PROFISSIONAL E CONFIDENCIALIDADE',
      texto:
        'Todas as informações compartilhadas durante as sessões, incluindo registros em prontuário e anotações clínicas, ' +
        'são estritamente confidenciais e protegidas pelo sigilo profissional terapêutico, ressalvadas as hipóteses legais.',
    },
    {
      titulo: '3. PROTEÇÃO DE DADOS PESSOAIS (LGPD - LEI Nº 13.709/2018)',
      texto:
        'O(A) paciente autoriza expressamente a coleta, armazenamento seguro e tratamento de seus dados cadastrais ' +
        'e de saúde exclusivamente para fins de acompanhamento clínico, evolução terapêutica e gestão administrativa da clínica.',
    },
    {
      titulo: '4. PARTICIPAÇÃO VOLUNTÁRIA E POLÍTICA DE SESSÕES',
      texto:
        'O(A) paciente declara estar ciente de que o processo terapêutico é colaborativo e exige participação ativa. ' +
        'Cancelamentos ou reagendamentos devem ser comunicados com antecedência mínima estipulada pelas regras da clínica.',
    },
  ];

  for (const c of clausulas) {
    page.drawText(clean(c.titulo), { x: M, y, size: 9, font: bold, color: NAVY });
    y -= 13;
    for (const line of wrapParagraphs(c.texto, regular, 8.8, contentWidth)) {
      page.drawText(line, { x: M, y, size: 8.8, font: regular, color: DARK });
      y -= 13;
    }
    y -= 6;
  }

  y -= 8;
  const declFinal =
    'Declaro que li, compreendi e concordo integralmente com os termos deste consentimento livre e esclarecido, ' +
    'autorizando o início ou continuidade do processo terapêutico.';
  for (const line of wrapParagraphs(declFinal, regular, 9.2, contentWidth)) {
    page.drawText(line, { x: M, y, size: 9.2, font: bold, color: NAVY });
    y -= 14;
  }

  y -= 14;
  const dataExtenso = formatPtBrDate(input.date);
  const localData = `${PROFESSIONAL_INFO.city}, ${dataExtenso}.`;
  page.drawText(clean(localData), { x: M, y, size: 9.5, font: regular, color: DARK });

  drawFooterAndSignatures(page, {
    showClientSignature: true,
    clientName: input.clientName,
  });

  return pdf.save();
}

