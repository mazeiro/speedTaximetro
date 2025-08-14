import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Navigation, DollarSign, Clock, Route, Info, ChevronDown, ChevronUp, Zap, MapPin } from 'lucide-react';
import { initializeGoogleMaps, calculateDistanceWithGoogleMaps, isGoogleMapsReady, getLocationInfo } from './services/googleMaps';
import InstallPrompt from './components/InstallPrompt';
import { useServiceWorker } from './hooks/useServiceWorker';

interface Position {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface OriginPosition {
  latitude: number;
  longitude: number;
  timestamp: number;
  address?: string;
}
interface TripData {
  distance: number;
  duration: number;
  waitingTime: number;
  cost: number;
  isRunning: boolean;
  isPaused: boolean;
}

interface TripSummary {
  distance: number;
  waitingTime: number;
  cost: number;
  timestamp: string;
}

// Configuración de tarifas
const RATES = {
  baseFare: 50, // Tarifa base en MXN
  waitingRate: 3, // Costo por minuto de espera en MXN
  ranges: [
    { min: 0, max: 4, price: 50 },
    { min: 4, max: 5, price: 60 },
    { min: 5, max: 6, price: 65 },
    { min: 6, max: 7, price: 70 },
    { min: 7, max: 8, price: 80 },
    { min: 8, max: Infinity, price: 80 } // Después de 8km mantiene el precio
  ]
};

function App() {
  // Registrar service worker
  useServiceWorker();

  const [tripData, setTripData] = useState<TripData>({
    distance: 0,
    duration: 0,
    waitingTime: 0,
    cost: RATES.baseFare,
    isRunning: false,
    isPaused: false
  });

  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [originPosition, setOriginPosition] = useState<OriginPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'unavailable' | 'requesting' | 'available' | 'denied'>('unavailable');
  const [showRates, setShowRates] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [lastTripSummary, setLastTripSummary] = useState<TripSummary | null>(null);
  const [googleMapsReady, setGoogleMapsReady] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [originAddress, setOriginAddress] = useState<string>('');
  
  const lastPosition = useRef<Position | null>(null);
  const startTime = useRef<number | null>(null);
  const pauseStartTime = useRef<number | null>(null);
  const watchId = useRef<number | null>(null);
  const intervalId = useRef<number | null>(null);

  // Función para calcular distancia usando Google Maps API o Haversine como fallback
  const calculateDistanceFromOrigin = (currentPos: Position, originPos: OriginPosition): number => {
    return calculateDistanceWithGoogleMaps(
      originPos.latitude,
      originPos.longitude,
      currentPos.latitude,
      currentPos.longitude
    );
  };

  // Calcular costo basado en distancia y tiempo
  const calculateCost = (distance: number, waitingMinutes: number): number => {
    // Encontrar el rango de precio apropiado
    const range = RATES.ranges.find(r => distance >= r.min && distance <= r.max);
    const baseCost = range ? range.price : RATES.ranges[RATES.ranges.length - 1].price;
    const waitingCost = waitingMinutes * RATES.waitingRate;
    console.log(`Distancia: ${distance}km, Rango encontrado:`, range, `Costo base: ${baseCost}, Costo espera: ${waitingCost}`);
    return baseCost + waitingCost;
  };

  // Inicializar geolocalización
  useEffect(() => {
    // Inicializar Google Maps API
    const initMaps = async () => {
      try {
        await initializeGoogleMaps();
        setGoogleMapsReady(true);
        console.log('Google Maps API inicializada correctamente');
      } catch (error) {
        console.error('Error inicializando Google Maps API:', error);
        setGoogleMapsReady(false);
      }
    };

    initMaps();

    if ('geolocation' in navigator) {
      setGpsStatus('available');
    } else {
      setGpsStatus('unavailable');
    }
  }, []);

  // Manejar actualizaciones de posición
  const handlePositionUpdate = (position: GeolocationPosition) => {
    const newPosition: Position = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: Date.now()
    };

    console.log('Nueva posición GPS:', newPosition);
    setCurrentPosition(newPosition);

    // Obtener información de dirección si Google Maps está listo
    if (googleMapsReady) {
      getLocationInfo(newPosition.latitude, newPosition.longitude)
        .then(address => setCurrentAddress(address))
        .catch(error => console.error('Error obteniendo dirección:', error));
    }

    if (tripData.isRunning && !tripData.isPaused && originPosition) {
      // Calcular distancia total desde el origen
      const totalDistance = calculateDistanceFromOrigin(newPosition, originPosition);
      
      console.log('Distancia total desde origen:', totalDistance, 'km');
      console.log('Posición origen:', originPosition);
      console.log('Posición actual:', newPosition);
      
      // Actualizar distancia total y costo
      setTripData(prev => {
        const newCost = calculateCost(totalDistance, prev.waitingTime / 60);
        console.log('📊 Distancia total:', totalDistance.toFixed(3), 'km, Costo: $', newCost);
        
        return {
          ...prev,
          distance: totalDistance,
          cost: newCost
        };
      });
    }

    lastPosition.current = newPosition;
  };

  // Iniciar el taxímetro
  const startTrip = () => {
    if (gpsStatus !== 'available') return;

    setGpsStatus('requesting');
    console.log('🚀 Iniciando viaje...');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsStatus('available');
        console.log('📍 Posición inicial obtenida:', position.coords);
        
        // Establecer posición de origen
        const origin: OriginPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now()
        };
        setOriginPosition(origin);
        
        // Obtener dirección de origen si Google Maps está disponible
        if (googleMapsReady) {
          getLocationInfo(origin.latitude, origin.longitude)
            .then(address => {
              setOriginAddress(address);
              setOriginPosition(prev => prev ? { ...prev, address } : null);
            })
            .catch(error => console.error('Error obteniendo dirección de origen:', error));
        }
        
        handlePositionUpdate(position);
        startTime.current = Date.now();
        
        setTripData(prev => ({
          ...prev,
          distance: 0, // Reiniciar distancia desde 0
          isRunning: true,
          isPaused: false
        }));

        // Iniciar seguimiento GPS
        watchId.current = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          (error) => {
            console.error('Error GPS:', error);
            setGpsStatus('denied');
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1000
          }
        );
        
        console.log('✅ Seguimiento GPS iniciado con watchId:', watchId.current);
      },
      (error) => {
        console.error('Error obteniendo posición:', error);
        setGpsStatus('denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // Pausar/reanudar el taxímetro
  const togglePause = () => {
    setTripData(prev => {
      if (!prev.isPaused) {
        // Pausar - iniciar conteo de tiempo de espera
        console.log('⏸️ Pausando viaje...');
        pauseStartTime.current = Date.now();
        
        // Iniciar contador de tiempo de espera
        intervalId.current = window.setInterval(() => {
          if (pauseStartTime.current) {
            const waitingSeconds = (Date.now() - pauseStartTime.current) / 1000;
            setTripData(current => ({
              ...current,
              waitingTime: current.waitingTime + 1,
              cost: calculateCost(current.distance, (current.waitingTime + 1) / 60)
            }));
          }
        }, 1000);
        
        return { ...prev, isPaused: true };
      } else {
        // Reanudar - detener conteo de tiempo de espera
        console.log('▶️ Reanudando viaje...');
        if (intervalId.current) {
          clearInterval(intervalId.current);
          intervalId.current = null;
        }
        pauseStartTime.current = null;
        
        return { ...prev, isPaused: false };
      }
    });
  };

  // Detener y reiniciar el taxímetro
  const stopTrip = () => {
    console.log('🛑 Finalizando viaje...');
    console.log('📊 Resumen final - Distancia:', tripData.distance.toFixed(3), 'km, Costo: $', tripData.cost);
    if (originPosition && originAddress) {
      console.log('📍 Origen del viaje:', originAddress);
    }
    
    // Guardar resumen del viaje antes de reiniciar
    if (tripData.isRunning && (tripData.distance > 0 || tripData.waitingTime > 0)) {
      const summary: TripSummary = {
        distance: tripData.distance,
        waitingTime: tripData.waitingTime,
        cost: tripData.cost,
        timestamp: new Date().toLocaleString('es-MX', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      };
      setLastTripSummary(summary);
      setShowSummary(true);
    }

    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      console.log('🔄 Seguimiento GPS detenido');
      watchId.current = null;
    }
    
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }

    setTripData({
      distance: 0,
      duration: 0,
      waitingTime: 0,
      cost: RATES.baseFare,
      isRunning: false,
      isPaused: false
    });

    lastPosition.current = null;
    startTime.current = null;
    pauseStartTime.current = null;
    setOriginPosition(null);
    setOriginAddress('');
  };

  // Limpiar intervalos al desmontar
  useEffect(() => {
    return () => {
      if (watchId.current) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    if (!tripData.isRunning) return 'bg-gray-400 shadow-gray-400/50';
    if (tripData.isPaused) return 'bg-yellow-400 shadow-yellow-400/50';
    return 'bg-green-400 shadow-green-400/50';
  };

  const getStatusText = () => {
    if (!tripData.isRunning) return 'Detenido';
    if (tripData.isPaused) return 'Pausado';
    return 'En marcha';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 p-4">
      <InstallPrompt />
      <div className="max-w-md mx-auto">
        {/* Modal de resumen del viaje */}
        {showSummary && lastTripSummary && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-900 to-black border border-yellow-400 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-yellow-400 mr-2" />
                <h2 className="text-2xl font-bold text-center text-white">
                  Resumen del Viaje
                </h2>
              </div>
              
              <div className="space-y-4">
                <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Distancia recorrida:</span>
                    <span className="font-bold text-lg text-yellow-400">{lastTripSummary.distance.toFixed(3)} km</span>
                  </div>
                  
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Tiempo de espera:</span>
                    <span className="font-bold text-lg text-yellow-400">{formatTime(lastTripSummary.waitingTime)}</span>
                  </div>
                  
                  <div className="border-t border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold text-lg">Total a cobrar:</span>
                      <span className="font-bold text-2xl text-green-400">
                        ${lastTripSummary.cost.toFixed(0)} MXN
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-center text-sm text-gray-400">
                  Viaje finalizado: {lastTripSummary.timestamp}
                </div>
                
                <button
                  onClick={() => setShowSummary(false)}
                  className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-105 shadow-lg"
                >
                  Cerrar Resumen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-black via-gray-900 to-black border-b-2 border-yellow-400 rounded-t-xl p-6 text-center shadow-2xl">
          <div className="flex items-center justify-center mb-2">
            <Zap className="w-10 h-10 text-yellow-400 mr-3 animate-pulse" />
            <div>
              <h1 className="text-3xl font-bold text-white tracking-wider">SPEED CABS</h1>
              <p className="text-yellow-400 text-sm font-semibold tracking-widest">ZAPOTLAN</p>
            </div>
            <Zap className="w-10 h-10 text-yellow-400 ml-3 animate-pulse" />
          </div>
          <div className="flex items-center justify-center mt-2">
            <div className={`w-4 h-4 rounded-full ${getStatusColor()} mr-2 animate-pulse shadow-lg`}></div>
            <span className="text-sm text-gray-300 font-medium">{getStatusText()}</span>
          </div>
        </div>

        {/* Pantalla principal */}
        <div className="bg-gradient-to-b from-gray-900 to-black text-yellow-400 p-6 text-center border-x-2 border-yellow-400">
          <div className="text-6xl font-mono font-bold mb-6 bg-gradient-to-br from-black to-gray-900 p-6 rounded-xl border-2 border-yellow-400 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/5 to-transparent animate-pulse"></div>
            ${tripData.cost.toFixed(0)} MXN
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-gray-700 shadow-lg hover:border-yellow-400/50 transition-all">
              <div className="flex items-center justify-center mb-1">
                <Route className="w-5 h-5 mr-1 text-yellow-400" />
              </div>
              <div className="text-xs text-gray-400 font-semibold">DISTANCIA</div>
              <div className="font-mono font-bold text-white">{tripData.distance.toFixed(3)} km</div>
            </div>
            
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-gray-700 shadow-lg hover:border-yellow-400/50 transition-all">
              <div className="flex items-center justify-center mb-1">
                <Clock className="w-5 h-5 mr-1 text-yellow-400" />
              </div>
              <div className="text-xs text-gray-400 font-semibold">ESPERA</div>
              <div className="font-mono font-bold text-white">{formatTime(tripData.waitingTime)}</div>
            </div>
            
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-gray-700 shadow-lg hover:border-yellow-400/50 transition-all">
              <div className="flex items-center justify-center mb-1">
                <Navigation className="w-5 h-5 mr-1 text-yellow-400" />
              </div>
              <div className="text-xs text-gray-400 font-semibold">GPS</div>
              <div className="font-bold text-xs text-white">
                {gpsStatus === 'available' && currentPosition ? (googleMapsReady ? 'Maps+GPS' : 'GPS Básico') : 
                 gpsStatus === 'requesting' ? 'Buscando...' :
                 gpsStatus === 'denied' ? 'Sin acceso' : 'No disponible'}
              </div>
            </div>
          </div>

          {/* Información de ubicación actual */}
          {currentPosition && currentAddress && (
            <div className="mt-4 bg-gradient-to-br from-gray-800 to-gray-900 p-3 rounded-xl border border-gray-700 shadow-lg">
              <div className="flex items-center justify-center mb-2">
                <MapPin className="w-4 h-4 text-yellow-400 mr-2" />
                <span className="text-xs text-gray-400 font-semibold">UBICACIÓN ACTUAL</span>
              </div>
              <div className="text-xs text-white text-center break-words">
                {currentAddress}
              </div>
            </div>
          )}

          {/* Información de ubicación de origen durante el viaje */}
          {tripData.isRunning && originPosition && originAddress && (
            <div className="mt-2 bg-gradient-to-br from-green-800 to-green-900 p-3 rounded-xl border border-green-700 shadow-lg">
              <div className="flex items-center justify-center mb-2">
                <MapPin className="w-4 h-4 text-green-400 mr-2" />
                <span className="text-xs text-green-400 font-semibold">ORIGEN DEL VIAJE</span>
              </div>
              <div className="text-xs text-white text-center break-words">
                {originAddress}
              </div>
            </div>
          )}
        </div>

        {/* Controles */}
        <div className="bg-gradient-to-b from-black to-gray-900 p-6 rounded-b-xl border-2 border-t-0 border-yellow-400 shadow-2xl">
          <div className="flex justify-center space-x-4">
            {!tripData.isRunning ? (
              <button
                onClick={startTrip}
                disabled={gpsStatus !== 'available'}
                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-4 rounded-xl flex items-center font-bold text-lg transition-all transform hover:scale-105 shadow-lg border border-green-400"
              >
                <Play className="w-6 h-6 mr-2 drop-shadow-lg" />
                INICIAR
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black px-6 py-4 rounded-xl flex items-center font-bold transition-all transform hover:scale-105 shadow-lg border border-yellow-400"
                >
                  {tripData.isPaused ? (
                    <>
                      <Play className="w-5 h-5 mr-2 drop-shadow-lg" />
                      REANUDAR
                    </>
                  ) : (
                    <>
                      <Pause className="w-5 h-5 mr-2 drop-shadow-lg" />
                      PAUSAR
                    </>
                  )}
                </button>
                
                <button
                  onClick={stopTrip}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-4 rounded-xl flex items-center font-bold transition-all transform hover:scale-105 shadow-lg border border-red-400"
                >
                  <Square className="w-5 h-5 mr-2 drop-shadow-lg" />
                  FINALIZAR
                </button>
              </>
            )}
          </div>

          {/* Información de tarifas */}
          <div className="mt-6">
            <button
              onClick={() => setShowRates(!showRates)}
              className="w-full bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 text-yellow-400 p-4 rounded-xl flex items-center justify-center font-bold transition-all border border-gray-600 hover:border-yellow-400/50 shadow-lg"
            >
              <Info className="w-5 h-5 mr-2" />
              VER TARIFAS
              {showRates ? (
                <ChevronUp className="w-5 h-5 ml-2" />
              ) : (
                <ChevronDown className="w-5 h-5 ml-2" />
              )}
            </button>
            
            {showRates && (
              <div className="mt-3 bg-gradient-to-br from-gray-800 to-gray-900 p-4 rounded-xl border border-gray-600 shadow-lg">
                <div className="flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5 text-yellow-400 mr-2" />
                  <h3 className="text-yellow-400 font-bold text-center">TARIFAS SPEED CABS</h3>
                </div>
                <div className="text-white text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Tarifa base:</span>
                    <span className="text-yellow-400 font-semibold">${RATES.baseFare} MXN</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiempo espera:</span>
                    <span className="text-yellow-400 font-semibold">${RATES.waitingRate} MXN/min</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-3 bg-gray-800 p-2 rounded-lg">
                    <div className="flex justify-between"><span>0-4 km:</span><span className="text-yellow-400">$50 MXN</span></div>
                    <div className="flex justify-between"><span>4-5 km:</span><span className="text-yellow-400">$60 MXN</span></div>
                    <div className="flex justify-between"><span>5-6 km:</span><span className="text-yellow-400">$65 MXN</span></div>
                    <div className="flex justify-between"><span>6-7 km:</span><span className="text-yellow-400">$70 MXN</span></div>
                    <div className="flex justify-between"><span>7-8 km:</span><span className="text-yellow-400">$80 MXN</span></div>
                    <div className="flex justify-between"><span>8+ km:</span><span className="text-yellow-400">$80 MXN</span></div>
                    <div className="text-center mt-2 pt-2 border-t border-gray-600">
                      <span className="text-yellow-400 text-xs">
                        {googleMapsReady ? '✓ Google Maps Activo' : '⚠ GPS Básico'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {gpsStatus === 'denied' && (
            <div className="mt-4 bg-gradient-to-r from-red-600 to-red-700 text-white p-4 rounded-xl text-center border border-red-500 shadow-lg">
              <p className="text-sm">Se necesita acceso a la ubicación para funcionar correctamente.</p>
            </div>
          )}

          {gpsStatus === 'unavailable' && (
            <div className="mt-4 bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 rounded-xl text-center border border-orange-500 shadow-lg">
              <p className="text-sm">GPS no disponible en este dispositivo.</p>
            </div>
          )}

          {!googleMapsReady && gpsStatus === 'available' && (
            <div className="mt-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-xl text-center border border-blue-500 shadow-lg">
              <p className="text-sm">Usando GPS básico. Google Maps no disponible.</p>
            </div>
          )}
          
          {/* Panel de debug para desarrollo */}
          {tripData.isRunning && currentPosition && (
            <div className="mt-4 bg-gradient-to-r from-purple-800 to-purple-900 text-white p-3 rounded-xl text-center border border-purple-500 shadow-lg">
              <div className="text-xs">
                <div>Estado: {tripData.isPaused ? 'Pausado' : 'Activo'}</div>
                <div>Precisión GPS: {googleMapsReady ? 'Google Maps' : 'Haversine'}</div>
                <div>Origen establecido: {originPosition ? 'Sí' : 'No'}</div>
                <div>Última actualización: {new Date().toLocaleTimeString()}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { App };
export default App;