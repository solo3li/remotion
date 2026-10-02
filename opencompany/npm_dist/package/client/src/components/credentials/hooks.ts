/**
 * Shared hooks for credential panels.
 */

import {
  useWhatsAppStatus, useAndroidStatus, useTwitterStatus, useGoogleStatus, useTelegramStatus,
} from '../../contexts/WebSocketContext';

/** Resolves config.statusHook string to the actual hook value. */
export function useProviderStatus(hook?: string) {
  const w = useWhatsAppStatus(), a = useAndroidStatus(), t = useTwitterStatus(),
        g = useGoogleStatus(), tg = useTelegramStatus();
  if (!hook) return null;
  return ({ whatsapp: w, android: a, twitter: t, google: g, telegram: tg } as Record<string, any>)[hook] ?? null;
}
