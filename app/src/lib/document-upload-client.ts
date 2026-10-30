/**
 * Cliente para upload de documentos (PDF, DOCX, Planilhas, TXT) para o Cloudflare R2.
 * Envia o arquivo para a API interna /api/admin/upload-document, que o deposita com segurança no R2.
 */

export async function uploadDocumentToR2Api(
  file: File,
  folder: 'prontuarios' | 'anotacoes' = 'prontuarios'
): Promise<{ url: string; name: string; size: number; mimeType: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const res = await fetch('/api/admin/upload-document', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || 'Falha ao salvar documento no Cloudflare R2.');
  }

  const json = await res.json();
  return {
    url: json.url,
    name: json.name || file.name,
    size: json.size || file.size,
    mimeType: json.mimeType || file.type || 'application/octet-stream',
  };
}

