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

/**
 * Solicita permissão e ativa Push Notifications no OneSignal
 */
export async function requestOneSignalPushPermission(params?: {
  role?: 'admin' | 'client';
  userId?: string;
  name?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        const permission = OneSignal.Notifications.permission;

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
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (err) {
        console.error('[OneSignal] requestPermission error:', err);
        resolve(false);
      }
    });
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

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const supported = OneSignal.Notifications.isPushSupported();
        const permission = OneSignal.Notifications.permission;
        resolve({
          supported: Boolean(supported),
          permission: Boolean(permission),
        });
      } catch {
        resolve({ supported: false, permission: false });
      }
    });
  });
}

