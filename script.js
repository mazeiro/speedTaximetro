// Variables globales
let totalDistance = 0;
let waitMinutes = 0;
let waitSeconds = 0;

// Variables de control
let isRunning = false;
let isPaused = false;
let watchId = null;
let waitInterval = null;

// Posiciones
let originLat = null;
let originLng = null;
let lastLat = null;
let lastLng = null;

// Elementos DOM
const costElement = document.getElementById('cost');
const kmElement = document.getElementById('km');
const waitTimeElement = document.getElementById('wait-time');
const statusElement = document.getElementById('status');
const gpsStatusElement = document.getElementById('gps-status');

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');

// Fórmula de Haversine para calcular distancia
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en kilómetros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

// Calcular costo según tabla de tarifas
function calculateCost(distance, waitMinutes) {
    let baseCost = 0;
    
    if (distance <= 4) {
        baseCost = 50;
    } else if (distance <= 5) {
        baseCost = 60;
    } else if (distance <= 6) {
        baseCost = 65;
    } else if (distance <= 7) {
        baseCost = 70;
    } else if (distance <= 8) {
        baseCost = 80;
    } else {
        // Más de 8 km: $80 + $16 por cada km adicional
        const extraKm = distance - 8;
        baseCost = 80 + (extraKm * 16);
    }
    
    // Agregar costo por tiempo de espera
    const waitCost = waitMinutes * 3;
    
    return Math.round(baseCost + waitCost);
}

// Actualizar display
function updateDisplay() {
    const totalCost = calculateCost(totalDistance, waitMinutes + (waitSeconds / 60));
    
    costElement.textContent = totalCost;
    kmElement.textContent = totalDistance.toFixed(3) + ' km';
    
    const minutes = Math.floor((waitMinutes * 60 + waitSeconds) / 60);
    const seconds = (waitMinutes * 60 + waitSeconds) % 60;
    waitTimeElement.textContent = 
        String(minutes).padStart(2, '0') + ':' + 
        String(Math.floor(seconds)).padStart(2, '0');
}

// Manejar nueva posición GPS
function handlePosition(position) {
    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;
    
    console.log('Nueva posición GPS:', currentLat, currentLng);
    
    if (originLat === null || originLng === null) {
        // Primera posición - establecer origen
        originLat = currentLat;
        originLng = currentLng;
        console.log('Origen establecido:', originLat, originLng);
    }
    
    if (!isPaused) {
        // Calcular distancia total desde el origen
        totalDistance = calculateHaversineDistance(originLat, originLng, currentLat, currentLng);
        console.log('Distancia total desde origen:', totalDistance.toFixed(3), 'km');
        updateDisplay();
    }
    
    lastLat = currentLat;
    lastLng = currentLng;
    
    // Actualizar estado GPS
    gpsStatusElement.textContent = 'GPS Activo';
    gpsStatusElement.className = 'value gps-available';
}

// Manejar error GPS
function handlePositionError(error) {
    console.error('Error GPS:', error);
    let errorMessage = 'Error GPS';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Acceso denegado';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'No disponible';
            break;
        case error.TIMEOUT:
            errorMessage = 'Tiempo agotado';
            break;
    }
    
    gpsStatusElement.textContent = errorMessage;
    gpsStatusElement.className = 'value gps-error';
}

// Iniciar cronómetro de espera
function startWaitTimer() {
    waitInterval = setInterval(() => {
        waitSeconds++;
        if (waitSeconds >= 60) {
            waitMinutes++;
            waitSeconds = 0;
        }
        updateDisplay();
    }, 1000);
}

// Detener cronómetro de espera
function stopWaitTimer() {
    if (waitInterval) {
        clearInterval(waitInterval);
        waitInterval = null;
    }
}

// Event Listeners
startBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert('Geolocalización no disponible en este dispositivo');
        return;
    }
    
    console.log('🚀 Iniciando taxímetro...');
    
    // Resetear variables
    totalDistance = 0;
    waitMinutes = 0;
    waitSeconds = 0;
    originLat = null;
    originLng = null;
    
    isRunning = true;
    isPaused = false;
    
    // Actualizar UI
    statusElement.textContent = 'En marcha';
    statusElement.className = 'value status-running';
    gpsStatusElement.textContent = 'Buscando GPS...';
    gpsStatusElement.className = 'value gps-searching pulse';
    
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    
    // Iniciar seguimiento GPS
    watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handlePositionError,
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 1000
        }
    );
    
    console.log('✅ Seguimiento GPS iniciado con ID:', watchId);
    updateDisplay();
});

pauseBtn.addEventListener('click', () => {
    console.log('⏸️ Pausando taxímetro...');
    
    isPaused = true;
    
    // Actualizar UI
    statusElement.textContent = 'Pausado';
    statusElement.className = 'value status-paused pulse';
    
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'inline-block';
    resumeBtn.disabled = false;
    
    // Iniciar cronómetro de espera
    startWaitTimer();
});

resumeBtn.addEventListener('click', () => {
    console.log('▶️ Reanudando taxímetro...');
    
    isPaused = false;
    
    // Actualizar UI
    statusElement.textContent = 'En marcha';
    statusElement.className = 'value status-running';
    
    resumeBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.disabled = false;
    
    // Detener cronómetro de espera
    stopWaitTimer();
});

stopBtn.addEventListener('click', () => {
    console.log('🛑 Finalizando taxímetro...');
    
    // Detener seguimiento GPS
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log('🔄 Seguimiento GPS detenido');
    }
    
    // Detener cronómetro de espera
    stopWaitTimer();
    
    // Calcular datos finales
    const finalCost = calculateCost(totalDistance, waitMinutes + (waitSeconds / 60));
    const totalWaitTime = waitMinutes + (waitSeconds / 60);
    
    // Mostrar modal con resultados
    showTripModal(totalDistance, totalWaitTime, finalCost);
    
    // Resetear todo
    isRunning = false;
    isPaused = false;
    totalDistance = 0;
    waitMinutes = 0;
    waitSeconds = 0;
    originLat = null;
    originLng = null;
    
    // Actualizar UI
    statusElement.textContent = 'Detenido';
    statusElement.className = 'value status-stopped';
    gpsStatusElement.textContent = 'No disponible';
    gpsStatusElement.className = 'value';
    
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.style.display = 'inline-block';
    resumeBtn.disabled = true;
    resumeBtn.style.display = 'none';
    stopBtn.disabled = true;
    
    updateDisplay();
});

// Función para mostrar el modal de resultado
function showTripModal(distance, waitTime, totalCost) {
    const modal = document.getElementById('trip-modal');
    const modalDistance = document.getElementById('modal-distance');
    const modalWaitTime = document.getElementById('modal-wait-time');
    const modalTotal = document.getElementById('modal-total');
    
    // Actualizar contenido del modal
    modalDistance.textContent = distance.toFixed(3) + ' km';
    modalWaitTime.textContent = waitTime.toFixed(1) + ' min';
    modalTotal.textContent = '$' + totalCost + ' MXN';
    
    // Mostrar modal
    modal.style.display = 'block';
}

// Event listener para cerrar el modal
document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('trip-modal').style.display = 'none';
});

// Cerrar modal al hacer clic fuera de él
window.addEventListener('click', (event) => {
    const modal = document.getElementById('trip-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// Verificar disponibilidad de GPS al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (navigator.geolocation) {
        gpsStatusElement.textContent = 'Disponible';
        gpsStatusElement.className = 'value gps-available';
    } else {
        gpsStatusElement.textContent = 'No soportado';
        gpsStatusElement.className = 'value gps-error';
        startBtn.disabled = true;
    }
    
    updateDisplay();
    console.log('🚕 Taxímetro Speed Cabs iniciado');
});