'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Video,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Smartphone,
  Monitor,
  Eye,
  EyeOff,
  RefreshCw,
  Play,
  Link2,
} from 'lucide-react';

type VideoOrientation = 'auto' | 'vertical' | 'horizontal';

interface HomeVideoConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  videoUrl: string;
  videoName: string;
  videoSize: number;
  posterUrl: string;
  orientation: VideoOrientation;
  updatedAt?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${ Math.max(1, Math.round(kb)) } KB`;
}

function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}?rel=0`;
      const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch?.[1]) return `https://www.youtube.com/embed/${shortsMatch[1]}?rel=0`;
      const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch?.[1]) return `https://www.youtube.com/embed/${embedMatch[1]}?rel=0`;
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
    }
  } catch {}
  return null;
}

export default function AdminVideoHomePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showExternalInput, setShowExternalInput] = useState(false);

  const [form, setForm] = useState<HomeVideoConfig>({
    enabled: true,
    title: 'Conheça o Atendimento',
    subtitle: 'Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa',
    videoUrl: '',
    videoName: '',
    videoSize: 0,
    posterUrl: '',
    orientation: 'auto',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/home-video', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar configuração.');
      if (data.video) {
        setForm({
          enabled: Boolean(data.video.enabled),
          title: data.video.title || 'Conheça o Atendimento',
          subtitle:
            data.video.subtitle ??
            'Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa',
          videoUrl: data.video.videoUrl || '',
          videoName: data.video.videoName || '',
          videoSize: Number(data.video.videoSize || 0),
          posterUrl: data.video.posterUrl || '',
          orientation: data.video.orientation || 'auto',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do vídeo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function saveToServer(nextConfig: HomeVideoConfig, customSuccess?: string) {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/home-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar.');
      if (data.video) {
        setForm({
          enabled: Boolean(data.video.enabled),
          title: data.video.title,
          subtitle: data.video.subtitle,
          videoUrl: data.video.videoUrl,
          videoName: data.video.videoName,
          videoSize: Number(data.video.videoSize || 0),
          posterUrl: data.video.posterUrl || '',
          orientation: data.video.orientation || 'auto',
        });
      }
      setSuccessMsg(customSuccess || 'Configurações do vídeo da Home salvas com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar vídeo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setError('');
    setSuccessMsg('');
    setUploading(true);
    setUploadProgress(1);
    setUploadStatusText(`Preparando envio de "${file.name}" (${formatBytes(file.size)})...`);

    try {
      // 1. Pede URL assinada para enviar direto ao Cloudflare R2 (suporta arquivos grandes sem limite de 4.5MB)
      const presignRes = await fetch('/api/admin/home-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign',
          fileName: file.name,
          mimeType: file.type || 'video/mp4',
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadUrl) {
        throw new Error(presignData.error || 'Não foi possível iniciar o upload.');
      }

      let finalVideoUrl = presignData.publicUrl as string;

      // 2. Faz o upload direto via XMLHttpRequest para ter barra de progresso real (0% a 100%)
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presignData.uploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
              setUploadProgress(pct);
              setUploadStatusText(
                `Enviando vídeo... ${pct}% (${formatBytes(event.loaded)} de ${formatBytes(event.total)})`
              );
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Falha no envio (HTTP ${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error('Erro de rede no envio direto.'));
          xhr.send(file);
        });
      } catch (directErr) {
        // Fallback automático via servidor caso o arquivo tenha até 4.4 MB
        if (file.size <= 4.4 * 1024 * 1024) {
          setUploadStatusText('Finalizando envio pelo servidor...');
          const fd = new FormData();
          fd.append('file', file);
          fd.append('folder', 'videos-home');
          const fbRes = await fetch('/api/admin/upload-document', {
            method: 'POST',
            body: fd,
          });
          const fbData = await fbRes.json();
          if (!fbRes.ok || !fbData.url) {
            throw directErr;
          }
          finalVideoUrl = fbData.url;
        } else {
          throw directErr;
        }
      }

      setUploadProgress(100);
      setUploadStatusText('Salvando e publicando na Home...');

      const nextConfig: HomeVideoConfig = {
        ...form,
        enabled: true,
        videoUrl: finalVideoUrl,
        videoName: file.name,
        videoSize: file.size,
      };
      setForm(nextConfig);
      await saveToServer(nextConfig, 'Vídeo enviado e publicado na Home com sucesso!');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar o vídeo. Tente novamente.'
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
    }
  }

  async function handleRemoveVideo() {
    if (!confirm('Deseja remover o vídeo atual da Home pública?')) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/home-video', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover vídeo.');
      if (data.video) {
        setForm((prev) => ({
          ...prev,
          videoUrl: '',
          videoName: '',
          videoSize: 0,
        }));
      }
      setSuccessMsg('Vídeo removido com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover vídeo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await saveToServer(form);
  }

  const youtubeEmbed = getYoutubeEmbedUrl(form.videoUrl);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1b4b6b 0%, #245d80 100%)',
          borderRadius: 18,
          padding: '22px 24px',
          color: '#fff',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 10px 28px rgba(27, 75, 107, 0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Video size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
              Vídeo de Apresentação da Home
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', opacity: 0.9 }}>
              Envie um vídeo do seu celular ou computador para os clientes assistirem direto na página inicial.
            </p>
          </div>
        </div>

        <Link
          href="/?site=1"
          target="_blank"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 12,
            background: '#fff',
            color: '#1b4b6b',
            fontWeight: 700,
            fontSize: '0.85rem',
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <ExternalLink size={16} />
          Ver Home Pública
        </Link>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 16px',
            borderRadius: 12,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 16px',
            borderRadius: 12,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 40,
            textAlign: 'center',
            color: '#64748b',
            border: '1px solid #e2e8f0',
          }}
        >
          Carregando configurações do vídeo...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* Coluna 1: Upload e Formulário */}
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
            }}
          >
            {/* Card de Upload */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                  1. Enviar Arquivo de Vídeo
                </label>
                {form.videoUrl && (
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: '#dcfce7',
                      color: '#166534',
                    }}
                  >
                    ✓ Vídeo Ativo
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #93c5fd',
                  borderRadius: 16,
                  padding: '24px 18px',
                  background: uploading ? '#f8fafc' : 'linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
                  textAlign: 'center',
                  cursor: uploading ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    background: '#245d80',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    boxShadow: '0 6px 16px rgba(36, 93, 128, 0.24)',
                  }}
                >
                  <Upload size={24} />
                </div>

                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                  {uploading
                    ? 'Enviando seu vídeo...'
                    : form.videoUrl
                    ? 'Toque aqui para enviar outro vídeo'
                    : 'Toque aqui para escolher um vídeo da Galeria / Computador'}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Aceita vídeos gravados pelo celular (MP4, MOV, WebM) em formato vertical ou horizontal.
                </p>

                {uploading && (
                  <div style={{ marginTop: 16, textAlign: 'left' }}>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: '#e2e8f0',
                        overflow: 'hidden',
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          width: `${uploadProgress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #245d80, #0284c7)',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', textAlign: 'center' }}>
                      {uploadStatusText}
                    </div>
                  </div>
                )}
              </div>

              {/* Botão opcional para colar link do YouTube ou externo */}
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowExternalInput((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#245d80',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Link2 size={14} />
                  {showExternalInput ? 'Ocultar opção de link externo' : 'Ou colar link externo / YouTube'}
                </button>

                {form.videoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    disabled={saving || uploading}
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Trash2 size={14} />
                    Remover vídeo atual
                  </button>
                )}
              </div>

              {showExternalInput && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        videoUrl: e.target.value,
                        videoName: e.target.value ? 'Link de vídeo' : '',
                      }))
                    }
                    placeholder="https://... (Link direto MP4 ou YouTube)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.86rem',
                    }}
                  />
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: 0 }} />

            {/* Formulário de Textos e Visibilidade */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                2. Personalizar Exibição na Home
              </div>

              {/* Visibilidade */}
              <div
                onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: form.enabled ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                  background: form.enabled ? '#f0fdf4' : '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {form.enabled ? (
                    <Eye size={19} style={{ color: '#16a34a' }} />
                  ) : (
                    <EyeOff size={19} style={{ color: '#64748b' }} />
                  )}
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
                      {form.enabled ? 'Seção de Vídeo Visível na Home' : 'Seção de Vídeo Oculta na Home'}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                      {form.enabled
                        ? 'Os clientes verão o quadro de vídeo ao abrir a página inicial.'
                        : 'O quadro de vídeo está desativado temporariamente.'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 18, height: 18, accentColor: '#16a34a' }}
                />
              </div>

              {/* Título */}
              <div>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}
                >
                  Título do Quadro na Home
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex: Conheça o Atendimento"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              {/* Subtítulo */}
              <div>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}
                >
                  Subtítulo / Descrição Curta (opcional)
                </label>
                <textarea
                  rows={2}
                  value={form.subtitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="Ex: Assista ao vídeo de apresentação e entenda como funciona a Hipnose Clínica Integrativa"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Formato do Vídeo */}
              <div>
                <label
                  style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}
                >
                  Formato do Vídeo
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { id: 'auto', label: 'Automático', icon: Sparkles },
                    { id: 'vertical', label: 'Vertical (Celular)', icon: Smartphone },
                    { id: 'horizontal', label: 'Horizontal', icon: Monitor },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = form.orientation === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, orientation: opt.id as VideoOrientation }))
                        }
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 5,
                          padding: '10px 8px',
                          borderRadius: 10,
                          border: active ? '2px solid #245d80' : '1px solid #cbd5e1',
                          background: active ? '#f0f9ff' : '#fff',
                          color: active ? '#1b4b6b' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.76rem',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon size={16} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || uploading}
                style={{
                  marginTop: 4,
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#245d80',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: saving || uploading ? 'not-allowed' : 'pointer',
                  opacity: saving || uploading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={17} />
                    Salvar Alterações
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Coluna 2: Pré-visualização de como fica na Home Pública */}
          <div
            style={{
              background: '#0d2232',
              borderRadius: 20,
              padding: 20,
              color: '#fff',
              border: '1px solid rgba(229, 200, 142, 0.25)',
              boxShadow: '0 14px 34px rgba(10, 26, 39, 0.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#e5c88e',
                }}
              >
                Prévia na Home Pública
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: form.enabled ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.2)',
                  color: form.enabled ? '#86efac' : '#cbd5e1',
                  fontWeight: 700,
                }}
              >
                {form.enabled ? 'Visível na Home' : 'Oculto'}
              </span>
            </div>

            {/* Simulação do Card na Home */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.97)',
                borderRadius: 18,
                padding: 16,
                color: '#0f172a',
                border: '1.5px solid rgba(229, 200, 142, 0.55)',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.22)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    background: 'linear-gradient(135deg, #245d80 0%, #163d57 100%)',
                    color: '#e5c88e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Play size={18} fill="currentColor" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#123247' }}>
                    {form.title || 'Conheça o Atendimento'}
                  </h3>
                  {form.subtitle && (
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#475569', lineHeight: 1.35 }}>
                      {form.subtitle}
                    </p>
                  )}
                </div>
              </div>

              {form.videoUrl ? (
                <div
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#09151f',
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {youtubeEmbed ? (
                    <iframe
                      src={youtubeEmbed}
                      title={form.title || 'Vídeo'}
                      style={{
                        width: '100%',
                        aspectRatio: form.orientation === 'vertical' ? '9 / 16' : '16 / 9',
                        maxHeight: form.orientation === 'vertical' ? 460 : 320,
                        border: 'none',
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      key={form.videoUrl}
                      src={form.videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      style={{
                        width: '100%',
                        maxHeight: form.orientation === 'vertical' ? 480 : 360,
                        aspectRatio:
                          form.orientation === 'vertical'
                            ? '9 / 16'
                            : form.orientation === 'horizontal'
                            ? '16 / 9'
                            : undefined,
                        objectFit: 'contain',
                        display: 'block',
                        background: '#000',
                      }}
                    />
                  )}
                </div>
              ) : (
                <div
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  style={{
                    borderRadius: 14,
                    padding: '36px 20px',
                    background: 'linear-gradient(145deg, #0f293c 0%, #1b4b6b 100%)',
                    color: '#fff',
                    textAlign: 'center',
                    cursor: 'pointer',
                    border: '1px dashed rgba(229, 200, 142, 0.5)',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(229, 200, 142, 0.2)',
                      color: '#e5c88e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px',
                    }}
                  >
                    <Play size={22} fill="currentColor" />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 4 }}>
                    Espaço Preparado na Home
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.8)' }}>
                    Assim que você enviar um vídeo ao lado, ele aparecerá exatamente aqui para os clientes assistirem.
                  </div>
                </div>
              )}

              {form.videoName && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: '0.75rem',
                    color: '#64748b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Arquivo: <strong>{form.videoName}</strong>
                  </span>
                  {form.videoSize > 0 && <span>{formatBytes(form.videoSize)}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
