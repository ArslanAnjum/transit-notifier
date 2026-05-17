// Listens for structural inbound Web Push payloads routed by Google/Apple infrastructure
self.addEventListener('push', function(event) {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: 'https://www.halifax.ca/themes/custom/halifax/logo.svg', // Halifax Transit branding asset placeholder
            badge: 'https://www.halifax.ca/themes/custom/halifax/logo.svg',
            vibrate: [200, 100, 200], // Haptic pulses on mobile devices
            data: { dateOfArrival: Date.now() },
            actions: [
                { action: 'close', title: 'Dismiss' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (err) {
        console.error("Failed to render background push payload structure: ", err);
    }
});
