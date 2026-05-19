import transitData from './transitData.js';

const API_ENDPOINT = "https://wnxu2jwhfgfopotnnwrtsgjeum0pzwoi.lambda-url.ca-central-1.on.aws/";
const ALERTS_ENDPOINT = "https://l7srhnplybhzagyehgedib246y0rvmem.lambda-url.ca-central-1.on.aws/";
const DELETE_ENDPOINT = "https://bvdsmrpxu2sw3uyqduczxxvyyq0xshms.lambda-url.ca-central-1.on.aws/";
const PUBLIC_VAPID_KEY = "BDZEQSMZKkKmAhr1bIZUBN7TrQBQS53hyhXLCEF4Pi0LidSKeCpO2ozy8WYuG38ephBxoaVYGEsoQlpKvurGVRg";

let stopSearchControl;
let routeSearchControl;
let leadTimeSearchControl;
let pendingDeletionTarget = null;

// Event Listeners
document.getElementById('submitBtn').addEventListener('click', requestAndRegisterAlert);
window.addEventListener('DOMContentLoaded', fetchAndDisplayAlerts);
document.getElementById('alertsContainer').addEventListener('click', handleAlertContainerClick);
document.getElementById('modalCancelBtn').addEventListener('click', closeConfirmModal);
document.getElementById('modalConfirmBtn').addEventListener('click', executeDeletionConfirmed);

function initializeSearchDropdowns() {
    const allStops = Object.keys(transitData).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    const stopSelectEl = document.getElementById('stopId');

    allStops.forEach(stopId => {
        const option = document.createElement('option');
        option.value = stopId;
        option.textContent = `Stop ${stopId}`;
        stopSelectEl.appendChild(option);
    });

    stopSearchControl = new TomSelect('#stopId', {
        create: false,
        sortField: { field: "text", direction: "asc" },
        onChange: function(selectedStop) {
            updateRouteDropdownOptions(selectedStop);
        }
    });

    routeSearchControl = new TomSelect('#routeId', {
        create: false,
        sortField: { field: "text", direction: "asc" }
    });
    routeSearchControl.disable();

    leadTimeSearchControl = new TomSelect('#leadTime', {
        create: false,
        disableSearch: true,
        onChange: function(value) {
            document.getElementById('submitBtn').innerText = `Set ${value}-Min Smart Alert`;
        }
    });
}

// Kickstart UI dropdown assignments
initializeSearchDropdowns();

function updateRouteDropdownOptions(selectedStop) {
    routeSearchControl.clear();
    routeSearchControl.clearOptions();

    if (selectedStop && transitData[selectedStop]) {
        routeSearchControl.enable();
        const routeOptions = transitData[selectedStop].map(route => ({
            value: route,
            text: `Route ${route}`
        }));
        routeSearchControl.addOptions(routeOptions);
        routeSearchControl.refreshOptions(false);
    } else {
        routeSearchControl.disable();
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function getOrCreateBrowserId() {
    let browserId = localStorage.getItem('transit_browser_id');
    if (!browserId) {
        browserId = `USER_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        localStorage.setItem('transit_browser_id', browserId);
    }
    return browserId;
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
        statusText.innerText = "🔄 Requesting browser notification permissions...";
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            statusText.style.color = "var(--error)";
            statusText.innerText = "❌ System permission denied by browser settings.";
            return;
        }

        statusText.innerText = "🔄 Registering device service workers...";
        const registration = await navigator.serviceWorker.register('sw.js');

        statusText.innerText = "🔄 Waiting for service worker activation...";
        if (!registration.active) {
            await new Promise((resolve) => {
                const worker = registration.installing || registration.waiting;
                if (worker) {
                    worker.addEventListener('statechange', (e) => {
                        if (e.target.state === 'activated') resolve();
                    });
                } else {
                    resolve();
                }
            });
        }
        await navigator.serviceWorker.ready;

        statusText.innerText = "🔄 Negotiating handshake with push server...";
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });

        statusText.innerText = "🔄 Saving tracking criteria to secure storage...";
        const browserUserId = getOrCreateBrowserId();

        const databasePayload = {
            pk: `${stopId}_${routeId}`,
            sk: browserUserId,
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
            statusText.innerText = `✅ Tracking active! You'll be alerted ${leadTime} mins before Route ${routeId} reaches Stop ${stopId}.`;
            fetchAndDisplayAlerts();
        } else {
            statusText.style.color = "var(--error)";
            statusText.innerText = "❌ Registration rejected by database controller.";
        }

    } catch (error) {
        console.error(error);
        statusText.style.color = "var(--error)";
        statusText.innerText = `❌ Error: ${error.message}`;
    }
}

async function fetchAndDisplayAlerts() {
    const browserUserId = getOrCreateBrowserId();
    const alertsContainer = document.getElementById('alertsContainer');
    alertsContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:14px;">🔄 Loading your watch alerts...</div>';

    try {
        const response = await fetch(ALERTS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sk: browserUserId })
        });
        if (!response.ok) throw new Error('Failed to fetch alerts');
        const data = await response.json();
        const alerts = (data && data.alerts) ? data.alerts : [];

        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);border: 2px dashed var(--border-color);border-radius:12px;padding:30px;font-size:14px;background:var(--card-bg);">No active tracking routes found. Select choices on the left to activate alerts.</div>';
            return;
        }

        alertsContainer.innerHTML = alerts.map(alert => `
            <div class="alert-item">
                <div>
                    <div class="alert-info-title">Stop ${alert.stop_id}</div>
                    <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">Route ${alert.route_id} (${alert.lead_time || 5} min window)</div>
                </div>
                <div class="alert-actions">
                    <span class="alert-tag ${alert.status ? 'tag-active' : 'tag-inactive'}">
                        ${alert.status ? 'Active' : 'Inactive'}
                    </span>
                    <button class="btn-delete"
                            data-pk="${alert.stop_id}_${alert.route_id}"
                            data-sk="${browserUserId}"
                            data-stop="${alert.stop_id}"
                            data-route="${alert.route_id}">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        alertsContainer.innerHTML = '<div style="text-align:center;color:var(--error);font-size:14px;padding:20px;">⚠️ Error loading active tracking watchlist feed.</div>';
    }
}

function openConfirmModal(stopId, routeId) {
    document.getElementById('modalMessage').innerText = `Are you sure you want to stop tracking Route ${routeId} at Stop ${stopId}? You will no longer receive proximity alerts for this run.`;
    document.getElementById('customConfirmModal').classList.add('is-active');
}

function closeConfirmModal() {
    document.getElementById('customConfirmModal').classList.remove('is-active');
    pendingDeletionTarget = null;
}

function handleAlertContainerClick(e) {
    if (!e.target.classList.contains('btn-delete')) return;

    pendingDeletionTarget = e.target;

    const stopId = pendingDeletionTarget.getAttribute('data-stop');
    const routeId = pendingDeletionTarget.getAttribute('data-route');

    openConfirmModal(stopId, routeId);
}

async function executeDeletionConfirmed() {
    if (!pendingDeletionTarget) return;

    const button = pendingDeletionTarget;
    const pk = button.getAttribute('data-pk');
    const sk = button.getAttribute('data-sk');

    closeConfirmModal();

    const originalText = button.innerText;
    button.innerText = "Removing...";
    button.disabled = true;

    try {
        const response = await fetch(DELETE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pk, sk })
        });

        if (response.ok) {
            fetchAndDisplayAlerts();
        } else {
            alert("Failed to delete the alert from server context.");
            button.innerText = originalText;
            button.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert(`Error communicating deletion: ${err.message}`);
        button.innerText = originalText;
        button.disabled = false;
    }
}