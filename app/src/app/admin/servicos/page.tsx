'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Plus,
  Search,
  Clock,
  MapPin,
  Video,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calendar,
  Layers,
  Check,
  Users,
} from 'lucide-react';
import type { AdminService } from '@/lib/domain';
import { formatCurrency, maskCurrency, finalizeCurrency } from '@/lib/utils';
import { ServiceAudioPlayer } from '@/components/service-audio-player';

const DURATION_PRESETS = [30, 45, 50, 60, 75, 90, 120];

type PriceTierForm = {
  id: string;
  name: string; // Ex: "Atendimento Individual", "Pacote 4 Sessões"
  isPackage: boolean; // Se true, ativa controle de pacotes e créditos
  sessionCount: number; // Quantidade de sessões do pacote
  priceRaw: string; // Ex: "1.650,00"
};

type FormState = {
  name: string;
  description: string;
  durationMinutes: number;
  intervalMinutes: number;
  priceRaw: string; // Em reais, ex: "250,00" ou ""
  priceVisible: boolean;
  published: boolean;
  presencial: boolean;
  online: boolean;
  pricingMode: 'unico' | 'pacotes' | 'consulta';
  packageBookingMode: 'sequencial' | 'livre';
  tiers: PriceTierForm[];
  audioUrl: string | null;
  audioName: string | null;
};

const INITIAL_FORM: FormState = {
  name: '',
  description: '',
  durationMinutes: 60,
  intervalMinutes: 0,
  priceRaw: '',
  priceVisible: true,
  published: true,
  presencial: true,
  online: true,
  pricingMode: 'unico',
  packageBookingMode: 'sequencial',
  tiers: [
    { id: '1', name: 'Atendimento Individual', isPackage: false, sessionCount: 1, priceRaw: '' },
    { id: '2', name: 'Atendimento Casal', isPackage: false, sessionCount: 1, priceRaw: '' },
  ],
  audioUrl: null,
  audioName: null,
};

function parsePriceToCents(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return null;
  const num = parseFloat(cleaned);
  if (num < 0) return null;
  return Math.round(num * 100);
}

function centsToRaw(cents: number | null): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let cachedServices: AdminService[] | null = null;

export default function AdminServicosPage() {
  const [services, setServices] = useState<AdminService[]>(cachedServices ?? []);
  const [search, setSearch] = useState('');
  const [filterModality, setFilterModality] = useState<'todos' | 'presencial' | 'online'>('todos');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'publicados' | 'rascunhos'>('todos');

  const [loading, setLoading] = useState(cachedServices === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<AdminService | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [formError, setFormError] = useState('');

  // Modal de Confirmação de Exclusão
  const [deletingService, setDeletingService] = useState<AdminService | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/services', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar serviços.');
      const list: AdminService[] = data.services ?? [];
      cachedServices = list;
      setServices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar serviços.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  function handleOpenCreate() {
    setEditingService(null);
    setForm(INITIAL_FORM);
    setFormError('');
    setIsModalOpen(true);
  }

  function handleOpenEdit(service: AdminService) {
    setEditingService(service);
    const hasTiers = Boolean(service.pricingTiers && service.pricingTiers.length > 0);
    const isConsult = service.priceCents === null && !hasTiers;
    const mode: 'unico' | 'pacotes' | 'consulta' = hasTiers
      ? 'pacotes'
      : isConsult
      ? 'consulta'
      : 'unico';

    setForm({
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      intervalMinutes: service.intervalMinutes,
      priceRaw: centsToRaw(service.priceCents),
      priceVisible: service.priceVisible,
      published: service.published,
      presencial: service.modalities.includes('presencial'),
      online: service.modalities.includes('online'),
      pricingMode: mode,
      packageBookingMode: service.packageBookingMode ?? 'sequencial',
      tiers: hasTiers
        ? service.pricingTiers!.map((t) => ({
            id: t.id,
            name: t.name,
            isPackage: Boolean(t.isPackage ?? (t.sessionCount && t.sessionCount > 1)),
            sessionCount: t.sessionCount || (t.isPackage ? 4 : 1),
            priceRaw: centsToRaw(t.priceCents),
          }))
        : [
            { id: '1', name: 'Atendimento Individual', isPackage: false, sessionCount: 1, priceRaw: '' },
            { id: '2', name: 'Atendimento Casal', isPackage: false, sessionCount: 1, priceRaw: '' },
          ],
      audioUrl: service.audioUrl ?? null,
      audioName: service.audioName ?? null,
    });
    setFormError('');
    setIsModalOpen(true);
  }

  function handleAudioFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setFormError('O arquivo de áudio deve ter no máximo 15 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({
          ...prev,
          audioUrl: reader.result as string,
          audioName: file.name,
        }));
        setFormError('');
      }
    };
    reader.onerror = () => {
      setFormError('Não foi possível ler o arquivo de áudio selecionado.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSaveService(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    // Validações
    if (!form.name.trim()) {
      return setFormError('Informe o nome do serviço.');
    }
    if (!form.presencial && !form.online) {
      return setFormError('Selecione ao menos uma modalidade de atendimento (Presencial ou Online).');
    }

    const modalities: Array<'presencial' | 'online'> = [];
    if (form.presencial) modalities.push('presencial');
    if (form.online) modalities.push('online');

    let priceCents: number | null = null;
    let pricingTiers: Array<{ id: string; name: string; priceCents: number; isPackage?: boolean; sessionCount?: number }> | undefined = undefined;

    if (form.pricingMode === 'unico') {
      priceCents = parsePriceToCents(form.priceRaw);
      pricingTiers = undefined;
    } else if (form.pricingMode === 'pacotes') {
      const validTiers = form.tiers
        .map((t) => {
          const isPkg = Boolean(t.isPackage);
          return {
            id: t.id || String(Date.now()),
            name: t.name.trim(),
            isPackage: isPkg,
            sessionCount: isPkg ? (Number(t.sessionCount) > 1 ? Number(t.sessionCount) : 4) : 1,
            priceCents: parsePriceToCents(t.priceRaw) ?? 0,
          };
        })
        .filter((t) => t.name.length > 0 && t.priceCents > 0);

      if (validTiers.length === 0) {
        return setFormError('Adicione ao menos uma opção ou pacote com nome e valor definidos.');
      }
      pricingTiers = validTiers;
      priceCents = Math.min(...validTiers.map((t) => t.priceCents));
    } else {
      priceCents = null;
      pricingTiers = undefined;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      durationMinutes: Number(form.durationMinutes),
      intervalMinutes: Number(form.intervalMinutes),
      priceCents,
      priceVisible: form.priceVisible,
      published: form.published,
      modalities,
      pricingTiers,
      packageBookingMode: form.packageBookingMode,
      audioUrl: form.audioUrl,
      audioName: form.audioName,
    };

    setSaving(true);
    try {
      const url = editingService
        ? `/api/admin/services/${editingService.id}`
        : '/api/admin/services';
      const method = editingService ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Erro ao salvar o serviço.');
      }

      setIsModalOpen(false);
      setSuccessMsg(
        editingService
          ? `Serviço "${payload.name}" atualizado com sucesso!`
          : `Serviço "${payload.name}" criado com sucesso!`
      );
      setTimeout(() => setSuccessMsg(''), 4500);

      // Atualiza instantaneamente a lista na tela sem precisar de novo fetch
      if (data.service) {
        setServices((prev) => {
          let updated: AdminService[];
          if (editingService) {
            updated = prev.map((s) => (s.id === data.service.id ? data.service : s));
          } else {
            updated = [data.service, ...prev];
          }
          cachedServices = updated;
          return updated;
        });
      } else {
        await loadServices();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar serviço.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingService) return;
    const target = deletingService;
    const previousServices = services;

    // 1. Fecha o modal imediatamente e remove o item da tela na hora (0ms)
    setDeletingService(null);
    const updated = services.filter((s) => s.id !== target.id);
    cachedServices = updated;
    setServices(updated);
    setSuccessMsg(`Serviço "${target.name}" excluído com sucesso.`);
    setTimeout(() => setSuccessMsg(''), 4500);

    // 2. Executa a exclusão definitiva no banco de dados em segundo plano
    try {
      const res = await fetch(`/api/admin/services/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao excluir serviço.');
    } catch (err) {
      // Caso ocorra algum erro inesperado no backend, restaura o serviço e notifica
      cachedServices = previousServices;
      setServices(previousServices);
      setError(err instanceof Error ? err.message : 'Erro ao excluir serviço.');
    }
  }

  // Estatísticas
  const totalServices = services.length;
  const publishedCount = services.filter((s) => s.published).length;
  const presencialCount = services.filter((s) => s.modalities.includes('presencial')).length;
  const onlineCount = services.filter((s) => s.modalities.includes('online')).length;

  // Filtragem
  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.description.toLowerCase().includes(search.toLowerCase());

    const matchesModality =
      filterModality === 'todos' ||
      service.modalities.includes(filterModality as 'presencial' | 'online');

    const matchesStatus =
      filterStatus === 'todos' ||
      (filterStatus === 'publicados' && service.published) ||
      (filterStatus === 'rascunhos' && !service.published);

    return matchesSearch && matchesModality && matchesStatus;
  });

  return (
    <div className="admin-services-container">
      <style>{`
        .srv-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.85rem;
          margin-bottom: 0.9rem;
          flex-wrap: wrap;
        }
        .srv-page-header h1 {
          font-size: 1.45rem;
          line-height: 1.2;
          margin: 0.15rem 0 0.25rem;
        }
        .srv-page-header p {
          font-size: 0.84rem;
          color: var(--color-text-secondary);
          margin: 0;
          line-height: 1.4;
        }
        .srv-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .srv-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
          margin-bottom: 0.9rem;
        }
        .srv-kpi-card {
          background: #ffffff;
          border: 1.5px solid #94a3b8;
          border-radius: 14px;
          padding: 0.65rem 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }
        .srv-kpi-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .srv-kpi-info {
          min-width: 0;
          flex: 1;
        }
        .srv-kpi-value {
          font-size: 1.25rem;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
        }
        .srv-kpi-label {
          font-size: 0.74rem;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .srv-toolbar {
          background: #ffffff;
          border: 1.5px solid #94a3b8;
          border-radius: 14px;
          padding: 0.65rem 0.75rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          flex-wrap: wrap;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        }
        .srv-search-field {
          flex: 1 1 220px;
          min-width: 0 !important;
          margin: 0;
        }
        .srv-filters-wrap {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .srv-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
          gap: 1rem;
        }
        .srv-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.15rem;
          border: 2px solid #94a3b8;
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 8px 20px -6px rgba(15, 23, 42, 0.1), 0 2px 6px -1px rgba(15, 23, 42, 0.05);
          transition: all 0.2s ease;
          overflow: hidden;
        }
        .srv-pricing-mode-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 1rem;
        }
        .srv-tier-input-row {
          display: grid;
          grid-template-columns: 1fr 135px 36px;
          gap: 8px;
          align-items: center;
        }
        .srv-two-col-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 768px) {
          .srv-page-header {
            margin-bottom: 0.7rem;
            gap: 0.6rem;
          }
          .srv-page-header h1 {
            font-size: 1.22rem;
          }
          .srv-page-header p {
            font-size: 0.78rem;
          }
          .srv-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 6px;
          }
          .srv-header-actions .btn {
            padding: 8px 12px;
            font-size: 0.78rem;
            justify-content: center;
            white-space: nowrap;
          }
          .srv-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            margin-bottom: 0.75rem;
          }
          .srv-kpi-card {
            padding: 0.55rem 0.65rem;
            gap: 0.55rem;
            border-radius: 12px;
          }
          .srv-kpi-icon {
            width: 30px;
            height: 30px;
            border-radius: 8px;
          }
          .srv-kpi-value {
            font-size: 1.08rem;
          }
          .srv-kpi-label {
            font-size: 0.7rem;
          }
          .srv-toolbar {
            padding: 0.55rem;
            gap: 0.5rem;
            margin-bottom: 0.85rem;
          }
          .srv-search-field {
            flex: 1 1 100%;
            width: 100%;
          }
          .srv-filters-wrap {
            width: 100%;
            justify-content: space-between;
            gap: 0.4rem;
          }
          .srv-filters-wrap .filter-tabs {
            flex: 1 1 auto;
            display: flex;
            overflow-x: auto;
            padding: 3px;
          }
          .srv-filters-wrap .filter-tabs button {
            flex: 1;
            padding: 5px 8px;
            font-size: 0.73rem;
            white-space: nowrap;
          }
          .srv-card {
            padding: 1rem;
            border-radius: 16px;
          }
          .srv-pricing-mode-grid {
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .srv-tier-input-row {
            grid-template-columns: 1fr 36px;
          }
          .srv-tier-input-row > input:first-child {
            grid-column: 1 / -1;
          }
          .srv-two-col-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── TOPO DA PÁGINA COMPACTO ── */}
      <div className="srv-page-header">
        <div>
          <span className="eyebrow">Catálogo & Procedimentos</span>
          <h1>Serviços da Clínica</h1>
          <p>Gerencie atendimentos, pacotes, durações e modalidades.</p>
        </div>
        <div className="srv-header-actions">
          <Link
            href="/admin/sessoes-grupo"
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '999px',
              textDecoration: 'none',
              border: '1.5px solid #94a3b8',
              fontWeight: 700,
            }}
          >
            <Users size={15} /> Sessões em Grupo
          </Link>
          <button
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ borderRadius: '999px', fontWeight: 700 }}
          >
            <Plus size={16} /> Novo serviço
          </button>
        </div>
      </div>

      {/* ── CARDS DE ESTATÍSTICAS RÁPIDAS (2x2 COMPACTO NO MOBILE) ── */}
      <div className="srv-kpi-grid">
        <div className="srv-kpi-card">
          <div className="srv-kpi-icon" style={{ background: '#f0f9ff', color: 'var(--color-primary)', border: '1px solid #bae6fd' }}>
            <Layers size={17} />
          </div>
          <div className="srv-kpi-info">
            <div className="srv-kpi-value">{totalServices}</div>
            <div className="srv-kpi-label">Total de Serviços</div>
          </div>
        </div>

        <div className="srv-kpi-card">
          <div className="srv-kpi-icon" style={{ background: '#ecfdf5', color: 'var(--color-success)', border: '1px solid #a7f3d0' }}>
            <Calendar size={17} />
          </div>
          <div className="srv-kpi-info">
            <div className="srv-kpi-value" style={{ color: 'var(--color-success)' }}>{publishedCount}</div>
            <div className="srv-kpi-label">Publicados</div>
          </div>
        </div>

        <div className="srv-kpi-card">
          <div className="srv-kpi-icon" style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>
            <MapPin size={17} />
          </div>
          <div className="srv-kpi-info">
            <div className="srv-kpi-value">{presencialCount}</div>
            <div className="srv-kpi-label">Presencial</div>
          </div>
        </div>

        <div className="srv-kpi-card">
          <div className="srv-kpi-icon" style={{ background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}>
            <Video size={17} />
          </div>
          <div className="srv-kpi-info">
            <div className="srv-kpi-value">{onlineCount}</div>
            <div className="srv-kpi-label">Online (Vídeo)</div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE FERRAMENTAS / FILTROS COMPACTA ── */}
      <div className="srv-toolbar">
        <label className="search-field srv-search-field">
          <Search size={16} />
          <span className="sr-only">Buscar serviços</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço ou pacote..."
          />
        </label>

        <div className="srv-filters-wrap">
          <div className="filter-tabs" role="group" aria-label="Filtrar por modalidade">
            <button
              className={filterModality === 'todos' ? 'active' : ''}
              onClick={() => setFilterModality('todos')}
            >
              Todas
            </button>
            <button
              className={filterModality === 'presencial' ? 'active' : ''}
              onClick={() => setFilterModality('presencial')}
            >
              Presencial
            </button>
            <button
              className={filterModality === 'online' ? 'active' : ''}
              onClick={() => setFilterModality('online')}
            >
              Online
            </button>
          </div>

          <div className="filter-tabs" role="group" aria-label="Filtrar por publicação">
            <button
              className={filterStatus === 'todos' ? 'active' : ''}
              onClick={() => setFilterStatus('todos')}
            >
              Todos
            </button>
            <button
              className={filterStatus === 'publicados' ? 'active' : ''}
              onClick={() => setFilterStatus('publicados')}
            >
              Publicados
            </button>
            <button
              className={filterStatus === 'rascunhos' ? 'active' : ''}
              onClick={() => setFilterStatus('rascunhos')}
            >
              Rascunhos
            </button>
          </div>
        </div>
      </div>

      {/* ── FEEDBACK ALERTS ── */}
      {successMsg && (
        <div className="form-alert form-alert-success page-alert" role="status" style={{ marginBottom: '1rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {error && (
        <div className="form-alert page-alert" role="alert" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {/* ── LISTAGEM DE SERVIÇOS EM CARDS PROPORCIONAIS E DESTACADOS ── */}
      {!loading && filteredServices.length === 0 ? (
        <div className="card empty-state" style={{ padding: '2.5rem 1.25rem', textAlign: 'center', border: '2px solid #94a3b8', borderRadius: '18px' }}>
          <Sparkles size={32} style={{ margin: '0 auto 0.75rem', color: 'var(--color-primary-light)' }} />
          <h3>Nenhum serviço encontrado</h3>
          <p style={{ maxWidth: '420px', margin: '0.4rem auto 1.25rem', color: 'var(--color-text-secondary)', fontSize: '0.86rem' }}>
            {search || filterModality !== 'todos' || filterStatus !== 'todos'
              ? 'Tente ajustar os filtros ou a busca acima.'
              : 'Comece adicionando os serviços prestados pela clínica para disponibilizá-los aos pacientes.'}
          </p>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            <Plus size={17} /> Cadastrar primeiro serviço
          </button>
        </div>
      ) : (
        <div className="srv-cards-grid">
          {filteredServices.map((service) => {
            const hasTiers = Boolean(service.pricingTiers && service.pricingTiers.length > 0);
            const hasMultiSessionPkg = Boolean(
              service.pricingTiers?.some((t) => t.isPackage || (t.sessionCount && t.sessionCount > 1))
            );
            const minPriceCents = hasTiers
              ? Math.min(...service.pricingTiers!.map((t) => t.priceCents))
              : service.priceCents;

            return (
              <article
                key={service.id}
                className="srv-card"
                style={{
                  borderLeft: service.published ? '5px solid #1a3a4a' : '5px solid #94a3b8',
                }}
              >
                <div>
                  {/* Header do Card: Título + Status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.55rem' }}>
                    <h2 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25, margin: 0 }}>
                      {service.name}
                    </h2>
                    <span
                      className={`badge ${service.published ? 'badge-success' : 'badge-muted'}`}
                      style={{
                        flexShrink: 0,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        border: service.published ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                      }}
                    >
                      {service.published ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>

                  {/* Descrição */}
                  {service.description ? (
                    <p
                      style={{
                        fontSize: '0.83rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: '0.75rem',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {service.description}
                    </p>
                  ) : null}

                  {/* Linha Única Proporcional: Duração + Modalidades + Visibilidade */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '0.85rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 9px',
                        borderRadius: '8px',
                        background: '#f0f9ff',
                        border: '1.5px solid #bae6fd',
                        color: '#0369a1',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      <Clock size={13} />
                      <span>{service.durationMinutes} min</span>
                    </span>

                    {service.modalities.includes('presencial') && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 9px',
                          borderRadius: '8px',
                          background: '#f0fdf4',
                          border: '1.5px solid #bbf7d0',
                          color: '#166534',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        <MapPin size={13} /> Presencial
                      </span>
                    )}

                    {service.modalities.includes('online') && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 9px',
                          borderRadius: '8px',
                          background: '#faf5ff',
                          border: '1.5px solid #e9d5ff',
                          color: '#7e22ce',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        <Video size={13} /> Online
                      </span>
                    )}

                    {minPriceCents !== null && (
                      <span
                        title={service.priceVisible ? 'Valor visível na agenda online' : 'Valor oculto na agenda (Sob consulta)'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          background: service.priceVisible ? '#f8fafc' : '#fffbeb',
                          border: service.priceVisible ? '1px solid #cbd5e1' : '1px solid #fde68a',
                          color: service.priceVisible ? '#475569' : '#92400e',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                        }}
                      >
                        {service.priceVisible ? <Eye size={12} style={{ color: '#16a34a' }} /> : <EyeOff size={12} />}
                        <span>{service.priceVisible ? 'Preço visível' : 'Preço oculto'}</span>
                      </span>
                    )}
                  </div>

                  {/* Quadro Estruturado de Opções / Pacotes Cadastrados */}
                  {hasTiers && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '0.65rem 0.75rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '0.45rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles size={12} style={{ color: '#16a34a' }} />
                          Opções / Pacotes ({service.pricingTiers!.length})
                        </span>
                        {hasMultiSessionPkg && (
                          <span
                            style={{
                              fontSize: '0.67rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: service.packageBookingMode === 'livre' ? '#dbeafe' : '#fef08a',
                              color: service.packageBookingMode === 'livre' ? '#1e40af' : '#854d0e',
                            }}
                          >
                            {service.packageBookingMode === 'livre' ? '🔓 Agendamento Livre' : '🔒 Sessão Sequencial'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {service.pricingTiers!.map((tier) => (
                          <div
                            key={tier.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              padding: '6px 9px',
                              borderRadius: '8px',
                              background: tier.isPackage ? '#f0fdf4' : '#ffffff',
                              border: tier.isPackage ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                              fontSize: '0.79rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {tier.name}
                              </span>
                              {tier.isPackage && tier.sessionCount && tier.sessionCount > 1 && (
                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    border: '1px solid #86efac',
                                  }}
                                >
                                  {tier.sessionCount}x
                                </span>
                              )}
                            </div>
                            <strong style={{ fontWeight: 800, color: '#15803d', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatCurrency(tier.priceCents)}
                            </strong>
                          </div>
                        ))}
                      </div>

                      {hasMultiSessionPkg && (
                        <div
                          style={{
                            marginTop: '6px',
                            fontSize: '0.71rem',
                            color: service.packageBookingMode === 'livre' ? '#1e40af' : '#854d0e',
                            fontWeight: 600,
                            lineHeight: 1.3,
                          }}
                        >
                          {service.packageBookingMode === 'livre'
                            ? '• Cliente pode agendar todas as sessões de uma vez'
                            : '• Próxima sessão liberada após concluir a anterior'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Player de Áudio Explicativo (quando cadastrado) */}
                  {service.audioUrl && (
                    <div style={{ marginBottom: '0.65rem' }}>
                      <ServiceAudioPlayer
                        audioUrl={service.audioUrl}
                        serviceName={service.name}
                        audioName={service.audioName}
                        compact
                      />
                    </div>
                  )}
                </div>

                {/* Rodapé Proporcional do Card: Resumo de Valor + Ações */}
                <div
                  style={{
                    borderTop: '1.5px solid #e2e8f0',
                    paddingTop: '0.8rem',
                    marginTop: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                        {hasTiers ? 'A partir de' : 'Valor da Sessão'}
                      </span>
                      {hasTiers && (
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                          }}
                        >
                          {service.pricingTiers!.length} {service.pricingTiers!.length === 1 ? 'opção' : 'opções'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                      <strong style={{ fontSize: '1.14rem', color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {minPriceCents !== null ? formatCurrency(minPriceCents) : 'Sob consulta'}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenEdit(service)}
                      style={{
                        padding: '7px 13px',
                        fontSize: '0.8rem',
                        borderRadius: '10px',
                        border: '1.5px solid #94a3b8',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                      title="Editar serviço"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDeletingService(service)}
                      style={{
                        padding: '7px 9px',
                        borderRadius: '10px',
                        border: '1.5px solid #fca5a5',
                        background: '#fef2f2',
                        color: 'var(--color-error)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Excluir serviço"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL: CRIAÇÃO / EDIÇÃO DE SERVIÇO
      ════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setIsModalOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-modal-title"
            style={{
              maxWidth: '680px',
              width: '95%',
              overflow: 'hidden',
              border: '2px solid #64748b',
              borderRadius: '22px',
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.45)',
            }}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
              <div>
                <span className="eyebrow">{editingService ? 'Atualização de Serviço' : 'Novo Atendimento'}</span>
                <h2 id="service-modal-title">{editingService ? 'Editar Serviço' : 'Cadastrar Novo Serviço'}</h2>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                aria-label="Fechar modal"
                style={{ borderRadius: '9999px', border: '1px solid var(--color-border)' }}
              >
                <X size={19} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form
              onSubmit={handleSaveService}
              className="modal-body"
              style={{
                maxHeight: 'calc(88vh - 120px)',
                overflowY: 'auto',
                marginRight: '4px',
                paddingRight: '22px',
              }}
            >
              {formError && (
                <div className="form-alert" role="alert" style={{ marginBottom: '1.25rem' }}>
                  <AlertCircle size={17} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nome do Serviço */}
              <label className="form-group">
                <span className="form-label">Nome do Serviço *</span>
                <input
                  className="form-input"
                  required
                  placeholder="Ex: Hipnoterapia Clínica & Regressão"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </label>

              {/* Descrição (Opcional) */}
              <label className="form-group">
                <span className="form-label">
                  Descrição e Proposta de Valor <small style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(opcional)</small>
                </span>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Explique o que é abordado neste atendimento, para quem é indicado e os benefícios esperados..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              {/* Upload de Áudio Explicativo (MP3) */}
              <div
                style={{
                  background: form.audioUrl
                    ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                    : '#f8fafc',
                  padding: '1.1rem 1.25rem',
                  borderRadius: '16px',
                  border: form.audioUrl ? '1.5px solid #7dd3fc' : '1.5px solid var(--color-border)',
                  marginBottom: '1.25rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      <span>🎧 Áudio Explicativo do Serviço (MP3)</span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: form.audioUrl ? '#0284c7' : '#e2e8f0',
                          color: form.audioUrl ? '#ffffff' : '#475569',
                        }}
                      >
                        {form.audioUrl ? 'Áudio Ativo na Home' : 'Opcional'}
                      </span>
                    </span>
                    <small style={{ color: 'var(--color-text-muted)', fontSize: '0.76rem', display: 'block', marginTop: '2px' }}>
                      Envie um áudio explicando como funciona este atendimento. Ele aparecerá com um botão de tocar na área de Serviços da Home.
                    </small>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        borderRadius: '999px',
                        background: form.audioUrl ? '#ffffff' : 'linear-gradient(180deg, #21577a 0%, #173f5a 100%)',
                        color: form.audioUrl ? '#0369a1' : '#ffffff',
                        border: form.audioUrl ? '1.5px solid #7dd3fc' : 'none',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
                      }}
                    >
                      <span>{form.audioUrl ? '🔄 Trocar Áudio (MP3)' : '📤 Enviar Áudio (MP3)'}</span>
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/*"
                        onChange={handleAudioFileChange}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {form.audioUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, audioUrl: null, audioName: null })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '7px 12px',
                          borderRadius: '999px',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Remover áudio explicativo"
                      >
                        <Trash2 size={13} /> Remover
                      </button>
                    )}
                  </div>
                </div>

                {form.audioUrl && (
                  <div style={{ marginTop: '0.65rem' }}>
                    {form.audioName && (
                      <div style={{ fontSize: '0.74rem', color: '#0369a1', fontWeight: 600, marginBottom: '0.4rem' }}>
                        📎 Arquivo anexado: <strong>{form.audioName}</strong> (Prévia de como ficará na Home):
                      </div>
                    )}
                    <ServiceAudioPlayer
                      audioUrl={form.audioUrl}
                      serviceName={form.name || 'Serviço'}
                      audioName={form.audioName}
                    />
                  </div>
                )}
              </div>

              {/* Duração da Sessão */}
              <div style={{ background: '#f8fafc', padding: '1.15rem 1.25rem', borderRadius: '16px', border: '1.5px solid var(--color-border)', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <label className="form-group" style={{ marginBottom: 0 }}>
                  <span className="form-label">Duração da sessão (minutos) *</span>
                  <input
                    type="number"
                    className="form-input"
                    min={15}
                    max={480}
                    step={5}
                    required
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                  />
                  {/* Pills de atalho */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {DURATION_PRESETS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setForm({ ...form, durationMinutes: dur })}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          border: form.durationMinutes === dur ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: form.durationMinutes === dur ? 'var(--color-primary)' : '#fff',
                          color: form.durationMinutes === dur ? '#fff' : 'var(--color-text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {dur}m
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              {/* Valores & Precificação com Múltiplas Opções / Pacotes */}
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1.5px solid var(--color-border)', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.75rem' }}>
                  Valores & Precificação
                </span>

                {/* Seletor de Modelo de Precificação */}
                <div className="srv-pricing-mode-grid">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pricingMode: 'unico' })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: form.pricingMode === 'unico' ? '2px solid var(--color-primary)' : '1.5px solid #cbd5e1',
                      background: form.pricingMode === 'unico' ? '#eaf3f8' : '#fff',
                      color: form.pricingMode === 'unico' ? 'var(--color-primary)' : 'var(--color-text)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: form.pricingMode === 'unico' ? '0 2px 6px rgba(36, 93, 128, 0.1)' : 'none',
                    }}
                  >
                    Valor Único (Fixo)
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pricingMode: 'pacotes' })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: form.pricingMode === 'pacotes' ? '2px solid var(--color-primary)' : '1.5px solid #cbd5e1',
                      background: form.pricingMode === 'pacotes' ? '#eaf3f8' : '#fff',
                      color: form.pricingMode === 'pacotes' ? 'var(--color-primary)' : 'var(--color-text)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: form.pricingMode === 'pacotes' ? '0 2px 6px rgba(36, 93, 128, 0.1)' : 'none',
                    }}
                  >
                    Múltiplos Valores / Pacotes
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, pricingMode: 'consulta' })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: form.pricingMode === 'consulta' ? '2px solid var(--color-primary)' : '1.5px solid #cbd5e1',
                      background: form.pricingMode === 'consulta' ? '#eaf3f8' : '#fff',
                      color: form.pricingMode === 'consulta' ? 'var(--color-primary)' : 'var(--color-text)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: form.pricingMode === 'consulta' ? '0 2px 6px rgba(36, 93, 128, 0.1)' : 'none',
                    }}
                  >
                    Sob Consulta
                  </button>
                </div>

                {/* Caso 1: Valor Único */}
                {form.pricingMode === 'unico' && (
                  <label className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <span className="form-label">Valor da Consulta / Sessão (R$)</span>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.9rem' }}>
                        R$
                      </span>
                      <input
                        className="form-input"
                        style={{ paddingLeft: '38px' }}
                        placeholder="0,00"
                        value={form.priceRaw}
                        onChange={(e) => setForm({ ...form, priceRaw: maskCurrency(e.target.value) })}
                        onBlur={(e) => setForm({ ...form, priceRaw: finalizeCurrency(e.target.value) })}
                      />
                    </div>
                  </label>
                )}

                {/* Caso 2: Múltiplos Valores / Pacotes */}
                {form.pricingMode === 'pacotes' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <span className="form-label" style={{ marginBottom: '2px', display: 'block' }}>
                          Opções de Valores / Pacotes
                        </span>
                        <small style={{ color: 'var(--color-text-muted)', fontSize: '0.76rem', display: 'block', lineHeight: 1.4 }}>
                          Cadastre as opções de valores. Se uma opção for pacote de várias consultas, marque <strong>&quot;É pacote&quot;</strong> para ativar o controle de créditos.
                        </small>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                      {form.tiers.map((tier, idx) => (
                        <div
                          key={tier.id || idx}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '14px',
                            border: tier.isPackage ? '1.5px solid rgba(13, 148, 136, 0.45)' : '1.5px solid #cbd5e1',
                            background: tier.isPackage ? 'rgba(13, 148, 136, 0.04)' : '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {/* Linha superior: Nome da Opção + Valor + Remover */}
                          <div className="srv-tier-input-row">
                            <input
                              className="form-input"
                              placeholder="Nome da opção (ex: Atendimento Individual, Pacote 4 Sessões...)"
                              value={tier.name}
                              onChange={(e) => {
                                const updated = [...form.tiers];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setForm({ ...form, tiers: updated });
                              }}
                            />
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
                                R$
                              </span>
                              <input
                                className="form-input"
                                style={{ paddingLeft: '34px' }}
                                placeholder="0,00"
                                value={tier.priceRaw}
                                onChange={(e) => {
                                  const updated = [...form.tiers];
                                  updated[idx] = { ...updated[idx], priceRaw: maskCurrency(e.target.value) };
                                  setForm({ ...form, tiers: updated });
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '6px', color: 'var(--color-error)', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px' }}
                              title="Remover opção"
                              onClick={() => {
                                if (form.tiers.length <= 1) return;
                                setForm({ ...form, tiers: form.tiers.filter((_, i) => i !== idx) });
                              }}
                              disabled={form.tiers.length <= 1}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Linha inferior: Toggle de Pacote & Quantidade de Sessões */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '4px', borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, userSelect: 'none', color: tier.isPackage ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(tier.isPackage)}
                                onChange={(e) => {
                                  const isPkg = e.target.checked;
                                  const updated = [...form.tiers];
                                  updated[idx] = {
                                    ...updated[idx],
                                    isPackage: isPkg,
                                    sessionCount: isPkg ? (updated[idx].sessionCount && updated[idx].sessionCount > 1 ? updated[idx].sessionCount : 4) : 1,
                                  };
                                  setForm({ ...form, tiers: updated });
                                }}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                              />
                              <span>É um pacote de múltiplas sessões?</span>
                            </label>

                            {tier.isPackage ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                  Qtd. de sessões:
                                </span>
                                <input
                                  type="number"
                                  min={2}
                                  max={100}
                                  className="form-input"
                                  style={{ width: '65px', padding: '4px 6px', height: '30px', textAlign: 'center', fontWeight: 700 }}
                                  value={tier.sessionCount || 4}
                                  onChange={(e) => {
                                    const count = Math.max(2, parseInt(e.target.value, 10) || 2);
                                    const updated = [...form.tiers];
                                    updated[idx] = { ...updated[idx], sessionCount: count };
                                    setForm({ ...form, tiers: updated });
                                  }}
                                />
                                <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px' }}>
                                  ✨ Pacote Ativo ({tier.sessionCount || 4} sessões)
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                Sessão única (1 atendimento normal)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '9999px', padding: '6px 14px', border: '1.5px solid #94a3b8', fontWeight: 700 }}
                      onClick={() => {
                        setForm({
                          ...form,
                          tiers: [
                            ...form.tiers,
                            { id: String(Date.now()), name: '', isPackage: false, sessionCount: 1, priceRaw: '' },
                          ],
                        });
                      }}
                    >
                      <Plus size={14} /> Adicionar outra opção / pacote
                    </button>

                    {/* Regra de Agendamento das Sessões para Pacotes (+ de 1 sessão) */}
                    {form.tiers.some((t) => t.isPackage) && (
                      <div
                        style={{
                          marginTop: '14px',
                          padding: '14px 16px',
                          borderRadius: '14px',
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            Regra de Agendamento das Sessões do Pacote (+ de 1 sessão)
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              background: form.packageBookingMode === 'sequencial' ? '#fef9c3' : '#dbeafe',
                              color: form.packageBookingMode === 'sequencial' ? '#854d0e' : '#1e40af',
                            }}
                          >
                            {form.packageBookingMode === 'sequencial' ? 'Padrão de Fábrica Ativo' : 'Modo Livre Ativo'}
                          </span>
                        </div>
                        <small style={{ display: 'block', fontSize: '0.76rem', color: 'var(--color-text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                          Defina se o cliente que comprar um pacote com múltiplas sessões pode agendar todas de uma vez ou somente após concluir cada sessão anterior.
                        </small>

                        <div className="srv-two-col-grid">
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, packageBookingMode: 'sequencial' })}
                            style={{
                              textAlign: 'left',
                              padding: '12px',
                              borderRadius: '12px',
                              border: form.packageBookingMode === 'sequencial' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                              background: form.packageBookingMode === 'sequencial' ? '#f0f9ff' : '#f8fafc',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ fontSize: '0.82rem', color: 'var(--color-text)' }}>
                                🔒 Liberar após 1ª sessão (Padrão)
                              </strong>
                              {form.packageBookingMode === 'sequencial' && <Check size={15} style={{ color: 'var(--color-primary)' }} />}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: 1.35 }}>
                              O cliente agenda livremente a 1ª sessão e só pode agendar a próxima após a sessão anterior ser concluída.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setForm({ ...form, packageBookingMode: 'livre' })}
                            style={{
                              textAlign: 'left',
                              padding: '12px',
                              borderRadius: '12px',
                              border: form.packageBookingMode === 'livre' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                              background: form.packageBookingMode === 'livre' ? '#f0f9ff' : '#f8fafc',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ fontSize: '0.82rem', color: 'var(--color-text)' }}>
                                🔓 Deixar livre (Agendar todas)
                              </strong>
                              {form.packageBookingMode === 'livre' && <Check size={15} style={{ color: 'var(--color-primary)' }} />}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: 1.35 }}>
                              Permite que o cliente agende todas as sessões do pacote livremente de uma vez só, sem aguardar a 1ª sessão.
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Caso 3: Sob Consulta */}
                {form.pricingMode === 'consulta' && (
                  <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', color: '#92400e', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                    Este serviço será exibido aos clientes como <strong>&quot;Valor sob consulta&quot;</strong>, sem preço tabelado.
                  </div>
                )}

                {/* Checkbox de visibilidade do valor */}
                {form.pricingMode !== 'consulta' && (
                  <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', marginTop: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={form.priceVisible}
                        onChange={(e) => setForm({ ...form, priceVisible: e.target.checked })}
                        style={{ width: '17px', height: '17px', accentColor: 'var(--color-primary)' }}
                      />
                      <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--color-text)' }}>
                        Exibir valores no agendamento público
                      </span>
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '25px', display: 'block', marginTop: '2px' }}>
                      Se desmarcado, os clientes verão &quot;Valor sob consulta&quot;.
                    </span>
                  </div>
                )}
              </div>

              {/* Modalidades de Atendimento (Presencial vs Online) */}
              <div style={{ background: '#f8fafc', padding: '1.15rem 1.25rem', borderRadius: '16px', border: '1.5px solid var(--color-border)', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    Modalidades de Atendimento *
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    Selecione onde o serviço pode ser realizado
                  </span>
                </div>

                <div className="srv-two-col-grid">
                  {/* Presencial */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: form.presencial ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                      background: form.presencial ? 'var(--color-primary-light)' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.presencial}
                      onChange={(e) => setForm({ ...form, presencial: e.target.checked })}
                      style={{ marginTop: '2px', accentColor: 'var(--color-primary)' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                        <MapPin size={15} style={{ color: '#0284c7' }} /> Presencial
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                        No consultório físico da clínica
                      </span>
                    </div>
                  </label>

                  {/* Online */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: form.online ? '2px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                      background: form.online ? '#faf5ff' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.online}
                      onChange={(e) => setForm({ ...form, online: e.target.checked })}
                      style={{ marginTop: '2px', accentColor: 'var(--color-primary)' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                        <Video size={15} style={{ color: '#7c3aed' }} /> Online (Vídeo)
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '2px' }}>
                        Atendimento remoto por videochamada
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Publicação na Agenda */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '16px',
                  background: form.published ? 'var(--color-success-bg)' : '#f8fafc',
                  border: form.published ? '1.5px solid rgba(27, 122, 74, 0.4)' : '1.5px solid var(--color-border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: form.published ? 'var(--color-success)' : 'var(--color-text)' }}>
                    {form.published ? 'Serviço Ativo e Publicado' : 'Salvar como Rascunho / Inativo'}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    {form.published
                      ? 'Disponível imediatamente para novos agendamentos na página pública.'
                      : 'Oculto para pacientes na página de agendamento online.'}
                  </span>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-success)' }}
                  />
                </label>
              </div>

              {/* Botões de Ação */}
              <div className="modal-actions" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '2px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  style={{ borderRadius: '9999px', padding: '9px 20px', border: '1.5px solid var(--color-border)', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ borderRadius: '9999px', padding: '9px 24px', fontWeight: 600, boxShadow: '0 4px 12px rgba(36, 93, 128, 0.25)' }}
                >
                  {saving ? (
                    'Salvando serviço…'
                  ) : (
                    <>
                      <Check size={16} /> {editingService ? 'Atualizar serviço' : 'Criar serviço'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL: CONFIRMAÇÃO DE EXCLUSÃO
      ════════════════════════════════════════════════════════════════ */}
      {deletingService && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeletingService(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            style={{
              maxWidth: '480px',
              width: '95%',
              borderRadius: '24px',
              border: '2px solid rgba(220, 38, 38, 0.35)',
              boxShadow: '0 25px 65px -15px rgba(15, 23, 42, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.95) inset',
            }}
          >
            <div className="modal-header" style={{ padding: '22px 26px', borderBottom: '2px solid var(--color-border)' }}>
              <div>
                <span className="eyebrow" style={{ color: 'var(--color-error)' }}>Confirmação</span>
                <h2 id="delete-modal-title">Excluir Serviço</h2>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setDeletingService(null)}
                aria-label="Fechar"
                style={{ borderRadius: '9999px', border: '1px solid var(--color-border)' }}
              >
                <X size={19} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: 'var(--color-text)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Tem certeza de que deseja remover o serviço <strong>&quot;{deletingService.name}&quot;</strong>?
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.82rem',
                  lineHeight: 1.4,
                  marginBottom: '1.25rem',
                }}
              >
                <HelpCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Atenção:</strong> O serviço e suas configurações serão removidos definitivamente do catálogo e da agenda online.
                </span>
              </div>

              <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeletingService(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteConfirm}
                  style={{
                    background: 'var(--color-error)',
                    color: '#fff',
                    borderColor: 'var(--color-error)',
                  }}
                >
                  Sim, excluir
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
