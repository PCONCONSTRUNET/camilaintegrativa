'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import styles from './agenda-dialogs.module.css';

type BookingConfirmationMode = 'manual' | 'automatico';

export type AgendaSettingsPayload = {
  settings: {
    bookingConfirmationMode: BookingConfirmationMode;
    minimumNoticeMinutes: number;
  };
  workingHours: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    publicBooking: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    intervalMinutes: number;
  }>;
  holidays: Array<{
    id?: string;
    date: string;
    name: string;
  }>;
};

export type AgendaSettingsDialogProps = {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const WEEK_DAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseError(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

function normalizePayload(body: unknown): AgendaSettingsPayload {
  if (!body || typeof body !== 'object') throw new Error('Resposta inválida ao carregar as configurações.');
  const source = body as Partial<AgendaSettingsPayload>;
  if (!source.settings || !Array.isArray(source.workingHours) || !Array.isArray(source.services) || !Array.isArray(source.holidays)) {
    throw new Error('As configurações recebidas estão incompletas.');
  }
  return {
    settings: {
      bookingConfirmationMode: source.settings.bookingConfirmationMode === 'automatico' ? 'automatico' : 'manual',
      minimumNoticeMinutes: Number(source.settings.minimumNoticeMinutes),
    },
    workingHours: source.workingHours.map((range) => ({
      weekday: Number(range.weekday),
      startTime: String(range.startTime),
      endTime: String(range.endTime),
      publicBooking: Boolean(range.publicBooking),
    })),
    services: source.services.map((service) => ({
      id: String(service.id),
      name: String(service.name),
      durationMinutes: Number(service.durationMinutes),
      intervalMinutes: Number(service.intervalMinutes),
    })),
    holidays: source.holidays.map((holiday) => ({
      ...(holiday.id ? { id: String(holiday.id) } : {}),
      date: String(holiday.date),
      name: String(holiday.name),
    })),
  };
}

async function requestSettings(signal?: AbortSignal) {
  const response = await fetch('/api/admin/agenda-settings', { cache: 'no-store', signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(parseError(body, 'Não foi possível carregar as configurações da agenda.'));
  return normalizePayload(body);
}

function validateSettings(payload: AgendaSettingsPayload) {
  if (!Number.isInteger(payload.settings.minimumNoticeMinutes) || payload.settings.minimumNoticeMinutes < 0) {
    return 'A antecedência mínima deve ser informada em minutos e não pode ser negativa.';
  }

  for (const service of payload.services) {
    if (!Number.isInteger(service.durationMinutes) || service.durationMinutes < 15 || service.durationMinutes > 480) {
      return `A duração de “${service.name}” deve ficar entre 15 minutos e 8 horas.`;
    }
    if (!Number.isInteger(service.intervalMinutes) || service.intervalMinutes < 0 || service.intervalMinutes > 180) {
      return `O intervalo de “${service.name}” deve ficar entre 0 e 180 minutos.`;
    }
  }

  for (const day of WEEK_DAYS) {
    const ranges = payload.workingHours
      .filter((range) => range.weekday === day.value)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index];
      if (!TIME_PATTERN.test(range.startTime) || !TIME_PATTERN.test(range.endTime) || range.startTime >= range.endTime) {
        return `Revise a faixa de horário de ${day.label.toLowerCase()}.`;
      }
      if (index > 0 && ranges[index - 1].endTime > range.startTime) {
        return `Existem faixas sobrepostas em ${day.label.toLowerCase()}.`;
      }
    }
  }

  const holidayDates = new Set<string>();
  for (const holiday of payload.holidays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday.date) || holiday.name.trim().length < 2) {
      return 'Preencha a data e o nome de todos os feriados.';
    }
    if (holidayDates.has(holiday.date)) return 'Há mais de um feriado cadastrado para a mesma data.';
    holidayDates.add(holiday.date);
  }

  return '';
}

export default function AgendaSettingsDialog({ onClose, onSaved }: AgendaSettingsDialogProps) {
  const [draft, setDraft] = useState<AgendaSettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);

  async function retryLoad() {
    setLoading(true);
    setError('');
    try {
      setDraft(await requestSettings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as configurações da agenda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const previousOverflow = document.body.style.overflow;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    void requestSettings(controller.signal)
      .then((payload) => setDraft(payload))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as configurações da agenda.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !savingRef.current) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      controller.abort();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      returnFocusTo?.focus();
    };
  }, [onClose]);

  function updateRange(index: number, changes: Partial<AgendaSettingsPayload['workingHours'][number]>) {
    setDraft((current) => current ? {
      ...current,
      workingHours: current.workingHours.map((range, rangeIndex) => rangeIndex === index ? { ...range, ...changes } : range),
    } : current);
  }

  function addRange(weekday: number) {
    setDraft((current) => current ? {
      ...current,
      workingHours: [...current.workingHours, { weekday, startTime: '09:00', endTime: '12:00', publicBooking: true }],
    } : current);
  }

  function removeRange(index: number) {
    setDraft((current) => current ? {
      ...current,
      workingHours: current.workingHours.filter((_, rangeIndex) => rangeIndex !== index),
    } : current);
  }

  function updateService(index: number, changes: Partial<AgendaSettingsPayload['services'][number]>) {
    setDraft((current) => current ? {
      ...current,
      services: current.services.map((service, serviceIndex) => serviceIndex === index ? { ...service, ...changes } : service),
    } : current);
  }

  function addHoliday() {
    setDraft((current) => current ? {
      ...current,
      holidays: [...current.holidays, { date: '', name: '' }],
    } : current);
  }

  function updateHoliday(index: number, changes: Partial<AgendaSettingsPayload['holidays'][number]>) {
    setDraft((current) => current ? {
      ...current,
      holidays: current.holidays.map((holiday, holidayIndex) => holidayIndex === index ? { ...holiday, ...changes } : holiday),
    } : current);
  }

  function removeHoliday(index: number) {
    setDraft((current) => current ? {
      ...current,
      holidays: current.holidays.filter((_, holidayIndex) => holidayIndex !== index),
    } : current);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    const validationError = validateSettings(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: AgendaSettingsPayload = {
      ...draft,
      workingHours: [...draft.workingHours].sort((left, right) => left.weekday - right.weekday || left.startTime.localeCompare(right.startTime)),
      holidays: draft.holidays.map((holiday) => ({ ...holiday, name: holiday.name.trim() })),
    };

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/agenda-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseError(body, 'Não foi possível salvar as configurações da agenda.'));
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as configurações da agenda.');
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={styles.layer} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className={`${styles.dialog} ${styles.settingsDialog}`} role="dialog" aria-modal="true" aria-labelledby="agenda-settings-title" aria-describedby="agenda-settings-description">
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headingIcon}><Settings2 size={19} /></span>
            <div>
              <h2 id="agenda-settings-title">Configurações da agenda</h2>
              <p id="agenda-settings-description">Defina o que aparece ao público e o tempo reservado para cada atendimento.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className={styles.iconButton} onClick={onClose} disabled={saving} aria-label="Fechar configurações">
            <X size={20} />
          </button>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.body}>
            {error && (
              <div className={styles.alert} role="alert">
                <AlertCircle size={17} />
                <span>{error}</span>
                {!draft && !loading && <button type="button" className={styles.retryButton} onClick={retryLoad}>Tentar novamente</button>}
              </div>
            )}

            {loading ? (
              <div className={styles.loading} aria-live="polite"><LoaderCircle className={styles.spin} size={22} /> Carregando regras da agenda…</div>
            ) : draft ? (
              <>
                <section className={styles.section} aria-labelledby="booking-rules-title">
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>
                      <CalendarClock size={18} />
                      <div><h3 id="booking-rules-title">Reservas online</h3><p>Controle a confirmação e a antecedência mínima para novos pedidos.</p></div>
                    </div>
                  </div>
                  <div className={styles.twoColumns}>
                    <label className={styles.field}>
                      <span>Confirmação da reserva</span>
                      <select value={draft.settings.bookingConfirmationMode} onChange={(event) => setDraft({
                        ...draft,
                        settings: { ...draft.settings, bookingConfirmationMode: event.target.value as BookingConfirmationMode },
                      })}>
                        <option value="manual">Manual — aguarda a clínica</option>
                        <option value="automatico">Automática — confirma ao reservar</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Antecedência mínima (minutos)</span>
                      <input type="number" min="0" max="525600" step="15" value={draft.settings.minimumNoticeMinutes} onChange={(event) => setDraft({
                        ...draft,
                        settings: { ...draft.settings, minimumNoticeMinutes: Number(event.target.value) },
                      })} required />
                    </label>
                  </div>
                </section>

                <section className={styles.section} aria-labelledby="public-hours-title">
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>
                      <Clock3 size={18} />
                      <div><h3 id="public-hours-title">Horários públicos</h3><p>Adicione quantos turnos forem necessários em cada dia.</p></div>
                    </div>
                  </div>
                  <div className={styles.dayList}>
                    {WEEK_DAYS.map((day) => {
                      const dayRanges = draft.workingHours
                        .map((range, index) => ({ range, index }))
                        .filter(({ range }) => range.weekday === day.value);
                      return (
                        <article className={styles.dayCard} key={day.value}>
                          <div className={styles.dayHeading}>
                            <strong>{day.label}</strong>
                            <button type="button" className={styles.smallButton} onClick={() => addRange(day.value)}><Plus size={13} /> Adicionar faixa</button>
                          </div>
                          <div className={styles.rangeList}>
                            {dayRanges.length ? dayRanges.map(({ range, index }) => (
                              <div className={styles.rangeRow} key={`${day.value}-${index}`}>
                                <label className={styles.compactField}><span>Início</span><input type="time" step="900" value={range.startTime} onChange={(event) => updateRange(index, { startTime: event.target.value })} required /></label>
                                <label className={styles.compactField}><span>Final</span><input type="time" step="900" value={range.endTime} onChange={(event) => updateRange(index, { endTime: event.target.value })} required /></label>
                                <label className={styles.checkLabel}><input type="checkbox" checked={range.publicBooking} onChange={(event) => updateRange(index, { publicBooking: event.target.checked })} /> Público</label>
                                <button type="button" className={styles.removeButton} onClick={() => removeRange(index)} aria-label={`Remover faixa de ${day.label}`}><Trash2 size={15} /></button>
                              </div>
                            )) : <p className={styles.emptyRow}>Sem atendimento público neste dia.</p>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.section} aria-labelledby="services-rules-title">
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>
                      <Settings2 size={18} />
                      <div><h3 id="services-rules-title">Duração e intervalo</h3><p>O intervalo mantém um espaço livre depois da sessão.</p></div>
                    </div>
                  </div>
                  <div className={styles.serviceList}>
                    {draft.services.map((service, index) => (
                      <div className={styles.serviceRow} key={service.id}>
                        <strong className={styles.serviceName} title={service.name}>{service.name}</strong>
                        <label className={styles.compactField}><span>Duração (min)</span><input type="number" min="15" max="480" step="15" value={service.durationMinutes} onChange={(event) => updateService(index, { durationMinutes: Number(event.target.value) })} required /></label>
                        <label className={styles.compactField}><span>Intervalo (min)</span><input type="number" min="0" max="180" step="5" value={service.intervalMinutes} onChange={(event) => updateService(index, { intervalMinutes: Number(event.target.value) })} required /></label>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.section} aria-labelledby="holidays-title">
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>
                      <CalendarDays size={18} />
                      <div><h3 id="holidays-title">Feriados</h3><p>Nessas datas nenhum horário será oferecido na agenda pública.</p></div>
                    </div>
                    <button type="button" className={styles.addButton} onClick={addHoliday}><Plus size={13} /> Adicionar</button>
                  </div>
                  <div className={styles.holidayList}>
                    {draft.holidays.length ? draft.holidays.map((holiday, index) => (
                      <div className={styles.holidayRow} key={holiday.id ?? `new-${index}`}>
                        <label className={styles.compactField}><span>Data</span><input type="date" value={holiday.date} onChange={(event) => updateHoliday(index, { date: event.target.value })} required /></label>
                        <label className={styles.compactField}><span>Nome</span><input type="text" maxLength={100} value={holiday.name} onChange={(event) => updateHoliday(index, { name: event.target.value })} placeholder="Ex.: Natal" required /></label>
                        <button type="button" className={styles.removeButton} onClick={() => removeHoliday(index)} aria-label={`Remover ${holiday.name || 'feriado'}`}><Trash2 size={15} /></button>
                      </div>
                    )) : <p className={styles.emptyRow}>Nenhum feriado cadastrado.</p>}
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <footer className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={!draft || loading || saving}>
              {saving ? <><LoaderCircle className={styles.spin} size={16} /> Salvando…</> : <><Save size={16} /> Salvar configurações</>}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
