/**
 * Sistema de Cache Instantâneo (Zero-Wait / Stale-While-Revalidate)
 * Garante que Dashboard, Agenda, Clientes, Financeiro e Prontuários
 * abram imediatamente com os dados na tela em 0 milissegundos,
 * enquanto a atualização em segundo plano sincroniza em paralelo sem travar a interface.
 */

const memoryCache = new Map<string, unknown>();

export function getInstantCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  // 1. Memória da aba (0 milissegundos)
  if (memoryCache.has(key)) {
    const val = memoryCache.get(key);
    if (val !== undefined && val !== null) return val as T;
  }

  // 2. LocalStorage persistente (sobrevive a refresh, fechamento ou troca de abas)
  try {
    const item = window.localStorage.getItem(`cm_cache_${key}`);
    if (item) {
      const parsed = JSON.parse(item);
      if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
        memoryCache.set(key, parsed.payload);
        return parsed.payload as T;
      }
    }
  } catch {
    // fallback seguro
  }

  return fallback;
}

export function setInstantCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined' || data === undefined || data === null) return;
  memoryCache.set(key, data);
  try {
    window.localStorage.setItem(
      `cm_cache_${key}`,
      JSON.stringify({ payload: data, savedAt: Date.now() })
    );
  } catch {
    // caso localStorage esteja cheio ou restrito
  }
}

export function clearInstantCache(keyPrefix?: string): void {
  if (typeof window === 'undefined') return;
  if (!keyPrefix) {
    memoryCache.clear();
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) {
        if (k.startsWith('cm_cache_')) window.localStorage.removeItem(k);
      }
    } catch {
      // fallback
    }
    return;
  }

  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(keyPrefix)) memoryCache.delete(k);
  }
  try {
    const keys = Object.keys(window.localStorage);
    for (const k of keys) {
      if (k.startsWith(`cm_cache_${keyPrefix}`)) window.localStorage.removeItem(k);
    }
  } catch {
    // fallback
  }
}

