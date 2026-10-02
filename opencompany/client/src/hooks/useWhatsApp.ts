/**
 * useWhatsApp Hook - WebSocket-based WhatsApp operations
 *
 * Provides WhatsApp messaging and connection management via WebSocket.
 * This replaces REST-based WhatsApp API calls for real-time operations.
 */

import { useCallback, useState } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

export interface WhatsAppStatus {
  connected: boolean;
  deviceId?: string;
  data?: any;
}

export interface WhatsAppQRResult {
  connected: boolean;
  qr?: string;
  message?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UseWhatsAppResult {
  // Get WhatsApp connection status
  getStatus: () => Promise<WhatsAppStatus>;

  // Get QR code for authentication
  getQRCode: () => Promise<WhatsAppQRResult>;

  // Send a WhatsApp message
  sendMessage: (phone: string, message: string) => Promise<WhatsAppSendResult>;

  // Start WhatsApp connection
  startConnection: () => Promise<{ success: boolean; message?: string }>;

  // Restart WhatsApp connection (stops and starts the service)
  restartConnection: () => Promise<{ success: boolean; message?: string }>;

  // State
  isLoading: boolean;
  lastError: string | null;
  connectionStatus: WhatsAppStatus | null;
  isConnected: boolean;
}

export const useWhatsApp = (): UseWhatsAppResult => {
  const {
    getWhatsAppStatus: wsGetStatus,
    getWhatsAppQR: wsGetQR,
    sendWhatsAppMessage: wsSendMessage,
    startWhatsAppConnection: wsStartConnection,
    restartWhatsAppConnection: wsRestartConnection,
    isConnected
  } = useWebSocket();

  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppStatus | null>(null);

  /**
   * Get WhatsApp connection status
   */
  const getStatus = useCallback(async (): Promise<WhatsAppStatus> => {
    setIsLoading(true);
    setLastError(null);

    try {
      const result = await wsGetStatus();
      setConnectionStatus(result);
      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to get status';
      setLastError(errorMsg);
      return { connected: false };
    } finally {
      setIsLoading(false);
    }
  }, [wsGetStatus]);

  /**
   * Get QR code for WhatsApp authentication
   */
  const getQRCode = useCallback(async (): Promise<WhatsAppQRResult> => {
    setIsLoading(true);
    setLastError(null);

    try {
      const result = await wsGetQR();

      if (result.connected) {
        setConnectionStatus({ connected: true });
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to get QR code';
      setLastError(errorMsg);
      return { connected: false, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [wsGetQR]);

  /**
   * Send a WhatsApp message
   */
  const sendMessage = useCallback(async (
    phone: string,
    message: string
  ): Promise<WhatsAppSendResult> => {
    setIsLoading(true);
    setLastError(null);

    try {
      const result = await wsSendMessage(phone, message);

      if (!result.success && result.error) {
        setLastError(result.error);
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to send message';
      setLastError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [wsSendMessage]);

  /**
   * Start WhatsApp connection
   */
  const startConnection = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    setLastError(null);

    try {
      const result = await wsStartConnection();

      if (!result.success && result.message) {
        setLastError(result.message);
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start connection';
      setLastError(errorMsg);
      return { success: false, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [wsStartConnection]);

  /**
   * Restart WhatsApp connection (stops and starts the service)
   */
  const restartConnection = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    setLastError(null);

    try {
      const result = await wsRestartConnection();

      if (!result.success && result.message) {
        setLastError(result.message);
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to restart connection';
      setLastError(errorMsg);
      return { success: false, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [wsRestartConnection]);

  return {
    getStatus,
    getQRCode,
    sendMessage,
    startConnection,
    restartConnection,
    isLoading,
    lastError,
    connectionStatus,
    isConnected
  };
};
