import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { GroupSession, GroupSessionEnrollment } from './domain';

const NAVY = rgb(0.102, 0.227, 0.29);     // #1a3a4a
const GOLD = rgb(0.722, 0.537, 0.165);    // #b8892a
const GRAY = rgb(0.39, 0.45, 0.5);        // #637380
const DARK = rgb(0.06, 0.09, 0.16);       // #0f172a
const LIGHT_BG = rgb(0.97, 0.98, 0.99);   // #f8fafc
const BORDER_COLOR = rgb(0.85, 0.88, 0.92); // #dbe1eb
const GREEN = rgb(0.08, 0.5, 0.24);       // #15803d

function clean(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '')
    .trim();
}

function formatDateBr(isoOrDateStr: string | null | undefined): string {
  if (!isoOrDateStr) return '-';
  const cleanStr = isoOrDateStr.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoOrDateStr;
}

function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return '-';
  const d = cpf.replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return cpf;
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.startsWith('55') && d.length === 13) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  return phone;
}

export type BuildGroupSessionPdfInput = {
  session: GroupSession;
  enrollments: GroupSessionEnrollment[];
  clinicName?: string;
  therapistName?: string;
};

export async function buildGroupSessionAttendancePdf(input: BuildGroupSessionPdfInput): Promise<Uint8Array> {
  const { session, enrollments } = input;
  const activeEnrollments = enrollments.filter((e) => e.status !== 'cancelado');
  const cancelledEnrollments = enrollments.filter((e) => e.status === 'cancelado');

  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`Lista de Presenca - ${session.title}`));
  pdf.setAuthor('Camila Machado - Espaco Terapeutico');

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let logoImage: any = null;
  try {
    const logoBuffer = await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png'));
    logoImage = await pdf.embedPng(logoBuffer);
  } catch {
    logoImage = null;
  }

  // A4 dimensions in points
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 36;
  const CONTENT_W = PAGE_W - MARGIN * 2; // 523.28

  const drawPageHeader = (p: PDFPage, isFirstPage: boolean) => {
    let curY = PAGE_H - MARGIN;

    if (isFirstPage && logoImage) {
      const lw = 150;
      const lh = (logoImage.height / logoImage.width) * lw;
      p.drawImage(logoImage, {
        x: (PAGE_W - lw) / 2,
        y: curY - lh + 8,
        width: lw,
        height: lh,
      });
      curY -= lh + 12;
    } else {
      p.drawText(clean('CAMILA MACHADO  |  HIPNOSE CLINICA INTEGRATIVA'), {
        x: MARGIN,
        y: curY,
        size: 9,
        font: fontBold,
        color: NAVY,
      });
      curY -= 14;
    }

    // Linha dourada
    p.drawLine({
      start: { x: MARGIN, y: curY },
      end: { x: PAGE_W - MARGIN, y: curY },
      thickness: 1.2,
      color: GOLD,
    });
    curY -= 18;

    return curY;
  };

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = drawPageHeader(page, true);

  // Titulo do Documento
  const docTitle = clean('LISTA OFICIAL DE PRESENCA & PARTICIPANTES');
  page.drawText(docTitle, {
    x: (PAGE_W - fontBold.widthOfTextAtSize(docTitle, 14)) / 2,
    y,
    size: 14,
    font: fontBold,
    color: NAVY,
  });
  y -= 16;

  const docSubtitle = clean('Sessao em Grupo Integrativa  -  Controle de Acesso e Assinaturas');
  page.drawText(docSubtitle, {
    x: (PAGE_W - fontRegular.widthOfTextAtSize(docSubtitle, 9)) / 2,
    y,
    size: 9,
    font: fontRegular,
    color: GRAY,
  });
  y -= 22;

  // Box com Informacoes da Sessao
  const infoBoxH = 88;
  page.drawRectangle({
    x: MARGIN,
    y: y - infoBoxH,
    width: CONTENT_W,
    height: infoBoxH,
    color: LIGHT_BG,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
  });

  const boxPadX = MARGIN + 12;
  let boxY = y - 16;

  // Linha 1: Nome da Sessao
  const titleClean = clean(session.title);
  page.drawText(clean('Sessao:'), { x: boxPadX, y: boxY, size: 9, font: fontBold, color: NAVY });
  page.drawText(titleClean.length > 55 ? titleClean.slice(0, 55) + '...' : titleClean, {
    x: boxPadX + 44,
    y: boxY,
    size: 10,
    font: fontBold,
    color: DARK,
  });

  // Data / Horario no canto direito da linha 1
  const dateStr = formatDateBr(session.date);
  const timeStr = `${session.startTime || ''}${session.endTime ? ` as ${session.endTime}` : ''}`;
  const dateFull = clean(`${dateStr}  ${timeStr}`);
  page.drawText(dateFull, {
    x: PAGE_W - MARGIN - 12 - fontBold.widthOfTextAtSize(dateFull, 9),
    y: boxY,
    size: 9,
    font: fontBold,
    color: GOLD,
  });
  boxY -= 17;

  // Linha 2: Local / Modalidade
  const modLabel = session.modality === 'online' ? 'Online (Ao Vivo)' : 'Presencial';
  const locNotes = clean(session.locationNotes || (session.modality === 'online' ? 'Link via Google Meet' : 'Espaco Camila Machado - Urussanga / SC'));
  page.drawText(clean('Modalidade:'), { x: boxPadX, y: boxY, size: 8.5, font: fontBold, color: NAVY });
  page.drawText(clean(`${modLabel}  |  Local: ${locNotes}`), {
    x: boxPadX + 60,
    y: boxY,
    size: 8.5,
    font: fontRegular,
    color: DARK,
  });
  boxY -= 17;

  // Linha 3: Terapeuta Responsavel & Vagas
  const capLabel = session.maxParticipants === 0
    ? `${activeEnrollments.length} inscritos (Vagas Ilimitadas)`
    : `${activeEnrollments.length} de ${session.maxParticipants} vagas preenchidas`;
  page.drawText(clean('Terapeuta:'), { x: boxPadX, y: boxY, size: 8.5, font: fontBold, color: NAVY });
  page.drawText(clean('Camila Machado (CRT-SBHP/SC 805)'), {
    x: boxPadX + 52,
    y: boxY,
    size: 8.5,
    font: fontRegular,
    color: DARK,
  });

  page.drawText(clean(`Ocupacao: ${capLabel}`), {
    x: PAGE_W - MARGIN - 12 - fontRegular.widthOfTextAtSize(clean(`Ocupacao: ${capLabel}`), 8.5),
    y: boxY,
    size: 8.5,
    font: fontBold,
    color: GREEN,
  });
  boxY -= 17;

  // Linha 4: Data de Emissao
  const nowBr = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  page.drawText(clean(`Documento gerado em: ${nowBr} (Horario de Brasilia)`), {
    x: boxPadX,
    y: boxY,
    size: 7.5,
    font: fontOblique,
    color: GRAY,
  });

  y -= infoBoxH + 20;

  // Definicao de Colunas da Tabela
  // Largura Total: 523.28
  // Colunas: # (22) | Nome (140) | CPF (74) | WhatsApp (74) | Nascimento (50) | Pagto (40) | Assinatura / Presenca (123)
  const COL_W = {
    idx: 22,
    name: 140,
    cpf: 74,
    phone: 74,
    birth: 50,
    payment: 40,
    signature: 123.28,
  };

  const drawTableHeader = (p: PDFPage, currentY: number) => {
    const thH = 20;
    p.drawRectangle({
      x: MARGIN,
      y: currentY - thH,
      width: CONTENT_W,
      height: thH,
      color: NAVY,
    });

    let xCursor = MARGIN + 4;
    const thY = currentY - 14;

    // #
    p.drawText('#', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.idx;

    // Nome
    p.drawText('NOME DO PARTICIPANTE', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.name;

    // CPF
    p.drawText('CPF', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.cpf;

    // WhatsApp
    p.drawText('WHATSAPP', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.phone;

    // Nasc.
    p.drawText('NASC.', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.birth;

    // Pagto
    p.drawText('PAGTO', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    xCursor += COL_W.payment;

    // Assinatura
    p.drawText('ASSINATURA DE PRESENCA', { x: xCursor, y: thY, size: 8, font: fontBold, color: rgb(1, 1, 1) });

    return currentY - thH;
  };

  y = drawTableHeader(page, y);

  // Linhas dos Participantes
  const ROW_H = 24;

  if (activeEnrollments.length === 0) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 36,
      width: CONTENT_W,
      height: 36,
      color: LIGHT_BG,
      borderColor: BORDER_COLOR,
      borderWidth: 1,
    });
    const emptyMsg = clean('Nenhum participante inscrito nesta sessao ate o momento.');
    page.drawText(emptyMsg, {
      x: (PAGE_W - fontRegular.widthOfTextAtSize(emptyMsg, 9)) / 2,
      y: y - 22,
      size: 9,
      font: fontRegular,
      color: GRAY,
    });
    y -= 36;
  } else {
    for (let i = 0; i < activeEnrollments.length; i++) {
      const enr = activeEnrollments[i];

      // Se estourar a pagina, adiciona nova pagina
      if (y - ROW_H < MARGIN + 60) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = drawPageHeader(page, false);
        y = drawTableHeader(page, y);
      }

      const isEven = i % 2 === 0;
      page.drawRectangle({
        x: MARGIN,
        y: y - ROW_H,
        width: CONTENT_W,
        height: ROW_H,
        color: isEven ? rgb(1, 1, 1) : rgb(0.97, 0.98, 0.99),
        borderColor: BORDER_COLOR,
        borderWidth: 0.6,
      });

      let rx = MARGIN + 4;
      const textY = y - 16;

      // Index
      page.drawText(String(i + 1), { x: rx, y: textY, size: 8, font: fontBold, color: DARK });
      rx += COL_W.idx;

      // Nome
      const nameClean = clean(enr.clientName);
      const nameTrunc = nameClean.length > 25 ? nameClean.slice(0, 24) + '...' : nameClean;
      page.drawText(nameTrunc, { x: rx, y: textY, size: 8.5, font: fontBold, color: DARK });
      rx += COL_W.name;

      // CPF
      const cpfFormatted = clean(formatCpf(enr.clientCpf));
      page.drawText(cpfFormatted, { x: rx, y: textY, size: 7.5, font: fontRegular, color: GRAY });
      rx += COL_W.cpf;

      // WhatsApp
      const phoneFormatted = clean(formatPhone(enr.clientPhone));
      page.drawText(phoneFormatted, { x: rx, y: textY, size: 7.5, font: fontRegular, color: DARK });
      rx += COL_W.phone;

      // Nascimento
      const birthFormatted = clean(formatDateBr(enr.clientBirthDate));
      page.drawText(birthFormatted, { x: rx, y: textY, size: 7.5, font: fontRegular, color: GRAY });
      rx += COL_W.birth;

      // Pagamento
      const payLabel = clean((enr.paymentMethod || 'PIX').toUpperCase());
      page.drawText(payLabel, { x: rx, y: textY, size: 7.5, font: fontBold, color: NAVY });
      rx += COL_W.payment;

      // Linha de Assinatura (pontilhada / fina)
      page.drawLine({
        start: { x: rx + 4, y: textY - 2 },
        end: { x: rx + COL_W.signature - 8, y: textY - 2 },
        thickness: 0.5,
        color: rgb(0.7, 0.75, 0.8),
      });

      y -= ROW_H;
    }
  }

  // Lista de Cancelados (se houver)
  if (cancelledEnrollments.length > 0) {
    y -= 14;
    if (y < MARGIN + 80) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = drawPageHeader(page, false);
    }

    const cancTitle = clean(`Inscricoes Canceladas / Desistencias (${cancelledEnrollments.length}):`);
    page.drawText(cancTitle, { x: MARGIN, y, size: 8, font: fontBold, color: rgb(0.7, 0.2, 0.2) });
    y -= 12;

    const cancListStr = clean(cancelledEnrollments.map((c) => `${c.clientName} (${formatPhone(c.clientPhone)})`).join('  |  '));
    page.drawText(cancListStr.length > 100 ? cancListStr.slice(0, 97) + '...' : cancListStr, {
      x: MARGIN,
      y,
      size: 7.5,
      font: fontOblique,
      color: GRAY,
    });
    y -= 16;
  }

  // Bloco de Assinatura da Terapeuta no final
  y -= 20;
  if (y < MARGIN + 80) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = drawPageHeader(page, false) - 20;
  }

  const signLineW = 200;
  const signX = (PAGE_W - signLineW) / 2;
  page.drawLine({
    start: { x: signX, y },
    end: { x: signX + signLineW, y },
    thickness: 0.8,
    color: NAVY,
  });
  y -= 12;

  const signTitle = clean('Camila Machado');
  page.drawText(signTitle, {
    x: (PAGE_W - fontBold.widthOfTextAtSize(signTitle, 9.5)) / 2,
    y,
    size: 9.5,
    font: fontBold,
    color: NAVY,
  });
  y -= 12;

  const signSub = clean('Terapeuta Responsavel  -  CRT-SBHP/SC 805');
  page.drawText(signSub, {
    x: (PAGE_W - fontRegular.widthOfTextAtSize(signSub, 8)) / 2,
    y,
    size: 8,
    font: fontRegular,
    color: GRAY,
  });

  // Numeracao de Paginas e Rodape em todas as paginas
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    const footerText = clean(
      `Camila Machado  |  Lista Oficial de Presenca  |  Documento Confidencial  |  Pagina ${index + 1} de ${pages.length}`
    );
    p.drawText(footerText, {
      x: (PAGE_W - fontRegular.widthOfTextAtSize(footerText, 7.5)) / 2,
      y: MARGIN - 16,
      size: 7.5,
      font: fontRegular,
      color: GRAY,
    });
  });

  return await pdf.save();
}

