/**
 * QRCodeDisplay - QR code viewer supporting both raw data and pre-encoded base64 images
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, Loader2, QrCode, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface QRCodeDisplayProps {
  value?: string | null;
  isConnected?: boolean;
  size?: number;
  loading?: boolean;
  connectedTitle?: string;
  connectedSubtitle?: string;
  emptyText?: string;
}

const isBase64Image = (value: string): boolean => {
  if (value.length < 100) return false;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('iVBOR') || value.startsWith('/9j/')) return true;
  if (value.length > 5000) {
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(value);
  }
  return false;
};

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  isConnected = false,
  size = 280,
  loading = false,
  connectedTitle = 'Connected',
  connectedSubtitle = 'No QR code needed',
  emptyText = 'QR code not available',
}) => {
  if (isConnected) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle className="h-10 w-10 text-success" />
        <div className="text-base font-semibold">{connectedTitle}</div>
        <div className="text-sm text-muted-foreground">{connectedSubtitle}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <div className="mt-4 text-sm text-muted-foreground">Waiting for QR code...</div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <QrCode className="mx-auto h-12 w-12 opacity-30" />
        <div className="mt-4">{emptyText}</div>
      </div>
    );
  }

  if (isBase64Image(value)) {
    const imgSrc = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
    return (
      <div className="p-4 text-center">
        <img
          src={imgSrc}
          alt="QR Code"
          style={{ width: size, height: size, imageRendering: 'pixelated' }}
        />
      </div>
    );
  }

  return <QRCodeRenderer value={value} size={size} />;
};

const QRCodeRenderer: React.FC<{ value: string; size: number }> = ({ value, size }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [value]);

  if (error) {
    return (
      <div className="p-6 text-center">
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>QR Code Error</AlertTitle>
          <AlertDescription>
            The QR code data is too large to display. Please try refreshing or reconnecting.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <QRCodeErrorBoundary onError={(err) => setError(err)}>
      <div className="p-4 text-center">
        <QRCodeSVG value={value} size={size} level="L" />
      </div>
    </QRCodeErrorBoundary>
  );
};

class QRCodeErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: string) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: string) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[QRCodeDisplay] QR code rendering error:', error.message);
    this.props.onError(error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>QR Code Error</AlertTitle>
            <AlertDescription>
              The QR code data is too large to display. Please try refreshing or reconnecting.
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

export default QRCodeDisplay;
