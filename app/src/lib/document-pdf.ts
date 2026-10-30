import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type DocumentPdfInput = {
  title: string;
  typeLabel: string;
  status: string;
  content: string | null;
  signedAt: string | null;
  createdAt: string;
  clientName: string;
  clientCpf: string | null;
};

const NAVY = rgb(0.102, 0.227, 0.29);
const GOLD = rgb(0.722, 0.537, 0.165);
const GRAY = rgb(0.39, 0.45, 0.5);

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

function fmt(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

const STATUS_LABEL: Record<string, string> = {
  assinado: 'Assinado',
  pendente_assinatura: 'Pendente de assinatura',
  ativo: 'Ativo',
  arquivado: 'Arquivado',
};

export async function buildDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(input.title));
  pdf.setAuthor('Camila Machado - Hipnose Clínica Multidimensional Integrativa');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(
    await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png')),
  );

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const contentWidth = W - M * 2;

  const drawHeader = (p: PDFPage) => {
    const lw = 170;
    const lh = (logo.height / logo.width) * lw;
    p.drawImage(logo, { x: (W - lw) / 2, y: H - M - lh + 10, width: lw, height: lh });
    return H - M - lh - 8;
  };

  let page = pdf.addPage([W, H]);
  let y = drawHeader(page);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: GOLD });
  y -= 30;

  const title = clean(input.title);
  for (const line of wrapParagraphs(title, bold, 16, contentWidth)) {
    page.drawText(line, { x: (W - bold.widthOfTextAtSize(line, 16)) / 2, y, size: 16, font: bold, color: NAVY });
    y -= 20;
  }
  y -= 6;

  const meta = [
    `Tipo: ${input.typeLabel}`,
    `Status: ${STATUS_LABEL[input.status] ?? input.status}`,
    `Cliente: ${input.clientName}${input.clientCpf ? ` (CPF ${input.clientCpf})` : ''}`,
    `Criado em: ${fmt(input.createdAt)}`,
    ...(input.signedAt ? [`Assinado em: ${fmt(input.signedAt)} (horário de Brasília)`] : []),
  ];
  for (const m of meta) {
    page.drawText(clean(m), { x: M, y, size: 10, font: regular, color: GRAY });
    y -= 15;
  }
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.93, 0.89, 0.84) });
  y -= 22;

  const body = input.content?.trim() || 'Documento sem conteúdo textual. Consulte os arquivos anexados no prontuário.';
  for (const line of wrapParagraphs(body, regular, 11, contentWidth)) {
    if (y < M + 50) {
      page = pdf.addPage([W, H]);
      y = drawHeader(page) - 20;
    }
    if (line) page.drawText(line, { x: M, y, size: 11, font: regular, color: NAVY });
    y -= 16;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const footer = clean(
      `Camila Machado - Hipnose Clínica Multidimensional Integrativa  |  Documento confidencial (LGPD)  |  Página ${i + 1} de ${pages.length}`,
    );
    p.drawText(footer, {
      x: (W - regular.widthOfTextAtSize(footer, 8)) / 2,
      y: M - 14,
      size: 8,
      font: regular,
      color: GRAY,
    });
  });

  return pdf.save();
}
