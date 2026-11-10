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
  Eye,
  EyeOff,
  RefreshCw,
  Play,
  Plus,
  Sparkles,
  Save,
} from 'lucide-react';

interface HomeVideoItem {
  id: string;
  title: string;
  subtitle: string;
  videoUrl: string;
  videoName: string;
  videoSize: number;
  published: boolean;
  displayOrder: number;
  createdAt: string;
}

interface HomeVideoSection {
  enabled: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  videos: HomeVideoItem[];
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export default function AdminVideoHomePage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoSubtitle, setNewVideoSubtitle] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [section, setSection] = useState<HomeVideoSection>({
    enabled: true,
    sectionTitle: 'Sessões & Atendimentos Reais',
    sectionSubtitle:
      'Assista a registros reais de sessões e transformações compartilhadas pela Dra. Camila Machado',
    videos: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSection = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/home-video', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar vídeos.');
      if (data.section) {
        setSection({
          enabled: Boolean(data.section.enabled),
          sectionTitle: data.section.sectionTitle || 'Sessões & Atendimentos Reais',
          sectionSubtitle:
            data.section.sectionSubtitle ??
            'Assista a registros reais de sessões e transformações compartilhadas pela Dra. Camila Machado',
          videos: Array.isArray(data.section.videos) ? data.section.videos : [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar vídeos da Home.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSection();
  }, [loadSection]);

  async function uploadSingleFileToR2(
    file: File,
    indexLabel: string
  ): Promise<{ publicUrl: string; name: string; size: number }> {
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
              `Enviando ${indexLabel} "${file.name}"... ${pct}% (${formatBytes(event.loaded)} de ${formatBytes(event.total)})`
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

    return {
      publicUrl: finalVideoUrl,
      name: file.name,
      size: file.size,
    };
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    setError('');
    setSuccessMsg('');
    setUploading(true);
    setUploadProgress(1);

    try {
      let latestSection: HomeVideoSection | null = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const label = files.length > 1 ? `(${i + 1}/${files.length})` : '';
        setUploadStatusText(`Preparando envio ${label} de "${file.name}"...`);

        const uploaded = await uploadSingleFileToR2(file, label);

        setUploadProgress(100);
        setUploadStatusText('Publicando Reel na Home...');

        const addRes = await fetch('/api/admin/home-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_video',
            title:
              files.length === 1 && newVideoTitle.trim()
                ? newVideoTitle.trim()
                : newVideoTitle.trim()
                ? `${newVideoTitle.trim()} #${i + 1}`
                : '',
            subtitle: newVideoSubtitle.trim(),
            videoUrl: uploaded.publicUrl,
            videoName: uploaded.name,
            videoSize: uploaded.size,
            published: true,
          }),
        });
        const addData = await addRes.json();
        if (!addRes.ok) throw new Error(addData.error || 'Erro ao salvar vídeo.');
        if (addData.section) {
          latestSection = addData.section;
        }
      }

      if (latestSection) {
        setSection(latestSection);
      } else {
        await loadSection();
      }
      setNewVideoTitle('');
      setNewVideoSubtitle('');
      setSuccessMsg(
        files.length > 1
          ? `${files.length} vídeos enviados e publicados na Home!`
          : 'Vídeo enviado e publicado na Home com sucesso!'
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar o vídeo. Tente novamente.'
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
    }
  }

  async function handleSaveSectionSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/admin/home-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          enabled: section.enabled,
          sectionTitle: section.sectionTitle,
          sectionSubtitle: section.sectionSubtitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar cabeçalho.');
      if (data.section) setSection(data.section);
      setSuccessMsg('Configurações da seção salvas com sucesso!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleUpdateVideoItem(item: HomeVideoItem, patch: Partial<HomeVideoItem>) {
    setSavingItemId(item.id);
    setError('');
    try {
      const res = await fetch('/api/admin/home-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_video',
          id: item.id,
          title: patch.title !== undefined ? patch.title : item.title,
          subtitle: patch.subtitle !== undefined ? patch.subtitle : item.subtitle,
          published: patch.published !== undefined ? patch.published : item.published,
          displayOrder: patch.displayOrder !== undefined ? patch.displayOrder : item.displayOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar vídeo.');
      if (data.section) setSection(data.section);
      setSuccessMsg('Vídeo atualizado!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar vídeo.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleDeleteVideoItem(id: string) {
    if (!confirm('Deseja remover este vídeo da Home e do Cloudflare?')) return;
    setSavingItemId(id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/home-video?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao remover vídeo.');
      if (data.section) setSection(data.section);
      setSuccessMsg('Vídeo removido com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover vídeo.');
    } finally {
      setSavingItemId(null);
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
              Sessões & Reels na Home Pública
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', opacity: 0.9 }}>
              Envie vídeos em formato Reels (9:16 sem bordas pretas) das sessões e atendimentos para compartilhar na Home.
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
          Ver na Home Pública
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

      {/* Grid Superior: Adicionar Novo Reel + Configurações da Seção */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Card 1: Adicionar Novo Vídeo / Reel */}
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} style={{ color: '#245d80' }} />
              Adicionar Vídeo de Sessão (Reels)
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 999,
                background: '#eff6ff',
                color: '#1d4ed8',
              }}
            >
              Formato 9:16 Sem Bordas
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            <input
              type="text"
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              placeholder="Título opcional do vídeo (ex: Sessão com Luiz, Atendimento Hipnose...)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
              }}
            />
            <input
              type="text"
              value={newVideoSubtitle}
              onChange={(e) => setNewVideoSubtitle(e.target.value)}
              placeholder="Descrição curta opcional (ex: Relato após a sessão)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
              }}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
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
                width: 52,
                height: 52,
                borderRadius: 16,
                background: '#245d80',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
                boxShadow: '0 6px 16px rgba(36, 93, 128, 0.24)',
              }}
            >
              <Upload size={24} />
            </div>

            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
              {uploading
                ? 'Enviando vídeo para o Cloudflare...'
                : 'Toque aqui para escolher 1 ou mais vídeos do Celular / PC'}
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              O vídeo entra automaticamente na galeria de Reels da Home sem bordas pretas.
            </p>

            {uploading && (
              <div style={{ marginTop: 14, textAlign: 'left' }}>
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
        </div>

        {/* Card 2: Título da Seção e Visibilidade na Home */}
        <form
          onSubmit={handleSaveSectionSettings}
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#b8860b' }} />
            Cabeçalho da Seção na Home
          </div>

          <div
            onClick={() => setSection((prev) => ({ ...prev, enabled: !prev.enabled }))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 12,
              border: section.enabled ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
              background: section.enabled ? '#f0fdf4' : '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {section.enabled ? (
                <Eye size={18} style={{ color: '#16a34a' }} />
              ) : (
                <EyeOff size={18} style={{ color: '#64748b' }} />
              )}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                  {section.enabled ? 'Seção de Sessões Visível na Home' : 'Seção Oculta na Home'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {section.enabled
                    ? 'Os vídeos ativos aparecem na página inicial para os clientes.'
                    : 'A seção está oculta temporariamente.'}
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={section.enabled}
              onChange={(e) => setSection((prev) => ({ ...prev, enabled: e.target.checked }))}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 18, height: 18, accentColor: '#16a34a' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              Título da Seção
            </label>
            <input
              type="text"
              value={section.sectionTitle}
              onChange={(e) => setSection((prev) => ({ ...prev, sectionTitle: e.target.value }))}
              placeholder="Ex: Sessões & Atendimentos Reais"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              Subtítulo da Seção
            </label>
            <input
              type="text"
              value={section.sectionSubtitle}
              onChange={(e) => setSection((prev) => ({ ...prev, sectionSubtitle: e.target.value }))}
              placeholder="Ex: Assista a registros reais de sessões na clínica"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: 11,
              border: 'none',
              background: '#245d80',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: savingSettings ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {savingSettings ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} />
                Salvar Cabeçalho
              </>
            )}
          </button>
        </form>
      </div>

      {/* Lista / Galeria de Reels Cadastrados (Prévia Real 9:16 sem bordas pretas) */}
      <div
        style={{
          background: '#0d2232',
          borderRadius: 20,
          padding: 22,
          color: '#fff',
          border: '1px solid rgba(229, 200, 142, 0.28)',
          boxShadow: '0 14px 34px rgba(10, 26, 39, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 18,
            paddingBottom: 12,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: '#e5c88e',
              }}
            >
              Galeria de Sessões Publicadas ({section.videos.length}{' '}
              {section.videos.length === 1 ? 'vídeo' : 'vídeos'})
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
              {section.sectionTitle || 'Sessões & Atendimentos Reais'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid rgba(229, 200, 142, 0.45)',
              background: 'rgba(229, 200, 142, 0.15)',
              color: '#e5c88e',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            Enviar Mais Vídeos
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#cbd5e1' }}>
            Carregando vídeos...
          </div>
        ) : section.videos.length === 0 ? (
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              borderRadius: 16,
              padding: '44px 20px',
              background: 'rgba(255,255,255,0.04)',
              border: '1.5px dashed rgba(229, 200, 142, 0.4)',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(229, 200, 142, 0.18)',
                color: '#e5c88e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <Play size={22} fill="currentColor" />
            </div>
            <div style={{ fontWeight: 800, fontSize: '0.96rem', marginBottom: 4 }}>
              Nenhum vídeo de sessão enviado ainda
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)' }}>
              Toque aqui para enviar o primeiro Reel de atendimento.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 18,
            }}
          >
            {section.videos.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.97)',
                  borderRadius: 18,
                  padding: 12,
                  color: '#0f172a',
                  border: item.published
                    ? '1.5px solid rgba(229, 200, 142, 0.65)'
                    : '1.5px solid rgba(148, 163, 184, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  opacity: item.published ? 1 : 0.75,
                }}
              >
                {/* Frame 9:16 Puro de Reels — SEM BORDAS PRETAS */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '9 / 16',
                    borderRadius: 14,
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#0d2232',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                  }}
                >
                  <video
                    src={item.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: 'rgba(13, 34, 50, 0.82)',
                      color: '#e5c88e',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      backdropFilter: 'blur(6px)',
                      pointerEvents: 'none',
                    }}
                  >
                    Reel #{idx + 1}
                  </span>
                </div>

                {/* Edição rápida de Título / Legenda do Reel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSection((prev) => ({
                        ...prev,
                        videos: prev.videos.map((v) => (v.id === item.id ? { ...v, title: val } : v)),
                      }));
                    }}
                    onBlur={() => handleUpdateVideoItem(item, { title: item.title })}
                    placeholder="Título da sessão (opcional)"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  />
                  <input
                    type="text"
                    value={item.subtitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSection((prev) => ({
                        ...prev,
                        videos: prev.videos.map((v) =>
                          v.id === item.id ? { ...v, subtitle: val } : v
                        ),
                      }));
                    }}
                    onBlur={() => handleUpdateVideoItem(item, { subtitle: item.subtitle })}
                    placeholder="Descrição / relato (opcional)"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: '0.76rem',
                      color: '#475569',
                    }}
                  />
                </div>

                {/* Botões de Ação do Reel */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingTop: 4,
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <button
                    type="button"
                    disabled={savingItemId === item.id}
                    onClick={() => handleUpdateVideoItem(item, { published: !item.published })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: item.published ? '1px solid #86efac' : '1px solid #cbd5e1',
                      background: item.published ? '#f0fdf4' : '#f8fafc',
                      color: item.published ? '#166534' : '#64748b',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {item.published ? <Eye size={13} /> : <EyeOff size={13} />}
                    {item.published ? 'Visível na Home' : 'Oculto'}
                  </button>

                  <button
                    type="button"
                    disabled={savingItemId === item.id}
                    onClick={() => handleDeleteVideoItem(item.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
