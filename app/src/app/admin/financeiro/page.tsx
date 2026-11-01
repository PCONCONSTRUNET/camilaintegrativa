'use client';

import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  WalletCards,
  Plus,
  Receipt,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  CreditCard,
  Banknote,
  Zap,
  Building2,
  Filter,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock3,
  CalendarDays,
  FileText,
  User,
  Sparkles,
  MessageSquare,
  Send,
  Printer,
  Trash2,
  ChevronRight,
  X,
  History,
  Tag,
  Percent,
  ArrowDownLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  BarChart3,
  PieChart,
  Activity,
  Award,
  ShieldCheck,
  Check,
  ChevronDown,
  LineChart,
  AreaChart,
} from 'lucide-react';
import { formatCurrency, formatPhone, maskCpf, numberToCurrencyWords } from '@/lib/utils';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

// ==========================================
// TIPAGENS FINANCEIRAS E DRE
// ==========================================

type PaymentTransaction = {
  id: string;
  paymentId: string;
  clientId: string;
  amountCents: number;
  paymentMethod: string;
  paidAt: string;
  notes: string | null;
  createdAt: string;
};

type Payment = {
  id: string;
  clinicId: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  appointmentId: string | null;
  serviceId: string | null;
  serviceName: string | null;
  clientPackageId: string | null;
  parentPaymentId: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  entryType: 'entrada' | 'saida';
  category: string;
  chargeType: string;
  description: string;
  amountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  discountCents: number;
  paymentMethod: string;
  status: string;
  isOverdue: boolean;
  paidAt: string | null;
  dueAt: string | null;
  receiptUrl: string | null;
  notes: string | null;
  transactions?: PaymentTransaction[];
  createdAt: string;
  updatedAt: string;
};

type DreSummary = {
  receitaBrutaCents: number;
  deducoesDescontosCents: number;
  receitaLiquidaCents: number;
  receitaRealizadaCaixaCents: number;
  custosVariaveisCents: number;
  lucroBrutoCents: number;
  margemBrutaPct: number;
  despesasOperacionaisCents: number;
  totalDespesasCents: number;
  totalDespesasPagasCents: number;
  lucroLiquidoCents: number;
  margemLiquidaPct: number;
  saldoLiquidoCaixaCents: number;
  totalAReceberCents: number;
  totalAPagarCents: number;
  totalVencidoCents: number;
};

type ServiceHighlight = {
  serviceName: string;
  count: number;
  totalCents: number;
  paidCents: number;
  pctOfTotal: number;
  averageTicketCents: number;
};

type ExpenseCategoryItem = {
  category: string;
  count: number;
  totalCents: number;
  pctOfTotal: number;
};

type MethodBreakdown = {
  method: string;
  count: number;
  totalCents: number;
  pct: number;
};

type TimelinePoint = {
  label: string;
  dateStr: string;
  receivedCents: number;
  expenseCents: number;
  netCents: number;
};

type ClientOption = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  cpf?: string | null;
  rg?: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
  priceCents: number;
  pricingTiers?: Array<{ name: string; priceCents: number; sessionCount: number }>;
};

type PaymentIconComponent = (props: { size?: number; style?: CSSProperties; className?: string }) => ReactNode;

const PixIconImg: PaymentIconComponent = ({ size = 16, style, className }) => (
  <img
    width={size}
    height={size}
    src="https://img.icons8.com/fluency/48/pix.png"
    alt="pix"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  />
);

const CardIconImg: PaymentIconComponent = ({ size = 16, style, className }) => (
  <img
    width={size}
    height={size}
    src="https://img.icons8.com/color/48/bank-card-back-side.png"
    alt="bank-card-back-side"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  />
);

const MoneyIconImg: PaymentIconComponent = ({ size = 16, style, className }) => (
  <img
    width={size}
    height={size}
    src="https://img.icons8.com/offices/30/money.png"
    alt="money"
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  />
);

const PAYMENT_METHODS: Record<string, { label: string; icon: PaymentIconComponent; color: string; bg: string; imgUrl: string }> = {
  pix: { label: 'PIX', icon: PixIconImg, color: '#0284c7', bg: '#e0f2fe', imgUrl: 'https://img.icons8.com/fluency/48/pix.png' },
  cartao: { label: 'Cartão', icon: CardIconImg, color: '#7c3aed', bg: '#ede9fe', imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png' },
  cartao_credito: { label: 'Cartão', icon: CardIconImg, color: '#7c3aed', bg: '#ede9fe', imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png' },
  cartao_debito: { label: 'Cartão', icon: CardIconImg, color: '#7c3aed', bg: '#ede9fe', imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png' },
  dinheiro: { label: 'Dinheiro', icon: MoneyIconImg, color: '#059669', bg: '#d1fae5', imgUrl: 'https://img.icons8.com/offices/30/money.png' },
  transferencia: { label: 'PIX', icon: PixIconImg, color: '#0284c7', bg: '#e0f2fe', imgUrl: 'https://img.icons8.com/fluency/48/pix.png' },
  boleto: { label: 'PIX', icon: PixIconImg, color: '#0284c7', bg: '#e0f2fe', imgUrl: 'https://img.icons8.com/fluency/48/pix.png' },
  outro: { label: 'PIX', icon: PixIconImg, color: '#0284c7', bg: '#e0f2fe', imgUrl: 'https://img.icons8.com/fluency/48/pix.png' },
};

function renderPaymentMethodButtons(value: string, onChange: (next: string) => void) {
  const options = [
    { key: 'pix', label: 'PIX', Icon: PixIconImg },
    { key: 'cartao', label: 'Cartão', Icon: CardIconImg },
    { key: 'dinheiro', label: 'Dinheiro', Icon: MoneyIconImg },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '4px',
        background: '#f1f5f9',
        padding: '3.5px',
        borderRadius: '11px',
        border: '1px solid #e2e8f0',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        const IconComp = opt.Icon;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              background: active ? '#1a3a4a' : 'transparent',
              color: active ? '#ffffff' : '#334155',
              border: 'none',
              borderRadius: '8.5px',
              padding: '7px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: active ? 700 : 600,
              fontSize: '0.8rem',
              letterSpacing: '-0.01em',
              boxShadow: active ? '0 2px 6px rgba(26,58,74,0.22), inset 0 1px 0 rgba(255,255,255,0.14)' : 'none',
              transition: 'all 0.16s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            <IconComp size={16} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const CATEGORIES_ENTRADA: Record<string, string> = {
  sessao_avulsa: 'Sessão Avulsa de Hipnose',
  pacote_tratamento: 'Pacote / Tratamento Completo',
  avaliacao_inicial: 'Avaliação Inicial & Triagem',
  terapia_integrativa: 'Terapia Integrativa / Floral / Holística',
  cursos_workshops: 'Cursos, Palestras & Workshops',
  produtos_livros: 'Produtos, Áudios & Livros',
  outras_entradas: 'Outras Receitas Operacionais',
};

const CATEGORIES_SAIDA: Record<string, string> = {
  aluguel_condominio: 'Aluguel & Condomínio da Clínica',
  energia_agua_internet: 'Energia, Água, Internet & Telefonia',
  softwares_plataformas: 'Softwares, Plataformas, IA & Domínios',
  materiais_suprimentos: 'Materiais & Insumos Clínicos',
  marketing_anuncios: 'Marketing, Anúncios, Tráfego & Redes',
  impostos_contabilidade: 'Impostos, Taxas & Honorários Contábeis',
  limpeza_manutencao: 'Limpeza, Higienização & Manutenção',
  pro_labore: 'Pró-Labore / Retirada Profissional',
  taxas_bancarias: 'Taxas Bancárias & Operadoras de Cartão',
  outras_saidas: 'Outras Despesas Operacionais',
};

function formatDateTime(val: string | null) {
  if (!val) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(val));
  } catch {
    return val;
  }
}

function formatDateOnly(val: string | null) {
  if (!val) return '—';
  try {
    const parts = val.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  } catch {
    return val;
  }
}

// Helpers para pontuação automática de moeda (R$)
function parseMoneyInput(val: string): number {
  if (!val || !val.trim()) return 0;
  const trimmed = val.trim();
  // Se vier no formato inglês "125.00" (sem vírgula e com 1 ou 2 casas após o único ponto), interpreta o ponto como decimal
  if (!trimmed.includes(',') && /^\d+\.\d{1,2}$/.test(trimmed)) {
    const n = parseFloat(trimmed);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function formatCentsToMoneyInput(cents: number): string {
  const reais = Math.max(0, Math.round(cents)) / 100;
  return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyWhileTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  if (!cleaned) return '';
  const commaIdx = cleaned.indexOf(',');
  let intPart = commaIdx >= 0 ? cleaned.slice(0, commaIdx) : cleaned;
  const decPart = commaIdx >= 0 ? cleaned.slice(commaIdx + 1).replace(/,/g, '').slice(0, 2) : null;

  intPart = intPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return decPart !== null ? `${formattedInt || '0'},${decPart}` : formattedInt;
}

function formatMoneyOnBlur(val: string): string {
  if (!val || !val.trim()) return '';
  const num = parseMoneyInput(val);
  if (num <= 0) return '0,00';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyOnFocus(val: string): string {
  if (val.endsWith(',00')) {
    return val.slice(0, -3);
  }
  return val;
}

// Helpers para renderização matemática de curvas spline e escalas financeiras SVG
function getNiceMax(valCents: number) {
  const valReais = Math.max(100, valCents / 100);
  const magnitude = Math.pow(10, Math.floor(Math.log10(valReais)));
  const norm = valReais / magnitude;
  let niceNorm = 1;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * magnitude * 100;
}

function getSplinePath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function getAreaPath(pts: { x: number; y: number }[], baseY: number) {
  if (pts.length === 0) return '';
  const curve = getSplinePath(pts);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${curve} L ${last.x.toFixed(1)},${baseY} L ${first.x.toFixed(1)},${baseY} Z`;
}

type FinMainTab = 'dashboard' | 'dre' | 'pagamentos' | 'lancamentos';
const VALID_FIN_TABS: FinMainTab[] = ['dashboard', 'dre', 'pagamentos', 'lancamentos'];

export default function AdminFinanceiroPage() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab') as FinMainTab | null;

  // Aba principal de visão (persiste no F5 via ?tab=... na URL e localStorage)
  const [activeMainTab, setActiveMainTabState] = useState<FinMainTab>(() => {
    if (urlTab && VALID_FIN_TABS.includes(urlTab)) return urlTab;
    return 'dashboard';
  });
  const [paymentsClientFilter, setPaymentsClientFilter] = useState('');

  const setActiveMainTab = useCallback((nextTab: FinMainTab) => {
    setActiveMainTabState(nextTab);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('clinica_fin_active_tab', nextTab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const currentUrl = new URL(window.location.href);
      const paramTab = currentUrl.searchParams.get('tab') as FinMainTab | null;
      if (paramTab && VALID_FIN_TABS.includes(paramTab)) {
        setActiveMainTabState(paramTab);
        window.localStorage.setItem('clinica_fin_active_tab', paramTab);
        return;
      }
      const saved = window.localStorage.getItem('clinica_fin_active_tab') as FinMainTab | null;
      if (saved && VALID_FIN_TABS.includes(saved)) {
        setActiveMainTabState(saved);
        currentUrl.searchParams.set('tab', saved);
        window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
      }
    } catch {
      // ignore
    }
  }, []);

  // Modo de visualização do gráfico de fluxo ('spline' = Curva/Área Fluida | 'bars' = Colunas Tecnológicas | 'balance' = Balanço Acumulado)
  const [chartStyle, setChartStyle] = useState<'spline' | 'bars' | 'balance'>('spline');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  // Filtros de período (Hoje, Semanal, Mensal, Geral/Tudo, Personalizado)
  const [periodPreset, setPeriodPreset] = useState<'hoje' | 'semanal' | 'mensal' | 'todos' | 'custom'>('mensal');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [drePrintModalOpen, setDrePrintModalOpen] = useState(false);

  // Estados dos dados com Instant Cache (0ms)
  type FinancialCachePayload = {
    payments: Payment[];
    dre: DreSummary;
    servicesHighlight: ServiceHighlight[];
    expensesByCategory: ExpenseCategoryItem[];
    methodBreakdown: MethodBreakdown[];
    timelineData: TimelinePoint[];
    periodInfo: { period: string; fromDate?: string; toDate?: string };
  };

  const defaultDre: DreSummary = {
    receitaBrutaCents: 0,
    deducoesDescontosCents: 0,
    receitaLiquidaCents: 0,
    receitaRealizadaCaixaCents: 0,
    custosVariaveisCents: 0,
    lucroBrutoCents: 0,
    margemBrutaPct: 0,
    despesasOperacionaisCents: 0,
    totalDespesasCents: 0,
    totalDespesasPagasCents: 0,
    lucroLiquidoCents: 0,
    margemLiquidaPct: 0,
    saldoLiquidoCaixaCents: 0,
    totalAReceberCents: 0,
    totalAPagarCents: 0,
    totalVencidoCents: 0,
  };

  const initialFinCache = getInstantCache<FinancialCachePayload | null>('admin_financial_data', null);
  const [payments, setPayments] = useState<Payment[]>(() => initialFinCache?.payments ?? []);
  const [dre, setDre] = useState<DreSummary>(() => initialFinCache?.dre ?? defaultDre);
  const [servicesHighlight, setServicesHighlight] = useState<ServiceHighlight[]>(() => initialFinCache?.servicesHighlight ?? []);
  const [expensesByCategory, setExpensesByCategory] = useState<ExpenseCategoryItem[]>(() => initialFinCache?.expensesByCategory ?? []);
  const [methodBreakdown, setMethodBreakdown] = useState<MethodBreakdown[]>(() => initialFinCache?.methodBreakdown ?? []);
  const [timelineData, setTimelineData] = useState<TimelinePoint[]>(() => initialFinCache?.timelineData ?? []);
  const [periodInfo, setPeriodInfo] = useState<{ period: string; fromDate?: string; toDate?: string }>(() => initialFinCache?.periodInfo ?? { period: 'mensal' });
  const [loading, setLoading] = useState(() => !initialFinCache);

  // Filtros da tabela de lançamentos
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pago' | 'pendente' | 'parcial' | 'vencido' | 'parcelado'>('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [methodFilter, setMethodFilter] = useState('todos');

  // Listas auxiliares hidratadas com instant cache
  const [clients, setClients] = useState<ClientOption[]>(() => getInstantCache<ClientOption[]>('admin_financial_clients', []));
  const [services, setServices] = useState<ServiceOption[]>(() => getInstantCache<ServiceOption[]>('admin_financial_services', []));

  // Modais
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalMode, setNewModalMode] = useState<'geral' | 'cliente'>('geral');
  const [payModalOpen, setPayModalOpen] = useState<Payment | null>(null);
  const [viewTransactionsModal, setViewTransactionsModal] = useState<Payment | null>(null);
  const [receiptModal, setReceiptModal] = useState<Payment | null>(null);
  const [whatsappChargeModal, setWhatsappChargeModal] = useState<Payment | null>(null);
  const [whatsappCustomMessage, setWhatsappCustomMessage] = useState('');
  const [whatsappChargeLoading, setWhatsappChargeLoading] = useState(false);
  const [whatsappChargeSuccess, setWhatsappChargeSuccess] = useState<{
    clientName: string;
    phone: string;
    amount: string;
    date: string;
  } | null>(null);

  // Central de Gerenciamento do Lançamento (Abrir ao clicar na linha)
  const [managePaymentModal, setManagePaymentModal] = useState<Payment | null>(null);
  const [manageModalTab, setManageModalTab] = useState<'detalhes' | 'quitar' | 'parcelar' | 'recibo'>('detalhes');

  // Estados de Parcelamento / Renegociação dentro do Modal
  const [renegoInstallmentsCount, setRenegoInstallmentsCount] = useState('3');
  const [renegoIntervalDays, setRenegoIntervalDays] = useState('30');
  const [renegoFirstDueDate, setRenegoFirstDueDate] = useState('');
  const [renegoMethod, setRenegoMethod] = useState('cartao');
  const [renegoFirstPaid, setRenegoFirstPaid] = useState(false);
  const [renegoNotes, setRenegoNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State: Novo Lançamento
  const [formEntryType, setFormEntryType] = useState<'entrada' | 'saida'>('entrada');
  const [formCategory, setFormCategory] = useState('sessao_avulsa');
  const [billingType, setBillingType] = useState<'avista' | 'parcial' | 'parcelado'>('avista');
  const [formClientId, setFormClientId] = useState('');
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formServiceId, setFormServiceId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmountStr, setFormAmountStr] = useState('');
  const [formDiscountStr, setFormDiscountStr] = useState('');
  const [formMethod, setFormMethod] = useState('pix');
  const [formStatus, setFormStatus] = useState<'pago' | 'pendente'>('pago');
  const [formPaidAt, setFormPaidAt] = useState('');
  const [formDueAt, setFormDueAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formInitialPaidStr, setFormInitialPaidStr] = useState('');
  const [formInstallmentsCount, setFormInstallmentsCount] = useState('3');
  const [formIntervalDays, setFormIntervalDays] = useState('30');
  const [formFirstDueDate, setFormFirstDueDate] = useState('');
  const [formFirstPaid, setFormFirstPaid] = useState(false);
  const [formAllPaid, setFormAllPaid] = useState(false);

  // Estados de busca / combobox (Cliente, Serviço e Categoria com cadastro dinâmico)
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceOpen, setServiceOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('Sessão Avulsa de Hipnose');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [customCategoriesEntrada, setCustomCategoriesEntrada] = useState<Record<string, string>>({});
  const [customCategoriesSaida, setCustomCategoriesSaida] = useState<Record<string, string>>({});

  // Form State: Baixa
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payMethod, setPayMethod] = useState('pix');
  const [payDate, setPayDate] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Categorias mescladas (padrão + cadastradas pelo usuário)
  const allCategoriesEntrada = useMemo(
    () => ({ ...CATEGORIES_ENTRADA, ...customCategoriesEntrada }),
    [customCategoriesEntrada]
  );
  const allCategoriesSaida = useMemo(
    () => ({ ...CATEGORIES_SAIDA, ...customCategoriesSaida }),
    [customCategoriesSaida]
  );

  useEffect(() => {
    try {
      const savedEnt = localStorage.getItem('clinica_custom_categories_entrada');
      if (savedEnt) setCustomCategoriesEntrada(JSON.parse(savedEnt));
      const savedSai = localStorage.getItem('clinica_custom_categories_saida');
      if (savedSai) setCustomCategoriesSaida(JSON.parse(savedSai));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!payments.length) return;
    setCustomCategoriesEntrada((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of payments) {
        if (p.entryType === 'entrada' && p.category && !CATEGORIES_ENTRADA[p.category] && !next[p.category]) {
          next[p.category] = p.category;
          changed = true;
        }
      }
      if (changed) {
        try { localStorage.setItem('clinica_custom_categories_entrada', JSON.stringify(next)); } catch {}
        return next;
      }
      return prev;
    });
    setCustomCategoriesSaida((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of payments) {
        if (p.entryType === 'saida' && p.category && !CATEGORIES_SAIDA[p.category] && !next[p.category]) {
          next[p.category] = p.category;
          changed = true;
        }
      }
      if (changed) {
        try { localStorage.setItem('clinica_custom_categories_saida', JSON.stringify(next)); } catch {}
        return next;
      }
      return prev;
    });
  }, [payments]);

  function registerCustomCategory(type: 'entrada' | 'saida', rawName: string): string {
    const trimmed = rawName.trim();
    if (!trimmed) return type === 'entrada' ? 'sessao_avulsa' : 'aluguel_condominio';
    const dict = type === 'entrada' ? allCategoriesEntrada : allCategoriesSaida;
    const existingEntry = Object.entries(dict).find(
      ([k, label]) => k.toLowerCase() === trimmed.toLowerCase() || label.toLowerCase() === trimmed.toLowerCase()
    );
    if (existingEntry) return existingEntry[0];
    if (type === 'entrada') {
      const next = { ...customCategoriesEntrada, [trimmed]: trimmed };
      setCustomCategoriesEntrada(next);
      try { localStorage.setItem('clinica_custom_categories_entrada', JSON.stringify(next)); } catch {}
    } else {
      const next = { ...customCategoriesSaida, [trimmed]: trimmed };
      setCustomCategoriesSaida(next);
      try { localStorage.setItem('clinica_custom_categories_saida', JSON.stringify(next)); } catch {}
    }
    return trimmed;
  }

  const filteredCategoryOptions = useMemo(() => {
    const dict = formEntryType === 'entrada' ? allCategoriesEntrada : allCategoriesSaida;
    const entries = Object.entries(dict);
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return entries;
    const currentLabel = dict[formCategory];
    if (currentLabel && currentLabel.toLowerCase() === q) return entries;
    return entries.filter(([k, label]) => label.toLowerCase().includes(q) || k.toLowerCase().includes(q));
  }, [formEntryType, allCategoriesEntrada, allCategoriesSaida, categoryQuery, formCategory]);

  const filteredClientOptions = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    const qDigits = q.replace(/\D/g, '');
    return clients.filter((c) => {
      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const emailMatch = (c.email || '').toLowerCase().includes(q);
      const phoneMatch = (c.phone || '').toLowerCase().includes(q) || (qDigits.length >= 2 && (c.phone || '').replace(/\D/g, '').includes(qDigits));
      const cpfMatch = (c.cpf || '').toLowerCase().includes(q) || (qDigits.length >= 2 && (c.cpf || '').replace(/\D/g, '').includes(qDigits));
      const rgMatch = (c.rg || '').toLowerCase().includes(q) || (qDigits.length >= 2 && (c.rg || '').replace(/\D/g, '').includes(qDigits));
      return nameMatch || emailMatch || phoneMatch || cpfMatch || rgMatch;
    });
  }, [clients, clientQuery]);

  const filteredServiceOptions = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [services, serviceQuery]);

  // Carregamento de dados com período selecionado
  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('period', periodPreset);
      if (periodPreset === 'custom') {
        if (customFrom) params.set('from', customFrom);
        if (customTo) params.set('to', customTo);
      }
      if (search) params.set('search', search);
      if (entryTypeFilter !== 'todos') params.set('entryType', entryTypeFilter);
      if (categoryFilter !== 'todos') params.set('category', categoryFilter);
      if (statusFilter !== 'todos' && statusFilter !== 'parcelado') params.set('status', statusFilter);
      if (methodFilter !== 'todos') params.set('method', methodFilter);

      const res = await fetch(`/api/admin/payments?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();

      let paymentList: Payment[] = data.payments || [];
      if (statusFilter === 'parcelado') {
        paymentList = paymentList.filter((p) => p.chargeType === 'parcelado' || (p.totalInstallments && p.totalInstallments > 1));
      }

      setPayments(paymentList);
      setDre(data.dre || dre);
      setServicesHighlight(data.servicesHighlight || []);
      setExpensesByCategory(data.expensesByCategory || []);
      setMethodBreakdown(data.methodBreakdown || []);
      setTimelineData(data.timelineData || []);
      setPeriodInfo(data.periodInfo || { period: periodPreset });

      // Salva snapshot no Instant Cache (0ms no próximo carregamento)
      setInstantCache('admin_financial_data', {
        payments: paymentList,
        dre: data.dre || dre,
        servicesHighlight: data.servicesHighlight || [],
        expensesByCategory: data.expensesByCategory || [],
        methodBreakdown: data.methodBreakdown || [],
        timelineData: data.timelineData || [],
        periodInfo: data.periodInfo || { period: periodPreset },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [periodPreset, customFrom, customTo, search, entryTypeFilter, categoryFilter, statusFilter, methodFilter]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/clients').then((r) => r.json()).catch(() => ({ clients: [] })),
      fetch('/api/admin/services').then((r) => r.json()).catch(() => ({ services: [] })),
    ]).then(([cliData, srvData]) => {
      const cliList = cliData.clients || [];
      const srvList = srvData.services || [];
      setClients(cliList);
      setServices(srvList);
      setInstantCache('admin_financial_clients', cliList);
      setInstantCache('admin_financial_services', srvList);
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSelectService(srvId: string) {
    setFormServiceId(srvId);
    if (!srvId) return;
    const srv = services.find((s) => s.id === srvId);
    if (srv) {
      if (!formDescription || formDescription.startsWith('Atendimento') || formDescription.startsWith('Sessão')) {
        setFormDescription(srv.name);
      }
      if (srv.priceCents > 0) {
        setFormAmountStr(formatCentsToMoneyInput(srv.priceCents));
      }
      setFormCategory('sessao_avulsa');
      setCategoryQuery(allCategoriesEntrada['sessao_avulsa'] || 'Sessão Avulsa de Hipnose');
    }
  }

  function handleToggleEntryType(t: 'entrada' | 'saida') {
    setFormEntryType(t);
    if (t === 'saida') {
      setFormCategory('aluguel_condominio');
      setCategoryQuery(allCategoriesSaida['aluguel_condominio'] || 'Aluguel & Condomínio da Clínica');
      setBillingType('avista');
      setFormClientId('');
      setClientQuery('');
    } else if (newModalMode === 'cliente') {
      setFormCategory('sessao_avulsa');
      setCategoryQuery(allCategoriesEntrada['sessao_avulsa'] || 'Sessão Avulsa de Hipnose');
    } else {
      setFormCategory('outras_entradas');
      setCategoryQuery(allCategoriesEntrada['outras_entradas'] || 'Outras Receitas Operacionais');
    }
  }

  async function handleCreatePayment(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      let resolvedClientId = newModalMode === 'cliente' ? formClientId : '';
      if (newModalMode === 'cliente' && !resolvedClientId) {
        const q = clientQuery.trim().toLowerCase();
        if (q) {
          const exact = clients.find((c) => (c.name || '').toLowerCase() === q);
          if (exact) resolvedClientId = exact.id;
          else if (filteredClientOptions.length === 1) resolvedClientId = filteredClientOptions[0].id;
        }
        if (!resolvedClientId) {
          throw new Error('Selecione obrigatoriamente o cliente na lista antes de registrar o pagamento do cliente.');
        }
      }

      const cleanAmount = parseFloat(formAmountStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanAmount) || cleanAmount <= 0) {
        throw new Error('Informe um valor válido maior que zero.');
      }
      const cleanDiscount = formDiscountStr ? parseFloat(formDiscountStr.replace(/\./g, '').replace(',', '.')) : 0;
      const amountCents = Math.round(cleanAmount * 100);
      const discountCents = Math.round((isNaN(cleanDiscount) ? 0 : cleanDiscount) * 100);

      const baseDescription = formDescription.trim() || (formEntryType === 'saida' ? 'Despesa Operacional' : 'Entrada Financeira');
      const supplierClean = formSupplierName.trim();
      const finalDescription =
        newModalMode === 'geral' && supplierClean && !baseDescription.toLowerCase().includes(supplierClean.toLowerCase())
          ? `${baseDescription} (${supplierClean})`
          : baseDescription;
      const resolvedCategory = categoryQuery.trim()
        ? registerCustomCategory(formEntryType, categoryQuery)
        : formCategory;

      const notePrefix = supplierClean
        ? `${formEntryType === 'saida' ? 'Favorecido' : 'Origem/Pagador'}: ${supplierClean}. `
        : '';

      const payload: Record<string, unknown> = {
        entryType: formEntryType,
        category: resolvedCategory,
        clientId: resolvedClientId || null,
        serviceId: newModalMode === 'cliente' ? (formServiceId || null) : null,
        description: finalDescription,
        amountCents,
        discountCents,
        billingType,
        paymentMethod: formMethod,
        notes: notePrefix + (formNotes.trim() || ''),
      };

      if (billingType === 'avista') {
        payload.status = formStatus;
        payload.paidAt = formStatus === 'pago' ? (formPaidAt ? new Date(formPaidAt).toISOString() : new Date().toISOString()) : null;
        payload.dueAt = formDueAt || null;
      } else if (billingType === 'parcial') {
        const cleanInitial = parseFloat(formInitialPaidStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(cleanInitial) || cleanInitial < 0) {
          throw new Error('Informe o valor pago de entrada.');
        }
        payload.initialPaidCents = Math.round(cleanInitial * 100);
        payload.paidAt = formPaidAt ? new Date(formPaidAt).toISOString() : new Date().toISOString();
        payload.dueAt = formDueAt || null;
      } else if (billingType === 'parcelado') {
        const count = parseInt(formInstallmentsCount, 10);
        if (isNaN(count) || count < 2) {
          throw new Error('O parcelamento deve ser de no mínimo 2 vezes.');
        }
        payload.installmentsCount = count;
        payload.intervalDays = parseInt(formIntervalDays, 10) || 30;
        payload.firstDueDate = formFirstDueDate || new Date().toISOString().slice(0, 10);
        payload.firstPaid = formFirstPaid;
        payload.allPaid = formAllPaid;
      }

      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao registrar.');

      setNewModalOpen(false);
      resetNewForm();
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetNewForm() {
    setFormEntryType('entrada');
    setFormCategory('sessao_avulsa');
    setCategoryQuery(allCategoriesEntrada['sessao_avulsa'] || 'Sessão Avulsa de Hipnose');
    setCategoryOpen(false);
    setFormClientId('');
    setClientQuery('');
    setClientOpen(false);
    setFormSupplierName('');
    setFormServiceId('');
    setServiceQuery('');
    setServiceOpen(false);
    setFormDescription('');
    setFormAmountStr('');
    setFormDiscountStr('');
    setFormMethod('pix');
    setFormStatus('pago');
    setFormPaidAt(new Date().toISOString().slice(0, 16));
    setFormDueAt(new Date().toISOString().slice(0, 10));
    setFormNotes('');
    setFormInitialPaidStr('');
    setFormInstallmentsCount('3');
    setFormIntervalDays('30');
    setFormFirstDueDate('');
    setFormFirstPaid(false);
    setFormAllPaid(false);
    setErrorMsg('');
  }

  function openPayDialog(payment: Payment) {
    openManageModal(payment, 'quitar');
  }

  function openWhatsappChargeModal(payment: Payment) {
    setWhatsappChargeSuccess(null);
    setWhatsappChargeModal(payment);
    const rem = payment.remainingAmountCents || payment.amountCents;
    const total = payment.amountCents || rem;
    const due = payment.dueAt ? formatDateOnly(payment.dueAt) : formatDateOnly(new Date().toISOString());
    const firstName = (payment.clientName || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';

    const defaultMsg = `Olá, *${firstName}*! 📄\n\nPassando para lembrar do seu saldo em aberto com vencimento em *${due}*:\n\n🧾 *Fatura / Atendimento:*\n${payment.description || 'Atendimento Clínico'}\n\n💰 *Valor Pendente:* ${formatCurrency(rem)}\n📊 *Valor Total:* ${formatCurrency(total)}\n\n🔑 *Chave PIX para Pagamento:*\n(48) 99691-5303 (Chave Telefone)\n*Favorecida:* Camila Machado\n\nPor gentileza, após efetuar o pagamento nos envie o *comprovante por aqui* para registrarmos a baixa no sistema. 🌿\n\nCaso já tenha efetuado o pagamento, por favor desconsidere este aviso. Muito obrigada! ✨`;

    setWhatsappCustomMessage(defaultMsg);
  }

  async function handleSendWhatsappCharge() {
    if (!whatsappChargeModal) return;
    setWhatsappChargeLoading(true);

    const clientName = whatsappChargeModal.clientName || 'o cliente';
    const clientPhone = whatsappChargeModal.clientPhone || '';
    const openVal = formatCurrency(whatsappChargeModal.remainingAmountCents || whatsappChargeModal.amountCents);
    const modalId = whatsappChargeModal.id;

    try {
      const res = await fetch(`/api/admin/payments/${modalId}/whatsapp-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMessage: whatsappCustomMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar cobrança via WhatsApp.');

      // Finaliza o loading e exibe tela de sucesso inline no modal
      setWhatsappChargeLoading(false);
      setWhatsappChargeSuccess({
        clientName,
        phone: clientPhone,
        amount: openVal,
        date: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err: unknown) {
      setWhatsappChargeLoading(false);
      await alertDialog({
        title: 'Erro ao Enviar Cobrança',
        description: err instanceof Error ? err.message : 'Falha na comunicação com o WhatsApp.',
        variant: 'error',
      });
    } finally {
      setWhatsappChargeLoading(false);
    }
  }

  function normalizeMethodValue(m?: string | null): 'pix' | 'cartao' | 'dinheiro' {
    if (m === 'cartao' || m === 'cartao_credito' || m === 'cartao_debito') return 'cartao';
    if (m === 'dinheiro') return 'dinheiro';
    return 'pix';
  }

  function openManageModal(payment: Payment, defaultTab: 'detalhes' | 'quitar' | 'parcelar' | 'recibo' = 'detalhes') {
    setManagePaymentModal(payment);
    setManageModalTab(defaultTab);
    if (defaultTab === 'recibo') setReceiptModal(payment);
    else if (defaultTab !== 'parcelar' && payment.remainingAmountCents > 0) setPayModalOpen(payment);
    else if (defaultTab === 'detalhes') setViewTransactionsModal(payment);
    const rem = payment.remainingAmountCents;
    setPayAmountStr(formatCentsToMoneyInput(rem));
    setPayMethod(normalizeMethodValue(payment.paymentMethod));
    setPayDate(new Date().toISOString().slice(0, 16));
    setPayNotes('');

    setRenegoInstallmentsCount('3');
    setRenegoIntervalDays('30');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setRenegoFirstDueDate(d.toISOString().slice(0, 10));
    setRenegoMethod(normalizeMethodValue(payment.paymentMethod));
    setRenegoFirstPaid(false);
    setRenegoNotes('');
    setErrorMsg('');
  }

  async function handleRenegotiateInstallment(e: FormEvent) {
    e.preventDefault();
    if (!managePaymentModal) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/admin/payments/${managePaymentModal.id}/installment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installmentsCount: parseInt(renegoInstallmentsCount, 10) || 2,
          intervalDays: parseInt(renegoIntervalDays, 10) || 30,
          firstDueDate: renegoFirstDueDate || new Date().toISOString().slice(0, 10),
          paymentMethod: renegoMethod,
          firstPaid: renegoFirstPaid,
          notes: renegoNotes.trim() || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao parcelar saldo.');

      setManagePaymentModal(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar parcelamento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManagePay(e: FormEvent) {
    e.preventDefault();
    if (!managePaymentModal) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const cleanVal = parseFloat(payAmountStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanVal) || cleanVal <= 0) {
        throw new Error('Informe um valor de recebimento válido maior que zero.');
      }
      const amountCents = Math.round(cleanVal * 100);

      const res = await fetch(`/api/admin/payments/${managePaymentModal.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          paymentMethod: payMethod,
          paidAt: payDate ? new Date(payDate).toISOString() : new Date().toISOString(),
          notes: payNotes.trim() || null,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao processar baixa.');

      setManagePaymentModal(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar baixa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterPay(e: FormEvent) {
    e.preventDefault();
    if (!payModalOpen) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const cleanVal = parseFloat(payAmountStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanVal) || cleanVal <= 0) {
        throw new Error('Informe um valor de recebimento válido.');
      }
      const amountCents = Math.round(cleanVal * 100);

      const res = await fetch(`/api/admin/payments/${payModalOpen.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          paymentMethod: payMethod,
          paidAt: payDate ? new Date(payDate).toISOString() : new Date().toISOString(),
          notes: payNotes.trim() || null,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao processar baixa.');

      setPayModalOpen(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar baixa.');
    } finally {
      setSubmitting(false);
    }
  }

  const { confirmDialog, alertDialog, dialogNode } = useConfirmDialog();

  async function handleDeletePayment(paymentId: string) {
    const targetPayment = payments.find((p) => p.id === paymentId) || managePaymentModal;
    const { confirmed } = await confirmDialog({
      title: 'Excluir lançamento financeiro',
      description: 'Tem certeza que deseja cancelar e excluir permanentemente este lançamento financeiro? Essa ação não pode ser desfeita.',
      highlightText: targetPayment
        ? `${targetPayment.description} (${formatCurrency(targetPayment.amountCents)})`
        : undefined,
      confirmLabel: 'Sim, excluir lançamento',
      cancelLabel: 'Voltar',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, { method: 'DELETE' });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Falha ao excluir.');
      if (managePaymentModal?.id === paymentId) {
        setManagePaymentModal(null);
      }
      await loadData();
    } catch (err: unknown) {
      await alertDialog({
        title: 'Erro ao excluir lançamento',
        description: err instanceof Error ? err.message : 'Não foi possível excluir o lançamento.',
        variant: 'error',
      });
    }
  }

  const renegoPreview = useMemo(() => {
    if (!managePaymentModal || managePaymentModal.remainingAmountCents <= 0) return [];
    const count = Math.max(2, parseInt(renegoInstallmentsCount, 10) || 2);
    const rem = managePaymentModal.remainingAmountCents;
    const base = Math.floor(rem / count);
    const remainder = rem % count;
    const interval = parseInt(renegoIntervalDays, 10) || 30;
    const start = renegoFirstDueDate ? new Date(renegoFirstDueDate) : new Date();

    const list = [];
    for (let i = 1; i <= count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + (i - 1) * interval);
      const val = i === 1 ? base + remainder : base;
      list.push({
        number: i,
        cents: val,
        dateStr: d.toLocaleDateString('pt-BR'),
        isPaid: i === 1 && renegoFirstPaid,
      });
    }
    return list;
  }, [managePaymentModal, renegoInstallmentsCount, renegoIntervalDays, renegoFirstDueDate, renegoFirstPaid]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const client = (p.clientName || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const serv = (p.serviceName || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        if (!client.includes(q) && !desc.includes(q) && !serv.includes(q) && !cat.includes(q)) return false;
      }
      if (entryTypeFilter !== 'todos' && p.entryType !== entryTypeFilter) return false;
      if (statusFilter === 'pago' && p.status !== 'pago') return false;
      if (statusFilter === 'pendente' && p.status !== 'pendente') return false;
      if (statusFilter === 'parcial' && p.status !== 'parcial') return false;
      if (statusFilter === 'vencido' && !p.isOverdue) return false;
      if (statusFilter === 'parcelado' && p.chargeType !== 'parcelado' && p.status !== 'parcelado') return false;
      if (categoryFilter !== 'todos' && p.category !== categoryFilter) return false;
      if (methodFilter !== 'todos') {
        if (methodFilter === 'cartao') {
          if (p.paymentMethod !== 'cartao' && p.paymentMethod !== 'cartao_credito' && p.paymentMethod !== 'cartao_debito') return false;
        } else if (p.paymentMethod !== methodFilter) {
          return false;
        }
      }
      return true;
    });
  }, [payments, search, entryTypeFilter, statusFilter, categoryFilter, methodFilter]);

  const installmentPreview = useMemo(() => {
    if (billingType !== 'parcelado') return [];
    const cleanAmount = parseFloat(formAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanAmount) || cleanAmount <= 0) return [];
    const count = Math.max(2, parseInt(formInstallmentsCount, 10) || 2);
    const cleanDiscount = formDiscountStr ? parseFloat(formDiscountStr.replace(/\./g, '').replace(',', '.')) : 0;
    const net = Math.max(0, cleanAmount - (isNaN(cleanDiscount) ? 0 : cleanDiscount));
    const netCents = Math.round(net * 100);
    const base = Math.floor(netCents / count);
    const rem = netCents % count;
    const interval = parseInt(formIntervalDays, 10) || 30;
    const start = formFirstDueDate ? new Date(formFirstDueDate) : new Date();

    const list = [];
    for (let i = 1; i <= count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + (i - 1) * interval);
      const val = i === 1 ? base + rem : base;
      list.push({
        number: i,
        cents: val,
        dateStr: d.toLocaleDateString('pt-BR'),
        isPaid: formAllPaid || (i === 1 && formFirstPaid),
      });
    }
    return list;
  }, [billingType, formAmountStr, formDiscountStr, formInstallmentsCount, formIntervalDays, formFirstDueDate, formFirstPaid, formAllPaid]);

  // Métricas matemáticas e geometria vetorial para o Gráfico SVG de Alta Tecnologia
  const chartMetrics = useMemo(() => {
    const rawMax = Math.max(
      0,
      ...timelineData.map((t) => Math.max(t.receivedCents, t.expenseCents))
    );
    const niceMaxCents = getNiceMax(rawMax);

    const chartLeft = 65;
    const chartRight = 790;
    const chartTop = 24;
    const chartBottom = 205;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    const count = timelineData.length;
    const points = timelineData.map((pt, i) => {
      const x = count > 1 ? chartLeft + (i / (count - 1)) * chartWidth : chartLeft + chartWidth / 2;
      const yReceived = chartBottom - (pt.receivedCents / niceMaxCents) * chartHeight;
      const yExpense = chartBottom - (pt.expenseCents / niceMaxCents) * chartHeight;
      return {
        ...pt,
        x,
        yReceived,
        yExpense,
      };
    });

    // Balanço acumulado
    let runningBalance = 0;
    const balanceList = timelineData.map((pt, i) => {
      runningBalance += pt.netCents;
      const x = count > 1 ? chartLeft + (i / (count - 1)) * chartWidth : chartLeft + chartWidth / 2;
      return {
        ...pt,
        accumulatedCents: runningBalance,
        x,
      };
    });

    const maxAbsBalance = Math.max(
      niceMaxCents,
      ...balanceList.map((b) => Math.abs(b.accumulatedCents))
    );
    const niceBalanceMax = getNiceMax(maxAbsBalance);

    const zeroY = chartTop + chartHeight / 2;
    const balancePoints = balanceList.map((b) => {
      const deltaY = (b.accumulatedCents / niceBalanceMax) * (chartHeight / 2);
      const y = zeroY - deltaY;
      return {
        ...b,
        y,
      };
    });

    const splineReceived = getSplinePath(points.map((p) => ({ x: p.x, y: p.yReceived })));
    const areaReceived = getAreaPath(points.map((p) => ({ x: p.x, y: p.yReceived })), chartBottom);

    const splineExpense = getSplinePath(points.map((p) => ({ x: p.x, y: p.yExpense })));
    const areaExpense = getAreaPath(points.map((p) => ({ x: p.x, y: p.yExpense })), chartBottom);

    const splineBalance = getSplinePath(balancePoints.map((p) => ({ x: p.x, y: p.y })));
    const areaBalance = getAreaPath(balancePoints.map((p) => ({ x: p.x, y: p.y })), zeroY);

    const totalReceivedPeriod = timelineData.reduce((acc, t) => acc + t.receivedCents, 0);
    const totalExpensePeriod = timelineData.reduce((acc, t) => acc + t.expenseCents, 0);
    const netPeriod = totalReceivedPeriod - totalExpensePeriod;

    return {
      niceMaxCents,
      niceBalanceMax,
      zeroY,
      chartLeft,
      chartRight,
      chartTop,
      chartBottom,
      chartWidth,
      chartHeight,
      points,
      balancePoints,
      splineReceived,
      areaReceived,
      splineExpense,
      areaExpense,
      splineBalance,
      areaBalance,
      rawMax,
      totalReceivedPeriod,
      totalExpensePeriod,
      netPeriod,
    };
  }, [timelineData]);

  const renderPaymentsTableSection = (title: string, subtitle: string) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
        {/* Topo da Seção com Título e Ações */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1a3a4a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <WalletCards size={22} style={{ color: '#0284c7', flexShrink: 0 }} /> {title}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0' }}>
              {subtitle}
            </p>
          </div>
          <div className="fin-section-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                resetNewForm();
                setNewModalMode('geral');
                setFormEntryType('saida');
                setFormCategory('aluguel_condominio');
                setCategoryQuery(allCategoriesSaida['aluguel_condominio'] || 'Aluguel & Condomínio da Clínica');
                setNewModalOpen(true);
              }}
              style={{
                background: '#fff1f2',
                color: '#e11d48',
                border: '1.5px solid #fda4af',
                padding: '7px 13px',
                minHeight: '36px',
                borderRadius: '10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 1px 2px rgba(225, 29, 72, 0.06)',
                transition: 'all 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)',
              }}
            >
              <ArrowUpRight size={14} /> Nova Despesa (Saída)
            </button>
            <button
              type="button"
              onClick={() => {
                resetNewForm();
                setNewModalMode('geral');
                setFormEntryType('entrada');
                setFormCategory('outras_entradas');
                setCategoryQuery(allCategoriesEntrada['outras_entradas'] || 'Outras Receitas Operacionais');
                setNewModalOpen(true);
              }}
              style={{
                background: 'linear-gradient(180deg, #244b5e 0%, #1a3a4a 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                minHeight: '36px',
                borderRadius: '10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(26,58,74,0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
                transition: 'all 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)',
              }}
            >
              <Plus size={14} /> Nova Receita (Entrada)
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div
          className="fin-filter-bar"
          style={{
            background: '#ffffff',
            border: '2px solid #cbd5e1',
            borderRadius: '20px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
          }}
        >
          {/* Linha 1: Tipo & Status */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px' }}>
            {[
              { key: 'todos', label: 'Todas as Movimentações' },
              { key: 'entrada', label: '🟢 Entradas (Receitas)' },
              { key: 'saida', label: '🔴 Saídas (Despesas)' },
            ].map((tab) => {
              const active = entryTypeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setEntryTypeFilter(tab.key as typeof entryTypeFilter)}
                  style={{
                    background: active ? '#1a3a4a' : '#f8fafc',
                    color: active ? '#ffffff' : '#475569',
                    border: active ? '1.5px solid #1a3a4a' : '1.5px solid #cbd5e1',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    fontSize: '0.78rem',
                    fontWeight: active ? 700 : 600,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            <div className="fin-filter-divider" style={{ borderLeft: '1.5px solid #cbd5e1', height: '22px', margin: '0 4px' }} />

            {[
              { key: 'todos', label: 'Todos Status' },
              { key: 'pago', label: 'Liquidados' },
              { key: 'pendente', label: 'Em Aberto' },
              { key: 'parcial', label: 'Parciais' },
              { key: 'vencido', label: 'Vencidos' },
              { key: 'parcelado', label: 'Parcelamentos' },
            ].map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key as typeof statusFilter)}
                  style={{
                    background: active ? '#245d80' : '#ffffff',
                    color: active ? '#ffffff' : '#475569',
                    border: active ? '1.5px solid #245d80' : '1.5px solid #cbd5e1',
                    padding: '6px 11px',
                    borderRadius: '10px',
                    fontSize: '0.76rem',
                    fontWeight: active ? 700 : 600,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Linha 2: Busca e Dropdowns */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                padding: '8px 12px',
                flex: '1 1 220px',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              <Search size={17} strokeWidth={2.4} style={{ color: '#0f172a', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Buscar por cliente, favorecido, serviço, descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', minWidth: 0, fontSize: '0.84rem', color: '#0f172a', fontWeight: 500 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                  <X size={15} />
                </button>
              )}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.82rem',
                color: '#1a3a4a',
                fontWeight: 700,
                cursor: 'pointer',
                flex: '1 1 160px',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              <option value="todos">Todas as Categorias</option>
              <optgroup label="Entradas (Receitas)">
                {Object.entries(allCategoriesEntrada).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </optgroup>
              <optgroup label="Saídas (Despesas)">
                {Object.entries(allCategoriesSaida).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </optgroup>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.82rem',
                color: '#1a3a4a',
                fontWeight: 700,
                cursor: 'pointer',
                flex: '1 1 140px',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              <option value="todos">Todos os Métodos</option>
              <option value="pix">PIX</option>
              <option value="cartao">Cartão</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>

        {/* Tabela de Lançamentos (Desktop) + Cards Destacados (Mobile) */}
        <div
          className="fin-table-card"
          style={{
            background: '#ffffff',
            borderRadius: '22px',
            border: '2px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.05)',
          }}
        >
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <p>Carregando lançamentos financeiros...</p>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '20px' }}>
              <WalletCards size={44} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a3a4a', margin: '0 0 6px' }}>
                Nenhum lançamento encontrado
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                Não foram encontrados registros para os filtros selecionados ou no período vigente.
              </p>
            </div>
          ) : (
            <>
              {/* VISÃO DESKTOP (> 768px): Tabela de 9 Colunas */}
              <div className="fin-desktop-table-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '14px 18px' }}>Tipo &amp; Categoria</th>
                      <th style={{ padding: '14px 18px' }}>Pessoa / Descrição</th>
                      <th style={{ padding: '14px 18px' }}>Valor Bruto</th>
                      <th style={{ padding: '14px 18px' }}>Liquidado</th>
                      <th style={{ padding: '14px 18px' }}>Saldo em Aberto</th>
                      <th style={{ padding: '14px 18px' }}>Forma</th>
                      <th style={{ padding: '14px 18px' }}>Status</th>
                      <th style={{ padding: '14px 18px' }}>Data / Vencimento</th>
                      <th style={{ padding: '14px 18px', textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p) => {
                      const isExpense = p.entryType === 'saida';
                      const methodConf = PAYMENT_METHODS[p.paymentMethod] || PAYMENT_METHODS.outro;
                      const MethodIcon = methodConf.icon;
                      const hasRemaining = p.remainingAmountCents > 0 && p.status !== 'cancelado';
                      const categoryLabel = (isExpense ? allCategoriesSaida[p.category] : allCategoriesEntrada[p.category]) || p.category;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => openManageModal(p, hasRemaining ? 'quitar' : 'detalhes')}
                          style={{
                            borderBottom: '1.5px solid #e2e8f0',
                            background: p.isOverdue ? '#fffbeb' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = p.isOverdue ? '#fef3c7' : '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = p.isOverdue ? '#fffbeb' : '#ffffff';
                          }}
                          title="Clique para abrir detalhes, quitar dívida ou parcelar"
                        >
                          {/* Tipo & Categoria */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: isExpense ? '#fef2f2' : '#f0fdf4',
                                color: isExpense ? '#dc2626' : '#166534',
                                border: `1px solid ${isExpense ? '#fecaca' : '#bbf7d0'}`,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                              }}
                            >
                              {isExpense ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                              {isExpense ? 'Saída' : 'Entrada'}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '4px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {categoryLabel}
                            </span>
                          </td>

                          {/* Pessoa / Descrição */}
                          <td style={{ padding: '14px 18px' }}>
                            <strong style={{ display: 'block', color: '#1e293b', fontSize: '0.88rem' }}>
                              {p.clientName || 'Geral / Clínica'}
                            </strong>
                            <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                              {p.description}
                            </span>
                            {p.installmentNumber && p.totalInstallments && (
                              <span style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                                Parcela {p.installmentNumber} de {p.totalInstallments}
                              </span>
                            )}
                          </td>

                          {/* Valor Bruto */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: isExpense ? '#dc2626' : '#0f172a' }}>
                              {formatCurrency(p.amountCents)}
                            </strong>
                            {p.discountCents > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#059669', display: 'block', fontWeight: 600 }}>
                                Bruto: {formatCurrency(p.amountCents + p.discountCents)} · Desc: -{formatCurrency(p.discountCents)}
                              </span>
                            )}
                          </td>

                          {/* Liquidado */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: '#059669' }}>
                              {formatCurrency(p.paidAmountCents)}
                            </strong>
                          </td>

                          {/* Saldo em Aberto */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            {hasRemaining ? (
                              <span style={{ color: p.isOverdue ? '#dc2626' : '#b45309', fontWeight: 800 }}>
                                {formatCurrency(p.remainingAmountCents)}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>R$ 0,00</span>
                            )}
                          </td>

                          {/* Forma */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span style={{ background: methodConf.bg, color: methodConf.color, borderRadius: '8px', padding: '3px 8px', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <MethodIcon size={13} /> {methodConf.label}
                            </span>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            {p.status === 'pago' ? (
                              <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> Pago
                              </span>
                            ) : p.status === 'parcial' ? (
                              <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> Parcial
                              </span>
                            ) : p.isOverdue ? (
                              <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <AlertCircle size={12} /> Vencido
                              </span>
                            ) : p.status === 'parcelado' ? (
                              <span style={{ background: '#f3e8ff', color: '#7e22ce', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Layers size={12} /> Parcelado
                              </span>
                            ) : (
                              <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> Pendente
                              </span>
                            )}
                          </td>

                          {/* Data / Vencimento */}
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontSize: '0.76rem', color: '#64748b' }}>
                            <div>{formatDateOnly(p.paidAt || p.createdAt)}</div>
                            {hasRemaining && (
                              <div style={{ color: p.isOverdue ? '#dc2626' : '#64748b', fontSize: '0.7rem', fontWeight: p.isOverdue ? 700 : 500, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                {p.isOverdue && <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626' }}></span>}
                                {p.dueAt ? (p.isOverdue ? `Venceu: ${formatDateOnly(p.dueAt)}` : `Vence: ${formatDateOnly(p.dueAt)}`) : `Vencimento pendente`}
                              </div>
                            )}
                          </td>

                          {/* Ações */}
                          <td style={{ padding: '14px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              {hasRemaining && !isExpense && p.clientPhone ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsappChargeModal(p);
                                  }}
                                  style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.28)',
                                  }}
                                  title="Enviar cobrança da fatura via WhatsApp"
                                >
                                  <WhatsappIcon size={14} color="#ffffff" /> Cobrar
                                </button>
                              ) : null}

                              {hasRemaining ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageModal(p, 'quitar');
                                  }}
                                  style={{
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title="Quitar ou dar baixa"
                                >
                                  <DollarSign size={13} /> Quitar
                                </button>
                              ) : null}

                              {hasRemaining ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageModal(p, 'parcelar');
                                  }}
                                  style={{
                                    background: '#ede9fe',
                                    color: '#6d28d9',
                                    border: '1px solid #ddd6fe',
                                    borderRadius: '8px',
                                    padding: '5px 9px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title="Parcelar saldo em aberto"
                                >
                                  <Layers size={13} /> Parcelar
                                </button>
                              ) : null}

                              {!isExpense && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageModal(p, 'recibo');
                                  }}
                                  style={{
                                    background: '#f1f5f9',
                                    color: '#334155',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    padding: '5px 8px',
                                    cursor: 'pointer',
                                  }}
                                  title="Visualizar recibo"
                                >
                                  <Printer size={13} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(p.id);
                                }}
                                style={{
                                  background: 'transparent',
                                  color: '#94a3b8',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '5px 7px',
                                  cursor: 'pointer',
                                }}
                                title="Excluir lançamento"
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* VISÃO MOBILE (<= 768px): Cards Completos e Destacados (Zero Corte) */}
              <div className="fin-mobile-cards-list">
                {filteredPayments.map((p) => {
                  const isExpense = p.entryType === 'saida';
                  const methodConf = PAYMENT_METHODS[p.paymentMethod] || PAYMENT_METHODS.outro;
                  const MethodIcon = methodConf.icon;
                  const hasRemaining = p.remainingAmountCents > 0 && p.status !== 'cancelado';
                  const categoryLabel = (isExpense ? allCategoriesSaida[p.category] : allCategoriesEntrada[p.category]) || p.category;

                  return (
                    <article
                      key={`mob-${p.id}`}
                      onClick={() => openManageModal(p, hasRemaining ? 'quitar' : 'detalhes')}
                      style={{
                        background: p.isOverdue ? '#fffbeb' : '#ffffff',
                        border: '2px solid #94a3b8',
                        borderLeft: `5px solid ${isExpense ? '#dc2626' : '#059669'}`,
                        borderRadius: '18px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.07)',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Topo: Tipo + Categoria + Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1.5px solid #cbd5e1', paddingBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: isExpense ? '#fef2f2' : '#f0fdf4',
                              color: isExpense ? '#dc2626' : '#166534',
                              border: `1.5px solid ${isExpense ? '#fecaca' : '#86efac'}`,
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontSize: '0.73rem',
                              fontWeight: 800,
                            }}
                          >
                            {isExpense ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                            {isExpense ? 'Saída' : 'Entrada'}
                          </span>
                          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '999px' }}>
                            {categoryLabel}
                          </span>
                        </div>

                        {p.status === 'pago' ? (
                          <span style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Pago
                          </span>
                        ) : p.status === 'parcial' ? (
                          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Parcial
                          </span>
                        ) : p.isOverdue ? (
                          <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={12} /> Vencido
                          </span>
                        ) : p.status === 'parcelado' ? (
                          <span style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Layers size={12} /> Parcelado
                          </span>
                        ) : (
                          <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Pendente
                          </span>
                        )}
                      </div>

                      {/* Pessoa / Descrição */}
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.96rem', fontWeight: 800, lineHeight: 1.25 }}>
                          {p.clientName || 'Geral / Clínica'}
                        </strong>
                        <span style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginTop: '3px', lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {p.description}
                        </span>
                        {p.installmentNumber && p.totalInstallments && (
                          <span style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '5px' }}>
                            Parcela {p.installmentNumber} de {p.totalInstallments}
                          </span>
                        )}
                      </div>

                      {/* Quadro de Valores (3 Colunas: Valor Total | Liquidado | Em Aberto) */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                          gap: '6px',
                          background: '#f8fafc',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '9px 10px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                            Valor Total
                          </span>
                          <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: isExpense ? '#dc2626' : '#0f172a', display: 'block', marginTop: '1px' }}>
                            {formatCurrency(p.amountCents)}
                          </strong>
                        </div>
                        <div style={{ minWidth: 0, borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', display: 'block' }}>
                            Liquidado
                          </span>
                          <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: '#059669', display: 'block', marginTop: '1px' }}>
                            {formatCurrency(p.paidAmountCents)}
                          </strong>
                        </div>
                        <div style={{ minWidth: 0, borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, color: hasRemaining ? '#b45309' : '#64748b', textTransform: 'uppercase', display: 'block' }}>
                            Em Aberto
                          </span>
                          <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: hasRemaining ? (p.isOverdue ? '#dc2626' : '#b45309') : '#94a3b8', display: 'block', marginTop: '1px' }}>
                            {hasRemaining ? formatCurrency(p.remainingAmountCents) : 'R$ 0,00'}
                          </strong>
                        </div>
                      </div>

                      {p.discountCents > 0 && (
                        <div style={{ fontSize: '0.73rem', color: '#059669', fontWeight: 700, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '4px 10px' }}>
                          Bruto: {formatCurrency(p.amountCents + p.discountCents)} · Desconto: -{formatCurrency(p.discountCents)}
                        </div>
                      )}

                      {/* Forma de Pagamento + Data / Vencimento */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.76rem', color: '#475569' }}>
                        <span style={{ background: methodConf.bg, color: methodConf.color, border: '1px solid #cbd5e1', borderRadius: '8px', padding: '3px 9px', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <MethodIcon size={13} /> {methodConf.label}
                        </span>
                        <div style={{ textAlign: 'right', fontWeight: 600 }}>
                          <span>📅 {formatDateOnly(p.paidAt || p.createdAt)}</span>
                          {hasRemaining && (
                            <span style={{ color: p.isOverdue ? '#dc2626' : '#b45309', fontWeight: 700, marginLeft: '6px' }}>
                              • {p.dueAt ? (p.isOverdue ? `Venceu: ${formatDateOnly(p.dueAt)}` : `Vence: ${formatDateOnly(p.dueAt)}`) : 'Venc. pendente'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações Rápidas */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          flexWrap: 'wrap',
                          borderTop: '1.5px solid #cbd5e1',
                          paddingTop: '9px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                          {hasRemaining && !isExpense && p.clientPhone && (
                            <button
                              type="button"
                              onClick={() => openWhatsappChargeModal(p)}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '6px 12px',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.28)',
                              }}
                            >
                              <WhatsappIcon size={14} color="#ffffff" /> Cobrar WhatsApp
                            </button>
                          )}

                          {hasRemaining && (
                            <button
                              type="button"
                              onClick={() => openManageModal(p, 'quitar')}
                              style={{
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '6px 12px',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <DollarSign size={13} /> Quitar
                            </button>
                          )}

                          {hasRemaining && (
                            <button
                              type="button"
                              onClick={() => openManageModal(p, 'parcelar')}
                              style={{
                                background: '#ede9fe',
                                color: '#6d28d9',
                                border: '1.5px solid #c4b5fd',
                                borderRadius: '999px',
                                padding: '5px 11px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Layers size={13} /> Parcelar
                            </button>
                          )}

                          {!isExpense && (
                            <button
                              type="button"
                              onClick={() => openManageModal(p, 'recibo')}
                              style={{
                                background: '#f8fafc',
                                color: '#1e293b',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '999px',
                                padding: '5px 11px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Printer size={13} /> Recibo
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          style={{
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1.5px solid #fecaca',
                            borderRadius: '999px',
                            padding: '5px 9px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Excluir lançamento"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>

      {/* ================= BARRA SUPERIOR EXECUTIVA COM CONTROLE DE PERÍODO ================= */}
      <div
        className="no-print fin-exec-header"
        style={{
          background: 'linear-gradient(135deg, #1a3a4a 0%, #152e3b 100%)',
          borderRadius: '24px',
          padding: '24px 28px',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 12px 30px rgba(26,58,74,0.18)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Sistema de Gestão Financeira & DRE
            </span>
            <span style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', borderRadius: '50px', padding: '1px 8px', fontSize: '0.7rem', fontWeight: 600 }}>
              Camila Machado
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
            Controle Financeiro &amp; DRE
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '0.86rem', marginTop: '4px', maxWidth: '600px', lineHeight: 1.4 }}>
            Demonstrativo de Resultados do Exercício (DRE), receitas brutas, custos variáveis, margem de contribuição, despesas operacionais e lucro líquido.
          </p>
        </div>

        {/* CONTROLES DE PERÍODO: HOJE | SEMANAL | MENSAL | GERAL (TUDO) | PERSONALIZADO */}
        <div className="fin-period-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', maxWidth: '100%' }}>
          <div
            className="fin-period-pills"
            style={{
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '4px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {[
              { key: 'hoje', label: 'Hoje' },
              { key: 'semanal', label: 'Semanal' },
              { key: 'mensal', label: 'Mensal' },
              { key: 'todos', label: 'Geral (Tudo)' },
              { key: 'custom', label: 'Personalizado' },
            ].map((p) => {
              const active = periodPreset === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriodPreset(p.key as typeof periodPreset)}
                  style={{
                    background: active ? '#ffffff' : 'transparent',
                    color: active ? '#1a3a4a' : '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    fontWeight: active ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: active ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Seletor Customizado De/Até */}
          {periodPreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '12px' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', fontSize: '0.78rem', color: '#0f172a' }}
              />
              <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', fontSize: '0.78rem', color: '#0f172a' }}
              />
            </div>
          )}

          {/* Badge informativa do intervalo */}
          <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
            {periodPreset === 'todos'
              ? 'Período: Geral Completo (Todo o Histórico)'
              : periodInfo.fromDate && periodInfo.toDate
              ? `Período: ${formatDateOnly(periodInfo.fromDate)} até ${formatDateOnly(periodInfo.toDate)}`
              : 'Período atual'}
          </span>
        </div>
      </div>

      {/* ================= ABAS PRINCIPAIS DE NAVEGAÇÃO ================= */}
      <div className="no-print fin-main-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #cbd5e1', paddingBottom: '2px', flexWrap: 'wrap' }}>
        {[
          { key: 'dashboard', label: '📊 Dashboard & Fluxo', icon: Activity },
          { key: 'pagamentos', label: '💳 Pagamentos', icon: CreditCard },
          { key: 'lancamentos', label: '📋 Lançamentos & Movimentações', icon: Layers },
          { key: 'dre', label: '📑 DRE Gerencial Detalhado', icon: BarChart3 },
        ].map((tab) => {
          const active = activeMainTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`fin-main-tab-btn ${active ? 'is-active' : ''}`}
              onClick={() => setActiveMainTab(tab.key as typeof activeMainTab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                border: 'none',
                borderBottom: active ? '3px solid #1a3a4a' : '3px solid transparent',
                background: 'none',
                color: active ? '#1a3a4a' : '#64748b',
                fontWeight: active ? 800 : 600,
                fontSize: '0.92rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                marginBottom: '-2px',
              }}
            >
              <Icon size={17} style={{ color: active ? '#1a3a4a' : '#94a3b8', flexShrink: 0 }} />
              <span>{tab.label}</span>
            </button>
          );
        })}

        <div className="fin-main-tabs-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              resetNewForm();
              setNewModalMode('geral');
              setFormEntryType('saida');
              setFormCategory('aluguel_condominio');
              setCategoryQuery(allCategoriesSaida['aluguel_condominio'] || 'Aluguel & Condomínio da Clínica');
              setNewModalOpen(true);
            }}
            style={{
              background: '#fff1f2',
              color: '#e11d48',
              border: '1.5px solid #fda4af',
              padding: '6px 13px',
              minHeight: '35px',
              borderRadius: '10px',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              boxShadow: '0 1px 2px rgba(225, 29, 72, 0.06)',
              transition: 'all 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            <ArrowUpRight size={14} /> Nova Despesa (Saída)
          </button>
          <button
            type="button"
            onClick={() => {
              resetNewForm();
              setNewModalMode('geral');
              setFormEntryType('entrada');
              setFormCategory('outras_entradas');
              setCategoryQuery(allCategoriesEntrada['outras_entradas'] || 'Outras Receitas Operacionais');
              setNewModalOpen(true);
            }}
            style={{
              background: 'linear-gradient(180deg, #244b5e 0%, #1a3a4a 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              minHeight: '35px',
              borderRadius: '10px',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              boxShadow: '0 2px 6px rgba(26,58,74,0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
              transition: 'all 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            <Plus size={14} /> Nova Receita (Entrada)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: DASHBOARD & FLUXO DE CAIXA MODERNO                                  */}
      {/* ========================================================================= */}
      {activeMainTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', minWidth: 0 }}>
          
          {/* CARDS PRINCIPAIS: LUCRO LÍQUIDO, RECEITA BRUTA, DESPESAS E SALDO EM CAIXA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
            
            {/* 1. LUCRO LÍQUIDO (ESTRELA DO FINANCEIRO) */}
            <div
              style={{
                background: dre.lucroLiquidoCents >= 0 ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : '#fef2f2',
                border: `2px solid ${dre.lucroLiquidoCents >= 0 ? '#10b981' : '#ef4444'}`,
                borderRadius: '20px',
                padding: '20px',
                position: 'relative',
                boxShadow: '0 8px 24px rgba(16,185,129,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  LUCRO LÍQUIDO (RESULTADO)
                </span>
                <span style={{ background: dre.lucroLiquidoCents >= 0 ? '#d1fae5' : '#fee2e2', color: dre.lucroLiquidoCents >= 0 ? '#065f46' : '#991b1b', borderRadius: '50px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {dre.margemLiquidaPct}% margem
                </span>
              </div>
              <strong style={{ display: 'block', fontSize: '1.85rem', fontWeight: 800, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c', marginTop: '10px', letterSpacing: '-0.02em' }}>
                {formatCurrency(dre.lucroLiquidoCents)}
              </strong>
              <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                Receita Líquida - Custos Diretos - Despesas
              </span>
            </div>

            {/* 2. RECEITA BRUTA OPERACIONAL */}
            <div style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '20px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  RECEITA BRUTA TOTAL
                </span>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                  <TrendingUp size={18} />
                </div>
              </div>
              <strong style={{ display: 'block', fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', marginTop: '10px', letterSpacing: '-0.02em' }}>
                {formatCurrency(dre.receitaBrutaCents)}
              </strong>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', fontSize: '0.75rem', color: '#64748b' }}>
                <span>Realizado no caixa: <strong>{formatCurrency(dre.receitaRealizadaCaixaCents)}</strong></span>
              </div>
            </div>

            {/* 3. DESPESAS & CUSTOS TOTAIS */}
            <div style={{ background: '#ffffff', border: '2px solid #fca5a5', borderRadius: '20px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  DESPESAS &amp; CUSTOS
                </span>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                  <ArrowUpRight size={18} />
                </div>
              </div>
              <strong style={{ display: 'block', fontSize: '1.8rem', fontWeight: 800, color: '#dc2626', marginTop: '10px', letterSpacing: '-0.02em' }}>
                {formatCurrency(dre.totalDespesasCents)}
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                Custos variáveis ({formatCurrency(dre.custosVariaveisCents)}) + Fixas ({formatCurrency(dre.despesasOperacionaisCents)})
              </span>
            </div>

            {/* 4. SALDO DEVEDOR / A RECEBER EM ABERTO */}
            <div style={{ background: '#ffffff', border: '2px solid #fcd34d', borderRadius: '20px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  A RECEBER (EM ABERTO)
                </span>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a16207' }}>
                  <Clock3 size={18} />
                </div>
              </div>
              <strong style={{ display: 'block', fontSize: '1.8rem', fontWeight: 800, color: '#b45309', marginTop: '10px', letterSpacing: '-0.02em' }}>
                {formatCurrency(dre.totalAReceberCents)}
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                Saldos parciais e parcelas a vencer
              </span>
            </div>

          </div>

          {/* ================= GRÁFICOS DE ALTA TECNOLOGIA ================= */}
          <div className="fin-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '20px', minWidth: 0 }}>
            
            {/* Gráfico 1: Terminal de Evolução do Fluxo com Curvas Spline, Colunas 3D e Balanço */}
            <div
              className="fin-chart-card"
              style={{
                background: '#ffffff',
                border: '2px solid #cbd5e1',
                borderRadius: '24px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                position: 'relative',
                minWidth: 0,
              }}
            >
              {/* Topo do Card com Título e Seletor de Modo Tecnológico */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a3a4a', margin: 0 }}>
                      Evolução do Fluxo Financeiro ({periodPreset.toUpperCase()})
                    </h3>
                    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '50px' }}>
                      {chartMetrics.points.length} pontos
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '3px 0 0' }}>
                    Análise dinâmica de entradas, saídas e resultado líquido
                  </p>
                </div>

                {/* Seletor de Estilo do Gráfico: Curva, Colunas, Balanço */}
                <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '12px', padding: '3px', gap: '3px' }}>
                  <button
                    type="button"
                    onClick={() => setChartStyle('spline')}
                    style={{
                      border: 'none',
                      background: chartStyle === 'spline' ? '#1a3a4a' : 'transparent',
                      color: chartStyle === 'spline' ? '#ffffff' : '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: '9px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                      boxShadow: chartStyle === 'spline' ? '0 2px 6px rgba(26,58,74,0.25)' : 'none',
                    }}
                    title="Visualizar em Ondas Fluídas e Área Suave com Gradiente"
                  >
                    <AreaChart size={13} /> Curva Fluida
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartStyle('bars')}
                    style={{
                      border: 'none',
                      background: chartStyle === 'bars' ? '#1a3a4a' : 'transparent',
                      color: chartStyle === 'bars' ? '#ffffff' : '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: '9px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                      boxShadow: chartStyle === 'bars' ? '0 2px 6px rgba(26,58,74,0.25)' : 'none',
                    }}
                    title="Visualizar em Colunas Tecnológicas com Tampo Glow"
                  >
                    <BarChart3 size={13} /> Colunas 3D
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartStyle('balance')}
                    style={{
                      border: 'none',
                      background: chartStyle === 'balance' ? '#1a3a4a' : 'transparent',
                      color: chartStyle === 'balance' ? '#ffffff' : '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: '9px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                      boxShadow: chartStyle === 'balance' ? '0 2px 6px rgba(26,58,74,0.25)' : 'none',
                    }}
                    title="Visualizar a Curva de Caixa Acumulada no Período"
                  >
                    <LineChart size={13} /> Saldo de Caixa
                  </button>
                </div>
              </div>

              {/* Faixa de Indicadores Rápidos do Gráfico */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#047857', fontWeight: 700 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                    Entradas: <strong>+{formatCurrency(chartMetrics.totalReceivedPeriod)}</strong>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#b91c1c', fontWeight: 700 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                    Saídas: <strong>-{formatCurrency(chartMetrics.totalExpensePeriod)}</strong>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: chartMetrics.netPeriod >= 0 ? '#0284c7' : '#d97706', fontWeight: 700 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: chartMetrics.netPeriod >= 0 ? '#0284c7' : '#d97706' }} />
                    Saldo Líquido: <strong>{formatCurrency(chartMetrics.netPeriod)}</strong>
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                  Escala Máxima: <strong style={{ color: '#1e293b' }}>{formatCurrency(chartMetrics.niceMaxCents)}</strong>
                </div>
              </div>

              {/* Canvas SVG Responsivo de Alta Definição */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '250px',
                  background: 'linear-gradient(180deg, #fbfcfe 0%, #f8fafc 100%)',
                  borderRadius: '16px',
                  border: '1px solid #eef2f6',
                  overflow: 'hidden',
                }}
              >
                <svg
                  viewBox="0 0 820 250"
                  style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
                >
                  <defs>
                    {/* Gradiente Entradas */}
                    <linearGradient id="glow-grad-entradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                      <stop offset="60%" stopColor="#10b981" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>

                    {/* Gradiente Saídas */}
                    <linearGradient id="glow-grad-saidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.38" />
                      <stop offset="60%" stopColor="#f43f5e" stopOpacity="0.10" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>

                    {/* Gradiente Saldo de Caixa */}
                    <linearGradient id="glow-grad-balance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity="0.45" />
                      <stop offset="50%" stopColor="#0284c7" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                    </linearGradient>

                    {/* Filtro de Glow Tecnológico */}
                    <filter id="neon-glow-green" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#10b981" floodOpacity="0.45" />
                    </filter>
                    <filter id="neon-glow-red" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#f43f5e" floodOpacity="0.45" />
                    </filter>
                    <filter id="neon-glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#0284c7" floodOpacity="0.45" />
                    </filter>
                  </defs>

                  {/* Linhas de Grade e Escala Monetária */}
                  {[
                    { ratio: 1.0, val: chartMetrics.niceMaxCents },
                    { ratio: 0.66, val: Math.round(chartMetrics.niceMaxCents * 0.66) },
                    { ratio: 0.33, val: Math.round(chartMetrics.niceMaxCents * 0.33) },
                    { ratio: 0.0, val: 0 },
                  ].map((level, idx) => {
                    const y = chartMetrics.chartBottom - level.ratio * chartMetrics.chartHeight;
                    const isZero = level.ratio === 0.0;
                    return (
                      <g key={idx}>
                        <line
                          x1={chartMetrics.chartLeft}
                          y1={y}
                          x2={chartMetrics.chartRight}
                          y2={y}
                          stroke={isZero ? '#cbd5e1' : '#e2e8f0'}
                          strokeWidth={isZero ? 1.5 : 1}
                          strokeDasharray={isZero ? 'none' : '4 4'}
                        />
                        <text
                          x={chartMetrics.chartLeft - 8}
                          y={y + 3.5}
                          textAnchor="end"
                          fontSize="9.5"
                          fontWeight={isZero ? 700 : 500}
                          fill={isZero ? '#64748b' : '#94a3b8'}
                          fontFamily="sans-serif"
                        >
                          {formatCurrency(level.val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Rótulos do Eixo X (Horários ou Dias) */}
                  {chartMetrics.points.map((pt, i) => (
                    <text
                      key={i}
                      x={pt.x}
                      y={chartMetrics.chartBottom + 17}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight={hoveredPointIdx === i ? 800 : 600}
                      fill={hoveredPointIdx === i ? '#1a3a4a' : '#64748b'}
                      fontFamily="sans-serif"
                    >
                      {pt.label}
                    </text>
                  ))}

                  {/* ================= ESTILO 1: CURVA FLUIDA & ÁREA COM GRADIENTE ================= */}
                  {chartStyle === 'spline' && (
                    <>
                      {/* Área Sombreada de Entradas */}
                      {chartMetrics.splineReceived && (
                        <path d={chartMetrics.areaReceived} fill="url(#glow-grad-entradas)" />
                      )}
                      {/* Curva Neon de Entradas */}
                      {chartMetrics.splineReceived && (
                        <path
                          d={chartMetrics.splineReceived}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#neon-glow-green)"
                        />
                      )}

                      {/* Área Sombreada de Saídas */}
                      {chartMetrics.splineExpense && (
                        <path d={chartMetrics.areaExpense} fill="url(#glow-grad-saidas)" />
                      )}
                      {/* Curva Neon de Saídas */}
                      {chartMetrics.splineExpense && (
                        <path
                          d={chartMetrics.splineExpense}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#neon-glow-red)"
                        />
                      )}

                      {/* Pontos / Nós da Curva */}
                      {chartMetrics.points.map((pt, i) => {
                        const hasVal = pt.receivedCents > 0 || pt.expenseCents > 0;
                        const isHovered = hoveredPointIdx === i;
                        return (
                          <g key={i}>
                            {/* Ponto de Entrada */}
                            {pt.receivedCents > 0 ? (
                              <circle
                                cx={pt.x}
                                cy={pt.yReceived}
                                r={isHovered ? 6.5 : 4.5}
                                fill="#10b981"
                                stroke="#ffffff"
                                strokeWidth={isHovered ? 2.5 : 2}
                                filter="url(#neon-glow-green)"
                              />
                            ) : null}

                            {/* Ponto de Saída */}
                            {pt.expenseCents > 0 ? (
                              <circle
                                cx={pt.x}
                                cy={pt.yExpense}
                                r={isHovered ? 6.5 : 4.5}
                                fill="#f43f5e"
                                stroke="#ffffff"
                                strokeWidth={isHovered ? 2.5 : 2}
                                filter="url(#neon-glow-red)"
                              />
                            ) : null}

                            {/* Ponto neutro na base quando não houver movimentação */}
                            {!hasVal && (
                              <circle
                                cx={pt.x}
                                cy={chartMetrics.chartBottom}
                                r={isHovered ? 4 : 2.5}
                                fill={isHovered ? '#0284c7' : '#cbd5e1'}
                              />
                            )}
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* ================= ESTILO 2: COLUNAS TECNOLÓGICAS (BARRAS 3D) ================= */}
                  {chartStyle === 'bars' && (
                    <>
                      {chartMetrics.points.map((pt, i) => {
                        const isHovered = hoveredPointIdx === i;
                        const colW = Math.min(18, Math.max(8, (chartMetrics.chartWidth / chartMetrics.points.length) * 0.32));
                        const incH = chartMetrics.chartBottom - pt.yReceived;
                        const expH = chartMetrics.chartBottom - pt.yExpense;

                        return (
                          <g key={i}>
                            {/* Coluna Verde de Entrada */}
                            {pt.receivedCents > 0 ? (
                              <rect
                                x={pt.x - colW - 2}
                                y={pt.yReceived}
                                width={colW}
                                height={incH}
                                rx={4}
                                fill="url(#glow-grad-entradas)"
                                stroke="#10b981"
                                strokeWidth={isHovered ? 2 : 1}
                                filter={isHovered ? 'url(#neon-glow-green)' : 'none'}
                              />
                            ) : null}

                            {/* Coluna Vermelha de Saída */}
                            {pt.expenseCents > 0 ? (
                              <rect
                                x={pt.x + 2}
                                y={pt.yExpense}
                                width={colW}
                                height={expH}
                                rx={4}
                                fill="url(#glow-grad-saidas)"
                                stroke="#f43f5e"
                                strokeWidth={isHovered ? 2 : 1}
                                filter={isHovered ? 'url(#neon-glow-red)' : 'none'}
                              />
                            ) : null}

                            {/* Ponto na base se ambos forem zero */}
                            {pt.receivedCents === 0 && pt.expenseCents === 0 && (
                              <circle
                                cx={pt.x}
                                cy={chartMetrics.chartBottom}
                                r={2.5}
                                fill={isHovered ? '#0284c7' : '#cbd5e1'}
                              />
                            )}
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* ================= ESTILO 3: SALDO DE CAIXA ACUMULADO ================= */}
                  {chartStyle === 'balance' && (
                    <>
                      {/* Linha Zero Referencial */}
                      <line
                        x1={chartMetrics.chartLeft}
                        y1={chartMetrics.zeroY}
                        x2={chartMetrics.chartRight}
                        y2={chartMetrics.zeroY}
                        stroke="#0284c7"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={chartMetrics.chartLeft - 8}
                        y={chartMetrics.zeroY + 3.5}
                        textAnchor="end"
                        fontSize="9"
                        fontWeight="700"
                        fill="#0284c7"
                      >
                        ZERO
                      </text>

                      {/* Área preenchida do saldo */}
                      {chartMetrics.splineBalance && (
                        <path d={chartMetrics.areaBalance} fill="url(#glow-grad-balance)" />
                      )}

                      {/* Linha contínua do saldo */}
                      {chartMetrics.splineBalance && (
                        <path
                          d={chartMetrics.splineBalance}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#neon-glow-cyan)"
                        />
                      )}

                      {/* Nós do Saldo */}
                      {chartMetrics.balancePoints.map((b, i) => {
                        const isHovered = hoveredPointIdx === i;
                        const isPositive = b.accumulatedCents >= 0;
                        return (
                          <circle
                            key={i}
                            cx={b.x}
                            cy={b.y}
                            r={isHovered ? 7 : 4.5}
                            fill={isPositive ? '#0284c7' : '#ef4444'}
                            stroke="#ffffff"
                            strokeWidth="2"
                            filter="url(#neon-glow-cyan)"
                          />
                        );
                      })}
                    </>
                  )}

                  {/* Cursor / Linha Guia Vertical no Hover */}
                  {hoveredPointIdx !== null && chartMetrics.points[hoveredPointIdx] && (
                    <line
                      x1={chartMetrics.points[hoveredPointIdx].x}
                      y1={chartMetrics.chartTop}
                      x2={chartMetrics.points[hoveredPointIdx].x}
                      y2={chartMetrics.chartBottom}
                      stroke="#0284c7"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Áreas Transparentes para Interação com o Mouse */}
                  {chartMetrics.points.map((pt, i) => {
                    const stepW = chartMetrics.chartWidth / chartMetrics.points.length;
                    return (
                      <rect
                        key={i}
                        x={pt.x - stepW / 2}
                        y={0}
                        width={stepW}
                        height={250}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredPointIdx(i)}
                        onMouseLeave={() => setHoveredPointIdx(null)}
                      />
                    );
                  })}
                </svg>

                {/* Tooltip HUD Flutuante com Glassmorphism */}
                {hoveredPointIdx !== null && chartMetrics.points[hoveredPointIdx] && (
                  (() => {
                    const hp = chartMetrics.points[hoveredPointIdx];
                    const leftPct = Math.min(76, Math.max(16, (hp.x / 820) * 100));
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          left: `${leftPct}%`,
                          transform: 'translateX(-50%)',
                          background: 'rgba(15, 23, 42, 0.94)',
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255, 255, 255, 0.16)',
                          borderRadius: '12px',
                          padding: '8px 14px',
                          color: '#ffffff',
                          boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                          pointerEvents: 'none',
                          zIndex: 10,
                          minWidth: '175px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '4px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase' }}>
                            {hp.label}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                            Fluxo
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ color: '#6ee7b7' }}>🟢 Entradas:</span>
                            <strong>+{formatCurrency(hp.receivedCents)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ color: '#fda4af' }}>🔴 Saídas:</span>
                            <strong>-{formatCurrency(hp.expenseCents)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', paddingTop: '3px', borderTop: '1px dashed rgba(255,255,255,0.15)', marginTop: '2px' }}>
                            <span style={{ color: '#93c5fd' }}>⚖️ Resultado:</span>
                            <strong style={{ color: hp.netCents >= 0 ? '#34d399' : '#f87171' }}>
                              {formatCurrency(hp.netCents)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Banner Minimalista se Não Houver Nenhuma Movimentação */}
                {chartMetrics.rawMax === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: 'rgba(255, 255, 255, 0.92)',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: '16px',
                      padding: '14px 22px',
                      textAlign: 'center',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
                      pointerEvents: 'none',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: '#475569' }}>
                      Nenhuma movimentação neste período
                    </p>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginTop: '3px' }}>
                      Utilize o botão acima "+ Novo Lançamento" para registrar entradas ou despesas
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Gráfico 2: Mix de Formas de Pagamento (PIX, Dinheiro, Cartões) com Gráfico Donut SVG */}
            <div
              className="fin-chart-card"
              style={{
                background: '#ffffff',
                border: '2px solid #cbd5e1',
                borderRadius: '24px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                minWidth: 0,
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a3a4a', margin: 0 }}>
                  Distribuição por Forma de Pagamento
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                  Volume total liquidado no período selecionado
                </p>
              </div>

              {methodBreakdown.filter((m) => m.totalCents > 0).length === 0 ? (
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.86rem' }}>
                  <div>
                    <PieChart size={38} style={{ color: '#cbd5e1', margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>Nenhum pagamento liquidado no período selecionado</p>
                    <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>As transações realizadas via PIX, Cartão ou Dinheiro aparecerão aqui.</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Gráfico Donut SVG com Total no Centro */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', padding: '10px 0', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                        {(() => {
                          const circumference = 2 * Math.PI * 38; // ~238.76
                          let accumulatedOffset = 0;
                          return methodBreakdown
                            .filter((m) => m.totalCents > 0)
                            .map((m) => {
                              const conf = PAYMENT_METHODS[m.method] || PAYMENT_METHODS.outro;
                              const strokeDash = (m.pct / 100) * circumference;
                              const circleElem = (
                                <circle
                                  key={m.method}
                                  cx="50"
                                  cy="50"
                                  r="38"
                                  fill="transparent"
                                  stroke={conf.color}
                                  strokeWidth="12"
                                  strokeDasharray={`${strokeDash} ${circumference}`}
                                  strokeDashoffset={-accumulatedOffset}
                                  strokeLinecap="round"
                                  style={{ transition: 'stroke-dasharray 0.5s ease' }}
                                />
                              );
                              accumulatedOffset += strokeDash;
                              return circleElem;
                            });
                        })()}
                      </svg>
                      {/* Centro do Donut */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <Zap size={16} style={{ color: '#0284c7', margin: '0 auto' }} />
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', display: 'block', textTransform: 'uppercase' }}>
                          Mix
                        </span>
                      </div>
                    </div>

                    {/* Destaque das Formas Principais */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Total Movimentado:</span>
                      <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1a3a4a' }}>
                        {formatCurrency(methodBreakdown.reduce((acc, m) => acc + m.totalCents, 0))}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                        {methodBreakdown.reduce((acc, m) => acc + m.count, 0)} liquidações realizadas
                      </span>
                    </div>
                  </div>

                  {/* Barras Horizontais com Percentuais */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {methodBreakdown
                      .filter((m) => m.totalCents > 0)
                      .map((m) => {
                        const conf = PAYMENT_METHODS[m.method] || PAYMENT_METHODS.outro;
                        const Icon = conf.icon;
                        return (
                          <div key={m.method} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#334155' }}>
                                <Icon size={14} style={{ color: conf.color }} /> {conf.label}
                              </span>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                <strong style={{ color: '#0f172a' }}>{formatCurrency(m.totalCents)}</strong>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>({m.pct}%)</span>
                              </div>
                            </div>
                            <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.min(100, m.pct)}%`,
                                  height: '100%',
                                  background: conf.color,
                                  borderRadius: '6px',
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ================= TABELA DE LANÇAMENTOS E MOVIMENTAÇÕES ABAIXO DOS GRÁFICOS ================= */}
          <div style={{ marginTop: '10px' }}>
            {renderPaymentsTableSection(
              'Lançamentos & Movimentações do Período',
              'Clique em qualquer lançamento para abrir a central, quitar dívidas, parcelar saldo ou emitir recibo.'
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: DRE GERENCIAL DETALHADO (DEMONSTRATIVO DE RESULTADOS)             */}
      {/* ========================================================================= */}
      {activeMainTab === 'dre' && (() => {
        const drePeriodLabel =
          periodPreset === 'todos'
            ? 'Período Geral Completo (Todo o Histórico)'
            : periodPreset === 'hoje'
            ? `Hoje (${formatDateOnly(periodInfo.fromDate || new Date().toISOString())})`
            : periodInfo.fromDate && periodInfo.toDate
            ? `${formatDateOnly(periodInfo.fromDate)} até ${formatDateOnly(periodInfo.toDate)}`
            : periodPreset === 'custom' && (customFrom || customTo)
            ? `${customFrom ? formatDateOnly(customFrom) : 'Início'} até ${customTo ? formatDateOnly(customTo) : 'Hoje'}`
            : 'Período Vigente';

        const dreEntriesIn = payments.filter((p) => p.entryType === 'entrada' && p.status !== 'cancelado');
        const dreEntriesOut = payments.filter((p) => p.entryType === 'saida' && p.status !== 'cancelado');

        // Agrupamento detalhado por Serviço / Categoria de Entrada
        const serviceMap = new Map<
          string,
          {
            serviceName: string;
            categoryLabel: string;
            count: number;
            grossCents: number;
            discountCents: number;
            netCents: number;
            paidCents: number;
            openCents: number;
          }
        >();

        for (const p of dreEntriesIn) {
          const sName = p.serviceName || p.description.split('—')[0].split('-')[0].trim() || 'Atendimento Clínico';
          const catLabel = allCategoriesEntrada[p.category] || p.category;
          const key = `${sName}__${catLabel}`;
          if (!serviceMap.has(key)) {
            serviceMap.set(key, {
              serviceName: sName,
              categoryLabel: catLabel,
              count: 0,
              grossCents: 0,
              discountCents: 0,
              netCents: 0,
              paidCents: 0,
              openCents: 0,
            });
          }
          const item = serviceMap.get(key)!;
          item.count += 1;
          item.grossCents += p.amountCents + (p.discountCents || 0);
          item.discountCents += p.discountCents || 0;
          item.netCents += p.amountCents;
          item.paidCents += p.paidAmountCents;
          item.openCents += p.remainingAmountCents;
        }

        const dreServicesList = Array.from(serviceMap.values()).sort((a, b) => b.netCents - a.netCents);

        // Detalhamento das entradas e transações parciais de cada cliente
        const dreClientEntries = dreEntriesIn.map((p) => {
          const sortedTxs = [...(p.transactions || [])].sort(
            (a, b) => new Date(a.paidAt || a.createdAt).getTime() - new Date(b.paidAt || b.createdAt).getTime()
          );
          const txSum = sortedTxs.reduce((acc, t) => acc + (t.amountCents || 0), 0);
          const missingInit = Math.max(0, (p.paidAmountCents || 0) - txSum);

          const steps: Array<{ label: string; method: string; dateStr: string; amountCents: number }> = [];
          if (missingInit > 0) {
            steps.push({
              label: sortedTxs.length > 0 || p.remainingAmountCents > 0 ? '1º Entrada Inicial' : 'Pagamento à Vista',
              method: PAYMENT_METHODS[p.paymentMethod]?.label || p.paymentMethod.toUpperCase(),
              dateStr: formatDateTime(p.paidAt || p.createdAt),
              amountCents: missingInit,
            });
          }
          sortedTxs.forEach((tx, idx) => {
            const stepNum = steps.length + 1;
            const rawNote = (tx.notes || '').trim();
            const isGen =
              !rawNote ||
              rawNote === 'Entrada / Pagamento parcial registrado' ||
              rawNote === 'Baixa parcial de saldo' ||
              rawNote === 'Quitação total de saldo' ||
              rawNote === 'Pagamento à vista liquidado';
            const stepLabel = !isGen
              ? rawNote.replace(/^Entrada parcial:\s*/i, '')
              : stepNum === 1 && (p.remainingAmountCents > 0 || sortedTxs.length > 1)
              ? '1º Entrada Inicial'
              : idx === sortedTxs.length - 1 && p.remainingAmountCents === 0 && sortedTxs.length > 1
              ? `${stepNum}º Quitação do Saldo`
              : stepNum > 1
              ? `${stepNum}º Pagamento Parcial`
              : 'Pagamento Integral';

            steps.push({
              label: stepLabel,
              method: PAYMENT_METHODS[tx.paymentMethod]?.label || tx.paymentMethod.toUpperCase(),
              dateStr: formatDateTime(tx.paidAt || tx.createdAt),
              amountCents: tx.amountCents,
            });
          });

          return {
            payment: p,
            grossCents: p.amountCents + (p.discountCents || 0),
            steps,
          };
        });

        // Componente reutilizável da Folha Oficial A4 do DRE (usado no Modal de Impressão e no @media print)
        const renderPrintableDreDocument = () => (
          <div
            id="printable-dre"
            style={{
              background: '#ffffff',
              color: '#0f172a',
              padding: '28px 32px',
              borderRadius: '16px',
              border: '1px solid #cbd5e1',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* CABEÇALHO FORMAL DO RELATÓRIO DRE */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2px solid #1a3a4a',
                paddingBottom: '14px',
                marginBottom: '18px',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#b8892a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Relatório Contábil &amp; Financeiro Oficial
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a3a4a', margin: '2px 0' }}>
                  Camila Machado — Hipnose Clínica Integrativa
                </h2>
                <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                  CRT-SBHP/SC 805 • Demonstrativo do Resultado do Exercício (DRE) Detalhado
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.76rem', color: '#334155' }}>
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '8px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  Período: {drePeriodLabel}
                </div>
                <div>Emitido em: <strong>{formatDateTime(new Date().toISOString())}</strong></div>
                <div>Total de lançamentos no período: <strong>{dreEntriesIn.length} entrada(s) · {dreEntriesOut.length} saída(s)</strong></div>
              </div>
            </div>

            {/* 1. DESTAQUES EXECUTIVOS PRINCIPAIS (LUCRO, BRUTO, CAIXA, DESPESAS) */}
            <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                1. Indicadores Principais do Período (Resumo Executivo)
              </div>
              <div className="dre-exec-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px' }}>
                <div style={{ border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block' }}>Receita Bruta</span>
                  <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'block', marginTop: '2px' }}>{formatCurrency(dre.receitaBrutaCents)}</strong>
                  <span style={{ fontSize: '0.66rem', color: '#64748b' }}>Desc: -{formatCurrency(dre.deducoesDescontosCents)}</span>
                </div>
                <div style={{ border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px', background: '#f0fdf4' }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', display: 'block' }}>Receita em Caixa</span>
                  <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669', display: 'block', marginTop: '2px' }}>{formatCurrency(dre.receitaRealizadaCaixaCents)}</strong>
                  <span style={{ fontSize: '0.66rem', color: '#15803d' }}>Líquida: {formatCurrency(dre.receitaLiquidaCents)}</span>
                </div>
                <div style={{ border: '1.5px solid #fde68a', borderRadius: '10px', padding: '10px 12px', background: '#fffbeb' }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', display: 'block' }}>Saldo a Receber</span>
                  <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b45309', display: 'block', marginTop: '2px' }}>{formatCurrency(dre.totalAReceberCents)}</strong>
                  <span style={{ fontSize: '0.66rem', color: '#92400e' }}>Em aberto de clientes</span>
                </div>
                <div style={{ border: '1.5px solid #fecaca', borderRadius: '10px', padding: '10px 12px', background: '#fef2f2' }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', display: 'block' }}>Despesas &amp; Custos</span>
                  <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: '#dc2626', display: 'block', marginTop: '2px' }}>- {formatCurrency(dre.totalDespesasCents)}</strong>
                  <span style={{ fontSize: '0.66rem', color: '#991b1b' }}>Pago: {formatCurrency(dre.totalDespesasPagasCents)}</span>
                </div>
                <div
                  style={{
                    border: `2px solid ${dre.lucroLiquidoCents >= 0 ? '#059669' : '#dc2626'}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    background: dre.lucroLiquidoCents >= 0 ? '#ecfdf5' : '#fef2f2',
                  }}
                >
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: dre.lucroLiquidoCents >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase', display: 'block' }}>
                    Lucro Líquido
                  </span>
                  <strong style={{ fontSize: '1.1rem', fontWeight: 900, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c', display: 'block', marginTop: '2px' }}>
                    {formatCurrency(dre.lucroLiquidoCents)}
                  </strong>
                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c' }}>
                    Margem: {dre.margemLiquidaPct}% · Caixa: {formatCurrency(dre.saldoLiquidoCaixaCents)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. DEMONSTRATIVO CONTÁBIL DO RESULTADO (ESTRUTURA DRE) */}
            <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                2. Demonstrativo Contábil do Resultado do Exercício (DRE)
              </div>
              <div className="dre-table-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #cbd5e1', minWidth: '520px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#1e293b', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Rubrica / Conta Contábil do Demonstrativo</th>
                    <th style={{ padding: '8px 12px' }}>Detalhamento / Composição</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f172a' }}>(+) RECEITA BRUTA OPERACIONAL</td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>Faturamento bruto de sessões, pacotes e tratamentos ({dreEntriesIn.length} lançamentos)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{formatCurrency(dre.receitaBrutaCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>(-) Deduções e Descontos Concedidos</td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>Descontos comerciais aplicados nas faturas de clientes</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>- {formatCurrency(dre.deducoesDescontosCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f0fdf4' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#166534' }}>(=) RECEITA OPERACIONAL LÍQUIDA</td>
                    <td style={{ padding: '9px 12px', color: '#15803d', fontWeight: 600 }}>
                      Recebido em caixa: {formatCurrency(dre.receitaRealizadaCaixaCents)} · Falta receber: {formatCurrency(dre.totalAReceberCents)}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{formatCurrency(dre.receitaLiquidaCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>(-) Custos Variáveis / Diretos</td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>Taxas bancárias/operadoras de cartão e materiais/insumos clínicos</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>- {formatCurrency(dre.custosVariaveisCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0f172a' }}>(=) LUCRO BRUTO (MARGEM DE CONTRIBUIÇÃO)</td>
                    <td style={{ padding: '9px 12px', color: '#475569' }}>Margem Bruta sobre a Receita Líquida: {dre.margemBrutaPct}%</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(dre.lucroBrutoCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>(-) Despesas Operacionais &amp; Administrativas</td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>Aluguel, condomínio, energia, internet, softwares, marketing, contabilidade</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>- {formatCurrency(dre.despesasOperacionaisCents)}</td>
                  </tr>
                  <tr style={{ background: dre.lucroLiquidoCents >= 0 ? '#ecfdf5' : '#fef2f2', borderTop: '2px solid #94a3b8' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 900, color: dre.lucroLiquidoCents >= 0 ? '#065f46' : '#991b1b', fontSize: '0.86rem' }}>
                      (=) LUCRO LÍQUIDO DO PERÍODO (RESULTADO)
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c' }}>
                      Margem Líquida: {dre.margemLiquidaPct}% · Saldo Efetivo em Caixa: {formatCurrency(dre.saldoLiquidoCaixaCents)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: '0.96rem', color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c' }}>
                      {formatCurrency(dre.lucroLiquidoCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            {/* 3. RECEITAS POR SERVIÇO / PROCEDIMENTO */}
            <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                3. Faturamento Detalhado por Serviço / Procedimento ({dreServicesList.length})
              </div>
              {dreServicesList.length === 0 ? (
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                  Nenhum serviço/receita registrado neste período.
                </div>
              ) : (
                <div className="dre-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #cbd5e1', minWidth: '580px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#1e293b', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Serviço / Procedimento</th>
                      <th style={{ padding: '7px 10px' }}>Categoria</th>
                      <th style={{ padding: '7px 10px', textAlign: 'center' }}>Qtd.</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Valor Bruto</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Descontos</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Valor Líquido</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Recebido (Caixa)</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Em Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreServicesList.map((srv, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0f172a' }}>{srv.serviceName}</td>
                        <td style={{ padding: '7px 10px', color: '#475569' }}>{srv.categoryLabel}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{srv.count}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatCurrency(srv.grossCents)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: srv.discountCents > 0 ? '#dc2626' : '#94a3b8' }}>
                          {srv.discountCents > 0 ? `- ${formatCurrency(srv.discountCents)}` : 'R$ 0,00'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{formatCurrency(srv.netCents)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{formatCurrency(srv.paidCents)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: srv.openCents > 0 ? 700 : 400, color: srv.openCents > 0 ? '#b45309' : '#94a3b8' }}>
                          {formatCurrency(srv.openCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* 4. ENTRADAS E TRANSAÇÕES DETALHADAS DOS CLIENTES */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                4. Entradas &amp; Transações Detalhadas dos Clientes ({dreClientEntries.length})
              </div>
              {dreClientEntries.length === 0 ? (
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                  Nenhuma entrada de cliente registrada neste período.
                </div>
              ) : (
                <div className="dre-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', border: '1px solid #cbd5e1', minWidth: '580px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#1e293b', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Data</th>
                      <th style={{ padding: '7px 10px' }}>Cliente / Origem</th>
                      <th style={{ padding: '7px 10px' }}>Serviço &amp; Histórico de Pagamentos (Entradas / Parciais)</th>
                      <th style={{ padding: '7px 10px' }}>Forma</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Bruto / Desc.</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Pago</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Em Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreClientEntries.map(({ payment: p, grossCents, steps }) => {
                      const mLabel = PAYMENT_METHODS[p.paymentMethod]?.label || p.paymentMethod.toUpperCase();
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {formatDateOnly(p.paidAt || p.createdAt)}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <strong style={{ color: '#0f172a', display: 'block' }}>{p.clientName}</strong>
                            {p.clientPhone && <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{p.clientPhone}</span>}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>
                              {p.serviceName ? `${p.serviceName} — ${p.description}` : p.description}
                            </div>
                            {steps.length > 0 && (
                              <div style={{ marginTop: '3px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {steps.map((st, idx) => (
                                  <span key={idx} style={{ fontSize: '0.7rem', color: '#047857' }}>
                                    • <strong>{st.label}:</strong> {formatCurrency(st.amountCents)} ({st.method} em {st.dateStr})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              {(() => {
                                const MIcon = (PAYMENT_METHODS[p.paymentMethod] || PAYMENT_METHODS.pix).icon;
                                return <MIcon size={14} />;
                              })()}
                              {mLabel}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700 }}>{formatCurrency(p.amountCents)}</div>
                            {p.discountCents > 0 && (
                              <div style={{ fontSize: '0.68rem', color: '#dc2626' }}>
                                Bruto {formatCurrency(grossCents)} (-{formatCurrency(p.discountCents)})
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: '#059669' }}>
                            {formatCurrency(p.paidAmountCents)}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: p.remainingAmountCents > 0 ? 800 : 400, color: p.remainingAmountCents > 0 ? '#b45309' : '#94a3b8' }}>
                            {p.remainingAmountCents > 0 ? formatCurrency(p.remainingAmountCents) : 'Quitado'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* 5. CUSTOS E DESPESAS DETALHADAS (SAÍDAS) */}
            <div style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                5. Detalhamento de Custos &amp; Despesas Operacionais ({dreEntriesOut.length})
              </div>
              {dreEntriesOut.length === 0 ? (
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                  Nenhuma despesa ou saída registrada neste período.
                </div>
              ) : (
                <div className="dre-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', border: '1px solid #cbd5e1', minWidth: '520px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#1e293b', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Data</th>
                      <th style={{ padding: '7px 10px' }}>Descrição / Favorecido</th>
                      <th style={{ padding: '7px 10px' }}>Categoria de Custo / Despesa</th>
                      <th style={{ padding: '7px 10px' }}>Forma</th>
                      <th style={{ padding: '7px 10px' }}>Situação</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Valor da Despesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreEntriesOut.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#475569' }}>
                          {formatDateOnly(exp.paidAt || exp.dueAt || exp.createdAt)}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0f172a' }}>
                          {exp.description}
                        </td>
                        <td style={{ padding: '7px 10px', color: '#475569' }}>
                          {allCategoriesSaida[exp.category] || exp.category}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            {(() => {
                              const MIcon = (PAYMENT_METHODS[exp.paymentMethod] || PAYMENT_METHODS.pix).icon;
                              return <MIcon size={14} />;
                            })()}
                            {PAYMENT_METHODS[exp.paymentMethod]?.label || exp.paymentMethod.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          {exp.status === 'pago' ? 'Pago' : 'Em Aberto'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>
                          - {formatCurrency(exp.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* RODAPÉ DE ASSINATURA CONTÁBIL / GERENCIAL */}
            <div style={{ marginTop: '28px', paddingTop: '14px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b', pageBreakInside: 'avoid' }}>
              <div>
                <strong>Camila Machado</strong> • Hipnose Clínica Multidimensional Integrativa (CRT-SBHP/SC 805)
              </div>
              <div>
                Documento DRE Gerencial • Período: {drePeriodLabel}
              </div>
            </div>
          </div>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ESTILO GLOBAL DE IMPRESSÃO DO DRE (QUANDO NÃO ESTIVER IMPRIMINDO RECIBO INDIVIDUAL) */}
            {!receiptModal && (
              <style>{`
                @media print {
                  @page { size: A4 portrait; margin: 10mm 12mm; }
                  html, body { background: #ffffff !important; height: auto !important; overflow: visible !important; }
                  aside, header, nav, .no-print { display: none !important; }
                  #dre-print-modal-backdrop {
                    position: static !important;
                    background: transparent !important;
                    backdrop-filter: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    overflow: visible !important;
                    display: block !important;
                  }
                  #dre-print-modal-sheet, #printable-dre-screen-wrapper {
                    display: block !important;
                    max-width: 100% !important;
                    width: 100% !important;
                    box-shadow: none !important;
                  }
                  #printable-dre {
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                  }
                }
              `}</style>
            )}

            {/* BARRA DE CONTROLE DO DRE (FILTRO POR PERÍODO OU GERAL + BOTÃO DE IMPRESSÃO / PDF) */}
            <div
              className="no-print"
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1.5px solid #cbd5e1',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    DRE Gerencial &amp; Analítico
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    Período: <strong style={{ color: '#0f172a' }}>{drePeriodLabel}</strong>
                  </span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a3a4a', margin: '4px 0 0' }}>
                  Demonstrativo do Resultado do Exercício (DRE) Completo
                </h3>
              </div>

              {/* Seletores de Período do DRE + Botões de Impressão */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'hoje', label: 'Hoje' },
                    { key: 'semanal', label: 'Semanal' },
                    { key: 'mensal', label: 'Mensal' },
                    { key: 'todos', label: 'Geral (Tudo)' },
                    { key: 'custom', label: 'Por Período' },
                  ].map((p) => {
                    const active = periodPreset === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPeriodPreset(p.key as typeof periodPreset)}
                        style={{
                          border: 'none',
                          background: active ? '#1a3a4a' : 'transparent',
                          color: active ? '#ffffff' : '#475569',
                          borderRadius: '9px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: active ? 800 : 600,
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {periodPreset === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '10px' }}>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 6px', fontSize: '0.76rem' }}
                    />
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>até</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 6px', fontSize: '0.76rem' }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDrePrintModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #1a3a4a 0%, #0f172a 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '9px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 4px 12px rgba(26,58,74,0.22)',
                  }}
                >
                  <Printer size={15} /> Imprimir / Gerar PDF do DRE
                </button>
              </div>
            </div>

            {/* CARDS PRINCIPAIS DO DRE NA TELA (LUCRO, RECEITA BRUTA, RECEBIDO X ABERTo, DESPESAS) */}
            <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {/* Card 1: Lucro Líquido */}
              <div
                style={{
                  background: dre.lucroLiquidoCents >= 0 ? 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)',
                  border: `2px solid ${dre.lucroLiquidoCents >= 0 ? '#10b981' : '#ef4444'}`,
                  borderRadius: '18px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c', textTransform: 'uppercase' }}>
                    (=) Lucro Líquido
                  </span>
                  <span style={{ background: dre.lucroLiquidoCents >= 0 ? '#d1fae5' : '#fee2e2', color: dre.lucroLiquidoCents >= 0 ? '#065f46' : '#991b1b', borderRadius: '999px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 800 }}>
                    Margem {dre.margemLiquidaPct}%
                  </span>
                </div>
                <strong style={{ display: 'block', fontSize: '1.75rem', fontWeight: 900, color: dre.lucroLiquidoCents >= 0 ? '#047857' : '#b91c1c', marginTop: '6px' }}>
                  {formatCurrency(dre.lucroLiquidoCents)}
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#475569', display: 'block', marginTop: '4px' }}>
                  Saldo efetivo em caixa: <strong>{formatCurrency(dre.saldoLiquidoCaixaCents)}</strong>
                </span>
              </div>

              {/* Card 2: Receita Bruta & Líquida */}
              <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '18px', padding: '18px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', display: 'block' }}>
                  (+) Receita Bruta Total
                </span>
                <strong style={{ display: 'block', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                  {formatCurrency(dre.receitaBrutaCents)}
                </strong>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Descontos: <strong style={{ color: '#dc2626' }}>-{formatCurrency(dre.deducoesDescontosCents)}</strong></span>
                  <span>Líquida: <strong style={{ color: '#059669' }}>{formatCurrency(dre.receitaLiquidaCents)}</strong></span>
                </div>
              </div>

              {/* Card 3: Recebido em Caixa vs A Receber */}
              <div style={{ background: '#ffffff', border: '1.5px solid #bbf7d0', borderRadius: '18px', padding: '18px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', display: 'block' }}>
                  (✓) Entradas Realizadas em Caixa
                </span>
                <strong style={{ display: 'block', fontSize: '1.65rem', fontWeight: 800, color: '#059669', marginTop: '6px' }}>
                  {formatCurrency(dre.receitaRealizadaCaixaCents)}
                </strong>
                <span style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 700, display: 'block', marginTop: '4px' }}>
                  ⏳ Em aberto a receber: {formatCurrency(dre.totalAReceberCents)}
                </span>
              </div>

              {/* Card 4: Despesas & Custos */}
              <div style={{ background: '#ffffff', border: '1.5px solid #fecaca', borderRadius: '18px', padding: '18px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', display: 'block' }}>
                  (-) Custos &amp; Despesas Totais
                </span>
                <strong style={{ display: 'block', fontSize: '1.65rem', fontWeight: 800, color: '#dc2626', marginTop: '6px' }}>
                  - {formatCurrency(dre.totalDespesasCents)}
                </strong>
                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  Variáveis: {formatCurrency(dre.custosVariaveisCents)} · Fixas: {formatCurrency(dre.despesasOperacionaisCents)}
                </span>
              </div>
            </div>

            {/* CORPO COMPLETO DO DRE (TAMBÉM USADO NA IMPRESSÃO DIRETA SE O MODAL NÃO ESTIVER ABERTO) */}
            <div id="printable-dre-screen-wrapper">
              {!drePrintModalOpen && renderPrintableDreDocument()}
            </div>

            {/* MODAL DE VISUALIZAÇÃO DE IMPRESSÃO / PDF DO DRE (ESTILO DOCUMENTO A4 LIMPO) */}
            {drePrintModalOpen && (
              <div
                id="dre-print-modal-backdrop"
                className="fin-modal-overlay"
                style={{
                  zIndex: 120,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
                onClick={(e) => { if (e.target === e.currentTarget) setDrePrintModalOpen(false); }}
              >
                {/* Barra Superior Flutuante do Modal (Não sai na impressão) */}
                <div
                  className="no-print"
                  style={{
                    width: '100%',
                    maxWidth: '920px',
                    background: '#0f172a',
                    color: '#ffffff',
                    borderRadius: '16px',
                    padding: '14px 20px',
                    marginBottom: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                      Visualização Oficial para Impressão / PDF (A4)
                    </span>
                    <strong style={{ fontSize: '1rem', color: '#ffffff' }}>
                      DRE — {drePeriodLabel}
                    </strong>
                  </div>

                  {/* Troca rápida de período dentro do preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'hoje', label: 'Hoje' },
                      { key: 'semanal', label: 'Semanal' },
                      { key: 'mensal', label: 'Mensal' },
                      { key: 'todos', label: 'Geral (Tudo)' },
                      { key: 'custom', label: 'Por Período' },
                    ].map((p) => {
                      const active = periodPreset === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPeriodPreset(p.key as typeof periodPreset)}
                          style={{
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: active ? '#ffffff' : 'rgba(255,255,255,0.08)',
                            color: active ? '#0f172a' : '#e2e8f0',
                            borderRadius: '8px',
                            padding: '5px 10px',
                            fontSize: '0.74rem',
                            fontWeight: active ? 800 : 600,
                            cursor: 'pointer',
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    {periodPreset === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          style={{ borderRadius: '6px', border: 'none', padding: '4px 6px', fontSize: '0.74rem', color: '#0f172a' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>até</span>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          style={{ borderRadius: '6px', border: 'none', padding: '4px 6px', fontSize: '0.74rem', color: '#0f172a' }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      style={{
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '8px 16px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Printer size={15} /> Imprimir / Salvar PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrePrintModalOpen(false)}
                      style={{
                        background: 'rgba(255,255,255,0.12)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                {/* Folha A4 do DRE */}
                <div id="dre-print-modal-sheet" style={{ width: '100%', maxWidth: '920px', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', borderRadius: '16px', background: '#ffffff' }}>
                  {renderPrintableDreDocument()}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* ABA 3: PAGAMENTOS DE CLIENTES (AGENDAMENTOS ONLINE + REGISTROS MANUAIS)   */}
      {/* ========================================================================= */}
      {activeMainTab === 'pagamentos' && (() => {
        const clientPayments = payments.filter(
          (p) => p.entryType === 'entrada' && p.clientId && (!paymentsClientFilter || p.clientId === paymentsClientFilter)
        );
        const totalCobrado = clientPayments.reduce((a, p) => a + p.amountCents, 0);
        const totalRecebido = clientPayments.reduce((a, p) => a + p.paidAmountCents, 0);
        const totalAberto = clientPayments.reduce((a, p) => a + (p.status !== 'cancelado' ? p.remainingAmountCents : 0), 0);
        const qtdOnline = clientPayments.filter((p) => p.appointmentId).length;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a3a4a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={22} style={{ color: '#059669' }} /> Pagamentos de Clientes
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0' }}>
                  Pagamentos vindos de agendamentos online e pagamentos registrados manualmente para um cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetNewForm();
                  setNewModalMode('cliente');
                  setFormEntryType('entrada');
                  setFormCategory('sessao_avulsa');
                  setCategoryQuery(allCategoriesEntrada['sessao_avulsa'] || 'Sessão Avulsa de Hipnose');
                  if (paymentsClientFilter) {
                    setFormClientId(paymentsClientFilter);
                    const cli = clients.find((c) => c.id === paymentsClientFilter);
                    if (cli) setClientQuery(cli.name);
                  }
                  setNewModalOpen(true);
                }}
                style={{
                  background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 14px',
                  minHeight: '34px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 6px rgba(5,150,105,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transition: 'all 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)',
                }}
              >
                <Plus size={14} /> Registrar Pagamento de Cliente
              </button>
            </div>

            {/* Cards resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '14px' }}>
              {[
                { label: 'Total Cobrado', val: formatCurrency(totalCobrado), color: '#0f172a', border: '#94a3b8' },
                { label: 'Total Recebido', val: formatCurrency(totalRecebido), color: '#059669', border: '#6ee7b7' },
                { label: 'Em Aberto', val: formatCurrency(totalAberto), color: '#b45309', border: '#fcd34d' },
                { label: 'Pagamentos / Online', val: `${clientPayments.length} / ${qtdOnline}`, color: '#0284c7', border: '#7dd3fc' },
              ].map((c) => (
                <div key={c.label} style={{ background: '#ffffff', border: `2px solid ${c.border}`, borderRadius: '18px', padding: '16px 18px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</span>
                  <strong style={{ display: 'block', fontSize: '1.5rem', fontWeight: 800, color: c.color, marginTop: '6px' }}>{c.val}</strong>
                </div>
              ))}
            </div>

            {/* Filtro por cliente */}
            <div style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <User size={16} style={{ color: '#64748b', flexShrink: 0 }} />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>Cliente:</span>
              <select
                value={paymentsClientFilter}
                onChange={(e) => setPaymentsClientFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.84rem',
                  flex: '1 1 200px',
                  minWidth: 0,
                  maxWidth: '100%',
                  color: '#1a3a4a',
                  fontWeight: 700,
                  background: '#ffffff',
                }}
              >
                <option value="">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Tabela (Desktop) + Cards Destacados (Mobile) */}
            <div
              className="fin-table-card"
              style={{
                background: '#ffffff',
                borderRadius: '22px',
                border: '2px solid #cbd5e1',
                overflow: 'hidden',
                boxShadow: '0 6px 20px rgba(15, 23, 42, 0.05)',
              }}
            >
              {clientPayments.length === 0 ? (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '20px' }}>
                  <CreditCard size={42} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                  <h4 style={{ margin: '0 0 4px', color: '#1a3a4a' }}>Nenhum pagamento de cliente no período</h4>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>Use &quot;Registrar Pagamento de Cliente&quot; para lançar um pagamento manual.</p>
                </div>
              ) : (
                <>
                  {/* VISÃO DESKTOP (> 768px) */}
                  <div className="fin-desktop-table-wrap" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <th style={{ padding: '14px 18px' }}>Cliente</th>
                          <th style={{ padding: '14px 18px' }}>Serviço / Referente</th>
                          <th style={{ padding: '14px 18px' }}>Origem</th>
                          <th style={{ padding: '14px 18px' }}>Valor</th>
                          <th style={{ padding: '14px 18px' }}>Pago</th>
                          <th style={{ padding: '14px 18px' }}>Em Aberto</th>
                          <th style={{ padding: '14px 18px' }}>Forma</th>
                          <th style={{ padding: '14px 18px' }}>Data / Hora</th>
                          <th style={{ padding: '14px 18px', textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientPayments.map((p) => {
                          const mConf = PAYMENT_METHODS[p.paymentMethod] || PAYMENT_METHODS.outro;
                          const MIcon = mConf.icon;
                          const open = p.remainingAmountCents > 0 && p.status !== 'cancelado';
                          return (
                            <tr
                              key={p.id}
                              onClick={() => openManageModal(p, open ? 'quitar' : 'detalhes')}
                              style={{ borderBottom: '1.5px solid #e2e8f0', background: p.isOverdue ? '#fffbeb' : '#ffffff', cursor: 'pointer', transition: 'background 0.15s ease' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = p.isOverdue ? '#fef3c7' : '#f8fafc'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = p.isOverdue ? '#fffbeb' : '#ffffff'; }}
                              title="Clique para abrir a ficha detalhada deste pagamento"
                            >
                              <td style={{ padding: '14px 18px' }}>
                                <strong style={{ color: '#1e293b' }}>{p.clientName}</strong>
                                {p.clientPhone && <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>{p.clientPhone}</span>}
                              </td>
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{ display: 'block', color: '#334155', fontWeight: 600 }}>{p.serviceName || p.description}</span>
                                {p.serviceName && <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{p.description}</span>}
                                {p.installmentNumber && p.totalInstallments && (
                                  <span style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                                    Parcela {p.installmentNumber}/{p.totalInstallments}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                                {p.appointmentId ? (
                                  <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CalendarDays size={12} /> Agendamento
                                  </span>
                                ) : (
                                  <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <User size={12} /> Manual
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                                <strong style={{ color: '#0f172a' }}>{formatCurrency(p.amountCents)}</strong>
                                {p.discountCents > 0 && (
                                  <span style={{ fontSize: '0.7rem', color: '#059669', display: 'block', fontWeight: 600 }}>
                                    Bruto: {formatCurrency(p.amountCents + p.discountCents)} · Desc: -{formatCurrency(p.discountCents)}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#059669', fontWeight: 700 }}>{formatCurrency(p.paidAmountCents)}</td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: open ? (p.isOverdue ? '#dc2626' : '#b45309') : '#94a3b8', fontWeight: open ? 800 : 500 }}>
                                {formatCurrency(open ? p.remainingAmountCents : 0)}
                              </td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                                <span style={{ background: mConf.bg, color: mConf.color, borderRadius: '8px', padding: '3px 8px', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <MIcon size={13} /> {mConf.label}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#64748b' }}>
                                {formatDateTime(p.paidAt || p.createdAt)}
                              </td>
                              <td style={{ padding: '14px 18px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  {open && p.clientPhone && (
                                    <button
                                      type="button"
                                      onClick={() => openWhatsappChargeModal(p)}
                                      style={{
                                        background: '#16a34a',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '5px 9px',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                      title="Cobrar via WhatsApp"
                                    >
                                      <WhatsappIcon size={13} color="#ffffff" /> Cobrar
                                    </button>
                                  )}
                                  {open && (
                                    <button type="button" onClick={() => openManageModal(p, 'quitar')} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                                      Quitar
                                    </button>
                                  )}
                                  <button type="button" onClick={() => setReceiptModal(p)} title="Recibo" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', color: '#334155' }}>
                                    <Printer size={13} />
                                  </button>
                                  <button type="button" onClick={() => handleDeletePayment(p.id)} title="Excluir" style={{ background: 'transparent', border: 'none', padding: '5px 7px', cursor: 'pointer', color: '#94a3b8' }}>
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* VISÃO MOBILE (<= 768px): Cards Destacados de Pagamentos de Clientes */}
                  <div className="fin-mobile-cards-list">
                    {clientPayments.map((p) => {
                      const mConf = PAYMENT_METHODS[p.paymentMethod] || PAYMENT_METHODS.outro;
                      const MIcon = mConf.icon;
                      const open = p.remainingAmountCents > 0 && p.status !== 'cancelado';

                      return (
                        <article
                          key={`mob-cli-${p.id}`}
                          onClick={() => openManageModal(p, open ? 'quitar' : 'detalhes')}
                          style={{
                            background: p.isOverdue ? '#fffbeb' : '#ffffff',
                            border: '2px solid #94a3b8',
                            borderLeft: '5px solid #059669',
                            borderRadius: '18px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.07)',
                            cursor: 'pointer',
                          }}
                        >
                          {/* Topo: Origem + Status */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1.5px solid #cbd5e1', paddingBottom: '8px' }}>
                            {p.appointmentId ? (
                              <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CalendarDays size={12} /> Agendamento Online
                              </span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <User size={12} /> Lançamento Manual
                              </span>
                            )}

                            {open ? (
                              <span style={{ background: p.isOverdue ? '#fee2e2' : '#fef3c7', color: p.isOverdue ? '#991b1b' : '#92400e', border: `1px solid ${p.isOverdue ? '#fca5a5' : '#fcd34d'}`, borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> {p.isOverdue ? 'Vencido' : 'Saldo em Aberto'}
                              </span>
                            ) : (
                              <span style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: '50px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> Quitado
                              </span>
                            )}
                          </div>

                          {/* Cliente & Serviço */}
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.96rem', fontWeight: 800 }}>
                              {p.clientName}
                            </strong>
                            {p.clientPhone && (
                              <span style={{ display: 'block', fontSize: '0.76rem', color: '#0284c7', fontWeight: 700, marginTop: '1px' }}>
                                {p.clientPhone}
                              </span>
                            )}
                            <span style={{ display: 'block', color: '#334155', fontSize: '0.82rem', fontWeight: 600, marginTop: '4px', wordBreak: 'break-word' }}>
                              {p.serviceName ? `${p.serviceName} — ${p.description}` : p.description}
                            </span>
                            {p.installmentNumber && p.totalInstallments && (
                              <span style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '5px' }}>
                                Parcela {p.installmentNumber}/{p.totalInstallments}
                              </span>
                            )}
                          </div>

                          {/* Quadro de Valores */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                              gap: '6px',
                              background: '#f8fafc',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '12px',
                              padding: '9px 10px',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                                Valor
                              </span>
                              <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', display: 'block', marginTop: '1px' }}>
                                {formatCurrency(p.amountCents)}
                              </strong>
                            </div>
                            <div style={{ minWidth: 0, borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
                              <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', display: 'block' }}>
                                Pago
                              </span>
                              <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: '#059669', display: 'block', marginTop: '1px' }}>
                                {formatCurrency(p.paidAmountCents)}
                              </strong>
                            </div>
                            <div style={{ minWidth: 0, borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
                              <span style={{ fontSize: '0.64rem', fontWeight: 800, color: open ? '#b45309' : '#64748b', textTransform: 'uppercase', display: 'block' }}>
                                Em Aberto
                              </span>
                              <strong style={{ fontSize: '0.86rem', fontWeight: 800, color: open ? (p.isOverdue ? '#dc2626' : '#b45309') : '#94a3b8', display: 'block', marginTop: '1px' }}>
                                {formatCurrency(open ? p.remainingAmountCents : 0)}
                              </strong>
                            </div>
                          </div>

                          {/* Forma + Data */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.76rem', color: '#475569' }}>
                            <span style={{ background: mConf.bg, color: mConf.color, border: '1px solid #cbd5e1', borderRadius: '8px', padding: '3px 9px', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <MIcon size={13} /> {mConf.label}
                            </span>
                            <span style={{ fontWeight: 600 }}>📅 {formatDateTime(p.paidAt || p.createdAt)}</span>
                          </div>

                          {/* Ações */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                              flexWrap: 'wrap',
                              borderTop: '1.5px solid #cbd5e1',
                              paddingTop: '9px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                              {open && p.clientPhone && (
                                <button
                                  type="button"
                                  onClick={() => openWhatsappChargeModal(p)}
                                  style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '999px',
                                    padding: '6px 12px',
                                    fontSize: '0.76rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <WhatsappIcon size={14} color="#ffffff" /> Cobrar WhatsApp
                                </button>
                              )}
                              {open && (
                                <button
                                  type="button"
                                  onClick={() => openManageModal(p, 'quitar')}
                                  style={{
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '999px',
                                    padding: '6px 12px',
                                    fontSize: '0.76rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <DollarSign size={13} /> Quitar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setReceiptModal(p)}
                                style={{
                                  background: '#f8fafc',
                                  color: '#1e293b',
                                  border: '1.5px solid #cbd5e1',
                                  borderRadius: '999px',
                                  padding: '5px 11px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Printer size={13} /> Recibo
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeletePayment(p.id)}
                              style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1.5px solid #fecaca',
                                borderRadius: '999px',
                                padding: '5px 9px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* ABA 4: LANÇAMENTOS, ENTRADAS & SAÍDAS (TABELA COMPLETA)                   */}
      {/* ========================================================================= */}
      {activeMainTab === 'lancamentos' && (
        <div>
          {renderPaymentsTableSection(
            'Todos os Lançamentos & Movimentações',
            'Gestão detalhada de contas a pagar, a receber, quitações e parcelamentos com auditoria completa.'
          )}
        </div>
      )}

      {/* ESTILOS COMPARTILHADOS PARA TODOS OS MODAIS FINANCEIROS (.fin-modal) E RESPONSIVIDADE MOBILE */}
      <style>{`
        .fin-mobile-cards-list {
          display: none;
        }
        .fin-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          z-index: 1000;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 24px 14px 48px 14px;
          box-sizing: border-box;
        }
        .fin-modal, #printable-receipt {
          margin: auto 0;
          width: 100%;
          box-sizing: border-box;
          background: #ffffff;
          border-radius: 20px;
          border: 1.5px solid #cbd5e1 !important;
          box-shadow: 0 25px 60px rgba(15, 23, 42, 0.32), 0 0 0 1px rgba(15, 23, 42, 0.05) !important;
          max-height: calc(100dvh - 48px);
          max-height: min(92vh, calc(100dvh - 48px));
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
          padding: 22px;
        }
        .fin-modal::-webkit-scrollbar, #printable-receipt::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .fin-modal::-webkit-scrollbar-track, #printable-receipt::-webkit-scrollbar-track {
          background: transparent !important;
          margin: 16px 0 !important;
        }
        .fin-modal::-webkit-scrollbar-thumb, #printable-receipt::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.42) !important;
          border-radius: 999px !important;
        }
        .fin-modal::-webkit-scrollbar-thumb:hover, #printable-receipt::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.65) !important;
        }
        .fin-modal .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fin-modal input:not([type=checkbox]):not([type=radio]):not(.fin-bare-input),
        .fin-modal select,
        .fin-modal textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1.5px solid #94a3b8 !important;
          border-radius: 10px !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-weight: 600 !important;
          font-size: 0.84rem !important;
          min-height: 40px;
          padding: 8px 12px !important;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04) !important;
          transition: border-color .15s ease, box-shadow .15s ease !important;
        }
        .fin-modal .fin-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          box-sizing: border-box;
          border: 1.5px solid #94a3b8;
          border-radius: 10px;
          background: #ffffff;
          min-height: 40px;
          padding: 0 12px;
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .fin-modal .fin-search-box:focus-within {
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5,150,105,0.12);
        }
        .fin-modal input.fin-bare-input {
          border: none !important;
          outline: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 8px 0 !important;
          margin: 0 !important;
          width: 100%;
          color: #0f172a !important;
          font-weight: 700 !important;
          font-size: 0.88rem !important;
        }
        .fin-modal select { cursor: pointer; }
        .fin-modal input:not(.fin-bare-input):hover, .fin-modal select:hover, .fin-modal textarea:hover, .fin-modal .fin-search-box:hover { border-color: #64748b !important; }
        .fin-modal input:not(.fin-bare-input):focus, .fin-modal select:focus, .fin-modal textarea:focus {
          outline: none !important;
          border-color: #059669 !important;
          box-shadow: 0 0 0 3px rgba(5,150,105,0.12) !important;
        }
        .fin-modal input::placeholder, .fin-modal textarea::placeholder { color: #94a3b8 !important; font-weight: 500 !important; }
        .fin-modal label, .fin-modal .form-label { font-weight: 700 !important; color: #1e293b !important; font-size: 0.78rem !important; }
        .fin-modal button[type=submit] {
          background: linear-gradient(180deg, #10b981 0%, #059669 100%) !important;
          color: #fff !important; border: none !important; border-radius: 10px !important;
          padding: 8px 16px !important; font-weight: 600 !important; font-size: 0.8rem !important;
          letter-spacing: -0.01em !important;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(5,150,105,0.22), inset 0 1px 0 rgba(255,255,255,0.2) !important;
          transition: transform .15s ease, filter .15s ease;
        }
        .fin-modal button[type=submit]:hover { transform: translateY(-0.5px); filter: brightness(1.04); }
        .fin-modal button[type=submit]:active { transform: scale(0.97); }
        .fin-modal .btn-secondary {
          border: 1.5px solid #cbd5e1 !important; border-radius: 10px !important;
          padding: 8px 15px !important; font-weight: 600 !important; font-size: 0.8rem !important;
          letter-spacing: -0.01em !important;
          background: #f1f5f9 !important; color: #1e293b !important;
          cursor: pointer;
          transition: all .15s ease;
        }
        .fin-modal .btn-secondary:hover { background: #e2e8f0 !important; color: #0f172a !important; }

        @media (max-width: 768px) {
          .fin-exec-header {
            padding: 16px !important;
            border-radius: 18px !important;
            gap: 14px !important;
          }
          .fin-exec-header h1 {
            font-size: 1.3rem !important;
          }
          .fin-exec-header p {
            font-size: 0.78rem !important;
          }
          .fin-period-controls {
            width: 100% !important;
            align-items: flex-start !important;
          }
          .fin-period-pills {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .fin-period-pills button {
            flex: 1 1 auto !important;
            padding: 6px 8px !important;
            font-size: 0.72rem !important;
            text-align: center !important;
          }
          .fin-main-tabs {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 6px !important;
            border-bottom: none !important;
            padding-bottom: 0 !important;
          }
          .fin-main-tab-btn {
            padding: 10px 10px !important;
            font-size: 0.76rem !important;
            border: 1.5px solid #cbd5e1 !important;
            border-radius: 12px !important;
            background: #ffffff !important;
            justify-content: center !important;
            text-align: center !important;
            margin-bottom: 0 !important;
          }
          .fin-main-tab-btn.is-active {
            background: #1a3a4a !important;
            color: #ffffff !important;
            border-color: #1a3a4a !important;
          }
          .fin-main-tab-btn.is-active svg {
            color: #ffffff !important;
          }
          .fin-main-tabs-actions {
            grid-column: 1 / -1 !important;
            width: 100% !important;
            margin-left: 0 !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            padding-top: 4px !important;
          }
          .fin-section-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .fin-filter-divider {
            display: none !important;
          }
          .fin-desktop-table-wrap {
            display: none !important;
          }
          .fin-table-card {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            overflow: visible !important;
            border-radius: 0 !important;
          }
          .fin-mobile-cards-list {
            display: flex !important;
            flex-direction: column !important;
            gap: 14px !important;
          }
          .fin-chart-card {
            padding: 15px !important;
            border-radius: 18px !important;
          }
          #printable-dre {
            padding: 14px !important;
            border-radius: 14px !important;
          }
          .fin-installment-grid {
            grid-template-columns: 1fr !important;
          }
          .fin-modal-overlay {
            padding: 12px 10px max(40px, env(safe-area-inset-bottom, 40px)) 10px !important;
            align-items: flex-start !important;
          }
          .fin-modal, #printable-receipt {
            max-height: calc(100dvh - 24px) !important;
            border-radius: 16px !important;
            padding: 18px 14px 36px 14px !important;
            margin: 0 0 auto 0 !important;
          }
          .fin-billing-segmented {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ================= MODAL: NOVO LANÇAMENTO (ENTRADA OU SAÍDA) ================= */}
      {newModalOpen && (
        <div className="fin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setNewModalOpen(false); }}>
          <div className="fin-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: formEntryType === 'entrada' ? '#059669' : '#e11d48', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {newModalMode === 'cliente'
                    ? 'Pagamento de Cliente / Atendimento'
                    : formEntryType === 'entrada'
                      ? 'Nova Receita / Entrada Externa ou Avulsa'
                      : 'Nova Despesa / Saída Operacional'}
                </span>
                <h3 style={{ fontSize: '1.16rem', fontWeight: 800, color: '#1a3a4a', margin: '2px 0 0', letterSpacing: '-0.02em' }}>
                  {newModalMode === 'cliente'
                    ? 'Registrar Pagamento de Cliente'
                    : formEntryType === 'entrada'
                      ? 'Registrar Nova Receita (Entrada Manual)'
                      : 'Registrar Nova Despesa (Saída Manual)'}
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0', lineHeight: 1.4 }}>
                  {newModalMode === 'cliente'
                    ? 'Selecione o cliente da clínica, o serviço realizado e a condição de pagamento.'
                    : formEntryType === 'entrada'
                      ? 'Entrada financeira manual sem vínculo obrigatório com cliente (ex: pagamento externo, venda avulsa, curso, aporte).'
                      : 'Saída financeira ou despesa operacional da clínica.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* SELETOR ENTRADA VS SAÍDA (Estilo iOS Segmented Control) */}
            {newModalMode === 'geral' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px',
                  marginBottom: '12px',
                  background: '#f1f5f9',
                  padding: '3.5px',
                  borderRadius: '11px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleToggleEntryType('entrada')}
                  style={{
                    background: formEntryType === 'entrada' ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)' : 'transparent',
                    color: formEntryType === 'entrada' ? '#ffffff' : '#475569',
                    border: 'none',
                    borderRadius: '8.5px',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: formEntryType === 'entrada' ? 700 : 600,
                    fontSize: '0.79rem',
                    letterSpacing: '-0.01em',
                    boxShadow: formEntryType === 'entrada' ? '0 2px 6px rgba(5,150,105,0.24), inset 0 1px 0 rgba(255,255,255,0.2)' : 'none',
                    transition: 'all 0.16s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  <ArrowDown size={14} /> Entrada (Receita)
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleEntryType('saida')}
                  style={{
                    background: formEntryType === 'saida' ? 'linear-gradient(180deg, #f43f5e 0%, #e11d48 100%)' : 'transparent',
                    color: formEntryType === 'saida' ? '#ffffff' : '#475569',
                    border: 'none',
                    borderRadius: '8.5px',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: formEntryType === 'saida' ? 700 : 600,
                    fontSize: '0.79rem',
                    letterSpacing: '-0.01em',
                    boxShadow: formEntryType === 'saida' ? '0 2px 6px rgba(225,29,72,0.24), inset 0 1px 0 rgba(255,255,255,0.2)' : 'none',
                    transition: 'all 0.16s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  <ArrowUp size={14} /> Saída (Despesa / Custo)
                </button>
              </div>
            )}

            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '0.82rem' }}>
                {errorMsg}
              </div>
            )}

            {/* SELETOR DE MODALIDADE: À VISTA | PARCIAL | PARCELADO (Estilo iOS Segmented Control) */}
            <div
              className="fin-billing-segmented"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '4px',
                marginBottom: '14px',
                background: '#f1f5f9',
                padding: '3.5px',
                borderRadius: '11px',
                border: '1px solid #e2e8f0',
              }}
            >
              {[
                { key: 'avista', label: 'À Vista (Total)', desc: 'Liquidado ou a vencer' },
                { key: 'parcial', label: 'Pagamento Parcial', desc: 'Entrada + saldo' },
                { key: 'parcelado', label: 'Parcelado (N vezes)', desc: 'Em até N parcelas' },
              ].map((m) => {
                const active = billingType === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      const nextType = m.key as typeof billingType;
                      setBillingType(nextType);
                      if (nextType === 'parcial' && !formDueAt) {
                        setFormDueAt(new Date().toISOString().slice(0, 10));
                      }
                    }}
                    style={{
                      background: active ? 'linear-gradient(180deg, #244b5e 0%, #1a3a4a 100%)' : 'transparent',
                      color: active ? '#ffffff' : '#334155',
                      border: 'none',
                      borderRadius: '8.5px',
                      padding: '6px 6px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: active ? '0 2px 6px rgba(26,58,74,0.22), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                      transition: 'all 0.16s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '0.78rem', fontWeight: active ? 700 : 600, letterSpacing: '-0.01em' }}>{m.label}</strong>
                    <span style={{ fontSize: '0.64rem', color: active ? '#cbd5e1' : '#64748b', display: 'block', marginTop: '1px' }}>{m.desc}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleCreatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* FLUXO 1 (PAGAMENTO DE CLIENTE): 1º PRIORIDADE ABSOLUTA = SELECIONAR CLIENTE OBRIGATÓRIO */}
              {newModalMode === 'cliente' && (
                <div
                  className="form-group"
                  style={{
                    margin: 0,
                    position: 'relative',
                    background: formClientId ? '#ecfdf5' : '#f8fafc',
                    border: formClientId ? '2px solid #059669' : '2px solid #94a3b8',
                    borderRadius: '16px',
                    padding: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="form-label" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                      <User size={16} strokeWidth={2.5} style={{ color: '#059669' }} /> 1º Selecionar Cliente *
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '2px 8px',
                        borderRadius: '50px',
                        background: formClientId ? '#059669' : '#fee2e2',
                        color: formClientId ? '#ffffff' : '#b91c1c',
                      }}
                    >
                      {formClientId ? '✓ Cliente Selecionado' : 'Obrigatório'}
                    </span>
                  </div>

                  <div className="fin-search-box" style={{ borderColor: formClientId ? '#059669' : '#94a3b8' }}>
                    <Search size={18} strokeWidth={2.6} style={{ color: '#0f172a', flexShrink: 0 }} />
                    <input
                      type="text"
                      className="fin-bare-input"
                      placeholder="Pesquise por nome, CPF, RG, telefone ou e-mail..."
                      value={clientQuery}
                      onChange={(e) => { setClientQuery(e.target.value); setClientOpen(true); if (formClientId) setFormClientId(''); }}
                      onFocus={() => setClientOpen(true)}
                      onBlur={() => setTimeout(() => setClientOpen(false), 160)}
                      required
                    />
                    {clientQuery && (
                      <button
                        type="button"
                        onClick={() => { setFormClientId(''); setClientQuery(''); setClientOpen(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                      >
                        <X size={17} strokeWidth={2.4} />
                      </button>
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setClientOpen((o) => !o); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                    >
                      <ChevronDown size={18} strokeWidth={2.5} />
                    </button>
                  </div>

                  {clientOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1.5px solid #94a3b8', borderRadius: '12px', boxShadow: '0 14px 32px rgba(15,23,42,0.22)', maxHeight: '240px', overflowY: 'auto', zIndex: 35 }}>
                      {filteredClientOptions.length === 0 ? (
                        <div style={{ padding: '12px 14px', fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}>Nenhum cliente encontrado com esse termo</div>
                      ) : (
                        filteredClientOptions.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => { setFormClientId(c.id); setClientQuery(c.name); setClientOpen(false); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f1f5f9', background: formClientId === c.id ? '#ecfdf5' : '#fff', cursor: 'pointer' }}
                          >
                            <strong style={{ display: 'block', fontSize: '0.88rem', color: '#0f172a' }}>{c.name}</strong>
                            <span style={{ fontSize: '0.74rem', color: '#475569' }}>
                              {[c.phone && `📱 ${c.phone}`, c.cpf && `CPF ${c.cpf}`, c.rg && `RG ${c.rg}`, c.email].filter(Boolean).join(' · ')}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* CATEGORIA: selecionar ou digitar (cadastra automaticamente para próximos) */}
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <span className="form-label">Categoria da {formEntryType === 'entrada' ? 'Entrada' : 'Saída'} (selecione ou digite nova) *</span>
                <div className="fin-search-box">
                  <Search size={18} strokeWidth={2.6} style={{ color: '#0f172a', flexShrink: 0 }} />
                  <input
                    type="text"
                    className="fin-bare-input"
                    placeholder="Selecione da lista ou digite uma nova categoria..."
                    value={categoryQuery}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      setCategoryOpen(true);
                    }}
                    onFocus={() => setCategoryOpen(true)}
                    onBlur={() => setTimeout(() => setCategoryOpen(false), 160)}
                    required
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setCategoryOpen((o) => !o); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                  >
                    <ChevronDown size={18} strokeWidth={2.5} />
                  </button>
                </div>
                {(() => {
                  const dict = formEntryType === 'entrada' ? allCategoriesEntrada : allCategoriesSaida;
                  const trimmed = categoryQuery.trim();
                  const exactMatch = Object.entries(dict).find(
                    ([k, l]) => k.toLowerCase() === trimmed.toLowerCase() || l.toLowerCase() === trimmed.toLowerCase()
                  );
                  return (
                    <>
                      {trimmed && !exactMatch && (
                        <span style={{ fontSize: '0.74rem', color: '#0284c7', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                          ✨ Nova categoria &quot;{trimmed}&quot; será cadastrada para os próximos lançamentos
                        </span>
                      )}
                      {categoryOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 12px 28px rgba(15,23,42,0.18)', maxHeight: '240px', overflowY: 'auto', zIndex: 25 }}>
                          {trimmed && !exactMatch && (
                            <button
                              type="button"
                              onMouseDown={() => {
                                const newKey = registerCustomCategory(formEntryType, trimmed);
                                setFormCategory(newKey);
                                setCategoryQuery(trimmed);
                                setCategoryOpen(false);
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1.5px solid #bae6fd', background: '#f0f9ff', cursor: 'pointer', fontSize: '0.85rem', color: '#0369a1', fontWeight: 800 }}
                            >
                              <Plus size={15} /> Cadastrar &quot;{trimmed}&quot; para próximos lançamentos
                            </button>
                          )}
                          {filteredCategoryOptions.map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onMouseDown={() => {
                                setFormCategory(key);
                                setCategoryQuery(label);
                                setCategoryOpen(false);
                              }}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f1f5f9', background: formCategory === key ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: '0.86rem' }}
                            >
                              <strong style={{ color: '#0f172a' }}>{label}</strong>
                              {formCategory === key && <Check size={15} style={{ color: '#059669' }} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* FLUXO 2 (MOVIMENTAÇÃO MANUAL GERAL): ORIGEM / PAGADOR (ENTRADA) OU FAVORECIDO / FORNECEDOR (SAÍDA) - OPCIONAL, SEM CLIENTE OBRIGATÓRIO */}
              {newModalMode === 'geral' && (
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">
                    {formEntryType === 'entrada'
                      ? 'Origem / Pagador (opcional — entrada externa sem cliente)'
                      : 'Favorecido / Fornecedor / Destino (opcional)'}
                  </span>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={
                      formEntryType === 'entrada'
                        ? 'Ex: Venda externa, Curso/Workshop, Recebimento de fora, Parceria...'
                        : 'Ex: Imobiliária Central, Copel, Google Ads, Farmácia...'
                    }
                    value={formSupplierName}
                    onChange={(e) => setFormSupplierName(e.target.value)}
                  />
                </label>
              )}

              {/* SERVIÇO (APENAS NO FLUXO DE PAGAMENTO DE CLIENTE): selecionar da lista ou digitar o nome */}
              {newModalMode === 'cliente' && (
                <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                  <span className="form-label">Serviço (selecione ou digite)</span>
                  <div className="fin-search-box">
                    <Search size={18} strokeWidth={2.6} style={{ color: '#0f172a', flexShrink: 0 }} />
                    <input
                      type="text"
                      className="fin-bare-input"
                      placeholder="Digite o nome do serviço ou escolha da lista..."
                      value={serviceQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setServiceQuery(v);
                        setServiceOpen(true);
                        if (formServiceId) setFormServiceId('');
                        setFormDescription(v);
                      }}
                      onFocus={() => setServiceOpen(true)}
                      onBlur={() => setTimeout(() => setServiceOpen(false), 150)}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setServiceOpen((o) => !o); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f172a', display: 'inline-flex', alignItems: 'center', padding: 0 }}
                    >
                      <ChevronDown size={18} strokeWidth={2.5} />
                    </button>
                  </div>
                  {serviceQuery && !formServiceId && (
                    <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>Serviço digitado manualmente (não cadastrado)</span>
                  )}
                  {formServiceId && (
                    <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700, marginTop: '4px' }}>✓ Serviço cadastrado vinculado</span>
                  )}
                  {serviceOpen && filteredServiceOptions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 12px 28px rgba(15,23,42,0.18)', maxHeight: '220px', overflowY: 'auto', zIndex: 20 }}>
                      {filteredServiceOptions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => { handleSelectService(s.id); setServiceQuery(s.name); setServiceOpen(false); }}
                          style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid #f1f5f9', background: formServiceId === s.id ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: '0.86rem' }}
                        >
                          <strong style={{ color: '#0f172a' }}>{s.name}</strong>
                          <span style={{ color: '#059669', fontWeight: 700 }}>{formatCurrency(s.priceCents)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Descrição */}
              <label className="form-group">
                <span className="form-label">Descrição do Lançamento *</span>
                <input
                  className="form-input"
                  type="text"
                  placeholder={
                    newModalMode === 'cliente'
                      ? 'Ex: Sessão Hipnose Clínica Integrativa'
                      : formEntryType === 'entrada'
                        ? 'Ex: Recebimento externo / Venda de livro ou curso / Aporte'
                        : 'Ex: Pagamento do aluguel da sala clínica ref. mês'
                  }
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                />
              </label>

              {/* Valores: Valor Total e Desconto (um abaixo do outro, com pontuação automática) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Valor (R$) *</span>
                  <div className="fin-search-box">
                    <strong style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 800 }}>R$</strong>
                    <input
                      className="fin-bare-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 500,00"
                      value={formAmountStr}
                      onChange={(e) => setFormAmountStr(formatMoneyWhileTyping(e.target.value))}
                      onBlur={() => setFormAmountStr((v) => formatMoneyOnBlur(v))}
                      onFocus={() => setFormAmountStr((v) => formatMoneyOnFocus(v))}
                      required
                    />
                    {parseMoneyInput(formAmountStr) > 0 && (
                      <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '2px 8px', fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {formatCurrency(Math.round(parseMoneyInput(formAmountStr) * 100))}
                      </span>
                    )}
                  </div>
                </label>

                {formEntryType === 'entrada' ? (
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span className="form-label" style={{ margin: 0 }}>Desconto Concedido (R$)</span>
                      {parseMoneyInput(formAmountStr) > 0 && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[5, 10, 15, 20].map((pct) => {
                            const grossCents = Math.round(parseMoneyInput(formAmountStr) * 100);
                            const discCents = Math.round((grossCents * pct) / 100);
                            return (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setFormDiscountStr(formatCentsToMoneyInput(discCents))}
                                style={{
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                  border: '1px solid #fecaca',
                                  borderRadius: '6px',
                                  padding: '2px 7px',
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                {pct}% ({formatCurrency(discCents)})
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="fin-search-box">
                      <strong style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 800 }}>R$</strong>
                      <input
                        className="fin-bare-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex: 0,00"
                        value={formDiscountStr}
                        onChange={(e) => setFormDiscountStr(formatMoneyWhileTyping(e.target.value))}
                        onBlur={() => setFormDiscountStr((v) => (v.trim() ? formatMoneyOnBlur(v) : ''))}
                        onFocus={() => setFormDiscountStr((v) => formatMoneyOnFocus(v))}
                      />
                      {parseMoneyInput(formDiscountStr) > 0 && (
                        <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', padding: '2px 8px', fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          - {formatCurrency(Math.round(parseMoneyInput(formDiscountStr) * 100))}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="form-group" style={{ margin: 0 }}>
                    <span className="form-label">Forma de Pagamento *</span>
                    {renderPaymentMethodButtons(formMethod, setFormMethod)}
                  </div>
                )}
              </div>

              {/* 1. À VISTA */}
              {billingType === 'avista' && (
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {formEntryType === 'entrada' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <span className="form-label">Forma de Pagamento</span>
                        {renderPaymentMethodButtons(formMethod, setFormMethod)}
                      </div>
                    )}

                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Situação</span>
                      <select
                        className="form-input"
                        value={formStatus}
                        onChange={(e) => {
                          const nextStatus = e.target.value as 'pago' | 'pendente';
                          setFormStatus(nextStatus);
                          if (nextStatus === 'pendente' && !formDueAt) {
                            setFormDueAt(new Date().toISOString().slice(0, 10));
                          }
                        }}
                      >
                        <option value="pago">{formEntryType === 'entrada' ? 'Recebido (Liquidado Agora)' : 'Pago (Liquidado Agora)'}</option>
                        <option value="pendente">{formEntryType === 'entrada' ? 'Pendente (A Receber)' : 'Pendente (A Pagar)'}</option>
                      </select>
                    </label>

                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Data e Hora do Pagamento</span>
                      <input
                        className="form-input"
                        type="datetime-local"
                        value={formPaidAt}
                        onChange={(e) => setFormPaidAt(e.target.value)}
                      />
                    </label>
                  </div>

                  {formStatus === 'pendente' && (
                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Data de Vencimento</span>
                      <input
                        className="form-input"
                        type="date"
                        value={formDueAt}
                        onChange={(e) => setFormDueAt(e.target.value)}
                      />
                    </label>
                  )}

                  {/* Resumo Detalhado do Valor Final a Ser Cobrado (À Vista) */}
                  {(() => {
                    const tot = parseMoneyInput(formAmountStr);
                    const disc = formEntryType === 'entrada' ? parseMoneyInput(formDiscountStr) : 0;
                    const finalVal = Math.max(0, tot - disc);
                    const methodLabel = PAYMENT_METHODS[formMethod]?.label || 'PIX';
                    return (
                      <div
                        style={{
                          background: '#ffffff',
                          border: '2px solid #059669',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(5,150,105,0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569' }}>
                          <span>Valor Bruto Original:</span>
                          <strong style={{ color: '#0f172a' }}>{formatCurrency(Math.round(tot * 100))}</strong>
                        </div>
                        {disc > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#dc2626' }}>
                            <span>(-) Desconto Concedido:</span>
                            <strong>- {formatCurrency(Math.round(disc * 100))}</strong>
                          </div>
                        )}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1.5px dashed #cbd5e1',
                            paddingTop: '8px',
                            marginTop: '2px',
                          }}
                        >
                          <div>
                            <span style={{ display: 'block', fontSize: '0.86rem', color: '#0f172a', fontWeight: 800 }}>
                              {formEntryType === 'entrada'
                                ? `Valor Final a Ser Cobrado (${methodLabel} À Vista):`
                                : `Valor Final da Saída (${methodLabel}):`}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                              {formStatus === 'pago'
                                ? '✓ Será liquidado integralmente agora'
                                : '⏳ Ficará agendado como pendente'}
                            </span>
                          </div>
                          <strong style={{ fontSize: '1.25rem', color: '#059669', fontWeight: 900 }}>
                            {formatCurrency(Math.round(finalVal * 100))}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 2. PAGAMENTO PARCIAL */}
              {billingType === 'parcial' && (
                <div style={{ background: '#fdf8f0', border: '1.5px solid #eedfc5', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="#b8892a" />
                    <strong style={{ fontSize: '0.88rem', color: '#1a3a4a' }}>
                      Entrada e Saldo Devedor Restante
                    </strong>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span className="form-label" style={{ margin: 0 }}>Valor Pago de Entrada (R$) *</span>
                        {(() => {
                          const netCents = Math.max(0, Math.round((parseMoneyInput(formAmountStr) - parseMoneyInput(formDiscountStr)) * 100));
                          if (netCents <= 0) return null;
                          return (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[25, 50, 75].map((pct) => {
                                const partCents = Math.round((netCents * pct) / 100);
                                return (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => setFormInitialPaidStr(formatCentsToMoneyInput(partCents))}
                                    style={{
                                      background: '#ecfdf5',
                                      color: '#047857',
                                      border: '1px solid #a7f3d0',
                                      borderRadius: '6px',
                                      padding: '2px 7px',
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {pct}% ({formatCurrency(partCents)})
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="fin-search-box">
                        <strong style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 800 }}>R$</strong>
                        <input
                          className="fin-bare-input"
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 300,00"
                          value={formInitialPaidStr}
                          onChange={(e) => setFormInitialPaidStr(formatMoneyWhileTyping(e.target.value))}
                          onBlur={() => setFormInitialPaidStr((v) => formatMoneyOnBlur(v))}
                          onFocus={() => setFormInitialPaidStr((v) => formatMoneyOnFocus(v))}
                          required
                        />
                        {parseMoneyInput(formInitialPaidStr) > 0 && (
                          <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '2px 8px', fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {formatCurrency(Math.round(parseMoneyInput(formInitialPaidStr) * 100))}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Forma da Entrada</span>
                      {renderPaymentMethodButtons(formMethod, setFormMethod)}
                    </div>
                  </div>

                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label">Vencimento do Saldo Restante em Aberto</span>
                    <input
                      className="form-input"
                      type="date"
                      value={formDueAt}
                      onChange={(e) => setFormDueAt(e.target.value)}
                    />
                  </label>

                  {/* Resumo Detalhado do Lançamento Parcial */}
                  {(() => {
                    const tot = parseMoneyInput(formAmountStr);
                    const disc = parseMoneyInput(formDiscountStr);
                    const liq = Math.max(0, tot - disc);
                    const ent = parseMoneyInput(formInitialPaidStr);
                    const rest = Math.max(0, liq - ent);
                    return (
                      <div style={{ background: '#ffffff', border: '1.5px solid #d4b896', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569' }}>
                          <span>Valor Bruto:</span>
                          <strong>{formatCurrency(Math.round(tot * 100))}</strong>
                        </div>
                        {disc > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#dc2626' }}>
                            <span>(-) Desconto Concedido:</span>
                            <strong>- {formatCurrency(Math.round(disc * 100))}</strong>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#0f172a', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                          <span>(=) Valor Líquido com Desconto:</span>
                          <strong>{formatCurrency(Math.round(liq * 100))}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#059669' }}>
                          <span>✓ Valor Pago de Entrada Agora:</span>
                          <strong>{formatCurrency(Math.round(ent * 100))}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #eedfc5', paddingTop: '6px', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.84rem', color: '#78350f', fontWeight: 800 }}>Saldo que ficará em aberto:</span>
                          <strong style={{ fontSize: '1.1rem', color: '#b45309', fontWeight: 800 }}>
                            {formatCurrency(Math.round(rest * 100))}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 3. PARCELAMENTO EM QUANTAS VEZES QUISER */}
              {billingType === 'parcelado' && (
                <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={16} color="#7c3aed" />
                    <strong style={{ fontSize: '0.88rem', color: '#1a3a4a' }}>
                      Configuração das Parcelas
                    </strong>
                  </div>

                  <div className="fin-installment-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Nº de Parcelas</span>
                      <input
                        className="form-input"
                        type="number"
                        min="2"
                        max="99"
                        value={formInstallmentsCount}
                        onChange={(e) => setFormInstallmentsCount(e.target.value)}
                        required
                      />
                    </label>

                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Intervalo (dias)</span>
                      <select className="form-input" value={formIntervalDays} onChange={(e) => setFormIntervalDays(e.target.value)}>
                        <option value="30">30 dias (Mensal)</option>
                        <option value="15">15 dias (Quinzenal)</option>
                        <option value="7">7 dias (Semanal)</option>
                      </select>
                    </label>

                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">1º Vencimento</span>
                      <input
                        className="form-input"
                        type="date"
                        value={formFirstDueDate}
                        onChange={(e) => setFormFirstDueDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Forma de Pagamento Padrão</span>
                      {renderPaymentMethodButtons(formMethod, setFormMethod)}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#1e293b', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formFirstPaid}
                          onChange={(e) => setFormFirstPaid(e.target.checked)}
                          disabled={formAllPaid}
                        />
                        1ª Parcela já paga no ato
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#1e293b', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formAllPaid}
                          onChange={(e) => setFormAllPaid(e.target.checked)}
                        />
                        Todas já liquidadas no Cartão
                      </label>
                    </div>
                  </div>

                  {installmentPreview.length > 0 && (
                    <div style={{ background: '#ffffff', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0', maxHeight: '140px', overflowY: 'auto' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Prévia das {installmentPreview.length} parcelas:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {installmentPreview.map((inst) => (
                          <div key={inst.number} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#334155' }}>
                            <span>Parcela {inst.number}: Venc. {inst.dateStr}</span>
                            <strong style={{ color: inst.isPaid ? '#059669' : '#1e293b' }}>
                              {formatCurrency(inst.cents)} {inst.isPaid ? '(Paga)' : '(Pendente)'}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Observações */}
              <label className="form-group">
                <span className="form-label">Observações Internas (opcional)</span>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Informações adicionais sobre o pagamento, comprovante, recibo ou instruções..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </label>

              {/* Botões do Rodapé */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={formEntryType === 'entrada' ? 'btn btn-primary' : 'btn btn-danger'}
                  disabled={submitting}
                  style={formEntryType === 'saida' ? { background: '#dc2626', borderColor: '#b91c1c', color: '#ffffff' } : {}}
                >
                  {submitting
                    ? 'Registrando...'
                    : newModalMode === 'cliente'
                      ? 'Confirmar Pagamento do Cliente'
                      : formEntryType === 'entrada'
                        ? 'Confirmar Nova Receita'
                        : 'Confirmar Nova Despesa'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: FICHA DO PAGAMENTO & BAIXA DE SALDO RESTANTE ================= */}
      {payModalOpen && (
        <div className="fin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPayModalOpen(null); }}>
          <div className="fin-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: payModalOpen.entryType === 'saida' ? '#dc2626' : '#059669', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Ficha Detalhada do Lançamento · {payModalOpen.entryType === 'saida' ? 'Saída / Despesa' : 'Entrada / Cliente'}
                </span>
                <h3 style={{ fontSize: '1.22rem', fontWeight: 800, color: '#1a3a4a', margin: '2px 0 0' }}>
                  Resumo Financeiro &amp; Quitação de Saldo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPayModalOpen(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* FICHA COMPLETA: DADOS + DEMONSTRATIVO DE DESCONTO, ENTRADA JÁ PAGA E SALDO RESTANTE */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Cliente / Favorecido</span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>{payModalOpen.clientName}</strong>
                  {payModalOpen.clientPhone && <span style={{ fontSize: '0.76rem', color: '#475569' }}>📱 {payModalOpen.clientPhone}</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Categoria</span>
                  <strong style={{ fontSize: '0.82rem', color: '#1e293b' }}>
                    {allCategoriesEntrada[payModalOpen.category] || allCategoriesSaida[payModalOpen.category] || payModalOpen.category}
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                <strong>Referente a / Serviço:</strong> {payModalOpen.serviceName ? `${payModalOpen.serviceName} — ${payModalOpen.description}` : payModalOpen.description}
              </div>

              {/* Quadro de Valores: Bruto, Desconto, Líquido, Já Pago (Entrada) e Restante */}
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: '#475569' }}>
                  <span>Valor Bruto Original:</span>
                  <strong style={{ color: '#0f172a' }}>{formatCurrency(payModalOpen.amountCents + (payModalOpen.discountCents || 0))}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: payModalOpen.discountCents > 0 ? '#dc2626' : '#64748b' }}>
                  <span>(-) Desconto Concedido:</span>
                  <strong>{payModalOpen.discountCents > 0 ? `- ${formatCurrency(payModalOpen.discountCents)}` : 'R$ 0,00'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0f172a', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 700 }}>(=) Valor Líquido Final:</span>
                  <strong style={{ fontSize: '0.95rem' }}>{formatCurrency(payModalOpen.amountCents)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#059669', background: '#ecfdf5', padding: '6px 10px', borderRadius: '8px', border: '1px solid #a7f3d0', marginTop: '2px' }}>
                  <span style={{ fontWeight: 800 }}>✓ Valor Já Pago (Entrada / Baixas):</span>
                  <strong style={{ fontSize: '0.96rem', fontWeight: 800 }}>{formatCurrency(payModalOpen.paidAmountCents)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', color: '#9a3412', background: '#fff7ed', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #fed7aa', marginTop: '2px' }}>
                  <span style={{ fontWeight: 800 }}>⏳ Valor Restante em Aberto:</span>
                  <strong style={{ fontSize: '1.1rem', color: '#c2410c', fontWeight: 900 }}>{formatCurrency(payModalOpen.remainingAmountCents)}</strong>
                </div>

                {payModalOpen.dueAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: payModalOpen.isOverdue ? '#dc2626' : '#64748b', marginTop: '2px' }}>
                    <span>Vencimento do Saldo Restante:</span>
                    <strong>{formatDateOnly(payModalOpen.dueAt)} {payModalOpen.isOverdue ? '(Vencido)' : ''}</strong>
                  </div>
                )}
              </div>

              {/* Histórico de Entradas / Pagamentos já efetuados neste lançamento */}
              {(payModalOpen.paidAmountCents > 0 || (payModalOpen.transactions && payModalOpen.transactions.length > 0)) && (
                <div style={{ marginTop: '4px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    Pagamentos / Entrada Já Registrados:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {payModalOpen.transactions && payModalOpen.transactions.length > 0 ? (
                      payModalOpen.transactions.map((t, idx) => {
                        const mConf = PAYMENT_METHODS[t.paymentMethod] || PAYMENT_METHODS.pix;
                        const Icon = mConf.icon;
                        return (
                          <div key={t.id || idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <div>
                              <span style={{ background: mConf.bg, color: mConf.color, borderRadius: '6px', padding: '2px 7px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                                <Icon size={12} /> {mConf.label}
                              </span>
                              <span style={{ color: '#475569' }}>{formatDateTime(t.paidAt)}</span>
                              {t.notes && <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>{t.notes}</span>}
                            </div>
                            <strong style={{ color: '#059669', fontSize: '0.9rem' }}>+ {formatCurrency(t.amountCents)}</strong>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span>Entrada registrada ({PAYMENT_METHODS[payModalOpen.paymentMethod]?.label || 'PIX'}) · {formatDateTime(payModalOpen.paidAt || payModalOpen.createdAt)}</span>
                        <strong style={{ color: '#059669', fontSize: '0.9rem' }}>+ {formatCurrency(payModalOpen.paidAmountCents)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Atalhos rápidos dentro da Ficha */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                {payModalOpen.clientPhone && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = payModalOpen;
                      setPayModalOpen(null);
                      openWhatsappChargeModal(p);
                    }}
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      border: '1px solid #86efac',
                      borderRadius: '10px',
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <WhatsappIcon size={16} /> Cobrar via WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { const p = payModalOpen; setPayModalOpen(null); openManageModal(p, 'parcelar'); }}
                  style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Layers size={14} /> Parcelar Saldo Restante
                </button>
                <button
                  type="button"
                  onClick={() => { const p = payModalOpen; setPayModalOpen(null); setReceiptModal(p); }}
                  style={{ background: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Printer size={14} /> Ver / Imprimir Comprovante
                </button>
              </div>
            </div>

            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}

            <form
              onSubmit={handleRegisterPay}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '16px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={17} style={{ color: '#059669' }} /> Dar Baixa / Liquidar Saldo Agora
                </strong>
                {payModalOpen.remainingAmountCents > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setPayAmountStr(formatCentsToMoneyInput(payModalOpen.remainingAmountCents))}
                      style={{
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1.5px solid #6ee7b7',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Quitar 100% ({formatCurrency(payModalOpen.remainingAmountCents)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmountStr(formatCentsToMoneyInput(Math.round(payModalOpen.remainingAmountCents * 0.5)))}
                      style={{
                        background: '#ffffff',
                        color: '#334155',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      50% ({formatCurrency(Math.round(payModalOpen.remainingAmountCents * 0.5))})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmountStr(formatCentsToMoneyInput(Math.round(payModalOpen.remainingAmountCents * 0.25)))}
                      style={{
                        background: '#ffffff',
                        color: '#334155',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      25% ({formatCurrency(Math.round(payModalOpen.remainingAmountCents * 0.25))})
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Valor a Liquidar Agora (R$) *</span>
                <div className="fin-search-box" style={{ borderColor: '#059669', borderWidth: '2px', background: '#ffffff' }}>
                  <strong style={{ color: '#059669', fontSize: '1rem', fontWeight: 900 }}>R$</strong>
                  <input
                    className="fin-bare-input"
                    type="text"
                    inputMode="decimal"
                    style={{ fontSize: '1.1rem', fontWeight: 800 }}
                    value={payAmountStr}
                    onChange={(e) => setPayAmountStr(formatMoneyWhileTyping(e.target.value))}
                    onBlur={() => setPayAmountStr((v) => formatMoneyOnBlur(v))}
                    onFocus={() => setPayAmountStr((v) => formatMoneyOnFocus(v))}
                    placeholder="0,00"
                    required
                  />
                  {parseMoneyInput(payAmountStr) > 0 && (
                    <span style={{ background: '#ecfdf5', color: '#047857', border: '1.5px solid #6ee7b7', borderRadius: '8px', padding: '4px 10px', fontSize: '0.82rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {formatCurrency(Math.round(parseMoneyInput(payAmountStr) * 100))}
                    </span>
                  )}
                </div>
                {(() => {
                  const payingCents = Math.round(parseMoneyInput(payAmountStr) * 100);
                  const afterCents = Math.max(0, payModalOpen.remainingAmountCents - payingCents);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginTop: '4px', padding: '6px 10px', borderRadius: '8px', background: afterCents === 0 && payingCents > 0 ? '#ecfdf5' : '#ffffff', border: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>
                        {afterCents === 0 && payingCents > 0
                          ? '✓ Este pagamento quitará 100% do saldo pendente!'
                          : 'Saldo que continuará em aberto após esta baixa:'}
                      </span>
                      <strong style={{ color: afterCents === 0 && payingCents > 0 ? '#059669' : '#b45309', fontSize: '0.86rem' }}>
                        {formatCurrency(afterCents)}
                      </strong>
                    </div>
                  );
                })()}
              </div>

              {/* Forma de Pagamento (Botões destacados PIX / Cartão / Dinheiro com ícones oficiais) */}
              <div className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Forma de Pagamento *</span>
                {renderPaymentMethodButtons(payMethod, setPayMethod)}
              </div>

              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Data e Hora da Baixa</span>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </label>

              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Observações da Baixa (opcional)</span>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ex: Restante pago no balcão da clínica / 2ª parte"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(null)}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Fechar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Processando...' : 'Confirmar Recebimento'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL: FICHA COMPLETA DO LANÇAMENTO & HISTÓRICO DE TRANSAÇÕES ================= */}
      {viewTransactionsModal && (
        <div className="fin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewTransactionsModal(null); }}>
          <div className="fin-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Ficha Detalhada do Pagamento
                </span>
                <h3 style={{ fontSize: '1.22rem', fontWeight: 800, color: '#1a3a4a', margin: '2px 0 0' }}>
                  Demonstrativo &amp; Histórico de Pagamentos
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewTransactionsModal(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Resumo Completo da Ficha */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Cliente / Favorecido</span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>{viewTransactionsModal.clientName}</strong>
                  {viewTransactionsModal.clientPhone && <span style={{ fontSize: '0.76rem', color: '#475569' }}>📱 {viewTransactionsModal.clientPhone}</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Categoria</span>
                  <strong style={{ fontSize: '0.82rem', color: '#1e293b' }}>
                    {allCategoriesEntrada[viewTransactionsModal.category] || allCategoriesSaida[viewTransactionsModal.category] || viewTransactionsModal.category}
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                <strong>Referente a / Serviço:</strong> {viewTransactionsModal.serviceName ? `${viewTransactionsModal.serviceName} — ${viewTransactionsModal.description}` : viewTransactionsModal.description}
              </div>

              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: '#475569' }}>
                  <span>Valor Bruto Original:</span>
                  <strong style={{ color: '#0f172a' }}>{formatCurrency(viewTransactionsModal.amountCents + (viewTransactionsModal.discountCents || 0))}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: viewTransactionsModal.discountCents > 0 ? '#dc2626' : '#64748b' }}>
                  <span>(-) Desconto Concedido:</span>
                  <strong>{viewTransactionsModal.discountCents > 0 ? `- ${formatCurrency(viewTransactionsModal.discountCents)}` : 'R$ 0,00'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0f172a', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 700 }}>(=) Valor Líquido Final:</span>
                  <strong style={{ fontSize: '0.95rem' }}>{formatCurrency(viewTransactionsModal.amountCents)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#059669', background: '#ecfdf5', padding: '6px 10px', borderRadius: '8px', border: '1px solid #a7f3d0', marginTop: '2px' }}>
                  <span style={{ fontWeight: 800 }}>✓ Total Pago (Entrada / Baixas):</span>
                  <strong style={{ fontSize: '0.96rem', fontWeight: 800 }}>{formatCurrency(viewTransactionsModal.paidAmountCents)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: viewTransactionsModal.remainingAmountCents > 0 ? '#b45309' : '#059669', paddingTop: '4px' }}>
                  <span style={{ fontWeight: 700 }}>Saldo Restante em Aberto:</span>
                  <strong>{formatCurrency(viewTransactionsModal.remainingAmountCents)} {viewTransactionsModal.remainingAmountCents === 0 ? '(Liquidado)' : ''}</strong>
                </div>
              </div>
            </div>

            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Pagamentos Realizados (Ordem Cronológica):
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '260px', overflowY: 'auto' }}>
              {(viewTransactionsModal.transactions && viewTransactionsModal.transactions.length > 0) ? (
                [...viewTransactionsModal.transactions]
                  .sort((a, b) => new Date(a.paidAt || a.createdAt).getTime() - new Date(b.paidAt || b.createdAt).getTime())
                  .map((t, idx, arr) => {
                    const mConf = PAYMENT_METHODS[t.paymentMethod] || PAYMENT_METHODS.outro;
                    const Icon = mConf.icon;
                    const rawNote = (t.notes || '').trim();
                    const isGen =
                      !rawNote ||
                      rawNote === 'Entrada / Pagamento parcial registrado' ||
                      rawNote === 'Baixa parcial de saldo' ||
                      rawNote === 'Quitação total de saldo' ||
                      rawNote === 'Pagamento à vista liquidado';
                    const friendlyTitle = !isGen
                      ? rawNote.replace(/^Entrada parcial:\s*/i, '')
                      : arr.length === 1 && viewTransactionsModal.remainingAmountCents === 0
                      ? 'Pagamento Integral'
                      : idx === 0
                      ? 'Entrada Inicial'
                      : idx === arr.length - 1 && viewTransactionsModal.remainingAmountCents === 0
                      ? 'Quitação do Saldo'
                      : `${idx + 1}º Pagamento Parcial`;

                    return (
                      <div key={t.id || idx} style={{ border: '1px solid #e2e8f0', borderLeft: '4px solid #059669', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#d1fae5', color: '#065f46', fontSize: '0.72rem', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {idx + 1}º
                          </span>
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.86rem', color: '#0f172a', marginBottom: '2px' }}>
                              {friendlyTitle}
                            </strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ background: mConf.bg, color: mConf.color, borderRadius: '6px', padding: '2px 7px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Icon size={12} /> {mConf.label}
                              </span>
                              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                {formatDateTime(t.paidAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <strong style={{ fontSize: '0.98rem', color: '#059669', whiteSpace: 'nowrap' }}>
                          {formatCurrency(t.amountCents)}
                        </strong>
                      </div>
                    );
                  })
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                      Pagamento Registrado ({PAYMENT_METHODS[viewTransactionsModal.paymentMethod]?.label || 'PIX'})
                    </span>
                    <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>
                      {formatDateTime(viewTransactionsModal.paidAt || viewTransactionsModal.createdAt)}
                    </span>
                  </div>
                  <strong style={{ fontSize: '0.98rem', color: '#059669' }}>
                    {formatCurrency(viewTransactionsModal.paidAmountCents)}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { const p = viewTransactionsModal; setViewTransactionsModal(null); setReceiptModal(p); }}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={15} /> Imprimir Comprovante
                </button>
                {viewTransactionsModal.remainingAmountCents > 0 && viewTransactionsModal.clientPhone && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = viewTransactionsModal;
                      setViewTransactionsModal(null);
                      openWhatsappChargeModal(p);
                    }}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <WhatsappIcon size={16} color="#ffffff" /> Cobrar via WhatsApp
                  </button>
                )}
              </div>
              <button onClick={() => setViewTransactionsModal(null)} className="btn btn-primary">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PARCELAR SALDO EM ABERTO ================= */}
      {managePaymentModal && manageModalTab === 'parcelar' && (
        <div className="fin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setManagePaymentModal(null); }}>
          <form onSubmit={handleRenegotiateInstallment} className="fin-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Parcelamento</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a3a4a', margin: '2px 0 0' }}>Parcelar Saldo em Aberto</h3>
              </div>
              <button
                type="button"
                onClick={() => setManagePaymentModal(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px', marginBottom: '14px', fontSize: '0.85rem', color: '#334155' }}>
              <div><strong>{managePaymentModal.clientName || 'Geral / Clínica'}</strong></div>
              <div style={{ color: '#64748b' }}>{managePaymentModal.description}</div>
              <div style={{ marginTop: '6px' }}>Saldo a parcelar: <strong style={{ color: '#b45309' }}>{formatCurrency(managePaymentModal.remainingAmountCents)}</strong></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                Nº de parcelas
                <input type="number" min={2} max={60} value={renegoInstallmentsCount} onChange={(e) => setRenegoInstallmentsCount(e.target.value)} className="form-input" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                Intervalo (dias)
                <input type="number" min={1} value={renegoIntervalDays} onChange={(e) => setRenegoIntervalDays(e.target.value)} className="form-input" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                1º vencimento
                <input type="date" value={renegoFirstDueDate} onChange={(e) => setRenegoFirstDueDate(e.target.value)} className="form-input" />
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                Forma de pagamento
                {renderPaymentMethodButtons(renegoMethod, setRenegoMethod)}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '0.84rem', color: '#334155' }}>
              <input type="checkbox" checked={renegoFirstPaid} onChange={(e) => setRenegoFirstPaid(e.target.checked)} />
              1ª parcela já foi paga agora
            </label>

            <input type="text" placeholder="Observação (opcional)" value={renegoNotes} onChange={(e) => setRenegoNotes(e.target.value)} className="form-input" style={{ marginTop: '10px', width: '100%' }} />

            {renegoPreview.length > 0 && (
              <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                {renegoPreview.map((it) => (
                  <div key={it.number} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
                    <span>Parcela {it.number}/{renegoPreview.length} · {it.dateStr}</span>
                    <strong style={{ color: it.isPaid ? '#059669' : '#1a3a4a' }}>{formatCurrency(it.cents)}{it.isPaid ? ' ✓' : ''}</strong>
                  </div>
                ))}
              </div>
            )}

            {errorMsg && <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '0.84rem' }}>{errorMsg}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '16px', paddingBottom: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setManagePaymentModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Processando...' : 'Confirmar Parcelamento'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ================= MODAL: RECIBO / COMPROVANTE OFICIAL ================= */}
      {receiptModal && (() => {
        const isPartialReceipt = receiptModal.status === 'parcial' || (receiptModal.paidAmountCents > 0 && receiptModal.remainingAmountCents > 0);
        const isPendingReceipt = receiptModal.paidAmountCents === 0 && receiptModal.remainingAmountCents > 0;
        const isPaidReceipt = !isPendingReceipt && !isPartialReceipt;
        const isInstallmentReceipt = Boolean(receiptModal.installmentNumber && receiptModal.totalInstallments && receiptModal.totalInstallments > 1);

        // Cliente associado
        const clientInfo = receiptModal.clientId ? clients.find((c) => c.id === receiptModal.clientId) : null;
        const clientCpf = clientInfo?.cpf ? maskCpf(clientInfo.cpf) : null;
        const clientPhone = receiptModal.clientPhone || clientInfo?.phone || null;
        const clientEmail = receiptModal.clientEmail || clientInfo?.email || null;

        // Limpeza de descrição duplicada
        const cleanServiceDescription = (() => {
          const service = (receiptModal.serviceName || '').trim();
          let desc = (receiptModal.description || '').trim();
          if (!service) return desc || 'Atendimento Terapêutico Integrativo';
          if (!desc) return service;
          if (desc.toLowerCase() === service.toLowerCase()) return service;
          if (desc.toLowerCase().startsWith(service.toLowerCase())) {
            const remainder = desc.slice(service.length).replace(/^[\s—–-]+/, '').trim();
            return remainder ? `${service} — ${remainder}` : service;
          }
          return `${service} — ${desc}`;
        })();

        // Ordenar transações em ordem cronológica (1º pagamento, 2º pagamento...)
        const sortedTxs = [...(receiptModal.transactions || [])].sort(
          (a, b) => new Date(a.paidAt || a.createdAt).getTime() - new Date(b.paidAt || b.createdAt).getTime()
        );
        const txSumCents = sortedTxs.reduce((acc, t) => acc + (t.amountCents || 0), 0);
        const missingInitialCents = Math.max(0, (receiptModal.paidAmountCents || 0) - txSumCents);

        const itemizedPayments: Array<{
          label: string;
          methodLabel: string;
          dateStr: string;
          amountCents: number;
        }> = [];

        if (missingInitialCents > 0) {
          itemizedPayments.push({
            label: sortedTxs.length > 0 ? 'Entrada / Pagamento Inicial' : (isPartialReceipt ? 'Pagamento Parcial / Entrada' : 'Pagamento Recebido'),
            methodLabel: PAYMENT_METHODS[receiptModal.paymentMethod]?.label || receiptModal.paymentMethod.toUpperCase(),
            dateStr: formatDateTime(receiptModal.createdAt || receiptModal.paidAt),
            amountCents: missingInitialCents,
          });
        }

        sortedTxs.forEach((tx, idx) => {
          const stepNum = itemizedPayments.length + 1;
          const rawClean = (tx.notes || '').trim();
          const isGen =
            !rawClean ||
            rawClean === 'Entrada / Pagamento parcial registrado' ||
            rawClean === 'Baixa parcial de saldo' ||
            rawClean === 'Quitação total de saldo' ||
            rawClean === 'Pagamento à vista liquidado';
          const defaultLabel = !isGen
            ? rawClean.replace(/^Entrada parcial:\s*/i, '')
            : stepNum === 1 && (isPartialReceipt || sortedTxs.length > 1)
            ? 'Entrada Inicial'
            : idx === sortedTxs.length - 1 && receiptModal.remainingAmountCents === 0 && sortedTxs.length > 1
            ? 'Quitação do Saldo'
            : stepNum > 1
            ? `${stepNum}º Pagamento Parcial`
            : isPartialReceipt
            ? 'Entrada Inicial'
            : 'Pagamento Integral';
          itemizedPayments.push({
            label: defaultLabel,
            methodLabel: PAYMENT_METHODS[tx.paymentMethod]?.label || tx.paymentMethod.toUpperCase(),
            dateStr: formatDateTime(tx.paidAt || tx.createdAt),
            amountCents: tx.amountCents,
          });
        });

        const docNumber = receiptModal.id.replace(/-/g, '').slice(0, 8).toUpperCase();
        const authHash = `CLN-2026-${receiptModal.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
        const mainAmount = receiptModal.paidAmountCents > 0 ? receiptModal.paidAmountCents : receiptModal.amountCents;
        const mainAmountWords = numberToCurrencyWords(mainAmount);

        return (
          <div className="fin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReceiptModal(null); }}>
            <div
              className="fin-modal"
              style={{
                maxWidth: '680px',
                width: '100%',
                background: '#ffffff',
                borderRadius: '20px',
                padding: '24px 28px',
                border: '1.5px solid #cbd5e1',
                boxShadow: '0 20px 40px -15px rgba(0,0,0,0.18)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* FOLHA OFICIAL TIMBRADA PARA TELA E IMPRESSÃO A4 */}
              <div id="official-receipt-sheet" style={{ background: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                
                {/* 1. CABEÇALHO TIMBRADO DA CLÍNICA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1a3a4a 0%, #2f7567 100%)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '1.25rem',
                        letterSpacing: '-0.02em',
                        boxShadow: '0 4px 10px rgba(47, 117, 103, 0.25)',
                        flexShrink: 0,
                      }}
                    >
                      CM
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1a3a4a', margin: 0, letterSpacing: '-0.01em' }}>
                        Camila Machado
                      </h2>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#b8892a', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>
                        Hipnose Clínica Multidimensional Integrativa
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
                        CRT-SBHP/SC 805 • Urussanga - SC • WhatsApp: (48) 99691-5303
                      </div>
                    </div>
                  </div>

                  {/* CAIXA FORMAL DE IDENTIFICAÇÃO DO RECIBO */}
                  <div style={{ textAlign: 'right', minWidth: '180px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {isPendingReceipt
                        ? 'Demonstrativo de Cobrança'
                        : isPartialReceipt
                        ? 'Recibo de Pagamento Parcial'
                        : 'Recibo & Quitação'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                      Documento: <strong>#{docNumber}</strong>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Emissão: <strong>{formatDateTime(receiptModal.paidAt || receiptModal.createdAt)}</strong>
                    </div>
                    <div style={{ marginTop: '5px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          background: isPaidReceipt ? '#ecfdf5' : isPartialReceipt ? '#fffbeb' : '#fff7ed',
                          color: isPaidReceipt ? '#065f46' : isPartialReceipt ? '#92400e' : '#c2410c',
                          border: `1px solid ${isPaidReceipt ? '#a7f3d0' : isPartialReceipt ? '#fde68a' : '#fed7aa'}`,
                        }}
                      >
                        {isPaidReceipt ? '✓ Quitado Integralmente' : isPartialReceipt ? '⏳ Pagamento Parcial' : '🕒 Aguardando Pagamento'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* FAIXA DIVISÓRIA DE PRESTÍGIO */}
                <div style={{ height: '2px', background: 'linear-gradient(90deg, #1a3a4a 0%, #b8892a 50%, #2f7567 100%)', margin: '14px 0 16px' }} />

                {/* 2. DADOS DO PACIENTE / PAGADOR */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    fontSize: '0.82rem',
                    color: '#334155',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                    Dados do Paciente / Tomador do Serviço
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 16px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Nome do Paciente: </span>
                      <strong style={{ color: '#0f172a' }}>{receiptModal.clientName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>CPF: </span>
                      <strong style={{ color: '#0f172a' }}>{clientCpf || 'Sob sigilo / conforme prontuário'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Telefone / WhatsApp: </span>
                      <strong style={{ color: '#0f172a' }}>{clientPhone ? formatPhone(clientPhone) : 'Não informado'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Localidade: </span>
                      <strong style={{ color: '#0f172a' }}>Urussanga - SC • Atendimento Clínico</strong>
                    </div>
                  </div>
                </div>

                {/* 3. DISCRIMINAÇÃO DO SERVIÇO PRESTADO */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                    Discriminação dos Serviços Prestados
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#334155', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Descrição do Serviço / Tratamento</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Categoria</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Forma</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                        <td style={{ padding: '10px 12px', color: '#0f172a' }}>
                          <strong>{cleanServiceDescription}</strong>
                          {isInstallmentReceipt && (
                            <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                              Parcela {receiptModal.installmentNumber} de {receiptModal.totalInstallments}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {allCategoriesEntrada[receiptModal.category] || receiptModal.category}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', textTransform: 'uppercase' }}>
                          {PAYMENT_METHODS[receiptModal.paymentMethod]?.label || receiptModal.paymentMethod}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {formatCurrency(receiptModal.amountCents + (receiptModal.discountCents || 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 4. HISTÓRICO DE BAIXAS / TRANSAÇÕES (SE HOUVER DETALHAMENTO DE ENTRADAS) */}
                {itemizedPayments.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                      {isPartialReceipt || itemizedPayments.length > 1
                        ? `Histórico de Pagamentos & Entradas Recebidas (${itemizedPayments.length}):`
                        : 'Detalhamento da Liquidação:'}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '6px 10px', fontWeight: 700 }}>Ordem / Etapa</th>
                          <th style={{ padding: '6px 10px', fontWeight: 700 }}>Data da Liquidação</th>
                          <th style={{ padding: '6px 10px', fontWeight: 700 }}>Forma</th>
                          <th style={{ padding: '6px 10px', fontWeight: 700, textAlign: 'right' }}>Valor Recebido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemizedPayments.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '6px 10px', color: '#0f172a', fontWeight: 600 }}>{item.label}</td>
                            <td style={{ padding: '6px 10px', color: '#475569' }}>{item.dateStr}</td>
                            <td style={{ padding: '6px 10px', color: '#475569' }}>{item.methodLabel}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#059669', fontWeight: 800 }}>
                              {formatCurrency(item.amountCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. QUADRO RESUMO DE VALORES E TOTAIS */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>Valor Original</span>
                    <strong style={{ fontSize: '0.98rem', color: '#0f172a', display: 'block', marginTop: '2px' }}>
                      {formatCurrency(receiptModal.amountCents + (receiptModal.discountCents || 0))}
                    </strong>
                  </div>

                  {receiptModal.discountCents > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px' }}>
                      <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', display: 'block' }}>Desconto</span>
                      <strong style={{ fontSize: '0.98rem', color: '#dc2626', display: 'block', marginTop: '2px' }}>
                        - {formatCurrency(receiptModal.discountCents)}
                      </strong>
                    </div>
                  )}

                  <div style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', borderRadius: '8px', padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', display: 'block' }}>Total Pago (Entrada / Baixas)</span>
                    <strong style={{ fontSize: '1.05rem', color: '#059669', display: 'block', marginTop: '2px' }}>
                      {formatCurrency(receiptModal.paidAmountCents)}
                    </strong>
                  </div>

                  <div
                    style={{
                      background: receiptModal.remainingAmountCents > 0 ? '#fffbeb' : '#f0fdf4',
                      border: `1.5px solid ${receiptModal.remainingAmountCents > 0 ? '#fde68a' : '#bbf7d0'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  >
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: receiptModal.remainingAmountCents > 0 ? '#92400e' : '#166534', textTransform: 'uppercase', display: 'block' }}>
                      Saldo em Aberto
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: receiptModal.remainingAmountCents > 0 ? '#b45309' : '#15803d', display: 'block', marginTop: '2px' }}>
                      {receiptModal.remainingAmountCents > 0 ? formatCurrency(receiptModal.remainingAmountCents) : 'R$ 0,00 (Quitado)'}
                    </strong>
                    {receiptModal.remainingAmountCents > 0 && receiptModal.dueAt && (
                      <span style={{ fontSize: '0.62rem', color: '#92400e', display: 'block', marginTop: '1px' }}>
                        Vencimento: {formatDateOnly(receiptModal.dueAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 6. DECLARAÇÃO FORMAL DE RECEBIMENTO / QUITAÇÃO */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderLeft: '3px solid #2f7567',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    fontSize: '0.76rem',
                    color: '#334155',
                    lineHeight: '1.45',
                    marginBottom: '18px',
                  }}
                >
                  <strong style={{ color: '#0f172a' }}>Declaração de Prestação de Serviços &amp; Fins Comprobatórios: </strong>
                  {isPendingReceipt ? (
                    <span>
                      Declara-se que consta registrado em aberto para cobrança ao(à) paciente <strong>{receiptModal.clientName}</strong> o montante de <strong>{formatCurrency(mainAmount)}</strong> ({mainAmountWords}), referente aos serviços terapêuticos discriminados neste demonstrativo.
                    </span>
                  ) : (
                    <span>
                      Declaramos para os devidos fins de comprovação e reembolso (perante operadoras de planos de saúde, declaração de imposto de renda e fins legais) que recebemos de <strong>{receiptModal.clientName}</strong>{clientCpf ? ` (CPF: ${clientCpf})` : ''} a importância de <strong>{formatCurrency(mainAmount)}</strong> ({mainAmountWords}), referente à prestação dos serviços terapêuticos de Hipnose Clínica Integrativa acima discriminados.
                    </span>
                  )}
                </div>

                {/* 7. ASSINATURA & AUTENTICIDADE DIGITAL */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', maxWidth: '320px', lineHeight: '1.4' }}>
                    <div style={{ fontWeight: 800, color: '#1a3a4a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Autenticidade &amp; Conformidade LGPD
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#0f172a', fontWeight: 700, margin: '2px 0' }}>
                      {authHash}
                    </div>
                    <div>
                      Emissão eletrônica pelo Sistema de Gestão Clínica Integrativa • Conforme Lei Federal 13.709/2018 (LGPD).
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: '220px' }}>
                    <div style={{ width: '180px', borderBottom: '1px solid #475569', margin: '0 auto 6px' }} />
                    <strong style={{ fontSize: '0.84rem', color: '#1a3a4a', display: 'block' }}>Camila Machado</strong>
                    <span style={{ fontSize: '0.7rem', color: '#475569', display: 'block' }}>
                      Terapeuta Responsável • CRT-SBHP/SC 805
                    </span>
                  </div>
                </div>

              </div>

              {/* ESTILO DE IMPRESSÃO EMBUTIDO QUE TRANSFORMA A FOLHA EM A4 PERFEITA */}
              <style>{`
                @media print {
                  @page {
                    size: A4 portrait;
                    margin: 12mm 15mm;
                  }
                  html, body {
                    background: #ffffff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    height: auto !important;
                    overflow: visible !important;
                  }
                  /* Oculta tudo que não faz parte do documento oficial */
                  aside, header, nav, footer, [role="navigation"], .fin-modal-overlay {
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    position: static !important;
                    display: block !important;
                  }
                  body * {
                    visibility: hidden !important;
                  }
                  #official-receipt-sheet, #official-receipt-sheet * {
                    visibility: visible !important;
                  }
                  #official-receipt-sheet {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    border: none !important;
                    box-shadow: none !important;
                    page-break-inside: avoid !important;
                  }
                  .no-print, .no-print * {
                    display: none !important;
                  }
                }
              `}</style>

              {/* BOTÕES DE AÇÃO VISÍVEIS SOMENTE NA TELA (NO-PRINT) */}
              <div
                className="no-print"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '22px',
                  paddingTop: '16px',
                  borderTop: '1px solid #e2e8f0',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => setReceiptModal(null)}
                  className="btn btn-secondary"
                  style={{ minWidth: '100px' }}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                    borderColor: '#059669',
                    fontWeight: 700,
                  }}
                >
                  <Printer size={16} /> Imprimir Comprovante Oficial (PDF)
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ================= MODAL: COBRAR FATURA VIA WHATSAPP ================= */}
      {whatsappChargeModal && (
        <div
          className="fin-modal-overlay"
          onClick={() => !whatsappChargeLoading && setWhatsappChargeModal(null)}
        >
          <div
            className="fin-modal"
            style={{
              maxWidth: '560px',
              borderRadius: '24px',
              border: '1.5px solid #bbf7d0',
              padding: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do Modal estilo WhatsApp */}
            <div
              style={{
                background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                color: '#ffffff',
                padding: '20px 22px',
                borderTopLeftRadius: '22px',
                borderTopRightRadius: '22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                  }}
                >
                  <WhatsappIcon size={26} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                    Cobrar Fatura via WhatsApp
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#dcfce7' }}>
                    Disparo de cobrança com chave PIX e valor em aberto
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWhatsappChargeModal(null);
                  setWhatsappChargeSuccess(null);
                }}
                disabled={whatsappChargeLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {whatsappChargeSuccess ? (
              <div style={{ padding: '36px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    background: '#dcfce7',
                    border: '2px solid #86efac',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <CheckCircle2 size={38} color="#15803d" />
                </div>

                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    Cobrança Enviada com Sucesso! 🚀
                  </h3>
                  <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, maxWidth: '440px' }}>
                    A mensagem com a chave PIX e detalhes da fatura no valor de <strong>{whatsappChargeSuccess.amount}</strong> foi entregue com sucesso para <strong>{whatsappChargeSuccess.clientName}</strong> no WhatsApp (<strong>{whatsappChargeSuccess.phone}</strong>) às {whatsappChargeSuccess.date}.
                  </p>
                </div>

                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '999px',
                    padding: '8px 18px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    color: '#166534',
                    fontWeight: 700,
                  }}
                >
                  <WhatsappIcon size={16} /> Entregue via WhatsApp da Clínica
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWhatsappChargeModal(null);
                    setWhatsappChargeSuccess(null);
                  }}
                  style={{
                    marginTop: '10px',
                    background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '12px 32px',
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                  }}
                >
                  Concluído / Fechar
                </button>
              </div>
            ) : (
              /* Corpo do Modal */
              <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Card Resumo do Cliente e da Dívida */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Cliente Destinatário
                    </span>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      {whatsappChargeModal.clientName || 'Cliente sem nome'}
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    📱 {whatsappChargeModal.clientPhone || 'Sem telefone'}
                  </span>
                </div>

                <div style={{ height: '1px', background: '#e2e8f0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Valor em Aberto</span>
                    <strong style={{ fontSize: '1.2rem', color: '#dc2626', fontWeight: 900 }}>
                      {formatCurrency(whatsappChargeModal.remainingAmountCents || whatsappChargeModal.amountCents)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Valor Total</span>
                    <strong style={{ fontSize: '0.95rem', color: '#334155' }}>
                      {formatCurrency(whatsappChargeModal.amountCents)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Vencimento</span>
                    <strong style={{ fontSize: '0.95rem', color: whatsappChargeModal.isOverdue ? '#dc2626' : '#0f172a' }}>
                      {whatsappChargeModal.dueAt ? formatDateOnly(whatsappChargeModal.dueAt) : 'Hoje'}
                      {whatsappChargeModal.isOverdue && ' (Vencida)'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Editor / Pré-visualização da Mensagem */}
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    Mensagem a ser enviada no WhatsApp:
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    (Você pode personalizar o texto antes de enviar)
                  </span>
                </label>
                <textarea
                  value={whatsappCustomMessage}
                  onChange={(e) => setWhatsappCustomMessage(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    borderRadius: '14px',
                    border: '1.5px solid #cbd5e1',
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    color: '#0f172a',
                    background: '#fefefe',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Aviso de Confirmação */}
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontSize: '0.76rem',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>
                  Ao clicar em <strong>Enviar Cobrança Agora</strong>, a mensagem acima será enviada diretamente para o WhatsApp do cliente com as instruções e chave PIX para envio do comprovante.
                </span>
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '14px', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setWhatsappChargeModal(null)}
                  disabled={whatsappChargeLoading}
                  style={{
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '999px',
                    padding: '10px 18px',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsappCharge}
                  disabled={whatsappChargeLoading || !whatsappChargeModal.clientPhone}
                  style={{
                    background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '10px 22px',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                    opacity: whatsappChargeLoading ? 0.7 : 1,
                  }}
                >
                  <WhatsappIcon size={16} color="#ffffff" className={whatsappChargeLoading ? 'animate-spin' : ''} />
                  {whatsappChargeLoading ? 'Enviando WhatsApp...' : 'Enviar Cobrança Agora (WhatsApp)'}
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {dialogNode}
    </div>
  );
}
