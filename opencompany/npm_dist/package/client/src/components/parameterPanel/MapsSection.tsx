import React, { useState, useEffect, useRef } from 'react';
import MapsPreviewPanel from '../maps/MapsPreviewPanel';
import { Node } from 'reactflow';
import { INodeTypeDescription } from '../../types/INodeProperties';
import {
  getCoordinateParams,
  getCurrentCoordinates,
  getMapDisplayParams,
  getGoogleMapsApiKey,
  createLocationUpdateHandler
} from '../../utils/locationUtils';
import { useApiKeys } from '../../hooks/useApiKeys';

interface MapsSectionProps {
  selectedNode: Node;
  nodeDefinition: INodeTypeDescription;
  parameters: Record<string, any>;
  onParameterChange: (paramName: string, value: any) => void;
  visible?: boolean;
}

const MapsSection: React.FC<MapsSectionProps> = ({
  nodeDefinition,
  parameters,
  onParameterChange,
  visible = true
}) => {
  const { getStoredApiKey, isConnected } = useApiKeys();
  const [apiKey, setApiKey] = useState<string | undefined>(() => {
    // Initialize with env variable if available
    return getGoogleMapsApiKey();
  });
  const hasFetchedRef = useRef(false);

  // Fetch stored API key from backend when WebSocket is connected
  useEffect(() => {
    if (!isConnected || hasFetchedRef.current) {
      return;
    }

    const fetchApiKey = async () => {
      hasFetchedRef.current = true;
      try {
        const storedKey = await getStoredApiKey('google_maps');
        if (storedKey) {
          setApiKey(storedKey);
        }
      } catch {
        // Keep env key if fetch fails
      }
    };

    fetchApiKey();
  }, [isConnected, getStoredApiKey]);

  if (!visible) {
    return null;
  }

  // Get coordinate parameters and current values
  const locationParams = getCoordinateParams(nodeDefinition);
  const { lat, lng } = getCurrentCoordinates(parameters, locationParams);
  const { zoom, mapTypeId } = getMapDisplayParams(parameters);

  // Create location update handler
  const handleLocationUpdate = createLocationUpdateHandler(locationParams, onParameterChange);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <MapsPreviewPanel
        lat={lat}
        lng={lng}
        zoom={zoom}
        mapTypeId={mapTypeId}
        apiKey={apiKey}
        onLocationClick={handleLocationUpdate}
        title="Maps Preview"
        description="Interactive map based on current parameters"
      />
    </div>
  );
};

export default MapsSection;