import { INodeTypeDescription, INodeProperties } from '../types/INodeProperties';

// Location parameter utilities
export interface LocationParams {
  latParam: INodeProperties | null;
  lngParam: INodeProperties | null;
}

// Find coordinate parameters in node definition
export const getCoordinateParams = (nodeDefinition: INodeTypeDescription | null): LocationParams => {
  if (!nodeDefinition) return { latParam: null, lngParam: null };

  const latParam = nodeDefinition.properties?.find((p: any) => {
    const name = p.name.toLowerCase();
    return name.includes('lat') || name === 'latitude';
  });

  const lngParam = nodeDefinition.properties?.find((p: any) => {
    const name = p.name.toLowerCase();
    return name.includes('lng') || name.includes('lon') || name === 'longitude';
  });

  return { latParam: latParam || null, lngParam: lngParam || null };
};

// Get current coordinates from parameters
export const getCurrentCoordinates = (
  parameters: Record<string, any>,
  locationParams: LocationParams
) => {
  const { latParam, lngParam } = locationParams;

  const lat = (latParam && parameters[latParam.name]) || latParam?.default || 40.7128;
  const lng = (lngParam && parameters[lngParam.name]) || lngParam?.default || -74.0060;

  return { lat, lng };
};

// Get map display parameters
export const getMapDisplayParams = (parameters: Record<string, any>) => {
  const zoom = parameters.zoom || 13;
  const mapTypeId = parameters.mapTypeId || 'ROADMAP';

  return { zoom, mapTypeId };
};

// Get Google Maps API key with fallbacks
export const getGoogleMapsApiKey = (): string | undefined => {
  // Note: For stored API keys, use ApiKeyManagerService.getStoredApiKeyAsync('google_maps')
  // This function now only returns the environment variable fallback
  return (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || undefined;
};

// Create location update handler
export const createLocationUpdateHandler = (
  locationParams: LocationParams,
  onParameterChange: (paramName: string, value: any) => void
) => {
  return (lat: number, lng: number) => {
    const { latParam, lngParam } = locationParams;

    if (latParam) {
      onParameterChange(latParam.name, lat);
    }
    if (lngParam) {
      onParameterChange(lngParam.name, lng);
    }
  };
};

// Check if a node is location-related
export const isLocationNode = (nodeDefinition: INodeTypeDescription | null): boolean => {
  if (!nodeDefinition) return false;

  const isCreateMap = nodeDefinition.name === 'gmaps_create';
  const hasLocationGroup = nodeDefinition.group?.includes('location') ?? false;
  const hasCoordinates = getCoordinateParams(nodeDefinition).latParam !== null;

  return isCreateMap || hasLocationGroup || hasCoordinates;
};

// Check if node should show maps preview
export const shouldShowMapsPreview = (nodeDefinition: INodeTypeDescription | null): boolean => {
  return nodeDefinition?.name === 'gmaps_create';
};