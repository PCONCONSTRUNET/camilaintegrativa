'use client';

import { useEffect } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => Promise<void> | void>;
    OneSignal?: any;
  }
}

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || 'd1a83484-dce6-45f0-880f-15f3d8235d4c';

const ONESIGNAL_SAFARI_WEB_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || 'web.onesignal.auto.4b51c712-23a7-447d-a673-6f24b07d407b';

export function OneSignalInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: false, // Usamos nossos botões visuais no Admin e Portal do Cliente
          },
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: '/OneSignalSDKWorker.js',
        });
      } catch (err) {
        console.warn('[OneSignal] Init warning:', err);
      }
    });
  }, []);

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}

export interface PushPermissionResult {
  granted: boolean;
  needsIosPwa?: boolean;
  denied?: boolean;
}

/**
 * Solicita permissão e ativa Push Notifications no OneSignal
 */
export async function requestOneSignalPushPermission(params?: {
  role?: 'admin' | 'client';
  userId?: string;
  name?: string;
}): Promise<PushPermissionResult> {
  if (typeof window === 'undefined') return { granted: false };

  // 1. Detectar se é Safari no iOS fora do modo PWA (onde a Apple bloqueia Web Push)
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error - navigator.standalone é específico do Safari iOS
    window.navigator.standalone === true;

  if (isIos && !isStandalone) {
    return { granted: false, needsIosPwa: true };
  }

  // 2. Verificar se as notificações já estão bloqueadas pelo usuário no navegador
  if ('Notification' in window && Notification.permission === 'denied') {
    return { granted: false, denied: true };
  }

  // 3. Tentar disparo direto nativo para preservar o token de gesto do usuário no navegador
  let nativeGranted = false;
  if ('Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        nativeGranted = true;
      } else if (perm === 'denied') {
        return { granted: false, denied: true };
      }
    } catch (e) {
      console.warn('[Notification] requestPermission warning:', e);
    }
  }

  // 4. Conectar e registrar tags no OneSignal SDK
  return new Promise((resolve) => {
    const applyOneSignal = async (OneSignal: any) => {
      try {
        await OneSignal.Notifications.requestPermission().catch(() => null);
        const permission = Boolean(OneSignal.Notifications.permission) || nativeGranted;

        if (permission) {
          if (params?.userId) {
            await OneSignal.login(params.userId).catch(() => null);
          }
          if (params?.role) {
            await OneSignal.User.addTags({
              role: params.role,
              clinic: 'camila_machado',
              name: params.name || '',
            }).catch(() => null);
          }
          try {
            window.localStorage.setItem('clinica_client_push_granted', 'true');
          } catch {}
          resolve({ granted: true });
        } else {
          resolve({ granted: false });
        }
      } catch (err) {
        console.error('[OneSignal] requestPermission error:', err);
        if (nativeGranted) {
          try {
            window.localStorage.setItem('clinica_client_push_granted', 'true');
          } catch {}
          resolve({ granted: true });
        } else {
          resolve({ granted: false });
        }
      }
    };

    if (window.OneSignal?.Notifications) {
      void applyOneSignal(window.OneSignal);
    } else {
      const timer = setTimeout(() => {
        if (nativeGranted) {
          try {
            window.localStorage.setItem('clinica_client_push_granted', 'true');
          } catch {}
          resolve({ granted: true });
        } else {
          resolve({ granted: false });
        }
      }, 2500);

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        clearTimeout(timer);
        await applyOneSignal(OneSignal);
      });
    }
  });
}

/**
 * Consulta se o usuário atual já deu permissão de Push
 */
export async function getOneSignalPushStatus(): Promise<{
  supported: boolean;
  permission: boolean;
  optedOut?: boolean;
}> {
  if (typeof window === 'undefined') {
    return { supported: false, permission: false };
  }

  // 1. Verificação nativa imediata
  const hasNative = 'Notification' in window;
  const nativeGranted = hasNative && Notification.permission === 'granted';
  let cachedGranted = false;
  try {
    cachedGranted = window.localStorage.getItem('clinica_client_push_granted') === 'true';
  } catch {}

  if (nativeGranted || cachedGranted) {
    return { supported: true, permission: true };
  }

  // 2. Consulta via OneSignal
  return new Promise((resolve) => {
    if (window.OneSignal?.Notifications) {
      try {
        const supported = window.OneSignal.Notifications.isPushSupported();
        const permission = window.OneSignal.Notifications.permission;
        resolve({
          supported: Boolean(supported) || hasNative,
          permission: Boolean(permission) || nativeGranted,
        });
        return;
      } catch {}
    }

    const timer = setTimeout(() => {
      resolve({ supported: hasNative, permission: nativeGranted });
    }, 1500);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      clearTimeout(timer);
      try {
        const supported = OneSignal.Notifications.isPushSupported();
        const permission = OneSignal.Notifications.permission;
        resolve({
          supported: Boolean(supported) || hasNative,
          permission: Boolean(permission) || nativeGranted,
        });
      } catch {
        resolve({ supported: hasNative, permission: nativeGranted });
      }
    });
  });
}

