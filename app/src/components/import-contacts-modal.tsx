'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Smartphone,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Phone,
  Users,
} from 'lucide-react';
import type { ClientSummary } from '@/lib/domain';
import { formatPhone } from '@/lib/utils';

export interface ExtractedContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isDuplicate: boolean;
  existingName?: string;
  selected: boolean;
}

interface ImportContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  existingClients: ClientSummary[];
}

export function normalizePhoneDigits(raw: string, defaultDdd: string = '48'): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';

  // Remove prefixo internacional 0055 ou 55
  if (digits.startsWith('0055') && digits.length >= 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Remove código de operadora com zero (ex: 0154899999999, 0214899999999, 0414832221111)
  if (digits.startsWith('0') && (digits.length === 13 || digits.length === 14)) {
    digits = digits.slice(3);
  }

  // Remove zero antes do DDD (ex: 048999999999 -> 48999999999)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // Se tiver apenas 8 ou 9 dígitos (número salvo sem DDD no celular), adiciona DDD padrão
  if ((digits.length === 8 || digits.length === 9) && defaultDdd) {
    digits = `${defaultDdd.replace(/\D/g, '')}${digits}`;
  }

  return digits;
}

function decodeQuotedPrintable(input: string): string {
  try {
    const cleaned = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    const encoder = new TextEncoder();
    let i = 0;
    while (i < cleaned.length) {
      if (
        cleaned[i] === '=' &&
        i + 2 < cleaned.length &&
        /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))
      ) {
        bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
        i += 3;
      } else {
        const encoded = encoder.encode(cleaned[i]);
        for (const b of encoded) bytes.push(b);
        i++;
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return input;
  }
}

export function parseVcfText(
  vcfText: string,
  defaultDdd: string = '48'
): Array<{ name: string; phone: string; email?: string }> {
  const result: Array<{ name: string; phone: string; email?: string }> = [];
  const cards = vcfText.split(/BEGIN:VCARD/i).slice(1);

  for (const rawCard of cards) {
    // 1. Remove blocos de foto em base64 para leitura instantânea e une quebras de linha Quoted-Printable (=\r\n) e RFC (\r\n )
    const unfoldedCard = rawCard
      .replace(/=\r?\n/g, '')
      .replace(/\r?\n[ \t]+/g, '');

    const lines = unfoldedCard
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^PHOTO[;:]/i.test(l) && !/^END:VCARD/i.test(l));

    let fnName = '';
    let nName = '';
    let orgName = '';
    let email = '';
    const candidatePhones: Array<{ raw: string; digits: string; isPreferred: boolean }> = [];

    for (const line of lines) {
      // Nome Formatado (FN)
      const fnMatch = line.match(/^(?:item\d+\.)?FN(?:;([^:]*))?:(.*)$/i);
      if (fnMatch) {
        const attrs = (fnMatch[1] || '').toUpperCase();
        let val = fnMatch[2].trim();
        if (attrs.includes('QUOTED-PRINTABLE') || /=[0-9A-F]{2}/i.test(val)) {
          val = decodeQuotedPrintable(val);
        }
        if (val) fnName = val;
        continue;
      }

      // Nome Estruturado (N:Sobrenome;Nome;Meio;...)
      const nMatch = line.match(/^(?:item\d+\.)?N(?:;([^:]*))?:(.*)$/i);
      if (nMatch && !nName) {
        const attrs = (nMatch[1] || '').toUpperCase();
        const isQp = attrs.includes('QUOTED-PRINTABLE') || /=[0-9A-F]{2}/i.test(nMatch[2]);
        const parts = nMatch[2].split(';').map((p) => {
          const decoded = isQp ? decodeQuotedPrintable(p.trim()) : p.trim();
          return decoded.trim();
        });
        const last = parts[0] || '';
        const first = parts[1] || '';
        const mid = parts[2] || '';
        const combined = [first, mid, last].filter(Boolean).join(' ');
        if (combined) nName = combined;
        continue;
      }

      // Organização / Apelido (fallback caso contato não tenha FN/N)
      const orgMatch = line.match(/^(?:item\d+\.)?(?:ORG|NICKNAME)(?:;([^:]*))?:(.*)$/i);
      if (orgMatch && !orgName) {
        const attrs = (orgMatch[1] || '').toUpperCase();
        let val = orgMatch[2].replace(/;/g, ' ').trim();
        if (attrs.includes('QUOTED-PRINTABLE') || /=[0-9A-F]{2}/i.test(val)) {
          val = decodeQuotedPrintable(val);
        }
        if (val) orgName = val;
        continue;
      }

      // Telefones (TEL)
      const telMatch = line.match(/^(?:item\d+\.)?TEL(?:;([^:]*))?:(.*)$/i);
      if (telMatch) {
        const attrs = (telMatch[1] || '').toUpperCase();
        const rawTel = telMatch[2].replace(/^tel:/i, '').trim();
        const digits = normalizePhoneDigits(rawTel, defaultDdd);
        if (digits) {
          const isPreferred =
            attrs.includes('CELL') ||
            attrs.includes('MOBILE') ||
            attrs.includes('PREF') ||
            attrs.includes('WHATSAPP') ||
            digits.length === 11;
          candidatePhones.push({ raw: rawTel, digits, isPreferred });
        }
        continue;
      }

      // E-mail
      const emailMatch = line.match(/^(?:item\d+\.)?EMAIL(?:;[^:]*)?:(.*)$/i);
      if (emailMatch && !email) {
        email = emailMatch[1].trim();
      }
    }

    // Escolhe o melhor número do contato (prioriza celular / preferencial, ou o primeiro disponível)
    const bestPhoneObj =
      candidatePhones.find((p) => p.isPreferred && p.digits.length >= 10) ||
      candidatePhones.find((p) => p.digits.length >= 10) ||
      candidatePhones[0];

    const finalPhone = bestPhoneObj ? bestPhoneObj.digits : '';
    const finalName = (fnName || nName || orgName || (finalPhone ? `Contato ${formatPhone(finalPhone)}` : ''))
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (finalName || finalPhone) {
      result.push({
        name: finalName || 'Contato da Agenda',
        phone: finalPhone,
        email: email || undefined,
      });
    }
  }

  return result;
}

export function parseCsvText(
  csvText: string,
  defaultDdd: string = '48'
): Array<{ name: string; phone: string; email?: string }> {
  const result: Array<{ name: string; phone: string; email?: string }> = [];
  const lines = csvText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return result;

  let separator = ',';
  if (lines[0].includes(';')) separator = ';';
  else if (lines[0].includes('\t')) separator = '\t';

  const firstCols = lines[0]
    .toLowerCase()
    .split(separator)
    .map((c) => c.replace(/["']/g, '').trim());

  let nameCol = firstCols.findIndex(
    (c) => c === 'name' || c === 'nome' || c.includes('nome completo') || c.includes('formatted name')
  );
  if (nameCol === -1) {
    nameCol = firstCols.findIndex(
      (c) => c.includes('nome') || c.includes('name') || c.includes('contato') || c.includes('given name') || c.includes('first name')
    );
  }

  let phoneCol = firstCols.findIndex(
    (c) => c.includes('phone 1 - value') || c.includes('celular') || c.includes('whatsapp') || c.includes('telefone')
  );
  if (phoneCol === -1) {
    phoneCol = firstCols.findIndex(
      (c) => c.includes('tel') || c.includes('cel') || c.includes('fone') || c.includes('phone') || c.includes('mobile')
    );
  }

  const emailCol = firstCols.findIndex(
    (c) => c.includes('e-mail 1 - value') || c.includes('email') || c.includes('e-mail')
  );

  const startIndex = nameCol !== -1 || phoneCol !== -1 ? 1 : 0;
  if (nameCol === -1) nameCol = 0;
  if (phoneCol === -1) phoneCol = 1;

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.replace(/^["']|["']$/g, '').trim());
    const rawName = cols[nameCol] || '';
    const rawPhone = cols[phoneCol] || '';
    const rawEmail = emailCol !== -1 ? cols[emailCol] : '';
    const cleanPhone = normalizePhoneDigits(rawPhone, defaultDdd);

    if (rawName || cleanPhone) {
      result.push({
        name: rawName || `Contato ${formatPhone(cleanPhone)}`,
        phone: cleanPhone,
        email: rawEmail || undefined,
      });
    }
  }

  return result;
}

export function ImportContactsModal({
  isOpen,
  onClose,
  onImportSuccess,
  existingClients,
}: ImportContactsModalProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [autoApply, setAutoApply] = useState<boolean>(true);
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mapa rápido de clientes existentes para evitar duplicidade
  const existingMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of existingClients) {
      if (c.phone) {
        const d = normalizePhoneDigits(c.phone);
        if (d.length >= 8) {
          map.set(d, c.name);
        }
      }
    }
    return map;
  }, [existingClients]);

  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setContacts([]);
      setSearchFilter('');
      setStatusMessage(null);
      setImportSummary(null);
      setIsImporting(false);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Salva diretamente no banco de dados e atualiza a tela de clientes
  async function saveContactsToBackend(listToSave: Array<{ name: string; phone: string; email?: string }>) {
    if (listToSave.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Nenhum contato novo selecionado para adicionar.',
      });
      return;
    }

    setIsImporting(true);
    setStatusMessage(null);

    try {
      const payload = {
        contacts: listToSave.map((c) => ({
          name: (c.name || '').trim() || 'Contato da Agenda',
          phone: c.phone || '',
          email: c.email || undefined,
          notes: 'Importado da agenda do celular',
        })),
      };

      const res = await fetch('/api/admin/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao importar contatos.');
      }

      setImportSummary({
        imported: data.importedCount ?? 0,
        skipped: data.skippedCount ?? 0,
      });

      onImportSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar contatos.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsImporting(false);
      setIsLoading(false);
    }
  }

  async function processExtractedContacts(rawList: Array<{ name: string; phone: string; email?: string }>) {
    if (rawList.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Nenhum contato foi encontrado. Tente novamente.',
      });
      setIsLoading(false);
      return;
    }

    const seenPhones = new Set<string>();
    const seenNamesNoPhone = new Set<string>();
    const formatted: ExtractedContact[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const digits = normalizePhoneDigits(item.phone, '48');
      const cleanName = (item.name || '').trim() || (digits ? `Contato ${formatPhone(digits)}` : '');

      if (!cleanName && !digits) continue;

      if (digits.length >= 8) {
        if (seenPhones.has(digits)) continue;
        seenPhones.add(digits);
      } else {
        const key = cleanName.toLowerCase();
        if (seenNamesNoPhone.has(key)) continue;
        seenNamesNoPhone.add(key);
      }

      const existingName = digits.length >= 8 ? existingMap.get(digits) : undefined;
      const isDuplicate = !!existingName;

      formatted.push({
        id: `contact-${i}-${digits || i}`,
        name: cleanName || 'Contato sem nome',
        phone: digits,
        email: item.email?.trim() || '',
        isDuplicate,
        existingName,
        selected: !isDuplicate,
      });
    }

    if (formatted.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Nenhum contato válido pôde ser lido.',
      });
      setIsLoading(false);
      return;
    }

    // Se "Aplicar direto" estiver marcado, já envia todos os novos contatos para o sistema na mesma hora!
    if (autoApply) {
      const newOnes = formatted.filter((c) => !c.isDuplicate);
      if (newOnes.length === 0) {
        setImportSummary({ imported: 0, skipped: formatted.length });
        setIsLoading(false);
        return;
      }
      await saveContactsToBackend(newOnes);
      return;
    }

    setContacts(formatted);
    setStep('preview');
    setStatusMessage(null);
    setIsLoading(false);
  }

  // OPÇÃO 1: Abre a Aba Nativa de Contatos do Android (Contact Picker API)
  async function handleOpenAndroidContactsPicker() {
    setStatusMessage(null);

    const hasContactPicker =
      typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

    if (!hasContactPicker) {
      // Se o navegador não tiver a API de janela direta, abre direto o seletor de arquivo .vcf do Android
      fileInputRef.current?.click();
      return;
    }

    setIsLoading(true);
    try {
      const navContacts = (
        navigator as unknown as {
          contacts: {
            select: (
              props: string[],
              opts: { multiple: boolean }
            ) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
          };
        }
      ).contacts;

      const selected = await navContacts.select(['name', 'tel', 'email'], { multiple: true });

      if (!selected || selected.length === 0) {
        setIsLoading(false);
        return;
      }

      const rawList: Array<{ name: string; phone: string; email?: string }> = [];
      for (const c of selected) {
        const names = Array.isArray(c.name) ? c.name.filter(Boolean) : c.name ? [String(c.name)] : [];
        const name = names[0] || '';
        const emails = Array.isArray(c.email) ? c.email.filter(Boolean) : c.email ? [String(c.email)] : [];
        const email = emails[0] || '';
        const tels = Array.isArray(c.tel) ? c.tel.filter(Boolean) : c.tel ? [String(c.tel)] : [];

        // Escolhe o melhor telefone (preferindo celular com 11 dígitos) ou aceita mesmo sem telefone
        let chosenPhone = '';
        for (const t of tels) {
          const d = normalizePhoneDigits(String(t), '48');
          if (d.length === 11) {
            chosenPhone = d;
            break;
          }
          if (!chosenPhone && d) {
            chosenPhone = d;
          }
        }

        if (name || chosenPhone) {
          rawList.push({
            name: name || `Contato ${formatPhone(chosenPhone)}`,
            phone: chosenPhone,
            email,
          });
        }
      }

      await processExtractedContacts(rawList);
    } catch (err: unknown) {
      setIsLoading(false);
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setStatusMessage({
        type: 'error',
        text: 'Não foi possível abrir a janela direta. Toque no botão verde abaixo para puxar o arquivo do app Contatos.',
      });
    }
  }

  // OPÇÃO 2: Puxa TODOS os contatos do arquivo exportado do App Contatos do Android (.vcf / .csv)
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '');
        let parsed: Array<{ name: string; phone: string; email?: string }> = [];

        if (
          file.name.toLowerCase().endsWith('.vcf') ||
          file.name.toLowerCase().endsWith('.vcard') ||
          text.includes('BEGIN:VCARD')
        ) {
          parsed = parseVcfText(text, '48');
        } else {
          parsed = parseCsvText(text, '48');
        }

        await processExtractedContacts(parsed);
      } catch {
        setStatusMessage({
          type: 'error',
          text: 'Não foi possível ler o arquivo selecionado. Escolha o arquivo .vcf exportado do app Contatos do Android.',
        });
        setIsLoading(false);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMessage({ type: 'error', text: 'Erro ao ler o arquivo selecionado.' });
      setIsLoading(false);
    };

    reader.readAsText(file, 'UTF-8');
  }

  function toggleSelectAll(select: boolean) {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        selected: select ? !c.isDuplicate : false,
      }))
    );
  }

  function toggleContactSelection(id: string) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  }

  async function handleConfirmPreviewImport() {
    const selectedContacts = contacts.filter((c) => c.selected);
    await saveContactsToBackend(selectedContacts);
  }

  const filteredContacts = useMemo(() => {
    if (!searchFilter.trim()) return contacts;
    const q = searchFilter.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, searchFilter]);

  const selectedCount = useMemo(() => contacts.filter((c) => c.selected).length, [contacts]);
  const newCount = useMemo(() => contacts.filter((c) => !c.isDuplicate).length, [contacts]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: step === 'preview' ? '680px' : '500px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* CABEÇALHO SIMPLES E DIRETO */}
        <div
          style={{
            padding: '1.15rem 1.35rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {importSummary ? 'Contatos Aplicados!' : 'Puxar Contatos do Celular'}
              </h2>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                {importSummary
                  ? 'Sua lista de clientes já foi atualizada'
                  : 'Escolha como puxar da agenda do seu Android'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            style={{
              background: '#e2e8f0',
              border: 'none',
              borderRadius: '999px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ALERTA DE ERRO SE HOUVER */}
        {statusMessage && (
          <div
            style={{
              padding: '0.8rem 1.2rem',
              background: statusMessage.type === 'error' ? '#fef2f2' : '#f0fdf4',
              borderBottom: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              color: statusMessage.type === 'error' ? '#b91c1c' : '#15803d',
              fontSize: '0.84rem',
              fontWeight: 600,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* CORPO PRINCIPAL */}
        <div style={{ padding: '1.35rem', overflowY: 'auto', flex: 1 }}>
          {/* Input oculto para arquivo .vcf/.csv do Android */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/directory,text/csv,text/plain,application/vcard,application/octet-stream"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {isImporting || isLoading ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <RefreshCw
                size={40}
                className="animate-spin"
                style={{ color: '#2563eb', margin: '0 auto 1rem auto' }}
              />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                {isImporting ? 'Aplicando contatos na lista de clientes...' : 'Lendo contatos do celular...'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Aguarde um instante, estamos salvando tudo automaticamente.
              </p>
            </div>
          ) : importSummary ? (
            /* TELA DE SUCESSO */
            <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem auto',
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>
                {importSummary.imported}{' '}
                {importSummary.imported === 1 ? 'contato adicionado' : 'contatos adicionados'} com sucesso!
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
                {importSummary.skipped > 0
                  ? `${importSummary.skipped} contato(s) já estavam cadastrados e não foram duplicados.`
                  : 'Todos os contatos foram aplicados diretamente na sua lista de clientes.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  borderRadius: '14px',
                  padding: '0.85rem 1.5rem',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                Fechar e Ver Clientes
              </button>
            </div>
          ) : step === 'input' ? (
            /* TELA ÚNICA E SIMPLES COM OS 2 BOTÕES DIRETOS PARA ANDROID */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* BOTÃO 1: ABRIR ABA DE CONTATOS DO ANDROID */}
              <button
                type="button"
                onClick={handleOpenAndroidContactsPicker}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '18px',
                  padding: '1.2rem 1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4)',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Smartphone size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.2rem' }}>
                    Abrir Aba de Contatos do Celular
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.92, lineHeight: 1.35 }}>
                    Abre a janela de contatos do seu Android para selecionar e já aplica na lista de clientes.
                  </div>
                </div>
              </button>

              {/* BOTÃO 2: PUXAR TODOS DO APP CONTATOS DO ANDROID (.VCF) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '18px',
                  padding: '1.2rem 1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: '0 10px 25px -5px rgba(22, 163, 74, 0.35)',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Upload size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.2rem' }}>
                    Puxar TODOS do App Contatos (.vcf)
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.92, lineHeight: 1.35 }}>
                    Importa a agenda inteira do Android de uma vez só (500, 1.000+ contatos) e já aplica tudo.
                  </div>
                </div>
              </button>

              {/* DICA CURTA DE 3 PASSOS PARA O APP CONTATOS DO ANDROID */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '0.85rem 1rem',
                  fontSize: '0.79rem',
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '0.2rem' }}>
                  💡 Como puxar todos de uma vez pelo app Contatos do Android:
                </strong>
                No app <strong>Contatos</strong> do celular → toque em <strong>Gerenciar contatos</strong> (ou nos 3
                pontinhos) → <strong>Exportar para arquivo (.vcf)</strong> → depois toque no botão verde acima!
              </div>

              {/* OPÇÃO DE APLICAR DIRETO (JÁ MARCADA POR PADRÃO) */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  padding: '0.25rem 0.2rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoApply}
                  onChange={(e) => setAutoApply(e.target.checked)}
                  style={{ width: '17px', height: '17px', accentColor: '#16a34a' }}
                />
                Aplicar e salvar direto na lista de clientes automaticamente
              </label>
            </div>
          ) : (
            /* TELA DE REVISÃO (CASO ELA DESMARQUE O 'APLICAR DIRETO') */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  background: '#f8fafc',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  {contacts.length} na agenda · <span style={{ color: '#16a34a' }}>{newCount} novos</span>
                </span>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#2563eb',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#64748b',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Buscar contato..."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2.2rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                }}
              >
                {filteredContacts.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => toggleContactSelection(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.9rem',
                      borderBottom: '1px solid #f1f5f9',
                      background: c.selected ? '#f8fafc' : '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span style={{ color: c.selected ? '#2563eb' : '#cbd5e1', display: 'flex' }}>
                        {c.selected ? <CheckSquare size={19} /> : <Square size={19} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.name}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Phone size={11} /> {c.phone ? formatPhone(c.phone) : 'Sem telefone'}
                        </div>
                      </div>
                    </div>
                    {c.isDuplicate && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                        }}
                      >
                        Já existe
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleConfirmPreviewImport}
                disabled={isImporting || selectedCount === 0}
                style={{
                  width: '100%',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={18} /> Aplicar {selectedCount} Contato(s) Agora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
