'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  NotebookPen,
  Folder,
  FolderPlus,
  Plus,
  Search,
  Pin,
  PinOff,
  Image as ImageIcon,
  FileText,
  Trash2,
  Edit3,
  Copy,
  Check,
  Download,
  X,
  Eye,
  LayoutGrid,
  List,
  Sparkles,
  Brain,
  Book,
  Heart,
  Star,
  Tag,
  Paperclip,
  Share2,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  Palette,
  RefreshCw,
} from 'lucide-react';
import type { NoteItem, NoteFolder, NoteAttachment } from '@/lib/notes-repository';
import { uploadImageToStorage, getSafeFileUrl } from '@/lib/image-storage';
import { uploadDocumentToR2Api } from '@/lib/document-upload-client';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

// Ícones disponíveis para as pastas
const FOLDER_ICONS: Record<string, typeof Folder> = {
  folder: Folder,
  brain: Brain,
  sparkles: Sparkles,
  book: Book,
  heart: Heart,
  star: Star,
  file: FileText,
};

// Paleta de cores para pastas
const FOLDER_COLORS = [
  { label: 'Verde Petróleo', value: '#0f766e' },
  { label: 'Azul Sereno', value: '#1e40af' },
  { label: 'Âmbar Dourado', value: '#b45309' },
  { label: 'Roxo Terapêutico', value: '#7c3aed' },
  { label: 'Rosa Suave', value: '#be185d' },
  { label: 'Ardósia Neutro', value: '#334155' },
  { label: 'Esmeralda', value: '#059669' },
];

// Cores de fundo para os cards de anotações
const NOTE_BG_COLORS = [
  { label: 'Branco', value: '#ffffff', border: '#e2e8f0' },
  { label: 'Menta', value: '#f0fdf4', border: '#bbf7d0' },
  { label: 'Âmbar Suave', value: '#fefce8', border: '#fef08a' },
  { label: 'Azul Claro', value: '#eff6ff', border: '#bfdbfe' },
  { label: 'Lavanda', value: '#faf5ff', border: '#e9d5ff' },
  { label: 'Pêssego', value: '#fff7ed', border: '#fed7aa' },
];

// Paleta completa estendida para o modal de paleta de cores
const EXTENDED_NOTE_COLORS = [
  // Neutros & Clássicos
  { label: 'Branco Puro', value: '#ffffff', border: '#cbd5e1' },
  { label: 'Cinza Suave', value: '#f8fafc', border: '#cbd5e1' },
  { label: 'Areia / Linho', value: '#f5f5f4', border: '#d6d3d1' },
  { label: 'Bege Suave', value: '#fafaf9', border: '#e7e5e4' },
  // Verdes & Menta
  { label: 'Menta Relaxante', value: '#f0fdf4', border: '#86efac' },
  { label: 'Esmeralda Suave', value: '#ecfdf5', border: '#6ee7b7' },
  { label: 'Sálvia / Chá', value: '#f7fee7', border: '#bef264' },
  // Azuis & Turquesa
  { label: 'Azul Sereno', value: '#eff6ff', border: '#93c5fd' },
  { label: 'Céu Claro', value: '#f0f9ff', border: '#7dd3fc' },
  { label: 'Turquesa Suave', value: '#ecfeff', border: '#67e8f9' },
  // Lavandas & Lilás
  { label: 'Lavanda Floral', value: '#faf5ff', border: '#d8b4fe' },
  { label: 'Lilás Calmo', value: '#f5f3ff', border: '#c4b5fd' },
  { label: 'Ametista Claro', value: '#fdf4ff', border: '#f0abfc' },
  // Quentes, Pêssego & Rosé
  { label: 'Âmbar Solar', value: '#fefce8', border: '#fde047' },
  { label: 'Pêssego Suave', value: '#fff7ed', border: '#fdba74' },
  { label: 'Rosé / Blush', value: '#fff1f2', border: '#fda4af' },
  { label: 'Salmão Suave', value: '#fef2f2', border: '#fca5a5' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AnotacoesPage() {
  const initialCachedNotes = getInstantCache<NoteItem[]>('admin_notes', []);
  const initialCachedFolders = getInstantCache<NoteFolder[]>('admin_folders', []);
  const [notes, setNotes] = useState<NoteItem[]>(() => initialCachedNotes);
  const [folders, setFolders] = useState<NoteFolder[]>(() => initialCachedFolders);
  const [loading, setLoading] = useState(() => initialCachedNotes.length === 0 && initialCachedFolders.length === 0);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Filtros & busca
  const [selectedFolderId, setSelectedFolderId] = useState<string | 'all' | 'pinned' | 'none'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modais
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);

  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<NoteItem | null>(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<NoteFolder | null>(null);
  const [deleteFolderWithNotes, setDeleteFolderWithNotes] = useState(false);

  // Visualização e Lightbox
  const [viewingNote, setViewingNote] = useState<NoteItem | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  // Form states da anotação
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFolderId, setFormFolderId] = useState<string>('');
  const [formColor, setFormColor] = useState('#ffffff');
  const [colorPickerModalOpen, setColorPickerModalOpen] = useState(false);
  const [tempCustomColor, setTempCustomColor] = useState('#ffffff');
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [formAttachments, setFormAttachments] = useState<NoteAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Form states da pasta
  const [folderFormName, setFolderFormName] = useState('');
  const [folderFormColor, setFolderFormColor] = useState('#0f766e');
  const [folderFormIcon, setFolderFormIcon] = useState('folder');
  const [savingFolder, setSavingFolder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }

  // Carregar anotações e pastas
  async function loadData() {
    try {
      if (notes.length === 0 && folders.length === 0) {
        setLoading(true);
      }
      const res = await fetch('/api/admin/notes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar dados');
      const incomingNotes: NoteItem[] = data.notes || [];
      const incomingFolders: NoteFolder[] = data.folders || [];
      setNotes(incomingNotes);
      setFolders(incomingFolders);
      setInstantCache('admin_notes', incomingNotes);
      setInstantCache('admin_folders', incomingFolders);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar anotações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Abrir modal de criação de anotação
  function handleOpenCreateNote(targetFolderId?: string) {
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormFolderId(
      targetFolderId !== undefined
        ? targetFolderId
        : selectedFolderId !== 'all' && selectedFolderId !== 'pinned' && selectedFolderId !== 'none'
        ? selectedFolderId
        : ''
    );
    setFormColor('#ffffff');
    setFormIsPinned(selectedFolderId === 'pinned');
    setFormTags([]);
    setTagInput('');
    setFormAttachments([]);
    setNoteModalOpen(true);
  }

  // Abrir modal de edição de anotação
  function handleOpenEditNote(note: NoteItem) {
    setEditingNote(note);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormFolderId(note.folderId || '');
    setFormColor(note.color || '#ffffff');
    setFormIsPinned(note.isPinned);
    setFormTags(note.tags || []);
    setTagInput('');
    setFormAttachments(note.attachments || []);
    setNoteModalOpen(true);
  }

  // Abrir modal de criação/edição de pasta
  function handleOpenFolderModal(folder?: NoteFolder) {
    if (folder) {
      setEditingFolder(folder);
      setFolderFormName(folder.name);
      setFolderFormColor(folder.color || '#0f766e');
      setFolderFormIcon(folder.icon || 'folder');
    } else {
      setEditingFolder(null);
      setFolderFormName('');
      setFolderFormColor('#0f766e');
      setFolderFormIcon('folder');
    }
    setFolderModalOpen(true);
  }

  // Processar upload de arquivos — Imagens vão direto para Supabase Storage (comprimidas)
  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    setUploadStatusMsg('Processando arquivos...');

    try {
      const newAttachments: NoteAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Se for imagem, comprime automaticamente no navegador e salva no Supabase Storage
        if (file.type.startsWith('image/')) {
          setUploadStatusMsg(`Otimizando foto ${i + 1} de ${files.length}...`);
          try {
            const { url, sizeAfter, sizeBefore } = await uploadImageToStorage(file, 'anotacoes');
            const reduction = Math.round((1 - sizeAfter / sizeBefore) * 100);
            console.log(
              `Foto "${file.name}" comprimida e salva no Storage: ${Math.round(sizeBefore / 1024)}KB -> ${Math.round(sizeAfter / 1024)}KB (-${reduction}%)`
            );

            newAttachments.push({
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              mimeType: 'image/jpeg',
              size: sizeAfter,
              data: url,
              createdAt: new Date().toISOString(),
            });
            continue;
          } catch (storageErr) {
            console.error('Falha no upload para o storage:', storageErr);
            alert(`Erro ao enviar foto "${file.name}" para o storage. Verifique sua conexão.`);
            continue;
          }
        }

        // Para outros documentos (PDF, Docx etc) -> Envia direto para Cloudflare R2
        setUploadStatusMsg(`Enviando documento ${i + 1} de ${files.length} para o Cloudflare R2...`);
        try {
          const docRes = await uploadDocumentToR2Api(file, 'anotacoes');
          newAttachments.push({
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            mimeType: docRes.mimeType,
            size: docRes.size,
            data: docRes.url,
            createdAt: new Date().toISOString(),
          });
        } catch (r2Err) {
          console.error('Falha no upload para Cloudflare R2:', r2Err);
          alert(`Erro ao enviar documento "${file.name}" para o Cloudflare R2. Verifique sua conexão.`);
        }
      }

      setFormAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      alert('Erro ao processar anexos: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingFiles(false);
      setUploadStatusMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(id: string) {
    setFormAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleAddTag() {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags((prev) => [...prev, trimmed]);
      setTagInput('');
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setFormTags((prev) => prev.filter((t) => t !== tagToRemove));
  }

  // Salvar Anotação (Criar ou Atualizar)
  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Por favor, informe o título da anotação.');
      return;
    }

    setSavingNote(true);
    try {
      const payload = {
        title: formTitle.trim(),
        content: formContent,
        folderId: formFolderId || null,
        color: formColor,
        isPinned: formIsPinned,
        tags: formTags,
        attachments: formAttachments,
      };

      let res: Response;
      if (editingNote) {
        res = await fetch(`/api/admin/notes/${editingNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar anotação');

      showToast(editingNote ? 'Anotação atualizada com sucesso!' : 'Anotação criada com sucesso!');
      setNoteModalOpen(false);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingNote(false);
    }
  }

  // Salvar Pasta (Criar ou Atualizar)
  async function handleSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderFormName.trim()) {
      alert('Informe o nome da pasta.');
      return;
    }

    setSavingFolder(true);
    try {
      const payload = {
        name: folderFormName.trim(),
        color: folderFormColor,
        icon: folderFormIcon,
      };

      let res: Response;
      if (editingFolder) {
        res = await fetch(`/api/admin/notes/folders/${editingFolder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/notes/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar pasta');

      showToast(editingFolder ? 'Pasta atualizada!' : 'Nova pasta criada com sucesso!');
      setFolderModalOpen(false);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar pasta');
    } finally {
      setSavingFolder(false);
    }
  }

  // Excluir Anotação
  async function handleDeleteNote(id: string) {
    try {
      const res = await fetch(`/api/admin/notes/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir');

      showToast('Anotação excluída.');
      setDeleteNoteConfirm(null);
      if (viewingNote?.id === id) setViewingNote(null);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  }

  // Excluir Pasta
  async function handleDeleteFolder(id: string, deleteNotes: boolean) {
    try {
      const res = await fetch(`/api/admin/notes/folders/${id}?deleteNotes=${deleteNotes}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir pasta');

      showToast('Pasta removida.');
      setDeleteFolderConfirm(null);
      if (selectedFolderId === id) setSelectedFolderId('all');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir pasta');
    }
  }

  // Fixar / Desafixar
  async function handleTogglePin(note: NoteItem) {
    try {
      const res = await fetch(`/api/admin/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ togglePin: true }),
      });
      if (!res.ok) throw new Error('Erro ao alterar fixação');

      showToast(note.isPinned ? 'Anotação desafixada.' : 'Anotação fixada no topo! 📌');
      loadData();
    } catch {
      alert('Erro ao alterar fixação');
    }
  }

  // Copiar conteúdo da anotação
  function handleCopyNote(note: NoteItem) {
    const text = `${note.title.toUpperCase()}\n\n${note.content}`;
    navigator.clipboard.writeText(text);
    showToast('Texto copiado para a área de transferência! 📋');
  }

  // Compartilhar no WhatsApp
  function handleShareWhatsApp(note: NoteItem) {
    const text = encodeURIComponent(`*${note.title.toUpperCase()}*\n\n${note.content}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }

  // Filtragem de anotações
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Filtro de pasta
      if (selectedFolderId === 'pinned' && !n.isPinned) return false;
      if (selectedFolderId === 'none' && n.folderId !== null) return false;
      if (
        selectedFolderId !== 'all' &&
        selectedFolderId !== 'pinned' &&
        selectedFolderId !== 'none' &&
        n.folderId !== selectedFolderId
      ) {
        return false;
      }

      // Filtro de busca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = n.title.toLowerCase().includes(q);
        const matchContent = n.content.toLowerCase().includes(q);
        const matchTags = (n.tags || []).some((t) => t.toLowerCase().includes(q));
        const matchFolder = (n.folderName || '').toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchTags && !matchFolder) return false;
      }

      return true;
    });
  }, [notes, selectedFolderId, searchQuery]);

  // Separação de notas fixadas e comuns
  const pinnedNotes = useMemo(() => {
    return filteredNotes.filter((n) => n.isPinned);
  }, [filteredNotes]);

  const unpinnedNotes = useMemo(() => {
    return filteredNotes.filter((n) => !n.isPinned);
  }, [filteredNotes]);

  // Totais para os cards de estatísticas
  const totalNotesCount = notes.length;
  const totalFoldersCount = folders.length;
  const pinnedNotesCount = notes.filter((n) => n.isPinned).length;
  const totalAttachmentsCount = notes.reduce(
    (acc, n) => acc + (n.attachments ? n.attachments.length : 0),
    0
  );

  const activeFolder = folders.find((f) => f.id === selectedFolderId);

  function renderNoteCard(note: NoteItem) {
    const photoAttachments = (note.attachments || []).filter((a) =>
      a.mimeType.startsWith('image/')
    );
    const docAttachments = (note.attachments || []).filter(
      (a) => !a.mimeType.startsWith('image/')
    );

    return (
      <div
        key={note.id}
        className="note-card"
        style={{
          backgroundColor: note.color || '#ffffff',
          borderTop: note.folderColor ? `4px solid ${note.folderColor}` : undefined,
        }}
        onClick={() => setViewingNote(note)}
      >
        <div>
          <div className="note-card-top">
            {note.folderName ? (
              <span
                className="note-folder-badge"
                style={{ backgroundColor: note.folderColor || '#0f766e' }}
              >
                <Folder size={11} /> {note.folderName}
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Sem pasta</span>
            )}

            <button
              type="button"
              className={`btn-pin ${note.isPinned ? 'is-pinned' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePin(note);
              }}
              title={note.isPinned ? 'Desafixar nota' : 'Fixar nota no topo'}
            >
              {note.isPinned ? <Pin size={17} /> : <PinOff size={17} />}
            </button>
          </div>

          <h3 className="note-title" style={{ marginTop: '10px' }}>
            {note.title}
          </h3>

          {note.content && (
            <div className="note-content-preview" style={{ marginTop: '8px' }}>
              {note.content}
            </div>
          )}
        </div>

        {/* ANEXOS & TAGS */}
        <div>
          {/* Fotos */}
          {photoAttachments.length > 0 && (
            <div className="note-attachments-strip">
              <div className="note-photos-mini-grid">
                {photoAttachments.slice(0, 3).map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="note-photo-thumb"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxImage({ url: photo.data, name: photo.name });
                    }}
                  >
                    <img src={photo.data} alt={photo.name} />
                    {idx === 2 && photoAttachments.length > 3 && (
                      <div className="note-photo-more-badge">
                        +{photoAttachments.length - 2}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos */}
          {docAttachments.length > 0 && (
            <div className="note-attachments-strip" style={{ marginTop: '6px' }}>
              <div className="note-docs-chips">
                {docAttachments.slice(0, 2).map((doc) => (
                  <span key={doc.id} className="note-doc-chip" title={doc.name}>
                    <FileText size={11} />
                    <span>{doc.name}</span>
                    <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                      ({formatFileSize(doc.size)})
                    </span>
                  </span>
                ))}
                {docAttachments.length > 2 && (
                  <span className="note-doc-chip" style={{ background: '#e2e8f0' }}>
                    +{docAttachments.length - 2} doc(s)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <div className="note-tags-row" style={{ marginTop: '8px' }}>
              {note.tags.map((t) => (
                <span key={t} className="note-tag-pill">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Rodapé */}
          <div className="note-card-footer">
            <span className="note-date">{formatDate(note.updatedAt)}</span>
            <div className="note-actions-btns" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn-note-action"
                onClick={() => handleCopyNote(note)}
                title="Copiar texto"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="btn-note-action"
                onClick={() => handleShareWhatsApp(note)}
                title="Enviar pelo WhatsApp"
                style={{ color: '#16a34a' }}
              >
                <WhatsappIcon size={15} />
              </button>
              <button
                type="button"
                className="btn-note-action"
                onClick={() => handleOpenEditNote(note)}
                title="Editar anotação"
              >
                <Edit3 size={14} />
              </button>
              <button
                type="button"
                className="btn-note-action"
                onClick={() => setDeleteNoteConfirm(note)}
                title="Excluir anotação"
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderNoteListRow(note: NoteItem) {
    const totalAtt = (note.attachments || []).length;
    return (
      <div
        key={note.id}
        className="note-list-row"
        style={{ borderLeft: note.folderColor ? `4px solid ${note.folderColor}` : undefined }}
        onClick={() => setViewingNote(note)}
      >
        <div className="note-list-main">
          <button
            type="button"
            className={`btn-pin ${note.isPinned ? 'is-pinned' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(note);
            }}
            title={note.isPinned ? 'Desafixar nota' : 'Fixar nota no topo'}
          >
            {note.isPinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>

          <div style={{ minWidth: 0 }}>
            <div className="note-list-title">{note.title}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
              {note.folderName && (
                <span
                  className="note-folder-badge"
                  style={{
                    backgroundColor: note.folderColor || '#0f766e',
                    padding: '1px 6px',
                    fontSize: '0.68rem',
                  }}
                >
                  {note.folderName}
                </span>
              )}
              {totalAtt > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Paperclip size={11} /> {totalAtt} anexo(s)
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {formatDate(note.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="note-actions-btns" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-note-action"
            onClick={() => handleCopyNote(note)}
            title="Copiar texto"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            className="btn-note-action"
            onClick={() => handleOpenEditNote(note)}
            title="Editar anotação"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            className="btn-note-action"
            onClick={() => setDeleteNoteConfirm(note)}
            title="Excluir anotação"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .notes-page {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding-bottom: 60px;
        }

        /* Top Header */
        .notes-header-card {
          background: linear-gradient(135deg, #1a3a4a 0%, #0f2530 100%);
          color: #ffffff;
          padding: 24px;
          border-radius: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          box-shadow: 0 10px 25px -5px rgba(26, 58, 74, 0.25);
        }

        .notes-header-title-group h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 6px 0;
        }

        .notes-header-title-group p {
          color: #94a3b8;
          font-size: 0.9rem;
          margin: 0;
          max-width: 580px;
          line-height: 1.4;
        }

        .notes-header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* Stats Bar */
        .notes-stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .stat-mini-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .stat-mini-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .stat-mini-info .stat-value {
          font-size: 1.35rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.1;
        }

        .stat-mini-info .stat-label {
          font-size: 0.76rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        /* Toolbar & Search */
        .notes-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          background: #ffffff;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .notes-search-box {
          position: relative;
          flex: 1;
          min-width: 240px;
        }

        .notes-search-box svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .notes-search-input {
          width: 100%;
          padding: 9px 36px 9px 38px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.88rem;
          color: #1e293b;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .notes-search-input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.15);
        }

        .notes-search-clear {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
        }

        .view-mode-toggle {
          display: flex;
          background: #f1f5f9;
          padding: 3px;
          border-radius: 8px;
        }

        .view-mode-btn {
          padding: 6px 10px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          transition: all 0.15s ease;
        }

        .view-mode-btn.active {
          background: #ffffff;
          color: #0f766e;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        /* Folders Scroll / Tabs Bar (100% responsivo) */
        .folders-scroll-container {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding: 4px 2px 10px 2px;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }

        .folder-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          border: 1.5px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          transition: all 0.15s ease;
          user-select: none;
          flex-shrink: 0;
        }

        .folder-pill:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .folder-pill.active {
          background: #1a3a4a;
          color: #ffffff;
          border-color: #1a3a4a;
          box-shadow: 0 2px 8px rgba(26, 58, 74, 0.25);
        }

        .folder-pill .folder-count {
          padding: 1px 7px;
          border-radius: 10px;
          font-size: 0.72rem;
          font-weight: 700;
          background: rgba(0, 0, 0, 0.08);
          color: inherit;
        }

        .folder-pill.active .folder-count {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }

        .btn-new-folder-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          border: 1.5px dashed #0f766e;
          background: rgba(15, 118, 110, 0.05);
          color: #0f766e;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        .btn-new-folder-pill:hover {
          background: rgba(15, 118, 110, 0.12);
        }

        /* Active Folder Banner */
        .active-folder-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #0f766e;
          border-radius: 10px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .active-folder-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .active-folder-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.95rem;
          font-weight: 700;
          color: #1e293b;
        }

        .active-folder-actions {
          display: flex;
          gap: 8px;
        }

        /* Section Titles */
        .notes-section-title {
          font-size: 0.88rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 12px 0 8px 0;
        }

        /* Notes Grid */
        .notes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 16px;
        }

        .note-card {
          border-radius: 14px;
          padding: 18px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          cursor: pointer;
        }

        .note-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 18px -4px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }

        .note-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }

        .note-folder-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          color: #ffffff;
        }

        .btn-pin {
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          padding: 4px;
          border-radius: 6px;
          display: grid;
          place-items: center;
          transition: color 0.15s ease;
        }

        .btn-pin:hover, .btn-pin.is-pinned {
          color: #b45309;
        }

        .note-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.3;
        }

        .note-content-preview {
          font-size: 0.85rem;
          color: #334155;
          line-height: 1.5;
          white-space: pre-line;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Attachments Previews */
        .note-attachments-strip {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 4px;
        }

        .note-photos-mini-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }

        .note-photo-thumb {
          position: relative;
          aspect-ratio: 16/10;
          border-radius: 6px;
          overflow: hidden;
          background: #e2e8f0;
          border: 1px solid rgba(0,0,0,0.06);
        }

        .note-photo-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .note-photo-more-badge {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          color: #ffffff;
          display: grid;
          place-items: center;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .note-docs-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .note-doc-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(0,0,0,0.04);
          border: 1px solid rgba(0,0,0,0.06);
          font-size: 0.72rem;
          font-weight: 600;
          color: #475569;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Tags */
        .note-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .note-tag-pill {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(0,0,0,0.05);
          color: #475569;
        }

        /* Card Footer */
        .note-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border-top: 1px solid rgba(0,0,0,0.06);
          padding-top: 10px;
          margin-top: 4px;
        }

        .note-date {
          font-size: 0.72rem;
          color: #64748b;
        }

        .note-actions-btns {
          display: flex;
          gap: 4px;
        }

        .btn-note-action {
          background: none;
          border: none;
          padding: 5px;
          border-radius: 6px;
          cursor: pointer;
          color: #64748b;
          display: grid;
          place-items: center;
          transition: all 0.15s ease;
        }

        .btn-note-action:hover {
          background: rgba(0,0,0,0.06);
          color: #0f172a;
        }

        /* List Mode View */
        .notes-list-view {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .note-list-row {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          transition: all 0.15s ease;
          cursor: pointer;
        }

        .note-list-row:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .note-list-main {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .note-list-title {
          font-weight: 700;
          color: #0f172a;
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Modal Overlays & Form Proporcionais */
        .notes-editor-modal {
          width: min(860px, 95vw) !important;
          max-width: 860px !important;
          max-height: min(92vh, 880px) !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          border-radius: 18px !important;
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.35) !important;
        }

        .notes-editor-form {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: calc(min(92vh, 880px) - 2px);
          overflow: hidden;
        }

        .notes-editor-header {
          flex-shrink: 0;
          padding: 18px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
        }

        .notes-editor-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #ffffff;
        }

        .notes-editor-footer {
          flex-shrink: 0;
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .notes-form-meta-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr;
          gap: 16px;
          align-items: flex-end;
        }

        .notes-pin-card {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.86rem;
          font-weight: 600;
          color: #475569;
          background: #ffffff;
          transition: all 0.15s ease;
          height: 42px;
        }

        .notes-pin-card.is-pinned {
          background: #fefce8;
          border-color: #f59e0b;
          color: #b45309;
        }

        .notes-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1.25fr;
          gap: 16px;
          align-items: flex-start;
        }

        .color-palette-picker {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .color-dot-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          display: grid;
          place-items: center;
          transition: transform 0.1s ease;
        }

        .color-dot-btn:hover {
          transform: scale(1.1);
        }

        .color-dot-btn.selected {
          border-color: #0f766e;
          box-shadow: 0 0 0 2px #ffffff inset;
        }

        .attachment-item-preview {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          gap: 10px;
        }

        .attachment-preview-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .attachment-thumb-box {
          width: 38px;
          height: 38px;
          border-radius: 6px;
          overflow: hidden;
          background: #e2e8f0;
          flex-shrink: 0;
          display: grid;
          place-items: center;
        }

        .attachment-thumb-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Lightbox Fullscreen */
        .lightbox-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.88);
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 20px;
        }

        .lightbox-img {
          max-width: 90vw;
          max-height: 85vh;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .lightbox-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: #ffffff;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
        }

        .lightbox-download-btn {
          position: absolute;
          bottom: 20px;
          background: #ffffff;
          color: #0f172a;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Toast */
        .notes-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #1a3a4a;
          color: #ffffff;
          padding: 12px 20px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
          z-index: 999;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: slideUp 0.2s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (max-width: 768px) {
          .notes-header-card {
            padding: 18px;
          }
          .notes-header-title-group h1 {
            font-size: 1.3rem;
          }
          .notes-header-actions {
            width: 100%;
          }
          .notes-header-actions .btn {
            flex: 1;
            justify-content: center;
          }
          .notes-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="notes-page">
        {/* TOAST DE FEEDBACK */}
        {toastMessage && (
          <div className="notes-toast">
            <Check size={18} style={{ color: '#4ade80' }} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* HEADER PRINCIPAL */}
        <div className="notes-header-card">
          <div className="notes-header-title-group">
            <h1>
              <NotebookPen size={26} style={{ color: '#cbd5e1' }} />
              Anotações & Caderno da Clínica
            </h1>
            <p>
              Crie pastas, registre roteiros e protocolos de hipnose, ideias, checklists e anexe fotos e documentos com facilidade.
            </p>
          </div>
          <div className="notes-header-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleOpenFolderModal()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FolderPlus size={16} /> Nova Pasta
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenCreateNote()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={18} /> Nova Anotação
            </button>
          </div>
        </div>

        {/* STATS RÁPIDOS */}
        <div className="notes-stats-row">
          <div className="stat-mini-card">
            <div className="stat-mini-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <NotebookPen size={20} />
            </div>
            <div className="stat-mini-info">
              <div className="stat-value">{totalNotesCount}</div>
              <div className="stat-label">Anotações</div>
            </div>
          </div>

          <div className="stat-mini-card">
            <div className="stat-mini-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Folder size={20} />
            </div>
            <div className="stat-mini-info">
              <div className="stat-value">{totalFoldersCount}</div>
              <div className="stat-label">Pastas Ativas</div>
            </div>
          </div>

          <div className="stat-mini-card">
            <div className="stat-mini-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
              <Pin size={20} />
            </div>
            <div className="stat-mini-info">
              <div className="stat-value">{pinnedNotesCount}</div>
              <div className="stat-label">Fixadas no Topo</div>
            </div>
          </div>

          <div className="stat-mini-card">
            <div className="stat-mini-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
              <Paperclip size={20} />
            </div>
            <div className="stat-mini-info">
              <div className="stat-value">{totalAttachmentsCount}</div>
              <div className="stat-label">Fotos & Documentos</div>
            </div>
          </div>
        </div>

        {/* BARRA DE PASTAS (SCROLL HORIZONTAL TOUCH-FRIENDLY NO MOBILE E PC) */}
        <div>
          <div className="folders-scroll-container">
            <button
              type="button"
              className={`folder-pill ${selectedFolderId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedFolderId('all')}
            >
              <Layers size={15} />
              <span>Todas as Notas</span>
              <span className="folder-count">{totalNotesCount}</span>
            </button>

            <button
              type="button"
              className={`folder-pill ${selectedFolderId === 'pinned' ? 'active' : ''}`}
              onClick={() => setSelectedFolderId('pinned')}
            >
              <Pin size={15} />
              <span>Fixadas</span>
              <span className="folder-count">{pinnedNotesCount}</span>
            </button>

            {folders.map((folder) => {
              const IconComp = FOLDER_ICONS[folder.icon] || Folder;
              const isActive = selectedFolderId === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`folder-pill ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{
                    borderLeftColor: folder.color,
                    borderLeftWidth: '3px',
                  }}
                >
                  <IconComp size={15} style={{ color: isActive ? '#ffffff' : folder.color }} />
                  <span>{folder.name}</span>
                  <span className="folder-count">{folder.noteCount || 0}</span>
                </button>
              );
            })}

            <button
              type="button"
              className={`folder-pill ${selectedFolderId === 'none' ? 'active' : ''}`}
              onClick={() => setSelectedFolderId('none')}
            >
              <FileText size={15} />
              <span>Sem Pasta</span>
            </button>

            <button
              type="button"
              className="btn-new-folder-pill"
              onClick={() => handleOpenFolderModal()}
              title="Criar nova pasta de anotações"
            >
              <Plus size={15} />
              <span>Nova Pasta</span>
            </button>
          </div>
        </div>

        {/* BANNER DA PASTA ATIVA COM AÇÕES */}
        {activeFolder && (
          <div className="active-folder-banner">
            <div className="active-folder-info">
              {(() => {
                const IconComp = FOLDER_ICONS[activeFolder.icon] || Folder;
                return <IconComp size={22} style={{ color: activeFolder.color }} />;
              })()}
              <div>
                <div className="active-folder-badge">{activeFolder.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {activeFolder.noteCount || 0} anotação(ões) nesta pasta
                </div>
              </div>
            </div>
            <div className="active-folder-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleOpenFolderModal(activeFolder)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Edit3 size={13} /> Editar Pasta
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDeleteFolderWithNotes(false);
                  setDeleteFolderConfirm(activeFolder);
                }}
                title="Excluir esta pasta"
                style={{ color: 'var(--color-danger)' }}
              >
                <Trash2 size={13} /> Excluir Pasta
              </button>
            </div>
          </div>
        )}

        {/* TOOLBAR COM BUSCA E MODO DE VISUALIZAÇÃO */}
        <div className="notes-toolbar">
          <div className="notes-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar no título, texto, tags ou pasta..."
              className="notes-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="notes-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Visualização em Grade de Cards"
            >
              <LayoutGrid size={15} /> Cards
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Visualização em Lista Compacta"
            >
              <List size={15} /> Lista
            </button>
          </div>
        </div>

        {/* ESTADO VAZIO OU ERRO */}
        {error && (
          <div className="form-alert form-alert-danger">
            <span>{error}</span>
          </div>
        )}

        {loading && notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <NotebookPen size={36} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p>Carregando anotações da clínica...</p>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1',
            }}
          >
            <NotebookPen size={44} style={{ margin: '0 auto 14px auto', color: '#94a3b8' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#1e293b', marginBottom: '6px' }}>
              Nenhuma anotação encontrada
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 18px auto' }}>
              {searchQuery
                ? `Nenhum resultado corresponde à busca "${searchQuery}". Tente outros termos.`
                : selectedFolderId !== 'all'
                ? 'Esta pasta ainda não possui anotações. Clique no botão abaixo para adicionar a primeira!'
                : 'Seu bloco de notas está pronto. Comece adicionando sua primeira anotação, roteiro ou ideia!'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenCreateNote()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> Criar Anotação Agora
            </button>
          </div>
        ) : (
          <>
            {/* NOTAS FIXADAS */}
            {pinnedNotes.length > 0 && selectedFolderId !== 'pinned' && (
              <div>
                <div className="notes-section-title">
                  <Pin size={14} style={{ color: '#b45309' }} />
                  Notas Fixadas no Topo ({pinnedNotes.length})
                </div>
                {viewMode === 'grid' ? (
                  <div className="notes-grid">
                    {pinnedNotes.map((note) => renderNoteCard(note))}
                  </div>
                ) : (
                  <div className="notes-list-view">
                    {pinnedNotes.map((note) => renderNoteListRow(note))}
                  </div>
                )}
              </div>
            )}

            {/* OUTRAS NOTAS */}
            {unpinnedNotes.length > 0 && (
              <div>
                {pinnedNotes.length > 0 && selectedFolderId !== 'pinned' && (
                  <div className="notes-section-title">
                    <NotebookPen size={14} />
                    Outras Anotações ({unpinnedNotes.length})
                  </div>
                )}
                {viewMode === 'grid' ? (
                  <div className="notes-grid">
                    {unpinnedNotes.map((note) => renderNoteCard(note))}
                  </div>
                ) : (
                  <div className="notes-list-view">
                    {unpinnedNotes.map((note) => renderNoteListRow(note))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR ANOTAÇÃO (PROPORCIONAL & ELEGANTE)
      ══════════════════════════════════════════════════════════════ */}
      {noteModalOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingNote) setNoteModalOpen(false);
          }}
        >
          <section className="modal notes-editor-modal" role="dialog" aria-modal="true">
            <form onSubmit={handleSaveNote} className="notes-editor-form">
              {/* Header Fixo */}
              <div className="notes-editor-header">
                <div>
                  <span className="eyebrow">{editingNote ? 'Editar' : 'Nova'}</span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    {editingNote ? 'Editar Anotação' : 'Criar Nova Anotação'}
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => setNoteModalOpen(false)}
                  disabled={savingNote}
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Corpo com Scroll Suave e Layout Balanceado */}
              <div className="notes-editor-body">
                {/* Linha 1: Título */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, color: '#1e293b' }}>
                    Título da Anotação *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Roteiro de Indução, Ideia para o Site, Protocolo..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    autoFocus
                    style={{ fontSize: '1rem', fontWeight: 600, padding: '10px 14px' }}
                  />
                </div>

                {/* Linha 2: Pasta Organizadora + Cor do Card + Fixar no Topo (3 Colunas no Desktop) */}
                <div className="notes-form-meta-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Pasta Organizadora</label>
                    <select
                      className="form-select"
                      value={formFolderId}
                      onChange={(e) => setFormFolderId(e.target.value)}
                      style={{ height: '42px' }}
                    >
                      <option value="">📂 Nenhuma (Sem pasta)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ margin: 0 }}>Cor do Card</label>
                      <button
                        type="button"
                        onClick={() => {
                          setTempCustomColor(formColor);
                          setColorPickerModalOpen(true);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#0f766e',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                        }}
                        title="Abrir paleta de cores completa e escolher qualquer tom"
                      >
                        <Palette size={13} /> Paleta Completa
                      </button>
                    </div>
                    <div className="color-palette-picker" style={{ minHeight: '42px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {NOTE_BG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`color-dot-btn ${formColor.toLowerCase() === c.value.toLowerCase() ? 'selected' : ''}`}
                          style={{
                            backgroundColor: c.value,
                            border: `1.5px solid ${c.border}`,
                            boxShadow: formColor.toLowerCase() === c.value.toLowerCase() ? '0 0 0 2px #0f766e' : '0 1px 3px rgba(0,0,0,0.08)',
                          }}
                          onClick={() => setFormColor(c.value)}
                          title={c.label}
                        >
                          {formColor.toLowerCase() === c.value.toLowerCase() && <Check size={14} style={{ color: '#0f766e' }} />}
                        </button>
                      ))}

                      {/* Se formColor for uma cor personalizada que não está nos 6 presets, exibe o círculo da cor ativa */}
                      {!NOTE_BG_COLORS.some((c) => c.value.toLowerCase() === formColor.toLowerCase()) && (
                        <button
                          type="button"
                          className="color-dot-btn selected"
                          style={{
                            backgroundColor: formColor,
                            border: '1.5px solid #0f766e',
                            boxShadow: '0 0 0 2px #0f766e',
                          }}
                          title={`Cor personalizada ativa: ${formColor}`}
                        >
                          <Check size={14} style={{ color: '#0f766e' }} />
                        </button>
                      )}

                      {/* Botão de Paleta de Cores Completa & Seletor */}
                      <button
                        type="button"
                        className="color-dot-btn"
                        onClick={() => {
                          setTempCustomColor(formColor);
                          setColorPickerModalOpen(true);
                        }}
                        title="Abrir paleta de cores e escolher qualquer cor personalizada"
                        style={{
                          background: 'conic-gradient(from 180deg at 50% 50%, #ff4d4f, #fa8c16, #fadb14, #52c41a, #13c2c2, #1890ff, #722ed1, #eb2f96, #ff4d4f)',
                          border: '2px solid #ffffff',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Palette size={15} style={{ color: '#ffffff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.8))' }} />
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Destaque</label>
                    <label className={`notes-pin-card ${formIsPinned ? 'is-pinned' : ''}`}>
                      <input
                        type="checkbox"
                        checked={formIsPinned}
                        onChange={(e) => setFormIsPinned(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <Pin size={16} />
                      <span>Fixar no topo</span>
                    </label>
                  </div>
                </div>

                {/* Linha 3: Conteúdo / Texto Livre */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                      Conteúdo / Texto da Anotação
                    </label>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      Roteiros, observações, passos e ideias
                    </span>
                  </div>
                  <textarea
                    className="form-textarea"
                    rows={6}
                    placeholder="Digite suas anotações, roteiro de hipnose, checklist, ideias, observações clínicas..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    style={{ lineHeight: 1.6, fontSize: '0.92rem', minHeight: '140px', padding: '12px 14px' }}
                  />
                </div>

                {/* Linha 4: Grid Inferior (Tags à esquerda, Anexos à direita) */}
                <div className="notes-bottom-grid">
                  {/* Coluna 1: Tags / Etiquetas */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, color: '#1e293b' }}>
                      Tags / Etiquetas
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: ansiedade, protocolo (Enter)"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleAddTag}
                        style={{ flexShrink: 0 }}
                      >
                        Adicionar
                      </button>
                    </div>

                    {formTags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {formTags.map((t) => (
                          <span
                            key={t}
                            className="note-tag-pill"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#e2e8f0',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                            }}
                          >
                            #{t}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(t)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coluna 2: Anexos (Fotos & Documentos) */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>
                        Fotos & Documentos ({formAttachments.length})
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Paperclip size={13} /> Anexar Arquivos
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.doc,.docx,.txt"
                        style={{ display: 'none' }}
                        onChange={handleFilesSelected}
                      />
                    </div>

                    {uploadingFiles && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <RefreshCw size={15} className="animate-spin" />
                        <span>{uploadStatusMsg || 'Comprimindo e salvando foto no Storage...'}</span>
                      </div>
                    )}

                    {formAttachments.length === 0 ? (
                      <div
                        style={{
                          padding: '14px',
                          border: '1.5px dashed #cbd5e1',
                          borderRadius: '8px',
                          textAlign: 'center',
                          color: '#64748b',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          background: '#f8fafc',
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImageIcon size={20} style={{ margin: '0 auto 4px auto', opacity: 0.6 }} />
                        <div>Clique para adicionar fotos ou documentos (PDF, Doc)</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                        {formAttachments.map((att) => {
                          const isImage = att.mimeType.startsWith('image/');
                          return (
                            <div key={att.id} className="attachment-item-preview">
                              <div className="attachment-preview-left">
                                <div className="attachment-thumb-box">
                                  {isImage ? (
                                    <img src={att.data} alt={att.name} />
                                  ) : (
                                    <FileText size={18} style={{ color: '#0f766e' }} />
                                  )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: '0.82rem',
                                      fontWeight: 600,
                                      color: '#1e293b',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '180px',
                                    }}
                                  >
                                    {att.name}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {formatFileSize(att.size)} • {isImage ? 'Foto' : 'Doc'}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleRemoveAttachment(att.id)}
                                style={{ color: 'var(--color-danger)', padding: '4px' }}
                                aria-label="Remover anexo"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rodapé Fixo */}
              <div className="notes-editor-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setNoteModalOpen(false)}
                  disabled={savingNote}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingNote}>
                  {savingNote ? 'Salvando...' : editingNote ? 'Salvar Alterações' : 'Criar Anotação'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: PALETA DE CORES COMPLETA & SELETOR LIVRE DO CARD
      ══════════════════════════════════════════════════════════════ */}
      {colorPickerModalOpen && (
        <div
          className="modal-layer"
          role="presentation"
          style={{ zIndex: 1100 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setColorPickerModalOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: 'min(560px, 95vw)',
              maxWidth: '560px',
              borderRadius: '18px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.45)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px 16px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#ffffff',
              }}
            >
              <div>
                <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Palette size={14} /> Personalização
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
                  Paleta de Cores do Card
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setColorPickerModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                padding: '20px 24px',
                maxHeight: '70vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                background: '#ffffff',
              }}
            >
              {/* Seção 1: Tons Estéticos Clínicos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                    Tons Suaves &amp; Estéticos Recomendados
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>16 opções</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {EXTENDED_NOTE_COLORS.map((c) => {
                    const isSelected = tempCustomColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setTempCustomColor(c.value)}
                        style={{
                          backgroundColor: c.value,
                          border: isSelected ? '2px solid #0f766e' : `1.5px solid ${c.border}`,
                          boxShadow: isSelected ? '0 0 0 2px #0f766e' : '0 1px 2px rgba(0,0,0,0.05)',
                          borderRadius: '8px',
                          padding: '10px 6px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          transition: 'transform 0.1s ease',
                          position: 'relative',
                        }}
                        title={c.label}
                      >
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1e293b', textAlign: 'center', lineHeight: 1.2 }}>
                          {c.label}
                        </span>
                        {isSelected && <Check size={14} style={{ color: '#0f766e' }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Seção 2: Seletor Livre / Espectro / Código Hexadecimal */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                  Ou escolha qualquer cor livre no seletor:
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Seletor nativo visual */}
                  <label
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      border: '2px solid #cbd5e1',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'block',
                      position: 'relative',
                      backgroundColor: tempCustomColor,
                      boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
                      flexShrink: 0,
                    }}
                    title="Clique para abrir a roda de cores livre"
                  >
                    <input
                      type="color"
                      value={tempCustomColor}
                      onChange={(e) => setTempCustomColor(e.target.value)}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        cursor: 'pointer',
                      }}
                    />
                  </label>

                  {/* Input Hex */}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                      Código Hexadecimal (HEX)
                    </span>
                    <input
                      type="text"
                      className="form-input"
                      value={tempCustomColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTempCustomColor(val.startsWith('#') ? val : `#${val}`);
                      }}
                      placeholder="#ffffff"
                      style={{
                        height: '38px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Seção 3: Pré-visualização do Card em Tempo Real */}
              <div
                style={{
                  backgroundColor: tempCustomColor,
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.4px' }}>
                    Pré-visualização do Card
                  </span>
                  <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                    {tempCustomColor}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.96rem', fontWeight: 700, color: '#0f172a' }}>
                  {formTitle.trim() || 'Título da Anotação'}
                </h4>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                  {formContent.slice(0, 100).trim() || 'Exemplo visual de leitura do texto com esta cor de fundo.'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTempCustomColor('#ffffff')}
              >
                Restaurar Branco
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setColorPickerModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setFormColor(tempCustomColor);
                    setColorPickerModalOpen(false);
                    showToast('Cor aplicada ao card!');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Check size={14} /> Aplicar Esta Cor
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR PASTA
      ══════════════════════════════════════════════════════════════ */}
      {folderModalOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingFolder) setFolderModalOpen(false);
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" style={{ width: 'min(500px, 94vw)', maxWidth: '500px', borderRadius: '18px' }}>
            <div className="modal-header" style={{ padding: '20px 24px 14px 24px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <span className="eyebrow">{editingFolder ? 'Editar' : 'Nova'}</span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  {editingFolder ? 'Editar Pasta' : 'Criar Pasta'}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setFolderModalOpen(false)}
                disabled={savingFolder}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSaveFolder}>
              <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label className="form-group" style={{ marginBottom: 0 }}>
                  <span className="form-label" style={{ fontWeight: 700, color: '#1e293b' }}>Nome da Pasta *</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Roteiros Clínicos, Ideias, Estudos..."
                    value={folderFormName}
                    onChange={(e) => setFolderFormName(e.target.value)}
                    required
                    autoFocus
                    style={{ fontSize: '1rem', padding: '10px 14px' }}
                  />
                </label>

                {/* Cores da Pasta */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="form-label" style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>Cor de Identificação</span>
                    <span style={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace' }}>{folderFormColor}</span>
                  </div>
                  <div className="color-palette-picker" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        className={`color-dot-btn ${folderFormColor.toLowerCase() === c.value.toLowerCase() ? 'selected' : ''}`}
                        style={{ backgroundColor: c.value }}
                        onClick={() => setFolderFormColor(c.value)}
                        title={c.label}
                      >
                        {folderFormColor.toLowerCase() === c.value.toLowerCase() && <Check size={14} style={{ color: '#ffffff' }} />}
                      </button>
                    ))}

                    {/* Seletor nativo de cor livre para a pasta */}
                    <label
                      className="color-dot-btn"
                      style={{
                        background: 'conic-gradient(from 180deg at 50% 50%, #ff4d4f, #fa8c16, #fadb14, #52c41a, #13c2c2, #1890ff, #722ed1, #eb2f96, #ff4d4f)',
                        border: '2px solid #ffffff',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      title="Escolher qualquer cor personalizada para a pasta"
                    >
                      <Palette size={14} style={{ color: '#ffffff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.8))' }} />
                      <input
                        type="color"
                        value={folderFormColor}
                        onChange={(e) => setFolderFormColor(e.target.value)}
                        style={{
                          position: 'absolute',
                          opacity: 0,
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          cursor: 'pointer',
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Ícones da Pasta */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <span className="form-label" style={{ fontWeight: 700, color: '#1e293b' }}>Ícone Temático</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(FOLDER_ICONS).map(([key, IconComp]) => (
                      <button
                        key={key}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{
                          backgroundColor: folderFormIcon === key ? folderFormColor : '#ffffff',
                          color: folderFormIcon === key ? '#ffffff' : '#334155',
                          borderColor: folderFormIcon === key ? folderFormColor : '#cbd5e1',
                          padding: '8px 12px',
                        }}
                        onClick={() => setFolderFormIcon(key)}
                      >
                        <IconComp size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFolderModalOpen(false)}
                  disabled={savingFolder}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingFolder}>
                  {savingFolder ? 'Salvando...' : editingFolder ? 'Atualizar Pasta' : 'Criar Pasta'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: VISUALIZAR ANOTAÇÃO COMPLETA (PROPORCIONAL)
      ══════════════════════════════════════════════════════════════ */}
      {viewingNote && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingNote(null);
          }}
        >
          <section className="modal notes-editor-modal" role="dialog" aria-modal="true">
            <div className="notes-editor-header">
              <div>
                {viewingNote.folderName ? (
                  <span
                    className="note-folder-badge"
                    style={{ backgroundColor: viewingNote.folderColor || '#0f766e', marginBottom: '6px' }}
                  >
                    <Folder size={11} /> {viewingNote.folderName}
                  </span>
                ) : (
                  <span className="eyebrow">Anotação</span>
                )}
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>{viewingNote.title}</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setViewingNote(null)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="notes-editor-body">
              {/* Metadados */}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem' }}>
                <span>Atualizado em: {formatDate(viewingNote.updatedAt)}</span>
                {viewingNote.isPinned && (
                  <span style={{ color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Pin size={13} /> Fixada no topo
                  </span>
                )}
              </div>

              {/* Texto Completo */}
              <div
                style={{
                  background: viewingNote.color !== '#ffffff' ? viewingNote.color : '#f8fafc',
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  lineHeight: 1.65,
                  fontSize: '0.94rem',
                  color: '#1e293b',
                  whiteSpace: 'pre-line',
                }}
              >
                {viewingNote.content || <em style={{ color: '#94a3b8' }}>Nenhum conteúdo em texto cadastrado.</em>}
              </div>

              {/* Tags */}
              {viewingNote.tags && viewingNote.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {viewingNote.tags.map((t) => (
                    <span key={t} className="note-tag-pill" style={{ background: '#e2e8f0', padding: '4px 9px', borderRadius: '6px' }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Galeria de Fotos */}
              {(() => {
                const photos = (viewingNote.attachments || []).filter((a) => a.mimeType.startsWith('image/'));
                if (photos.length === 0) return null;
                return (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ImageIcon size={16} /> Fotos Anexadas ({photos.length})
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                      {photos.map((photo) => (
                        <div
                          key={photo.id}
                          style={{
                            aspectRatio: '1',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid #e2e8f0',
                            position: 'relative',
                          }}
                          onClick={() => setLightboxImage({ url: photo.data, name: photo.name })}
                          title="Clique para ampliar"
                        >
                          <img
                            src={photo.data}
                            alt={photo.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Lista de Documentos */}
              {(() => {
                const docs = (viewingNote.attachments || []).filter((a) => !a.mimeType.startsWith('image/'));
                if (docs.length === 0) return null;
                return (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={16} /> Documentos & Arquivos ({docs.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="attachment-item-preview"
                          style={{ background: '#ffffff' }}
                        >
                          <div className="attachment-preview-left">
                            <FileText size={20} style={{ color: '#0f766e' }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#1e293b' }}>{doc.name}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{formatFileSize(doc.size)}</div>
                            </div>
                          </div>
                          <a
                            href={doc.data}
                            download={doc.name}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Download size={13} /> Baixar
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="notes-editor-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopyNote(viewingNote)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Copy size={14} /> Copiar Texto
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleShareWhatsApp(viewingNote)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 700 }}
                >
                  <WhatsappIcon size={16} /> WhatsApp
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const toEdit = viewingNote;
                    setViewingNote(null);
                    handleOpenEditNote(toEdit);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <Edit3 size={14} /> Editar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setViewingNote(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LIGHTBOX: ZOOM DE FOTO EM TELA CHEIA
      ══════════════════════════════════════════════════════════════ */}
      {lightboxImage && (
        <div className="lightbox-backdrop" onClick={() => setLightboxImage(null)}>
          <button
            type="button"
            className="lightbox-close-btn"
            onClick={() => setLightboxImage(null)}
            aria-label="Fechar visualização"
          >
            <X size={22} />
          </button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightboxImage.url}
            download={lightboxImage.name}
            className="lightbox-download-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={16} /> Baixar Foto
          </a>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CONFIRMAÇÃO: EXCLUIR ANOTAÇÃO
      ══════════════════════════════════════════════════════════════ */}
      {deleteNoteConfirm && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteNoteConfirm(null);
          }}
        >
          <section className="modal modal-sm" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <span className="eyebrow" style={{ color: 'var(--color-danger)' }}>Atenção</span>
                <h2>Excluir Anotação</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setDeleteNoteConfirm(null)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </div>
            <div className="modal-body">
              <p>Tem certeza que deseja excluir permanentemente a anotação:</p>
              <strong style={{ display: 'block', margin: '8px 0', color: '#1e293b' }}>
                &ldquo;{deleteNoteConfirm.title}&rdquo;?
              </strong>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Esta ação removerá todo o texto e os arquivos anexados a ela.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteNoteConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDeleteNote(deleteNoteConfirm.id)}
              >
                <Trash2 size={15} /> Excluir Definitivamente
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CONFIRMAÇÃO: EXCLUIR PASTA
      ══════════════════════════════════════════════════════════════ */}
      {deleteFolderConfirm && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteFolderConfirm(null);
          }}
        >
          <section className="modal modal-sm" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <span className="eyebrow" style={{ color: 'var(--color-danger)' }}>Atenção</span>
                <h2>Excluir Pasta</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setDeleteFolderConfirm(null)}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>Deseja excluir a pasta <strong>&ldquo;{deleteFolderConfirm.name}&rdquo;</strong>?</p>
              
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  background: deleteFolderWithNotes ? '#fee2e2' : '#f8fafc',
                }}
              >
                <input
                  type="checkbox"
                  checked={deleteFolderWithNotes}
                  onChange={(e) => setDeleteFolderWithNotes(e.target.checked)}
                />
                <span>Excluir também todas as anotações contidas nesta pasta</span>
              </label>
              {!deleteFolderWithNotes && (
                <p style={{ fontSize: '0.78rem', color: '#15803d' }}>
                  ✓ As anotações não serão apagadas; elas serão movidas para <strong>Sem Pasta</strong>.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteFolderConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDeleteFolder(deleteFolderConfirm.id, deleteFolderWithNotes)}
              >
                <Trash2 size={15} /> Excluir Pasta
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
