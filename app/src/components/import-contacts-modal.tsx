'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Smartphone,
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Info,
  Phone,
  User,
  HelpCircle,
  ExternalLink,
  Users,
  Check,
  FileSpreadsheet,
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

function normalizePhoneDigits(raw: string, defaultDdd: string = '11'): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  // Se tiver apenas 8 ou 9 dígitos (sem DDD), prefixa com o DDD padrão da clínica
  if ((digits.length === 8 || digits.length === 9) && defaultDdd) {
    digits = `${defaultDdd.replace(/\D/g, '')}${digits}`;
  }
  return digits;
}

function decodeQuotedPrintable(str: string): string {
  try {
    return decodeURIComponent(
      str.replace(/=([0-9A-F]{2})/gi, (_, hex) => `%${hex}`)
    );
  } catch {
    return str;
  }
}

export function parseVcfText(vcfText: string, defaultDdd: string = '11'): Array<{ name: string; phone: string; email?: string }> {
  const result: Array<{ name: string; phone: string; email?: string }> = [];
  const cards = vcfText.split(/BEGIN:VCARD/i).slice(1);

  for (const card of cards) {
    let name = '';
    let phone = '';
    let email = '';

    const rawLines = card.split(/\r\n|\r|\n/);
    const lines: string[] = [];
    for (const raw of rawLines) {
      if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
        lines[lines.length - 1] += raw.trim();
      } else if (raw.trim()) {
        lines.push(raw.trim());
      }
    }

    for (const line of lines) {
      // Formatted Name (aceita FN:, item1.FN:, com atributos CHARSET/ENCODING)
      const fnMatch = line.match(/^(?:item\d+\.)?FN(?:;[^:]*)?:(.*)$/i);
      if (fnMatch) {
        name = fnMatch[1].trim();
      }

      // Name N: (caso FN não exista)
      const nMatch = line.match(/^(?:item\d+\.)?N(?:;[^:]*)?:(.*)$/i);
      if (!name && nMatch) {
        const parts = nMatch[1].split(';');
        const last = parts[0]?.trim() || '';
        const first = parts[1]?.trim() || '';
        const mid = parts[2]?.trim() || '';
        name = [first, mid, last].filter(Boolean).join(' ');
      }

      // Telephone (aceita TEL, item1.TEL, TEL;TYPE=CELL, TEL;CELL, TEL;PREF, etc.)
      const telMatch = line.match(/^(?:item\d+\.)?TEL(?:;[^:]*)?:(.*)$/i);
      if (telMatch && (!phone || line.toUpperCase().includes('CELL') || line.toUpperCase().includes('PREF'))) {
        const candidate = telMatch[1].trim();
        const candDigits = normalizePhoneDigits(candidate, defaultDdd);
        if (candDigits.length >= 10 && candDigits.length <= 11) {
          phone = candidate;
        }
      }

      // Email
      const emailMatch = line.match(/^(?:item\d+\.)?EMAIL(?:;[^:]*)?:(.*)$/i);
      if (emailMatch && !email) {
        email = emailMatch[1].trim();
      }
    }

    if (name.includes('=')) {
      name = decodeQuotedPrintable(name);
    }
    name = name.replace(/;/g, ' ').replace(/\s+/g, ' ').trim();

    if (name && phone) {
      const cleanPhone = normalizePhoneDigits(phone, defaultDdd);
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
        result.push({ name, phone: cleanPhone, email });
      }
    }
  }

  return result;
}

export function parseCsvText(csvText: string, defaultDdd: string = '11'): Array<{ name: string; phone: string; email?: string }> {
  const result: Array<{ name: string; phone: string; email?: string }> = [];
  const lines = csvText.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return result;

  // Tenta identificar separador (vírgula, ponto-e-vírgula ou tabulação)
  let separator = ',';
  if (lines[0].includes(';')) separator = ';';
  else if (lines[0].includes('\t')) separator = '\t';

  const firstCols = lines[0].toLowerCase().split(separator).map((c) => c.replace(/["']/g, '').trim());

  let nameCol = firstCols.findIndex((c) => c === 'name' || c === 'nome' || c.includes('nome completo') || c.includes('formatted name'));
  if (nameCol === -1) {
    nameCol = firstCols.findIndex((c) => c.includes('nome') || c.includes('name') || c.includes('contato') || c.includes('given name'));
  }

  let phoneCol = firstCols.findIndex((c) => c.includes('phone 1 - value') || c.includes('celular') || c.includes('whatsapp') || c.includes('telefone'));
  if (phoneCol === -1) {
    phoneCol = firstCols.findIndex((c) => c.includes('tel') || c.includes('cel') || c.includes('fone') || c.includes('phone'));
  }

  let emailCol = firstCols.findIndex((c) => c.includes('e-mail 1 - value') || c.includes('email') || c.includes('e-mail'));

  const startIndex = (nameCol !== -1 || phoneCol !== -1) ? 1 : 0;
  if (nameCol === -1) nameCol = 0;
  if (phoneCol === -1) phoneCol = 1;

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.replace(/^["']|["']$/g, '').trim());
    const rawName = cols[nameCol] || '';
    const rawPhone = cols[phoneCol] || '';
    const rawEmail = emailCol !== -1 ? cols[emailCol] : '';

    if (rawName && rawPhone) {
      const cleanPhone = normalizePhoneDigits(rawPhone, defaultDdd);
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
        result.push({ name: rawName, phone: cleanPhone, email: rawEmail });
      }
    }
  }

  return result;
}

export function parseRawPastedText(text: string, defaultDdd: string = '11'): Array<{ name: string; phone: string }> {
  const result: Array<{ name: string; phone: string }> = [];
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const phoneMatch = line.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-.\s]?\d{4}/);
    if (phoneMatch) {
      const rawPhone = phoneMatch[0];
      const cleanPhone = normalizePhoneDigits(rawPhone, defaultDdd);
      const rawName = line.replace(rawPhone, '').replace(/[-–—,:;()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
        result.push({
          name: rawName || `Contato ${formatPhone(cleanPhone)}`,
          phone: cleanPhone,
        });
      }
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
  // Aba padrão agora é 'file' (Todos os Contatos de Uma Só Vez)
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'native'>('file');
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [isNativeSupported, setIsNativeSupported] = useState<boolean>(false);
  const [defaultDdd, setDefaultDdd] = useState<string>('11');
  const [pastedText, setPastedText] = useState<string>('');
  const [contacts, setContacts] = useState<ExtractedContact[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [onlyNewFilter, setOnlyNewFilter] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mapa rápido de telefones existentes para detecção de duplicidade
  const existingMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of existingClients) {
      if (c.phone) {
        const d = normalizePhoneDigits(c.phone);
        if (d.length >= 10) {
          map.set(d, c.name);
        }
      }
    }
    return map;
  }, [existingClients]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supported = 'contacts' in navigator && 'ContactsManager' in window;
      setIsNativeSupported(supported);
    }
  }, []);

  // Reseta estado ao abrir
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setActiveTab('file'); // Sempre abre na opção recomendada (Todos os Contatos de Uma Só Vez)
      setContacts([]);
      setPastedText('');
      setSearchFilter('');
      setStatusMessage(null);
      setImportSummary(null);
      setIsImporting(false);
    }
  }, [isOpen]);

  function processParsedList(rawList: Array<{ name: string; phone: string; email?: string }>) {
    if (rawList.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Nenhum contato com telefone válido foi encontrado no arquivo ou texto. Verifique e tente novamente.',
      });
      return;
    }

    const seenInBatch = new Set<string>();
    const formatted: ExtractedContact[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const digits = normalizePhoneDigits(item.phone, defaultDdd);
      if (digits.length < 10 || digits.length > 11) continue;

      if (seenInBatch.has(digits)) continue;
      seenInBatch.add(digits);

      const existingName = existingMap.get(digits);
      const isDuplicate = !!existingName;

      formatted.push({
        id: `contact-${i}-${digits}`,
        name: item.name.trim() || 'Sem Nome',
        phone: digits,
        email: item.email?.trim() || '',
        isDuplicate,
        existingName,
        selected: !isDuplicate, // Já deixa selecionado todos os novos
      });
    }

    if (formatted.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Nenhum contato com telefone válido pôde ser importado. Verifique se os números possuem DDD.',
      });
      return;
    }

    setContacts(formatted);
    setStep('preview');
    setStatusMessage(null);
  }

  // 1. Upload de Arquivo .vcf ou .csv (Lê TODOS os 500, 1.000 ou 2.000 contatos de uma vez só!)
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        let parsed: Array<{ name: string; phone: string; email?: string }> = [];

        if (file.name.toLowerCase().endsWith('.vcf') || file.name.toLowerCase().endsWith('.vcard') || text.includes('BEGIN:VCARD')) {
          parsed = parseVcfText(text, defaultDdd);
        } else {
          parsed = parseCsvText(text, defaultDdd);
        }

        processParsedList(parsed);
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: 'Falha ao processar arquivo. Certifique-se de que é um arquivo .vcf (exportado do celular) ou .csv.',
        });
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setStatusMessage({ type: 'error', text: 'Erro ao ler o arquivo selecionado.' });
      setIsLoading(false);
    };

    reader.readAsText(file, 'UTF-8');
  }

  // 2. Processar Texto Colado
  function handleProcessPasted() {
    if (!pastedText.trim()) {
      setStatusMessage({ type: 'error', text: 'Cole os contatos no campo de texto para continuar.' });
      return;
    }
    const parsed = parseRawPastedText(pastedText, defaultDdd);
    processParsedList(parsed);
  }

  // 3. API Nativa do Celular (Manual um a um)
  async function handleNativeContactPicker() {
    setStatusMessage(null);
    setIsLoading(true);

    try {
      if (!('contacts' in navigator && 'ContactsManager' in window)) {
        setStatusMessage({
          type: 'error',
          text: 'Seu navegador não suporta a seleção manual direta. Use a opção "Todos os Contatos (.vcf)" acima que importa a lista inteira!',
        });
        setIsLoading(false);
        return;
      }

      const navContacts = (navigator as unknown as { contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>> } }).contacts;
      const selected = await navContacts.select(['name', 'tel', 'email'], { multiple: true });

      if (!selected || selected.length === 0) {
        setIsLoading(false);
        return;
      }

      const rawList: Array<{ name: string; phone: string; email?: string }> = [];
      for (const c of selected) {
        const name = Array.isArray(c.name) ? c.name[0] : (c.name || '');
        const emails = Array.isArray(c.email) ? c.email : [c.email];
        const email = emails[0] || '';
        const tels = Array.isArray(c.tel) ? c.tel : [c.tel];

        for (const t of tels) {
          if (t) {
            rawList.push({
              name: name || 'Contato da Agenda',
              phone: String(t),
              email: email || '',
            });
            break;
          }
        }
      }

      processParsedList(rawList);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Usuário apenas cancelou o seletor
      } else {
        const msg = err instanceof Error ? err.message : 'Permissão negada';
        setStatusMessage({
          type: 'error',
          text: `Não foi possível acessar a agenda: ${msg}`,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Controle de seleção no Preview
  function toggleSelectAll(select: boolean) {
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        selected: select ? (!onlyNewFilter || !c.isDuplicate) : false,
      }))
    );
  }

  function toggleContactSelection(id: string) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  }

  function updateContactField(id: string, field: 'name' | 'phone', value: string) {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (field === 'phone') {
          const digits = normalizePhoneDigits(value, defaultDdd);
          const isDuplicate = existingMap.has(digits);
          return {
            ...c,
            phone: digits,
            isDuplicate,
            existingName: existingMap.get(digits),
          };
        }
        return { ...c, [field]: value };
      })
    );
  }

  // Salvar contatos selecionados no Backend
  async function handleConfirmImport() {
    const selectedContacts = contacts.filter((c) => c.selected);
    if (selectedContacts.length === 0) {
      setStatusMessage({ type: 'error', text: 'Selecione pelo menos um contato para importar.' });
      return;
    }

    setIsImporting(true);
    setStatusMessage(null);

    try {
      const payload = {
        contacts: selectedContacts.map((c) => ({
          name: c.name.trim(),
          phone: c.phone,
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
        imported: data.importedCount,
        skipped: data.skippedCount,
      });

      onImportSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar contatos.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsImporting(false);
    }
  }

  // Estatísticas do preview
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (onlyNewFilter && c.isDuplicate) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    });
  }, [contacts, onlyNewFilter, searchFilter]);

  const selectedCount = useMemo(() => contacts.filter((c) => c.selected).length, [contacts]);
  const newCount = useMemo(() => contacts.filter((c) => !c.isDuplicate).length, [contacts]);
  const duplicateCount = useMemo(() => contacts.filter((c) => c.isDuplicate).length, [contacts]);

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
          maxWidth: step === 'preview' ? '760px' : '620px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* CABEÇALHO */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {importSummary
                  ? 'Importação Concluída'
                  : step === 'preview'
                  ? 'Revisar Contatos da Agenda'
                  : 'Importar Todos os Contatos do Celular'}
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                {importSummary
                  ? 'Contatos adicionados com sucesso ao sistema da clínica'
                  : step === 'preview'
                  ? `${contacts.length} contato(s) carregado(s) da sua agenda`
                  : 'Importe todos os contatos da sua agenda de uma só vez'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '999px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* MENSAGEM DE STATUS / ALERTA */}
        {statusMessage && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: statusMessage.type === 'error' ? '#fef2f2' : '#f0fdf4',
              borderBottom: `1px solid ${statusMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: statusMessage.type === 'error' ? '#b91c1c' : '#15803d',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            {statusMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* TELA DE SUCESSO FINAL */}
          {importSummary ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
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
                  margin: '0 auto 1.25rem auto',
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                {importSummary.imported} {importSummary.imported === 1 ? 'cliente importado' : 'clientes importados'} com sucesso!
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '440px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
                {importSummary.skipped > 0
                  ? `${importSummary.skipped} contato(s) já existiam no sistema e não foram duplicados.`
                  : 'Todos os contatos selecionados foram adicionados à sua base de clientes da clínica.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary"
                style={{
                  borderRadius: '999px',
                  padding: '0.75rem 2rem',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}
              >
                Concluir e Ver Lista de Clientes
              </button>
            </div>
          ) : step === 'input' ? (
            /* PASSO 1: ESCOLHA DA FORMA DE IMPORTAÇÃO */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* CONFIGURAÇÃO RÁPIDA: DDD PADRÃO */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Info size={18} style={{ color: '#0284c7', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: '#334155' }}>
                    DDD padrão para contatos salvos sem código de área:
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>DDD</span>
                  <input
                    type="text"
                    value={defaultDdd}
                    onChange={(e) => setDefaultDdd(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="11"
                    maxLength={2}
                    style={{
                      width: '46px',
                      padding: '0.35rem 0.5rem',
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                    }}
                  />
                </div>
              </div>

              {/* ABAS COM DESTAQUE PARA A OPÇÃO PRINCIPAL */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.45rem',
                  background: '#f1f5f9',
                  padding: '0.35rem',
                  borderRadius: '14px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('file')}
                  style={{
                    padding: '0.65rem 0.4rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: activeTab === 'file' ? '#ffffff' : 'transparent',
                    color: activeTab === 'file' ? '#1d4ed8' : '#64748b',
                    fontWeight: activeTab === 'file' ? 800 : 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: activeTab === 'file' ? '0 2px 8px rgba(37,99,235,0.12)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Sparkles size={15} style={{ color: activeTab === 'file' ? '#2563eb' : '#94a3b8' }} />
                  Todos da Agenda
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  style={{
                    padding: '0.65rem 0.4rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: activeTab === 'paste' ? '#ffffff' : 'transparent',
                    color: activeTab === 'paste' ? '#0f172a' : '#64748b',
                    fontWeight: activeTab === 'paste' ? 800 : 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: activeTab === 'paste' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <FileText size={15} /> Colar Lista
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('native')}
                  style={{
                    padding: '0.65rem 0.4rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: activeTab === 'native' ? '#ffffff' : 'transparent',
                    color: activeTab === 'native' ? '#0f172a' : '#64748b',
                    fontWeight: activeTab === 'native' ? 800 : 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: activeTab === 'native' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Smartphone size={15} /> Manual (Um a um)
                </button>
              </div>

              {/* ABA 1: TODOS OS CONTATOS DE UMA VEZ SÓ (.VCF / GOOGLE) - RECOMENDADA */}
              {activeTab === 'file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* ÁREA DE SELEÇÃO DO ARQUIVO */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed #93c5fd',
                      borderRadius: '20px',
                      padding: '1.75rem 1.25rem',
                      textAlign: 'center',
                      background: 'linear-gradient(to bottom, #f0fdf4, #eff6ff)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#93c5fd')}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#2563eb',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 0.75rem auto',
                        boxShadow: '0 6px 18px rgba(37,99,235,0.3)',
                      }}
                    >
                      <Upload size={26} />
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.3rem' }}>
                      Toque aqui para escolher o arquivo da sua Agenda
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#475569', margin: 0 }}>
                      Carrega <strong>todos os 200, 500 ou 1.000 contatos</strong> do seu celular de uma só vez!
                    </p>
                    <div
                      style={{
                        marginTop: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#ffffff',
                        padding: '0.35rem 0.85rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      Formatos suportados: .vcf (vCard do Celular) ou .csv (Google Contatos / Excel)
                    </div>
                  </div>

                  {/* COMO EXPORTAR TODOS OS CONTATOS NO CELULAR */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '18px',
                      padding: '1.15rem 1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Smartphone size={18} style={{ color: '#2563eb' }} />
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                        Como exportar TODOS os contatos do seu celular em 5 segundos:
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      {/* CARD ANDROID */}
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '14px',
                          padding: '0.85rem 1rem',
                          fontSize: '0.8rem',
                          lineHeight: 1.55,
                        }}
                      >
                        <strong style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                          🤖 No Android (Samsung, Motorola, Xiaomi):
                        </strong>
                        <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#475569' }}>
                          <li>Abra o aplicativo <strong>Contatos</strong> do celular</li>
                          <li>Toque em <strong>Corrigir e gerenciar</strong> (ou nos <strong>3 pontinhos ⠇</strong> no canto)</li>
                          <li>Toque em <strong>Exportar para arquivo</strong> (.vcf)</li>
                          <li>Toque em <strong>Salvar</strong> e selecione o arquivo aqui!</li>
                        </ol>
                      </div>

                      {/* CARD GOOGLE CONTATOS / IPHONE */}
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '14px',
                          padding: '0.85rem 1rem',
                          fontSize: '0.8rem',
                          lineHeight: 1.55,
                        }}
                      >
                        <strong style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
                          🌐 Pelo Google Contatos (Gmail):
                        </strong>
                        <p style={{ margin: '0 0 0.5rem 0', color: '#475569' }}>
                          Se seus contatos estão salvos na sua conta Google do celular, você pode baixar todos em 1 clique:
                        </p>
                        <a
                          href="https://contacts.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: '#1d4ed8',
                            background: '#eff6ff',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            textDecoration: 'none',
                          }}
                        >
                          Abrir Google Contatos <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: COLAR LISTA LIVRE */}
              {activeTab === 'paste' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                    Cole nomes e telefones de conversas do WhatsApp, anotações ou planilhas (uma linha por contato):
                  </p>
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Exemplo:\nMaria Silva - (11) 98765-4321\nCarlos Pereira 11999998888\nJuliana Santos, 11 91234-5678`}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '14px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.85rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleProcessPasted}
                    className="btn btn-primary"
                    style={{
                      borderRadius: '999px',
                      padding: '0.65rem 1.5rem',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      alignSelf: 'flex-end',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                    }}
                  >
                    Processar Lista <ArrowRight size={16} />
                  </button>
                </div>
              )}

              {/* ABA 3: SELEÇÃO MANUAL UM A UM (API NATIVA DO NAVEGADOR) */}
              {activeTab === 'native' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div
                    style={{
                      padding: '1.25rem',
                      background: '#fffbeb',
                      border: '1.5px solid #fef3c7',
                      borderRadius: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <HelpCircle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5 }}>
                        <strong>Por que esta opção exige marcar um por um?</strong><br />
                        Por regras de segurança da Google e dos navegadores, sites não têm permissão para acessar a agenda inteira em segundo plano sem que você toque manualmente em cada contato.
                        <br />
                        💡 <strong>Dica:</strong> Se você quer puxar <strong>TODOS os contatos de uma só vez</strong>, use a primeira aba <strong>&quot;Todos da Agenda&quot;</strong> exportando o arquivo .vcf!
                      </div>
                    </div>
                  </div>

                  {isNativeSupported ? (
                    <div
                      style={{
                        padding: '1.5rem',
                        background: '#f8fafc',
                        border: '1.5px dashed #cbd5e1',
                        borderRadius: '18px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          background: '#eff6ff',
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 0.75rem auto',
                        }}
                      >
                        <Smartphone size={24} />
                      </div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                        Seletor Manual do Android
                      </h4>
                      <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem 0' }}>
                        Abre a lista do celular para você selecionar contatos específicos tocando em cada um.
                      </p>
                      <button
                        type="button"
                        onClick={handleNativeContactPicker}
                        disabled={isLoading}
                        className="btn btn-primary"
                        style={{
                          borderRadius: '999px',
                          padding: '0.65rem 1.5rem',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" /> Abrindo agenda...
                          </>
                        ) : (
                          <>
                            <Smartphone size={16} /> Abrir Lista para Marcar Contatos
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                      Seletor manual não disponível neste navegador. Use a aba <strong>&quot;Todos da Agenda&quot;</strong> acima.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* PASSO 2: REVISÃO E SELEÇÃO DE CONTATOS */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* FILTROS E RESUMO */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: '#f8fafc',
                  padding: '0.75rem 1rem',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#e2e8f0',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                    }}
                  >
                    {contacts.length} encontrados na agenda
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#15803d',
                      background: '#dcfce7',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                    }}
                  >
                    {newCount} novos para importar
                  </span>
                  {duplicateCount > 0 && (
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#64748b',
                        background: '#f1f5f9',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                      }}
                    >
                      {duplicateCount} já cadastrados
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#2563eb',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                    }}
                  >
                    Marcar todos
                  </button>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#64748b',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                    }}
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              {/* BUSCA E TOGGLE 'APENAS NOVOS' */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Pesquisar nos contatos por nome ou telefone..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                {duplicateCount > 0 && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onlyNewFilter}
                      onChange={(e) => setOnlyNewFilter(e.target.checked)}
                      style={{ accentColor: '#2563eb' }}
                    />
                    Apenas novos
                  </label>
                )}
              </div>

              {/* LISTA DE CONTATOS EXTRAÍDOS */}
              <div
                style={{
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  background: '#ffffff',
                }}
              >
                {filteredContacts.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Nenhum contato corresponde ao filtro de busca.
                  </div>
                ) : (
                  filteredContacts.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f1f5f9',
                        background: c.selected ? '#f8fafc' : '#ffffff',
                        opacity: c.isDuplicate && !c.selected ? 0.7 : 1,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                        <button
                          type="button"
                          onClick={() => toggleContactSelection(c.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: c.selected ? '#2563eb' : '#cbd5e1',
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {c.selected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateContactField(c.id, 'name', e.target.value)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              fontWeight: 700,
                              fontSize: '0.88rem',
                              color: '#0f172a',
                              width: '100%',
                              padding: 0,
                              outline: 'none',
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Phone size={12} /> {formatPhone(c.phone)}
                            </span>
                            {c.email && (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                · {c.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        {c.isDuplicate ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#64748b',
                              background: '#f1f5f9',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '999px',
                            }}
                            title={`Já existe cliente com esse telefone: ${c.existingName || ''}`}
                          >
                            Já cadastrado
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#15803d',
                              background: '#dcfce7',
                              padding: '0.25rem 0.55rem',
                              borderRadius: '999px',
                            }}
                          >
                            Novo
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ / AÇÕES */}
        {!importSummary && (
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            {step === 'preview' ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  disabled={isImporting}
                  className="btn btn-outline"
                  style={{
                    borderRadius: '999px',
                    padding: '0.6rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting || selectedCount === 0}
                  className="btn btn-primary"
                  style={{
                    borderRadius: '999px',
                    padding: '0.65rem 1.75rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" /> Salvando clientes...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={17} /> Salvar {selectedCount} {selectedCount === 1 ? 'Cliente' : 'Clientes'}
                    </>
                  )}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-outline"
                  style={{
                    borderRadius: '999px',
                    padding: '0.6rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
