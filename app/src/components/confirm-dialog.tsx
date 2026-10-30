'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Trash2, X } from 'lucide-react';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'primary';

export type ConfirmDialogOptions = {
  title: string;
  description: string;
  highlightText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  showReasonInput?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
};

export type AlertDialogOptions = {
  title: string;
  description: string;
  variant?: 'error' | 'warning' | 'success' | 'info';
  buttonLabel?: string;
};

type ActiveDialogState =
  | {
      mode: 'confirm';
      options: ConfirmDialogOptions;
    }
  | {
      mode: 'alert';
      options: AlertDialogOptions;
    };

export function useConfirmDialog() {
  const [activeDialog, setActiveDialog] = useState<ActiveDialogState | null>(null);
  const [reason, setReason] = useState('');
  const confirmResolverRef = useRef<((res: { confirmed: boolean; reason: string }) => void) | null>(null);
  const alertResolverRef = useRef<(() => void) | null>(null);

  const confirmDialog = useCallback((options: ConfirmDialogOptions) => {
    setReason(options.defaultReason ?? '');
    setActiveDialog({ mode: 'confirm', options });
    return new Promise<{ confirmed: boolean; reason: string }>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

  const alertDialog = useCallback((options: AlertDialogOptions) => {
    setActiveDialog({ mode: 'alert', options });
    return new Promise<void>((resolve) => {
      alertResolverRef.current = resolve;
    });
  }, []);

  const handleCloseConfirm = useCallback(
    (confirmed: boolean) => {
      const currentReason = reason.trim();
      setActiveDialog(null);
      if (confirmResolverRef.current) {
        confirmResolverRef.current({ confirmed, reason: currentReason });
        confirmResolverRef.current = null;
      }
    },
    [reason]
  );

  const handleCloseAlert = useCallback(() => {
    setActiveDialog(null);
    if (alertResolverRef.current) {
      alertResolverRef.current();
      alertResolverRef.current = null;
    }
  }, []);

  const dialogNode = activeDialog ? (
    <div
      className="modal-layer"
      style={{ zIndex: 999999 }}
      onClick={() => {
        if (activeDialog.mode === 'confirm') handleCloseConfirm(false);
        else handleCloseAlert();
      }}
    >
      <div
        className="modal"
        style={{
          width: 'min(420px, calc(100vw - 28px))',
          borderRadius: '20px',
          padding: 0,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.32)',
          background: '#ffffff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {activeDialog.mode === 'confirm' ? (
          (() => {
            const {
              title,
              description,
              highlightText,
              confirmLabel = 'Confirmar',
              cancelLabel = 'Voltar',
              variant = 'danger',
              showReasonInput,
              reasonLabel = 'Motivo (opcional)',
              reasonPlaceholder = 'Se desejar, informe o motivo...',
            } = activeDialog.options;

            const isDanger = variant === 'danger';
            const isWarning = variant === 'warning';

            const iconBg = isDanger ? '#fef2f2' : isWarning ? '#fffbeb' : '#f0f7fb';
            const iconBorder = isDanger ? '#fecaca' : isWarning ? '#fde68a' : '#bae6fd';
            const iconColor = isDanger ? '#dc2626' : isWarning ? '#d97706' : '#1a3a4a';
            const btnBg = isDanger ? '#dc2626' : isWarning ? '#d97706' : '#1a3a4a';

            return (
              <>
                <div
                  style={{
                    padding: '20px 20px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: iconBg,
                        border: `1px solid ${iconBorder}`,
                        color: iconColor,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isDanger ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
                    </div>
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1.02rem',
                          fontWeight: 800,
                          color: '#0f172a',
                          lineHeight: 1.25,
                        }}
                      >
                        {title}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: iconColor,
                        }}
                      >
                        {isDanger ? 'Confirmação necessária' : isWarning ? 'Atenção' : 'Confirmação'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCloseConfirm(false)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      border: 'none',
                      background: '#f1f5f9',
                      color: '#64748b',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ padding: '0 20px 18px' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.86rem',
                      color: '#475569',
                      lineHeight: 1.5,
                    }}
                  >
                    {description}
                  </p>

                  {highlightText && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        borderRadius: '11px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: '#1e293b',
                        lineHeight: 1.4,
                      }}
                    >
                      {highlightText}
                    </div>
                  )}

                  {showReasonInput && (
                    <label style={{ display: 'block', marginTop: '12px' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#475569',
                          marginBottom: '5px',
                        }}
                      >
                        {reasonLabel}
                      </span>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={reasonPlaceholder}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '0.84rem',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0f172a',
                          outline: 'none',
                        }}
                      />
                    </label>
                  )}
                </div>

                <div
                  style={{
                    padding: '12px 20px',
                    background: '#f8fafc',
                    borderTop: '1px solid #f1f5f9',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.25fr',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCloseConfirm(false)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '11px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCloseConfirm(true)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '11px',
                      border: 'none',
                      background: btnBg,
                      color: '#ffffff',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: isDanger
                        ? '0 4px 12px rgba(220, 38, 38, 0.25)'
                        : '0 4px 12px rgba(26, 58, 74, 0.2)',
                    }}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </>
            );
          })()
        ) : (
          (() => {
            const { title, description, variant = 'error', buttonLabel = 'Entendi' } = activeDialog.options;
            const isError = variant === 'error';
            const isSuccess = variant === 'success';
            const iconBg = isError ? '#fef2f2' : isSuccess ? '#ecfdf5' : '#fffbeb';
            const iconBorder = isError ? '#fecaca' : isSuccess ? '#a7f3d0' : '#fde68a';
            const iconColor = isError ? '#dc2626' : isSuccess ? '#059669' : '#d97706';

            return (
              <>
                <div
                  style={{
                    padding: '20px 20px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: iconBg,
                      border: `1px solid ${iconBorder}`,
                      color: iconColor,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isError ? (
                      <ShieldAlert size={20} />
                    ) : isSuccess ? (
                      <CheckCircle2 size={20} />
                    ) : (
                      <Info size={20} />
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
                </div>
                <div style={{ padding: '0 20px 18px' }}>
                  <p style={{ margin: 0, fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>{description}</p>
                </div>
                <div
                  style={{
                    padding: '12px 20px',
                    background: '#f8fafc',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCloseAlert}
                    style={{
                      padding: '9px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#1a3a4a',
                      color: '#ffffff',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {buttonLabel}
                  </button>
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  ) : null;

  return {
    confirmDialog,
    alertDialog,
    dialogNode,
  };
}

