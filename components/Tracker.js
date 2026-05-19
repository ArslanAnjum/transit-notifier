import transitData from '../transitData.js';
// 1. Import About to access its template layout when trackers are empty
import About from './About.js';

const API_ENDPOINT = "https://wnxu2jwhfgfopotnnwrtsgjeum0pzwoi.lambda-url.ca-central-1.on.aws/";
const ALERTS_ENDPOINT = "https://l7srhnplybhzagyehgedib246y0rvmem.lambda-url.ca-central-1.on.aws/";
const DELETE_ENDPOINT = "https://bvdsmrpxu2sw3uyqduczxxvyyq0xshms.lambda-url.ca-central-1.on.aws/";
const PUBLIC_VAPID_KEY = "BDZEQSMZKkKmAhr1bIZUBN7TrQBQS53hyhXLCEF4Pi0LidSKeCpO2ozy8WYuG38ephBxoaVYGEsoQlpKvurGVRg";

let stopSearchControl, routeSearchControl, leadTimeSearchControl;
let pendingDeletionTarget = null;

const Tracker = {
    render: () => `
        <header class="app-header">
            <h1>NexxtUp Alerts</h1>
            <p>Smart proximity notifications for your transit routes</p>
        </header>

        <div class="main-layout tracker-main-layout">
            <button id="openCreateModalBtn" class="create-tracker-btn">
                ➕ Track New Transit Route
            </button>

            <div>
                <h3 class="watchlist-title">Active Alerts</h3>
                <div id="alertsContainer"></div>
            </div>
        </div>
    `,
    init: () => {
        // Fetch watchlist feeds immediately
        fetchAndDisplayAlerts();

        // Bindings for the creation workflow
        document.getElementById('openCreateModalBtn').addEventListener('click', openCreateModal);
        document.getElementById('alertsContainer').addEventListener('click', handleAlertContainerClick);

        // Modal structural controls (Resetting global index HTML triggers)
        document.getElementById('modalCancelBtn').onclick = closeConfirmModal;
        document.getElementById('modalConfirmBtn').onclick = executeDeletionConfirmed;
    }
};

// --- Modal Control Functions ---

function openCreateModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalButtons = document.querySelector('.modal-buttons');
    const modalIcon = document.querySelector('.modal-icon');

    // 1. Transform the generic modal into the configuration form
    modalIcon.innerText = "🔔";
    modalIcon.classList.remove('modal-icon-delete');
    modalIcon.classList.add('modal-icon-create');
    modalTitle.innerText = "Configure Alert Trigger";

    // Inject the select structure directly into the message body area
    modalMessage.innerHTML = `
        <div class="card modal-form-container">
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
            <p id="status" class="status-message">Select parameters to begin tracking.</p>
        </div>
    `;

    // Swap original operational buttons for the creation workflow
    modalButtons.innerHTML = `
        <button id="modalCancelBtn" class="btn-modal-cancel">Cancel</button>
        <button id="submitBtn" class="btn-modal-confirm submit-btn-primary">Set 5-Min Smart Alert</button>
    `;

    // 2. Initialize TomSelect features after elements are rendered inside the modal DOM
    initializeSearchDropdowns();

    // 3. Bind events for internal components
    document.getElementById('modalCancelBtn').onclick = closeConfirmModal;
    document.getElementById('submitBtn').onclick = requestAndRegisterAlert;

    // Open modal view
    document.getElementById('customConfirmModal').classList.add('is-active');
}

function closeConfirmModal() {
    document.getElementById('customConfirmModal').classList.remove('is-active');
    pendingDeletionTarget = null;

    // Clean up TomSelect instances if they exist to prevent memory leaks or dual mounting
    if (stopSearchControl) { stopSearchControl.destroy(); stopSearchControl = null; }
    if (routeSearchControl) { routeSearchControl.destroy(); routeSearchControl = null; }
    if (leadTimeSearchControl) { leadTimeSearchControl.destroy(); leadTimeSearchControl = null; }
}

// --- Original Logic Wrappers ---

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
    if (!routeSearchControl) return;
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
        statusText.classList.add('status-error');
        statusText.classList.remove('status-main', 'status-success');
        statusText.innerText = "⚠️ Missing required configurations.";
        return;
    }

    try {
        statusText.classList.add('status-main');
        statusText.classList.remove('status-error', 'status-success');
        statusText.innerText = "🔄 Requesting permissions...";
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            statusText.classList.add('status-error');
            statusText.classList.remove('status-main', 'status-success');
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
            statusText.classList.add('status-success');
            statusText.classList.remove('status-error', 'status-main');
            statusText.innerText = `✅ Tracking active!`;
            setTimeout(() => {
                closeConfirmModal();
                fetchAndDisplayAlerts();
            }, 800);
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
    alertsContainer.innerHTML = '<div class="loading-indicator">🔄 Loading watch alerts...</div>';

    try {
        const response = await fetch(ALERTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sk: getOrCreateBrowserId() })
        });
        const data = await response.json();
        const alerts = data?.alerts || [];

        // 2. If no trackers are present, dynamically inject the Info Card layout from About
        if (alerts.length === 0) {
            alertsContainer.innerHTML = `
                <div class="empty-watchlist">
                    No active tracking routes found.
                </div>
                <div class="empty-watchlist-text">
                    ${About.render()}
                </div>
            `;
            return;
        }

        alertsContainer.innerHTML = alerts.map(alert => `
            <div class="alert-item">
                <div>
                    <div class="alert-info-title">Stop ${alert.stop_id}</div>
                    <div class="alert-subtitle">Route ${alert.route_id} (${alert.lead_time || 5} min window)</div>
                </div>
                <div class="alert-actions">
                    <button class="btn-delete" data-pk="${alert.stop_id}_${alert.route_id}" data-sk="${getOrCreateBrowserId()}" data-stop="${alert.stop_id}" data-route="${alert.route_id}">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        alertsContainer.innerHTML = '<div class="error-indicator">⚠️ Error loading watchlist feed.</div>';
    }
}

function handleAlertContainerClick(e) {
    if (!e.target.classList.contains('btn-delete')) return;
    pendingDeletionTarget = e.target;

    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalButtons = document.querySelector('.modal-buttons');
    const modalIcon = document.querySelector('.modal-icon');

    // Revert/Setup modal elements to the generic Delete verification configuration
    modalIcon.innerText = "⚠️";
    modalIcon.classList.remove('modal-icon-create');
    modalIcon.classList.add('modal-icon-delete');
    modalTitle.innerText = "Remove Alert Tracker";
    modalMessage.innerText = `Are you sure you want to stop tracking Route ${pendingDeletionTarget.getAttribute('data-route')} at Stop ${pendingDeletionTarget.getAttribute('data-stop')}?`;

    modalButtons.innerHTML = `
        <button id="modalCancelBtn" class="btn-modal-cancel">Cancel</button>
        <button id="modalConfirmBtn" class="btn-modal-confirm">Delete Tracker</button>
    `;

    document.getElementById('modalCancelBtn').onclick = closeConfirmModal;
    document.getElementById('modalConfirmBtn').onclick = executeDeletionConfirmed;

    document.getElementById('customConfirmModal').classList.add('is-active');
}

async function executeDeletionConfirmed() {
    if (!pendingDeletionTarget) return;
    const btn = pendingDeletionTarget;
    btn.innerText = "Removing...";
    btn.disabled = true;

    try {
        const res = await fetch(DELETE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pk: btn.getAttribute('data-pk'), sk: btn.getAttribute('data-sk') })
        });
        if (res.ok) {
            closeConfirmModal();
            fetchAndDisplayAlerts();
        }
    } catch (err) {
        alert("Error executing removal logic.");
    }
}

export default Tracker;