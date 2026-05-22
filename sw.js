// Listens for structural inbound Web Push payloads routed by infrastructure
self.addEventListener('push', function(event) {
    if (!event.data) return;

    try {
        const data = event.data.json();

        const pk = data.pk || data.data?.pk;
        const sk = data.sk || data.data?.sk;

        // Setup options along with actionable buttons
        const options = {
            body: data.body,
            icon: 'https://www.halifax.ca/themes/custom/halifax/logo.svg', // Branding placeholder
            badge: 'https://www.halifax.ca/themes/custom/halifax/logo.svg',
            vibrate: [200, 100, 200], // Haptic pulses on mobile devices

            // KEY ADDITION: The tag groups notifications by this ID and updates them sequentially
            tag: pk ? String(pk) : undefined,

            // OPTIONAL: set to true if you want the device to vibrate/sound again on update
            renotify: true,

            data: {
                dateOfArrival: Date.now(),
                // CRITICAL: Ensure your backend tracking Lambda includes pk & sk inside the 'data' layer of its payload
                pk: pk,
                sk: sk
            },
            actions: [
                { action: 'view_details', title: '📍 View Details' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (err) {
        console.error("Failed to render background push payload structure: ", err);
    }
});

// Intercepts button interactions on the system level notification frame
self.addEventListener('notificationclick', function(event) {
    const notification = event.notification;
    const action = event.action;

    notification.close();

    const pk = notification.data.pk;
    const sk = notification.data.sk;

    if (action === 'view_details' || !action) {
        if (pk && sk) {
            event.waitUntil(
                clients.matchAll({ type: 'window' }).then(clientList => {
                    for (let client of clientList) {
                        if (client.url.includes('#/alert-detail') && client.focus) {
                            return client.focus();
                        }
                    }

                    if (clients.openWindow) {
                        // FIX: Prepend self.location.origin and a slash to force root routing
                        const targetUrl = `${self.location.origin}/#/alert-detail?pk=${encodeURIComponent(pk)}&sk=${encodeURIComponent(sk)}`;
                        return clients.openWindow(targetUrl);
                    }
                })
            );
        }
    }
});