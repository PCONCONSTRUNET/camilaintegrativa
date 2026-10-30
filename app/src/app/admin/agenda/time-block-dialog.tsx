'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarOff, CalendarRange, Check, Clock3, LoaderCircle, X } from 'lucide-react';
import styles from './agenda-dialogs.module.css';

export type TimeBlockDialogProps = {
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type TimeBlockForm = {
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
};

function clinicToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function initialForm(initialDate?: string): TimeBlockForm {
  const today = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : clinicToday();
  return {
    startDate: today,
    endDate: today,
    allDay: true,
    startTime: '09:00',
    endTime: '10:00',
    reason: '',
  };
}

function parseError(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${date}T12:00:00Z`));
}

export default function TimeBlockDialog({ initialDate, onClose, onSaved }: TimeBlockDialogProps) {
  const [form, setForm] = useState<TimeBlockForm>(() => initialForm(initialDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(false);

  const summary = useMemo(() => {
    if (form.allDay) {
      return form.startDate === form.endDate
        ? `O dia ${formatDate(form.startDate)} ficará indisponível.`
        : `O período de ${formatDate(form.startDate)} até ${formatDate(form.endDate)} ficará indisponível.`;
    }
    return `${formatDate(form.startDate)}, das ${form.startTime} às ${form.endTime}.`;
  }, [form]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !savingRef.current) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      returnFocusTo?.focus();
    };
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) {
      setError('A data final não pode ser anterior à data inicial.');
      return;
    }
    if (!form.allDay && (!form.startTime || !form.endTime || form.endTime <= form.startTime)) {
      setError('Em um bloqueio por horário, o término deve ser posterior ao início.');
      return;
    }
    if (form.reason.trim().length < 3) {
      setError('Informe um motivo interno com pelo menos 3 caracteres.');
      reasonRef.current?.focus();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    const payload = form.allDay
      ? {
          startDate: form.startDate,
          endDate: form.endDate,
          allDay: true as const,
          reason: form.reason.trim(),
        }
      : {
          date: form.startDate,
          startTime: form.startTime,
          endTime: form.endTime,
          reason: form.reason.trim(),
        };

    try {
      const response = await fetch('/api/admin/time-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseError(body, 'Não foi possível bloquear este período.'));
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível bloquear este período.');
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={styles.layer} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="time-block-title" aria-describedby="time-block-description">
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headingIcon}><CalendarOff size={19} /></span>
            <div>
              <h2 id="time-block-title">Bloquear horário</h2>
              <p id="time-block-description">O período deixará de aparecer como disponível para novas reservas.</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className={styles.iconButton} onClick={onClose} disabled={saving} aria-label="Fechar bloqueio de horário"><X size={20} /></button>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.body}>
            {error && <div className={styles.alert} role="alert"><AlertCircle size={17} /><span>{error}</span></div>}

            {/* Atalhos de Bloqueio Rápido (1 Toque) */}
            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1.5px solid #cbd5e1' }}>
              <span style={{ display: 'block', fontSize: '0.71rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                ⚡ Atalhos Rápidos (Preenchimento em 1 Toque)
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    allDay: false,
                    startTime: '12:00',
                    endTime: '13:00',
                    reason: 'Intervalo de Almoço',
                  }))}
                  style={{
                    padding: '7px 9px',
                    borderRadius: '9px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  🍽️ Almoço (12h-13h)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    allDay: false,
                    startTime: '14:00',
                    endTime: '15:00',
                    reason: 'Compromisso Médico',
                  }))}
                  style={{
                    padding: '7px 9px',
                    borderRadius: '99px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  🩺 Médico / Externo
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    allDay: true,
                    reason: 'Folga da Terapeuta',
                  }))}
                  style={{
                    padding: '7px 9px',
                    borderRadius: '9px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  🏖️ Folga do Dia
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    allDay: true,
                    reason: 'Feriado / Recesso',
                  }))}
                  style={{
                    padding: '7px 9px',
                    borderRadius: '9px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  🚫 Feriado / Recesso
                </button>
              </div>
            </div>

            <div className={styles.switchPanel}>
              <div className={styles.switchCopy}>
                <strong>Bloquear o dia inteiro</strong>
                <p>Use para férias, feriados internos, eventos ou indisponibilidade.</p>
              </div>
              <label className={styles.switchRow}>
                <input type="checkbox" checked={form.allDay} onChange={(event) => setForm({
                  ...form,
                  allDay: event.target.checked,
                  endDate: event.target.checked ? form.endDate : form.startDate,
                })} />
                <span>{form.allDay ? 'Sim' : 'Não'}</span>
              </label>
            </div>

            {form.allDay ? (
              <div className={styles.twoColumns}>
                <label className={styles.field}><span><CalendarRange size={15} /> Data inicial</span><input type="date" value={form.startDate} onChange={(event) => setForm({
                  ...form,
                  startDate: event.target.value,
                  endDate: form.endDate < event.target.value ? event.target.value : form.endDate,
                })} required /></label>
                <label className={styles.field}><span><CalendarRange size={15} /> Data final</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label>
              </div>
            ) : (
              <>
                <label className={styles.field}><span><CalendarRange size={15} /> Data</span><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: event.target.value })} required /></label>
                <div className={styles.twoColumns}>
                  <label className={styles.field}><span><Clock3 size={15} /> Início</span><input type="time" step="900" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required /></label>
                  <label className={styles.field}><span><Clock3 size={15} /> Final</span><input type="time" step="900" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} required /></label>
                </div>
              </>
            )}

            <label className={styles.field}>
              <span>Motivo interno</span>
              <textarea ref={reasonRef} rows={3} maxLength={240} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder={form.allDay ? 'Ex.: férias da profissional' : 'Ex.: compromisso externo'} required />
              <small className={styles.hint}>O motivo fica restrito ao painel administrativo e não é exibido ao público.</small>
            </label>

            <div className={styles.summary}><Check size={16} /><span>{summary}</span></div>
          </div>

          <footer className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? <><LoaderCircle className={styles.spin} size={16} /> Salvando…</> : <><CalendarOff size={16} /> Bloquear período</>}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
