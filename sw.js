// Listens for structural inbound Web Push payloads routed by infrastructure
self.addEventListener('push', function(event) {
    if (!event.data) return;

    try {
        const data = event.data.json();

        // Setup options along with actionable buttons
        const options = {
            body: data.body,
            icon: 'https://www.halifax.ca/themes/custom/halifax/logo.svg', // Branding placeholder
            badge: 'https://www.halifax.ca/themes/custom/halifax/logo.svg',
            vibrate: [200, 100, 200], // Haptic pulses on mobile devices
            data: {
                dateOfArrival: Date.now(),
                // CRITICAL: Ensure your backend tracking Lambda includes pk & sk inside the 'data' layer of its payload
                pk: data.pk || data.data?.pk,
                sk: data.sk || data.data?.sk
            },
            actions: [
                { action: 'delete_tracker', title: '🛑 Stop Tracking' },
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

// Intercepts button interactions on the system level notification frame
self.addEventListener('notificationclick', function(event) {
    const notification = event.notification;
    const action = event.action;

    // Instantly close the operating system notification popup overlay
    notification.close();

    if (action === 'delete_tracker') {
        const pk = notification.data.pk;
        const sk = notification.data.sk;
        const DELETE_ENDPOINT = "https://bvdsmrpxu2sw3uyqduczxxvyyq0xshms.lambda-url.ca-central-1.on.aws/";

        if (!pk || !sk) {
            console.error("Cannot delete tracking target: missing identifier keys (pk/sk) in notification payload data context.");
            return;
        }

        // Keep the service worker alive in the background while it executes the fetch request
        event.waitUntil(
            fetch(DELETE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pk, sk })
            })
            .then(response => {
                if (!response.ok) throw new Error('Network response returned server error code.');
                console.log(`Successfully deleted tracking alert matching: ${pk}`);

                // OPTIONAL: Send a local verification banner showing confirmation of removal
                return self.registration.showNotification("Alert Cancelled", {
                    body: "You've successfully unsubscribed from this route's tracking watchlist.",
                    icon: 'https://www.halifax.ca/themes/custom/halifax/logo.svg'
                });
            })
            .catch(err => {
                console.error("Failed background notification removal transaction:", err);
            })
        );
    }
});