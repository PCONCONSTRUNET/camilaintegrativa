/**
 * Utilitário de Geração de Código PIX (BR Code / EMVCo) e QR Code
 * Compatível com todos os aplicativos bancários do Brasil (Nubank, Itaú, Inter, Bradesco, etc.)
 */

export const CLINIC_PIX_CONFIG = {
  key: '+5548996915303',
  keyDisplay: '(48) 99691-5303',
  keyType: 'Chave Telefone',
  recipientName: 'Camila Machado',
  city: 'Urussanga',
  whatsappNumber: '5548996915303',
  whatsappDisplay: '(48) 99691-5303',
};

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
  key = CLINIC_PIX_CONFIG.key,
  name = CLINIC_PIX_CONFIG.recipientName,
  city = CLINIC_PIX_CONFIG.city,
  amount,
  txid = '***',
}: GeneratePixParams): string {
  const cleanDigits = key.replace(/\D/g, '');
  const cleanKey =
    cleanDigits.length === 11 && !key.startsWith('+') ? `+55${cleanDigits}` : key.trim();

  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', cleanKey);
  let payload =
    tlv('00', '01') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986');

  if (amount && amount > 0) {
    payload += tlv('54', Number(amount).toFixed(2));
  }

  const cleanName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .toUpperCase();

  const cleanCity = city
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

