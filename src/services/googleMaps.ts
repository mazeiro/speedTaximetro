import { Loader } from '@googlemaps/js-api-loader';

const GOOGLE_MAPS_API_KEY = 'AIzaSyDyArJkh_IF8L0BgNONsldhk5MBOtRHbTg';

let googleMapsLoader: Loader | null = null;
let isGoogleMapsLoaded = false;

export const initializeGoogleMaps = async (): Promise<void> => {
  if (isGoogleMapsLoaded) return;

  try {
    googleMapsLoader = new Loader({
      apiKey: GOOGLE_MAPS_API_KEY,
      version: 'weekly',
      libraries: ['geometry', 'places']
    });

    await googleMapsLoader.load();
    isGoogleMapsLoaded = true;
    console.log('Google Maps API cargada correctamente');
  } catch (error) {
    console.error('Error cargando Google Maps API:', error);
    throw error;
  }
};

export const calculateDistanceWithGoogleMaps = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  if (!isGoogleMapsLoaded || !window.google) {
    // Fallback al cálculo Haversine si Google Maps no está disponible
    return calculateHaversineDistance(lat1, lng1, lat2, lng2);
  }

  try {
    const point1 = new google.maps.LatLng(lat1, lng1);
    const point2 = new google.maps.LatLng(lat2, lng2);
    
    // Usar la función de geometría de Google Maps para mayor precisión
    const distance = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);
    
    // Convertir de metros a kilómetros
    return distance / 1000;
  } catch (error) {
    console.error('Error calculando distancia con Google Maps:', error);
    // Fallback al cálculo Haversine
    return calculateHaversineDistance(lat1, lng1, lat2, lng2);
  }
};

// Función de respaldo usando fórmula Haversine
const calculateHaversineDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Radio de la Tierra en kilómetros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const isGoogleMapsReady = (): boolean => {
  return isGoogleMapsLoaded && !!window.google;
};

// Función para obtener información de ubicación más detallada
export const getLocationInfo = async (lat: number, lng: number): Promise<string> => {
  if (!isGoogleMapsReady()) {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  try {
    const geocoder = new google.maps.Geocoder();
    const response = await geocoder.geocode({
      location: { lat, lng }
    });

    if (response.results && response.results.length > 0) {
      return response.results[0].formatted_address;
    }
    
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch (error) {
    console.error('Error obteniendo información de ubicación:', error);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
};