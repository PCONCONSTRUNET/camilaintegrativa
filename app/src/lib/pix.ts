/**
 * Utilitário de Geração de Código PIX (BR Code / EMVCo) e QR Code
 * Compatível com todos os aplicativos bancários do Brasil (Nubank, Itaú, Inter, Bradesco, etc.)
 */

export type PixKeyType = 'telefone' | 'cpf' | 'cnpj' | 'email' | 'aleatoria';

export type ClinicPixConfig = {
  keyType: PixKeyType;
  key: string;
  keyDisplay: string;
  recipientName: string;
  city: string;
  instructions: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  updatedAt?: string;
};

export const DEFAULT_CLINIC_PIX_CONFIG: ClinicPixConfig = {
  keyType: 'telefone',
  key: '+5548996915303',
  keyDisplay: '(48) 99691-5303',
  recipientName: 'Camila Machado',
  city: 'Urussanga',
  instructions: 'Após o pagamento via PIX, o agendamento é registrado com status pendente até a conciliação automática ou confirmação pela clínica.',
  whatsappNumber: '5548996915303',
  whatsappDisplay: '(48) 99691-5303',
};

// Mantido para compatibilidade com importações legadas
export const CLINIC_PIX_CONFIG = DEFAULT_CLINIC_PIX_CONFIG;

export function formatPixKeyForBacen(rawKey: string, keyType: PixKeyType = 'telefone'): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';

  if (keyType === 'telefone') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 10) {
      return `+55${digits}`;
    }
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits}`;
    }
    return trimmed.startsWith('+') ? trimmed : `+${digits}`;
  }

  if (keyType === 'cpf' || keyType === 'cnpj') {
    return trimmed.replace(/\D/g, '');
  }

  if (keyType === 'email') {
    return trimmed.toLowerCase();
  }

  // aleatoria / evp
  return trimmed;
}

export function formatPixKeyDisplay(rawKey: string, keyType: PixKeyType = 'telefone'): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';

  if (keyType === 'telefone') {
    let digits = trimmed.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
      digits = digits.slice(2);
    }
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return trimmed;
  }

  if (keyType === 'cpf') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    return trimmed;
  }

  if (keyType === 'cnpj') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 14) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    }
    return trimmed;
  }

  return trimmed;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, val: string): string {
  const len = String(val.length).padStart(2, '0');
  return tag + len + val;
}

export type GeneratePixParams = {
  key?: string;
  name?: string;
  city?: string;
  amount?: number; // em Reais (ex: 1650.00)
  txid?: string;
};

/**
 * Gera o payload oficial do PIX Copia e Cola (EMV QRCPS-MPM)
 */
export function generatePixCopiaECola({
  key = DEFAULT_CLINIC_PIX_CONFIG.key,
  name = DEFAULT_CLINIC_PIX_CONFIG.recipientName,
  city = DEFAULT_CLINIC_PIX_CONFIG.city,
  amount,
  txid = '***',
}: GeneratePixParams): string {
  let cleanKey = (key || '').trim();
  const digitsOnly = cleanKey.replace(/\D/g, '');

  // Se parecer telefone com 10 ou 11 dígitos e sem +, prefixa +55 para o BACEN
  if ((digitsOnly.length === 10 || digitsOnly.length === 11) && !cleanKey.startsWith('+') && !cleanKey.includes('@')) {
    cleanKey = `+55${digitsOnly}`;
  }

  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', cleanKey);
  let payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986');

  if (amount && amount > 0) {
    payload += tlv('54', Number(amount).toFixed(2));
  }

  const cleanName = (name || 'CLINICA INTEGRATIVA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .toUpperCase();

  const cleanCity = (city || 'BRASIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 15)
    .toUpperCase();

  payload +=
    tlv('58', 'BR') +
    tlv('59', cleanName) +
    tlv('60', cleanCity) +
    tlv('62', tlv('05', txid)) +
    '6304';

  const checksum = crc16(payload);
  return payload + checksum;
}

/**
 * Retorna URL de renderização do QR Code do PIX
 */
export function getPixQrCodeImageUrl(payload: string, size = 260): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(payload)}`;
}
