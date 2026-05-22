// AlertDetail Component - Shows a single alert with bus location on map
const ALERTS_ENDPOINT = "https://l7srhnplybhzagyehgedib246y0rvmem.lambda-url.ca-central-1.on.aws/";
const VEHICLE_POSITIONS_URL = "https://d3rf53mgwiq7r2.cloudfront.net/canada/halifax/hfx_transit/vehicle_positions.json";
const DELETE_ENDPOINT = "https://bvdsmrpxu2sw3uyqduczxxvyyq0xshms.lambda-url.ca-central-1.on.aws/";

let currentMap = null;
let currentMarker = null;
let refreshInterval = null;

const AlertDetail = {
    render: () => `
        <header class="app-header">
            <h1>Alert Details</h1>
        </header>

        <div class="main-layout alert-detail-layout">
            <button id="backToAlerts" class="back-btn">← Back to Alerts</button>

            <div id="alertDetailContainer" class="alert-detail-container">
                <div class="loading-indicator">🔄 Loading alert details...</div>
            </div>

            <div id="mapContainer" class="map-container" style="height: 400px; margin-top: 20px;"></div>

            <div id="vehicleInfo" class="vehicle-info-panel" style="display: none; margin-top: 20px;">
                <h3>Vehicle Information</h3>
                <div id="vehicleDetails"></div>
                <button id="deleteAlertBtn" class="btn-delete">🗑️ Delete This Alert</button>
            </div>
        </div>
    `,
    init: () => {
        document.getElementById('backToAlerts').addEventListener('click', () => {
            window.location.hash = '#/';
        });

        const params = new URLSearchParams(window.location.search);
        const pk = params.get('pk');
        const sk = params.get('sk');

        if (pk && sk) {
            loadAlertDetail(pk, sk);
        } else {
            document.getElementById('alertDetailContainer').innerHTML =
                '<div class="error-indicator">⚠️ Missing alert parameters (pk/sk)</div>';
        }
    }
};

async function loadAlertDetail(pk, sk) {
    const container = document.getElementById('alertDetailContainer');

    try {
        // Fetch active alerts
        const response = await fetch(ALERTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sk: sk })
        });

        const data = await response.json();
        const alerts = data?.alerts || [];

        // Find the matching alert by pk
        const alert = alerts.find(a => `${a.stop_id}_${a.route_id}` === pk);

        if (!alert) {
            container.innerHTML = '<div class="error-indicator">⚠️ Alert not found</div>';
            return;
        }

        // Display alert information
        container.innerHTML = `
            <div class="alert-detail-card">
                <div class="alert-detail-header">
                    <div>
                        <h2>Stop ${alert.stop_id}</h2>
                        <p class="alert-detail-route">Route ${alert.route_id}</p>
                    </div>
                    <div class="alert-detail-meta">
                        <p><strong>Lead Time:</strong> ${alert.lead_time || 5} minutes</p>
                    </div>
                </div>
            </div>
        `;

        // Initialize map
        initializeMap();

        // Fetch vehicle positions to get trip_id and invalid_after_stop_sequence
        await loadAndDisplayVehicle(alert, sk);

        // Set up delete button
        document.getElementById('deleteAlertBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this alert?')) {
                deleteAlert(pk, sk);
            }
        });
    } catch (e) {
        console.error('Error loading alert:', e);
        container.innerHTML = '<div class="error-indicator">⚠️ Error loading alert details</div>';
    }
}

async function loadAndDisplayVehicle(alert, sk) {
    try {
        const response = await fetch(VEHICLE_POSITIONS_URL);
        const vehicleData = await response.json();

        // Find vehicles matching this alert's route_id
        let bestMatch = null;

        for (const [tripId, vehicleInfo] of Object.entries(vehicleData)) {
            if (vehicleInfo.trip?.route_id === alert.route_id) {
                // This vehicle matches our route
                // We'll store it as best match and get trip_id from the key
                bestMatch = {
                    tripId: tripId,
                    vehicleInfo: vehicleInfo,
                    trip_id: tripId,
                    // Calculate invalid_after_stop_sequence as current + a reasonable buffer (e.g., 3 stops ahead)
                    invalid_after_stop_sequence: Math.max(
                        vehicleInfo.current_stop_sequence,
                        vehicleInfo.current_stop_sequence + 3
                    )
                };
                break;
            }
        }

        const vehiclePanel = document.getElementById('vehicleInfo');
        const vehicleDetails = document.getElementById('vehicleDetails');

        if (bestMatch) {
            const vehicleInfo = bestMatch.vehicleInfo;
            const position = vehicleInfo.position;

            // Validate vehicle data before displaying
            if (position && bestMatch.tripId && bestMatch.invalid_after_stop_sequence !== undefined &&
                vehicleInfo.current_stop_sequence <= bestMatch.invalid_after_stop_sequence) {

                // Update marker on map
                if (currentMarker) {
                    currentMarker.setLatLng([position.latitude, position.longitude]);
                } else {
                    currentMarker = L.marker([position.latitude, position.longitude], {
                        icon: L.icon({
                            iconUrl: 'https://cdn-icons-png.flaticon.com/512/929/929502.png',
                            iconSize: [32, 32],
                            popupAnchor: [0, -16]
                        })
                    }).addTo(currentMap);
                }

                // Center map on vehicle
                currentMap.setView([position.latitude, position.longitude], 15);
            } else {
                // Remove marker if validation fails
                if (currentMarker && currentMap) {
                    currentMap.removeLayer(currentMarker);
                    currentMarker = null;
                }
            }

            // Display vehicle information
            vehicleDetails.innerHTML = `
                <div class="vehicle-details-grid">
                    <div class="detail-item">
                        <span class="label">Vehicle:</span>
                        <span class="value">${vehicleInfo.vehicle?.label || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Position:</span>
                        <span class="value">${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Stop Sequence:</span>
                        <span class="value">${vehicleInfo.current_stop_sequence} / ${bestMatch.invalid_after_stop_sequence}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Speed:</span>
                        <span class="value">${position.speed ? position.speed.toFixed(1) + ' km/h' : 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Direction:</span>
                        <span class="value">${position.bearing ? position.bearing.toFixed(0) + '°' : 'N/A'}</span>
                    </div>
                    ${vehicleInfo.occupancy_status ? `
                    <div class="detail-item">
                        <span class="label">Occupancy:</span>
                        <span class="value">${vehicleInfo.occupancy_status}</span>
                    </div>
                    ` : ''}
                </div>
            `;

            vehiclePanel.style.display = 'block';

            // Set up refresh interval to update vehicle position every 15 seconds
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => updateVehiclePosition(alert, bestMatch), 15000);
        } else {
            vehicleDetails.innerHTML = '<p class="warning">🚌 No vehicles found for this route</p>';
            vehiclePanel.style.display = 'block';
        }
    } catch (e) {
        console.error('Error fetching vehicle positions:', e);
        document.getElementById('vehicleInfo').style.display = 'block';
        document.getElementById('vehicleDetails').innerHTML = '<p class="error">⚠️ Unable to fetch vehicle position data</p>';
    }
}

function initializeMap() {
    const mapContainer = document.getElementById('mapContainer');

    // Remove existing map if it exists
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }

    // Initialize Leaflet map - centered on Halifax
    currentMap = L.map('mapContainer').setView([44.6533, -63.5833], 13);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(currentMap);
}

async function updateVehiclePosition(alert, matchInfo) {
    try {
        const response = await fetch(VEHICLE_POSITIONS_URL);
        const vehicleData = await response.json();

        // Find the vehicle by trip ID if we have it
        const vehicleInfo = vehicleData[matchInfo.tripId];
        const vehicleDetails = document.getElementById('vehicleDetails');

        // Validate all required conditions
        if (vehicleInfo && vehicleInfo.position && matchInfo.tripId &&
            matchInfo.invalid_after_stop_sequence !== undefined &&
            vehicleInfo.current_stop_sequence <= matchInfo.invalid_after_stop_sequence) {

            const position = vehicleInfo.position;

            // Update marker position on map
            if (currentMarker) {
                currentMarker.setLatLng([position.latitude, position.longitude]);
            } else {
                currentMarker = L.marker([position.latitude, position.longitude], {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/929/929502.png',
                        iconSize: [32, 32],
                        popupAnchor: [0, -16]
                    })
                }).addTo(currentMap);
            }

            // Update vehicle details display
            vehicleDetails.innerHTML = `
                <div class="vehicle-details-grid">
                    <div class="detail-item">
                        <span class="label">Vehicle:</span>
                        <span class="value">${vehicleInfo.vehicle?.label || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Position:</span>
                        <span class="value">${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Stop Sequence:</span>
                        <span class="value">${vehicleInfo.current_stop_sequence} / ${matchInfo.invalid_after_stop_sequence}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Speed:</span>
                        <span class="value">${position.speed ? position.speed.toFixed(1) + ' km/h' : 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Direction:</span>
                        <span class="value">${position.bearing ? position.bearing.toFixed(0) + '°' : 'N/A'}</span>
                    </div>
                    ${vehicleInfo.occupancy_status ? `
                    <div class="detail-item">
                        <span class="label">Occupancy:</span>
                        <span class="value">${vehicleInfo.occupancy_status}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Vehicle does not meet validation criteria - remove marker from map
            if (currentMarker && currentMap) {
                currentMap.removeLayer(currentMarker);
                currentMarker = null;
            }

            // Update display to indicate vehicle not available
            if (vehicleInfo) {
                vehicleDetails.innerHTML = '<p class="warning">🚌 Vehicle no longer on valid route or has passed the stop</p>';
            } else {
                vehicleDetails.innerHTML = '<p class="warning">🚌 Vehicle data not available</p>';
            }
        }
    } catch (e) {
        console.error('Error updating vehicle position:', e);
    }
}

async function deleteAlert(pk, sk) {
    try {
        const response = await fetch(DELETE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pk, sk })
        });

        if (response.ok) {
            // Clean up
            if (refreshInterval) clearInterval(refreshInterval);
            if (currentMap) currentMap.remove();

            alert('✅ Alert deleted successfully');
            window.location.hash = '#/';
        } else {
            alert('❌ Failed to delete alert');
        }
    } catch (e) {
        console.error('Error deleting alert:', e);
        alert('❌ Error deleting alert');
    }
}

export default AlertDetail;
