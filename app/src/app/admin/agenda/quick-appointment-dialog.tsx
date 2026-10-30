'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Clock3, LoaderCircle, PencilLine, Plus, Sparkles, UserRound, X } from 'lucide-react';
import type { AppointmentStatus, AppointmentSummary, ClientPackage, ClientSummary, Service } from '@/lib/domain';
import { formatCurrency } from '@/lib/utils';

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
      : 'Em branco: usa automaticamente a duração cadastrada no serviço.';

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch('/api/admin/clients?status=todos', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/admin/services', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([clientsResponse, servicesResponse]) => {
        const [clientsBody, servicesBody] = await Promise.all([clientsResponse.json(), servicesResponse.json()]);
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
    if (!form.clientId || !form.serviceId) {
      setError('Selecione o cliente e o serviço.');
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
          notes: finalNotes,
          clientPackageId: selectedPackageId || null,
          ...(!allowFitIn ? { bookingKind: undefined, fitInReason: undefined } : {
            fitInReason: form.bookingKind === 'encaixe' ? form.fitInReason.trim() : null,
          }),
          expectedUpdatedAt: appointment.updatedAt,
        } : {
          ...form,
          notes: finalNotes,
          clientPackageId: selectedPackageId || null,
          fitInReason: form.bookingKind === 'encaixe' ? form.fitInReason.trim() : null,
        }),
      });
      const body = await response.json();
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

                <label className="gcal-quick-field">
                  <span><UserRound size={15} /> Cliente</span>
                  <select
                    ref={firstFieldRef}
                    name="clientId"
                    value={form.clientId}
                    onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                    required
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map((client) => <option value={client.id} key={client.id}>{client.name} · {client.phone}</option>)}
                  </select>
                </label>
                <a className="gcal-quick-new-client" href="/admin/clientes" target="_blank" rel="noreferrer">
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

                <label className="gcal-quick-field">
                  <span>Serviço</span>
                  <select name="serviceId" value={form.serviceId} onChange={(event) => chooseService(event.target.value)} required>
                    <option value="">Selecione um serviço</option>
                    {services.map((service) => <option value={service.id} key={service.id}>{service.name} · {service.durationMinutes} min</option>)}
                  </select>
                </label>

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
