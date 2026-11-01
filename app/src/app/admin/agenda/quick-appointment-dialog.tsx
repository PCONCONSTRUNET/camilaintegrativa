'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Clock3, LoaderCircle, PencilLine, Plus, Search, Sparkles, UserRound, X } from 'lucide-react';
import type { AppointmentStatus, AppointmentSummary, ClientPackage, ClientSummary, Service } from '@/lib/domain';
import { formatCurrency } from '@/lib/utils';

function formatCpf(val?: string | null): string {
  if (!val) return '';
  const d = val.replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return val;
}

function formatPhone(val?: string | null): string {
  if (!val) return '';
  const d = val.replace(/\D/g, '');
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return val;
}

export type QuickAppointmentSlot = {
  date: string;
  time: string;
  bookingKind?: 'regular' | 'encaixe';
};

type FormState = {
  clientId: string;
  serviceId: string;
  modality: 'presencial' | 'online';
  date: string;
  time: string;
  endTime: string;
  status: AppointmentStatus;
  bookingKind: 'regular' | 'encaixe';
  fitInReason: string;
  notes: string;
};

type QuickAppointmentDialogProps = {
  slot?: QuickAppointmentSlot;
  appointment?: AppointmentSummary;
  allowFitIn?: boolean;
  onClose: () => void;
  onSaved: (appointment: AppointmentSummary) => void;
  onConflict: (message?: string) => void;
};

const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

function appointmentDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function appointmentTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function initialForm(slot?: QuickAppointmentSlot, appointment?: AppointmentSummary): FormState {
  if (appointment) {
    return {
      clientId: appointment.clientId,
      serviceId: appointment.serviceId,
      modality: appointment.modality,
      date: appointmentDate(appointment.startAt),
      time: appointmentTime(appointment.startAt),
      endTime: appointmentTime(appointment.endAt),
      status: appointment.status,
      bookingKind: appointment.bookingKind,
      fitInReason: appointment.fitInReason ?? '',
      notes: appointment.administrativeNotes ?? '',
    };
  }

  if (!slot) throw new Error('Informe um horário para criar o agendamento.');
  return {
    clientId: '',
    serviceId: '',
    modality: 'presencial',
    date: slot.date,
    time: slot.time,
    endTime: '',
    status: 'confirmado',
    bookingKind: slot.bookingKind ?? 'regular',
    fitInReason: '',
    notes: '',
  };
}

function formatSelectedDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Selecione uma data';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}

function timeInMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function durationBetweenTimes(startTime: string, endTime: string) {
  if (startTime === endTime) return 0;
  const difference = timeInMinutes(endTime) - timeInMinutes(startTime);
  return difference > 0 ? difference : difference + 24 * 60;
}

function automaticEndLabel(startTime: string, durationMinutes: number) {
  const total = timeInMinutes(startTime) + durationMinutes;
  const normalized = total % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}${total >= 24 * 60 ? ' do dia seguinte' : ''}`;
}

export default function QuickAppointmentDialog({
  slot,
  appointment,
  allowFitIn = false,
  onClose,
  onSaved,
  onConflict,
}: QuickAppointmentDialogProps) {
  const editing = Boolean(appointment);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<FormState>(() => initialForm(slot, appointment));
  const [clientPackages, setClientPackages] = useState<ClientPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedTierId, setSelectedTierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // Modo de seleção ou digitação livre de serviço
  const [serviceMode, setServiceMode] = useState<'list' | 'custom'>('list');
  const [customServiceName, setCustomServiceName] = useState('');
  const customServiceInputRef = useRef<HTMLInputElement>(null);

  // Busca e seleção rápida de clientes (Nome, CPF, Telefone)
  const [clientSearch, setClientSearch] = useState('');
  const [isSearchingClient, setIsSearchingClient] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === form.clientId) ?? null,
    [clients, form.clientId],
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    if (!q) return clients;

    return clients.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const phoneRaw = (c.phone || '').toLowerCase();
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      const matchPhone =
        phoneRaw.includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits));

      const cpfRaw = (c.cpf || '').toLowerCase();
      const cpfDigits = cpfRaw.replace(/\D/g, '');
      const matchCpf =
        cpfRaw.includes(q) ||
        (qDigits.length > 0 && cpfDigits.includes(qDigits));

      const matchEmail = (c.email || '').toLowerCase().includes(q);

      return matchName || matchPhone || matchCpf || matchEmail;
    });
  }, [clients, clientSearch]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.serviceId) ?? null,
    [services, form.serviceId],
  );
  const customDurationMinutes = form.endTime ? durationBetweenTimes(form.time, form.endTime) : null;
  const endTimeInvalid = customDurationMinutes !== null && (customDurationMinutes < 15 || customDurationMinutes > 480);
  const durationHint = form.endTime
    ? (() => {
        if (customDurationMinutes === null || customDurationMinutes < 15) return 'A duração mínima é de 15 minutos.';
        if (customDurationMinutes > 480) return 'A duração máxima é de 8 horas.';
        const crossesMidnight = timeInMinutes(form.endTime) < timeInMinutes(form.time);
        return `Duração personalizada: ${customDurationMinutes} minutos${crossesMidnight ? ' · termina no dia seguinte' : ''}.`;
      })()
    : selectedService
      ? `Em branco: termina automaticamente às ${automaticEndLabel(form.time, selectedService.durationMinutes)} (${selectedService.durationMinutes} min).`
      : 'Em branco: duração padrão de 60 minutos.';

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch('/api/admin/clients?status=todos', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/admin/services', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([clientsResponse, servicesResponse]) => {
        const [clientsBody, servicesBody] = await Promise.all([
          clientsResponse.json().catch(() => ({})),
          servicesResponse.json().catch(() => ({})),
        ]);
        if (!clientsResponse.ok) throw new Error(clientsBody.error ?? 'Não foi possível carregar os clientes.');
        if (!servicesResponse.ok) throw new Error(servicesBody.error ?? 'Não foi possível carregar os serviços.');
        const loadedServices: Service[] = servicesBody.services ?? [];
        setClients(clientsBody.clients ?? []);
        setServices(loadedServices);

        if (form.serviceId) {
          const currentSvc = loadedServices.find((s) => s.id === form.serviceId);
          if (currentSvc?.pricingTiers && currentSvc.pricingTiers.length > 0) {
            const matchedTier = currentSvc.pricingTiers.find((t) => form.notes.includes(t.name));
            setSelectedTierId(matchedTier ? matchedTier.id : currentSvc.pricingTiers[0].id);
          }
        }

        window.requestAnimationFrame(() => {
          if (window.matchMedia('(min-width: 701px)').matches) {
            firstFieldRef.current?.focus({ preventScroll: true });
          }
        });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível preparar o agendamento.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [appointment?.id, slot?.date, slot?.time]);

  // Carregar pacotes ativos do cliente selecionado
  useEffect(() => {
    if (!form.clientId) {
      setClientPackages([]);
      setSelectedPackageId('');
      return;
    }
    fetch(`/api/admin/client-packages?clientId=${form.clientId}`)
      .then((res) => res.json())
      .then((data) => {
        const list: ClientPackage[] = data.packages ?? [];
        setClientPackages(list);
        const active = list.find((p) => p.status === 'ativo' && p.remainingSessions > 0);
        if (active && !editing) {
          setSelectedPackageId(active.id);
          if (!form.serviceId && active.serviceId) {
            chooseService(active.serviceId);
          }
        }
      })
      .catch(() => {});
  }, [form.clientId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [appointment?.id, slot?.date, slot?.time, submitting, onClose]);

  function chooseService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    setForm((current) => ({
      ...current,
      serviceId,
      modality: service?.modalities.includes(current.modality) ? current.modality : (service?.modalities[0] ?? 'presencial'),
    }));
    if (service?.pricingTiers && service.pricingTiers.length > 0) {
      setSelectedTierId(service.pricingTiers[0].id);
    } else {
      setSelectedTierId('');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.clientId) {
      setError('Selecione ou busque o cliente.');
      return;
    }
    if (serviceMode === 'list' && !form.serviceId) {
      setError('Selecione um serviço ou clique em "Digitar outro".');
      return;
    }
    if (serviceMode === 'custom' && !customServiceName.trim()) {
      setError('Digite o nome do serviço personalizado.');
      return;
    }
    if (form.bookingKind === 'encaixe' && form.fitInReason.trim().length < 3) {
      setError('Explique o motivo do encaixe para manter o histórico da agenda.');
      return;
    }
    if (editing && !form.endTime) {
      setError('Informe o horário final do agendamento.');
      return;
    }
    if (form.endTime) {
      const durationMinutes = durationBetweenTimes(form.time, form.endTime);
      if (durationMinutes < 15) {
        setError('O horário final deve criar uma duração mínima de 15 minutos.');
        return;
      }
      if (durationMinutes > 480) {
        setError('A duração máxima de um agendamento é de 8 horas.');
        return;
      }
    }

    setSubmitting(true);
    setError('');

    let finalServiceId = form.serviceId;

    if (serviceMode === 'custom') {
      const cleanCustomName = customServiceName.trim();
      const existingMatch = services.find(
        (s) => s.name.trim().toLowerCase() === cleanCustomName.toLowerCase(),
      );

      if (existingMatch) {
        finalServiceId = existingMatch.id;
      } else {
        try {
          const calcDuration = form.endTime ? durationBetweenTimes(form.time, form.endTime) : 60;
          const svcRes = await fetch('/api/admin/services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: cleanCustomName,
              description: 'Serviço personalizado da agenda',
              durationMinutes: calcDuration >= 15 && calcDuration <= 480 ? calcDuration : 60,
              intervalMinutes: 15,
              priceCents: null,
              priceVisible: false,
              published: false,
              modalities: ['presencial', 'online'],
            }),
          });
          const svcData = (await svcRes.json().catch(() => null)) as { service?: Service; error?: string } | null;
          if (!svcRes.ok || !svcData?.service?.id) {
            throw new Error(svcData?.error || 'Não foi possível cadastrar o serviço personalizado.');
          }
          finalServiceId = svcData.service.id;
          setServices((prev) => [...prev, svcData.service!]);
        } catch (err) {
          setSubmitting(false);
          setError(err instanceof Error ? err.message : 'Erro ao cadastrar serviço personalizado.');
          return;
        }
      }
    }

    const selectedTier = selectedService?.pricingTiers?.find((t) => t.id === selectedTierId);
    let finalNotes = form.notes.trim();
    if (selectedTier && !finalNotes.includes(selectedTier.name)) {
      finalNotes = `Opção/Pacote: ${selectedTier.name} (${formatCurrency(selectedTier.priceCents)})${finalNotes ? '\n' + finalNotes : ''}`;
    }

    try {
      const response = await fetch(appointment ? '/api/admin/appointments/' + appointment.id : '/api/admin/appointments', {
        method: appointment ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointment ? {
          operation: 'edit',
          ...form,
          serviceId: finalServiceId,
          notes: finalNotes,
          clientPackageId: selectedPackageId || null,
          ...(!allowFitIn ? { bookingKind: undefined, fitInReason: undefined } : {
            fitInReason: form.bookingKind === 'encaixe' ? form.fitInReason.trim() : null,
          }),
          expectedUpdatedAt: appointment.updatedAt,
        } : {
          ...form,
          serviceId: finalServiceId,
          notes: finalNotes,
          clientPackageId: selectedPackageId || null,
          fitInReason: form.bookingKind === 'encaixe' ? form.fitInReason.trim() : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = body.error ?? (editing ? 'Não foi possível editar o agendamento.' : 'Não foi possível criar o agendamento.');
        if (response.status === 409) {
          onConflict(errorMessage);
          if (editing) {
            onClose();
            return;
          }
        }
        throw new Error(errorMessage);
      }
      onSaved(body.appointment as AppointmentSummary);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (editing ? 'Não foi possível editar o agendamento.' : 'Não foi possível criar o agendamento.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="gcal-quick-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="gcal-quick-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-dialog-title">
        <header className="gcal-quick-header">
          <div>
            <span className="gcal-quick-icon">{editing ? <PencilLine size={18} /> : <Plus size={18} />}</span>
            <div>
              <h2 id="appointment-dialog-title">{editing ? 'Editar agendamento' : 'Novo agendamento'}</h2>
              <p>{formatSelectedDate(form.date)} às {form.time}</p>
            </div>
          </div>
          <button type="button" className="gcal-icon-button" onClick={onClose} disabled={submitting} aria-label="Fechar formulário">
            <X size={19} />
          </button>
        </header>

        <form onSubmit={submit} className="gcal-quick-form">
          <div className="gcal-quick-body">
            {error && <div className="gcal-quick-alert" role="alert">{error}</div>}

            {loading ? (
              <div className="gcal-quick-loading"><LoaderCircle className="is-spinning" size={20} /> Preparando formulário…</div>
            ) : (
              <>
                {allowFitIn && (
                  <label className="gcal-quick-field">
                    <span><Sparkles size={15} /> Tipo de agendamento</span>
                    <select
                      name="bookingKind"
                      value={form.bookingKind}
                      onChange={(event) => setForm({
                        ...form,
                        bookingKind: event.target.value as FormState['bookingKind'],
                        fitInReason: event.target.value === 'encaixe' ? form.fitInReason : '',
                      })}
                    >
                      <option value="regular">Agendamento normal</option>
                      <option value="encaixe">Encaixe interno</option>
                    </select>
                  </label>
                )}
                {form.bookingKind === 'encaixe' && (
                  <div className="gcal-fit-in-box">
                    <strong>Encaixe controlado</strong>
                    <p>Pode ser criado fora do horário público, mas nunca sobre outro atendimento ou bloqueio.</p>
                    <label className="gcal-quick-field">
                      <span>Motivo do encaixe</span>
                      <input
                        name="fitInReason"
                        value={form.fitInReason}
                        onChange={(event) => setForm({ ...form, fitInReason: event.target.value })}
                        maxLength={200}
                        placeholder="Ex.: urgência ou reposição autorizada"
                        required
                      />
                    </label>
                  </div>
                )}

                <div className="gcal-quick-field" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
                      <UserRound size={15} /> Cliente *
                    </span>
                    {selectedClient && !isSearchingClient && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchingClient(true);
                          setClientSearch('');
                          setTimeout(() => searchInputRef.current?.focus(), 50);
                        }}
                        style={{
                          fontSize: '0.74rem',
                          color: '#0f766e',
                          fontWeight: 700,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Trocar cliente
                      </button>
                    )}
                  </div>

                  {/* Campo oculto com validação HTML nativa */}
                  <input
                    type="hidden"
                    name="clientId"
                    value={form.clientId}
                    required
                  />

                  {/* 1. Cliente Selecionado (Card com Nome, CPF e Telefone) */}
                  {selectedClient && !isSearchingClient ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#f8fafc',
                        border: '1.5px solid #0f766e',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedClient.name}
                          </span>
                          {selectedClient.isInadimplente && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 5px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontWeight: 800 }}>
                              Inadimplente
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                          <span>📞 {formatPhone(selectedClient.phone)}</span>
                          {selectedClient.cpf && (
                            <span>🪪 CPF: <strong style={{ color: '#1e293b' }}>{formatCpf(selectedClient.cpf)}</strong></span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchingClient(true);
                          setClientSearch('');
                          setTimeout(() => searchInputRef.current?.focus(), 50);
                        }}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#0f766e',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    /* 2. Campo de Busca Dinâmica por Nome, CPF ou Telefone */
                    <div>
                      <div style={{ position: 'relative' }}>
                        <Search
                          size={15}
                          style={{
                            position: 'absolute',
                            left: '11px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                            pointerEvents: 'none',
                          }}
                        />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          placeholder="Buscar por Nome, CPF ou Telefone..."
                          style={{
                            width: '100%',
                            padding: '9px 32px 9px 34px',
                            fontSize: '0.86rem',
                            border: '1.5px solid #0f766e',
                            borderRadius: '10px',
                            background: '#ffffff',
                            color: '#0f172a',
                            fontWeight: 600,
                            outline: 'none',
                            boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.12)',
                          }}
                          autoFocus={!selectedClient}
                        />
                        {clientSearch ? (
                          <button
                            type="button"
                            onClick={() => setClientSearch('')}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <X size={15} />
                          </button>
                        ) : selectedClient && (
                          <button
                            type="button"
                            onClick={() => setIsSearchingClient(false)}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: '#64748b',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>

                      {/* Lista de Resultados Filtrados */}
                      <div
                        style={{
                          marginTop: '6px',
                          maxHeight: '190px',
                          overflowY: 'auto',
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '10px',
                          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                        }}
                      >
                        <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{clientSearch ? `Resultados da busca (${filteredClients.length})` : `Selecione um cliente (${clients.length})`}</span>
                          {clientSearch && <span style={{ color: '#0f766e' }}>Filtro: "{clientSearch}"</span>}
                        </div>

                        {filteredClients.length === 0 ? (
                          <div style={{ padding: '16px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                            <p style={{ margin: '0 0 8px' }}>Nenhum cliente encontrado com "{clientSearch}".</p>
                            <a
                              href="/admin/clientes"
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: '#0f766e',
                                fontWeight: 800,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <Plus size={13} /> Cadastrar cliente agora
                            </a>
                          </div>
                        ) : (
                          filteredClients.map((c) => {
                            const isChosen = form.clientId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setForm({ ...form, clientId: c.id });
                                  setIsSearchingClient(false);
                                  setClientSearch('');
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '8px 12px',
                                  border: 'none',
                                  borderBottom: '1px solid #f1f5f9',
                                  background: isChosen ? '#ecfdf5' : '#ffffff',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  transition: 'background 0.12s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isChosen) e.currentTarget.style.background = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isChosen) e.currentTarget.style.background = '#ffffff';
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {c.name}
                                    </span>
                                    {c.isInadimplente && (
                                      <span style={{ fontSize: '0.64rem', padding: '1px 4px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontWeight: 800 }}>
                                        Débito
                                      </span>
                                    )}
                                    {c.activePackagesCount && c.activePackagesCount > 0 ? (
                                      <span style={{ fontSize: '0.64rem', padding: '1px 4px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 800 }}>
                                        Pacote
                                      </span>
                                    ) : null}
                                  </div>
                                  <div style={{ fontSize: '0.73rem', color: '#64748b', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '1px' }}>
                                    <span>📞 {formatPhone(c.phone)}</span>
                                    {c.cpf ? (
                                      <span style={{ color: '#334155', fontWeight: 600 }}>🪪 CPF: {formatCpf(c.cpf)}</span>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>Sem CPF</span>
                                    )}
                                  </div>
                                </div>
                                {isChosen && <Check size={16} color="#0f766e" style={{ flexShrink: 0 }} />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <a className="gcal-quick-new-client" href="/admin/clientes" target="_blank" rel="noreferrer" style={{ marginTop: '2px' }}>
                  <Plus size={13} /> Cadastrar novo cliente
                </a>

                {/* Exibição e Seleção de Pacotes Ativos do Cliente */}
                {clientPackages.length > 0 && (
                  <div style={{ marginTop: '8px', marginBottom: '6px', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Sparkles size={13} /> Pacotes de Sessões do Cliente
                      </span>
                      <span style={{ fontSize: '0.73rem', color: '#15803d', fontWeight: 600 }}>
                        {clientPackages.filter((p) => p.status === 'ativo').length} ativo(s)
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {clientPackages.map((pkg) => {
                        const isSelected = selectedPackageId === pkg.id;
                        const isAvailable = pkg.status === 'ativo' && pkg.remainingSessions > 0;
                        return (
                          <label
                            key={pkg.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '7px 10px',
                              background: isSelected ? '#dcfce7' : '#ffffff',
                              border: isSelected ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                              borderRadius: '8px',
                              cursor: isAvailable ? 'pointer' : 'default',
                              fontSize: '0.8rem',
                            }}
                          >
                            <input
                              type="checkbox"
                              disabled={!isAvailable}
                              checked={isSelected}
                              onChange={(e) => setSelectedPackageId(e.target.checked ? pkg.id : '')}
                              style={{ accentColor: '#16a34a', width: '15px', height: '15px' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ color: '#0f172a', display: 'block' }}>{pkg.packageName}</strong>
                              <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '1px' }}>
                                {pkg.usedSessions}/{pkg.totalSessions} sessões utilizadas · <strong style={{ color: pkg.remainingSessions > 0 ? '#15803d' : '#94a3b8' }}>{pkg.remainingSessions} restantes</strong>
                              </div>
                            </div>
                            {isSelected && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', background: '#ffffff', padding: '2px 7px', borderRadius: '4px', border: '1px solid #86efac' }}>
                                Abater 1 crédito
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="gcal-quick-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
                      <Sparkles size={14} style={{ display: 'inline', marginRight: '4px', color: '#245d80' }} /> Serviço *
                    </span>
                    <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '6px', padding: '2px', gap: '2px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setServiceMode('list');
                          setCustomServiceName('');
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          fontWeight: serviceMode === 'list' ? 700 : 500,
                          background: serviceMode === 'list' ? '#ffffff' : 'transparent',
                          color: serviceMode === 'list' ? '#0f766e' : '#64748b',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          boxShadow: serviceMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        📋 Da lista
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setServiceMode('custom');
                          setTimeout(() => customServiceInputRef.current?.focus(), 50);
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          fontWeight: serviceMode === 'custom' ? 700 : 500,
                          background: serviceMode === 'custom' ? '#ffffff' : 'transparent',
                          color: serviceMode === 'custom' ? '#0f766e' : '#64748b',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          boxShadow: serviceMode === 'custom' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        ✏️ Digitar outro
                      </button>
                    </div>
                  </div>

                  {serviceMode === 'list' ? (
                    <select
                      name="serviceId"
                      value={form.serviceId}
                      onChange={(event) => {
                        if (event.target.value === '__custom__') {
                          setServiceMode('custom');
                          setTimeout(() => customServiceInputRef.current?.focus(), 50);
                        } else {
                          chooseService(event.target.value);
                        }
                      }}
                      required={serviceMode === 'list'}
                    >
                      <option value="">Selecione um serviço</option>
                      {services.map((service) => (
                        <option value={service.id} key={service.id}>
                          {service.name} · {service.durationMinutes} min
                        </option>
                      ))}
                      <option value="__custom__">✏️ Outro (digitar serviço personalizado)...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        ref={customServiceInputRef}
                        type="text"
                        value={customServiceName}
                        onChange={(e) => setCustomServiceName(e.target.value)}
                        placeholder="Digite o nome do serviço (ex.: Conversa inicial, Retorno, Avaliação...)"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: '0.86rem',
                          fontWeight: 600,
                          border: '1.5px solid #0f766e',
                          borderRadius: '8px',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                        }}
                        required={serviceMode === 'custom'}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setServiceMode('list');
                          setCustomServiceName('');
                        }}
                        title="Voltar para a lista de serviços cadastrados"
                        style={{
                          padding: '0 10px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          color: '#475569',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Ver lista
                      </button>
                    </div>
                  )}
                </div>

                {selectedService?.pricingTiers && selectedService.pricingTiers.length > 0 && (
                  <label className="gcal-quick-field">
                    <span><Sparkles size={14} style={{ color: '#245d80' }} /> Opção / Pacote</span>
                    <select
                      value={selectedTierId}
                      onChange={(event) => setSelectedTierId(event.target.value)}
                    >
                      {selectedService.pricingTiers.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.name} — {formatCurrency(tier.priceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="gcal-quick-field">
                  <span>Modalidade</span>
                  <select
                    name="modality"
                    value={form.modality}
                    onChange={(event) => setForm({ ...form, modality: event.target.value as FormState['modality'] })}
                    disabled={!selectedService}
                  >
                    {(selectedService?.modalities ?? ['presencial']).map((modality) => (
                      <option value={modality} key={modality}>{modality === 'online' ? 'Online' : 'Presencial'}</option>
                    ))}
                  </select>
                </label>

                <div className="gcal-quick-schedule">
                  <label className="gcal-quick-field gcal-quick-date-field">
                    <span><CalendarDays size={15} /> Data</span>
                    <input name="date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
                  </label>
                  <label className="gcal-quick-field">
                    <span><Clock3 size={15} /> Início</span>
                    <input name="time" type="time" step="900" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
                  </label>
                  <label className="gcal-quick-field">
                    <span><Clock3 size={15} /> Final {!editing && <small>(opcional)</small>}</span>
                    <input
                      name="endTime"
                      type="time"
                      step="900"
                      value={form.endTime}
                      onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                      required={editing}
                      aria-invalid={endTimeInvalid}
                      aria-describedby="gcal-end-time-hint"
                    />
                  </label>
                </div>
                <div className="gcal-quick-duration-row">
                  <p id="gcal-end-time-hint" className={'gcal-quick-duration-hint' + (endTimeInvalid ? ' is-error' : '')}>{durationHint}</p>
                  {!editing && form.endTime && (
                    <button type="button" onClick={() => setForm({ ...form, endTime: '' })}>Usar duração do serviço</button>
                  )}
                </div>

                <label className="gcal-quick-field">
                  <span>{editing ? 'Status' : 'Status inicial'}</span>
                  <select name="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState['status'] })}>
                    <option value="confirmado">Confirmado</option>
                    <option value="solicitado">Solicitado</option>
                    {editing && <option value="em_atendimento">Em atendimento</option>}
                    {editing && <option value="concluido">Concluído</option>}
                    {editing && <option value="cancelado">Cancelado</option>}
                    {editing && <option value="nao_compareceu">Não compareceu</option>}
                  </select>
                </label>

                <label className="gcal-quick-field">
                  <span>Observação administrativa</span>
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={500}
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    placeholder="Opcional"
                  />
                </label>
              </>
            )}
          </div>

          <footer className="gcal-quick-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || submitting || !clients.length || !services.length}>
              {submitting ? <><LoaderCircle className="is-spinning" size={16} /> Salvando…</> : <><Check size={16} /> {editing ? 'Salvar alterações' : 'Salvar agendamento'}</>}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
