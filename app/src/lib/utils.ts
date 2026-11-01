import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100);
}

export function formatDate(date: Date | string, format = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return format
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', String(year))
    .replace('HH', hours)
    .replace('mm', minutes);
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function maskCurrency(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  if (isNaN(cents)) return '';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function finalizeCurrency(value: string): string {
  return maskCurrency(value);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

export const STATUS_LABELS: Record<string, string> = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
};

export const STATUS_COLORS: Record<string, string> = {
  solicitado: 'status-solicitado',
  confirmado: 'status-confirmado',
  em_atendimento: 'status-em_atendimento',
  concluido: 'status-concluido',
  cancelado: 'status-cancelado',
  nao_compareceu: 'status-nao_compareceu',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  nao_pago: 'Não pago',
  parcialmente_pago: 'Pago parcialmente',
  pago: 'Pago',
  reembolsado: 'Reembolsado',
};

export function numberToCurrencyWords(amountCents: number): string {
  const reais = Math.floor(amountCents / 100);
  const centavos = amountCents % 100;

  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dezenasEspeciais: Record<number, string> = {
    10: 'dez',
    11: 'onze',
    12: 'doze',
    13: 'treze',
    14: 'quatorze',
    15: 'quinze',
    16: 'dezesseis',
    17: 'dezessete',
    18: 'dezoito',
    19: 'dezenove',
  };
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function trioParaExtenso(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'cem';
    const c = Math.floor(num / 100);
    const d = Math.floor((num % 100) / 10);
    const u = num % 10;
    const partes: string[] = [];
    if (c > 0) partes.push(centenas[c]);
    const resto = num % 100;
    if (resto >= 10 && resto <= 19) {
      partes.push(dezenasEspeciais[resto]);
    } else {
      if (d > 0) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(' e ');
  }

  let textoReais = '';
  if (reais === 0) {
    textoReais = 'zero reais';
  } else if (reais === 1) {
    textoReais = 'um real';
  } else if (reais < 1000) {
    textoReais = `${trioParaExtenso(reais)} reais`;
  } else if (reais < 1000000) {
    const milhar = Math.floor(reais / 1000);
    const resto = reais % 1000;
    const txtMilhar = milhar === 1 ? 'um mil' : `${trioParaExtenso(milhar)} mil`;
    if (resto === 0) {
      textoReais = `${txtMilhar} reais`;
    } else if (resto < 100 || resto % 100 === 0) {
      textoReais = `${txtMilhar} e ${trioParaExtenso(resto)} reais`;
    } else {
      textoReais = `${txtMilhar}, ${trioParaExtenso(resto)} reais`;
    }
  } else {
    textoReais = `${reais.toLocaleString('pt-BR')} reais`;
  }

  if (centavos > 0) {
    const txtCentavos = trioParaExtenso(centavos);
    return `${textoReais} e ${txtCentavos} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }

  return textoReais;
}
