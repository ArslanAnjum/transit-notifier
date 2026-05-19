import transitData from '../transitData.js';

const API_ENDPOINT = "https://wnxu2jwhfgfopotnnwrtsgjeum0pzwoi.lambda-url.ca-central-1.on.aws/";
const ALERTS_ENDPOINT = "https://l7srhnplybhzagyehgedib246y0rvmem.lambda-url.ca-central-1.on.aws/";
const DELETE_ENDPOINT = "https://bvdsmrpxu2sw3uyqduczxxvyyq0xshms.lambda-url.ca-central-1.on.aws/";
const PUBLIC_VAPID_KEY = "BDZEQSMZKkKmAhr1bIZUBN7TrQBQS53hyhXLCEF4Pi0LidSKeCpO2ozy8WYuG38ephBxoaVYGEsoQlpKvurGVRg";

let stopSearchControl, routeSearchControl, leadTimeSearchControl;
let pendingDeletionTarget = null;

const Tracker = {
    render: () => `
        <header class="app-header">
            <h1>Configure Alert Trigger</h1>
            <p>Set proximity push notifications directly to your device</p>
        </header>

        <div class="main-layout">
            <div class="card">
                <h2>Track New Run</h2>
                <div class="form-group">
                    <label for="stopId">1. Select Stop Location</label>
                    <select id="stopId" placeholder="Search or select Stop ID...">
                        <option value="">Search or select Stop ID...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="routeId">2. Select Bus Route</label>
                    <select id="routeId" placeholder="Waiting for Stop selection..." disabled>
                        <option value="">Waiting for Stop selection...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="leadTime">3. Select Alert Lead Time</label>
                    <select id="leadTime">
                        <option value="5" selected>5 mins</option>
                        <option value="10">10 mins</option>
                        <option value="15">15 mins</option>
                        <option value="30">30 mins</option>
                    </select>
                </div>
                <button id="submitBtn">Set 5-Min Smart Alert</button>
                <p id="status">Select your route parameters to begin tracking.</p>
            </div>

            <div>
                <h3 class="watchlist-title">Active Watchlist Alerts</h3>
                <div id="alertsContainer"></div>
            </div>
        </div>
    `,
    init: () => {
        // Core initialization bindings
        initializeSearchDropdowns();
        fetchAndDisplayAlerts();

        document.getElementById('submitBtn').addEventListener('click', requestAndRegisterAlert);
        document.getElementById('alertsContainer').addEventListener('click', handleAlertContainerClick);

        // Modal global triggers setup/reset
        document.getElementById('modalCancelBtn').onclick = closeConfirmModal;
        document.getElementById('modalConfirmBtn').onclick = executeDeletionConfirmed;
    }
};

// --- Copy original support methods here securely ---
function initializeSearchDropdowns() {
    const allStops = Object.keys(transitData).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    const stopSelectEl = document.getElementById('stopId');
    if(!stopSelectEl) return;

    allStops.forEach(stopId => {
        const option = document.createElement('option');
        option.value = stopId;
        option.textContent = `Stop ${stopId}`;
        stopSelectEl.appendChild(option);
    });

    stopSearchControl = new TomSelect('#stopId', {
        create: false,
        sortField: { field: "text", direction: "asc" },
        onChange: (val) => updateRouteDropdownOptions(val)
    });

    routeSearchControl = new TomSelect('#routeId', { create: false, sortField: { field: "text", direction: "asc" } });
    routeSearchControl.disable();

    leadTimeSearchControl = new TomSelect('#leadTime', {
        create: false,
        disableSearch: true,
        onChange: (val) => { document.getElementById('submitBtn').innerText = `Set ${val}-Min Smart Alert`; }
    });
}

function updateRouteDropdownOptions(selectedStop) {
    routeSearchControl.clear();
    routeSearchControl.clearOptions();
    if (selectedStop && transitData[selectedStop]) {
        routeSearchControl.enable();
        routeSearchControl.addOptions(transitData[selectedStop].map(r => ({ value: r, text: `Route ${r}` })));
        routeSearchControl.refreshOptions(false);
    } else {
        routeSearchControl.disable();
    }
}

function getOrCreateBrowserId() {
    let id = localStorage.getItem('transit_browser_id');
    if (!id) {
        id = `USER_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        localStorage.setItem('transit_browser_id', id);
    }
    return id;
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

async function requestAndRegisterAlert() {
    const stopId = stopSearchControl.getValue();
    const routeId = routeSearchControl.getValue();
    const leadTime = leadTimeSearchControl.getValue();
    const statusText = document.getElementById('status');

    if (!stopId || !routeId || !leadTime) {
        statusText.style.color = "var(--error)";
        statusText.innerText = "⚠️ Missing required configurations.";
        return;
    }

    try {
        statusText.style.color = "var(--text-main)";
        statusText.innerText = "🔄 Requesting permissions...";
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            statusText.style.color = "var(--error)";
            statusText.innerText = "❌ System permission denied.";
            return;
        }

        const registration = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });

        const databasePayload = {
            pk: `${stopId}_${routeId}`,
            sk: getOrCreateBrowserId(),
            endpoint_url: subscription.endpoint,
            auth_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))),
            p256dh_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
            lead_time: parseInt(leadTime),
            is_active: true
        };

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(databasePayload)
        });

        if (response.ok) {
            statusText.style.color = "var(--success)";
            statusText.innerText = `✅ Tracking active!`;
            fetchAndDisplayAlerts();
        } else {
            statusText.innerText = "❌ Registration rejected.";
        }
    } catch (error) {
        statusText.innerText = `❌ Error: ${error.message}`;
    }
}

async function fetchAndDisplayAlerts() {
    const alertsContainer = document.getElementById('alertsContainer');
    if(!alertsContainer) return;
    alertsContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">🔄 Loading watch alerts...</div>';

    try {
        const response = await fetch(ALERTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sk: getOrCreateBrowserId() })
        });
        const data = await response.json();
        const alerts = data?.alerts || [];

        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<div class="empty-watchlist">No active tracking routes found.</div>';
            return;
        }

        alertsContainer.innerHTML = alerts.map(alert => `
            <div class="alert-item">
                <div>
                    <div class="alert-info-title">Stop ${alert.stop_id}</div>
                    <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">Route ${alert.route_id} (${alert.lead_time || 5} min window)</div>
                </div>
                <div class="alert-actions">
                    <span class="alert-tag ${alert.status ? 'tag-active' : 'tag-inactive'}">${alert.status ? 'Active' : 'Inactive'}</span>
                    <button class="btn-delete" data-pk="${alert.stop_id}_${alert.route_id}" data-sk="${getOrCreateBrowserId()}" data-stop="${alert.stop_id}" data-route="${alert.route_id}">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        alertsContainer.innerHTML = '<div style="text-align:center;color:var(--error);">⚠️ Error loading watchlist feed.</div>';
    }
}

function handleAlertContainerClick(e) {
    if (!e.target.classList.contains('btn-delete')) return;
    pendingDeletionTarget = e.target;
    document.getElementById('modalMessage').innerText = `Are you sure you want to stop tracking Route ${pendingDeletionTarget.getAttribute('data-route')} at Stop ${pendingDeletionTarget.getAttribute('data-stop')}?`;
    document.getElementById('customConfirmModal').classList.add('is-active');
}

function closeConfirmModal() {
    document.getElementById('customConfirmModal').classList.remove('is-active');
    pendingDeletionTarget = null;
}

async function executeDeletionConfirmed() {
    if (!pendingDeletionTarget) return;
    const btn = pendingDeletionTarget;
    closeConfirmModal();
    btn.innerText = "Removing...";
    btn.disabled = true;

    try {
        const res = await fetch(DELETE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pk: btn.getAttribute('data-pk'), sk: btn.getAttribute('data-sk') })
        });
        if (res.ok) fetchAndDisplayAlerts();
    } catch (err) {
        alert("Error executing removal logic.");
    }
}

export default Tracker;