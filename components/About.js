const About = {
    render: () => `
        <header class="app-header">
            <h1>How NexxtUp Works</h1>
            <p>Smart proximity alerts powered by real-time transit data</p>
        </header>

        <div class="card info-card">
            <h3>1. Choose Your Routes</h3>
            <p>Select your transit stops and routes, then set your preferred alert lead time. NexxtUp securely registers your preferences using encrypted browser push notifications.</p>

            <h3>2. Real-Time Monitoring</h3>
            <p>Our cloud infrastructure continuously monitors live transit schedules and vehicle positions against your custom proximity parameters, 24/7.</p>

            <h3>3. Instant Notifications</h3>
            <p>Get native OS alerts at exactly the right time - even if NexxtUp is closed or your device is locked. Never miss your bus again.</p>
        </div>
    `,
    init: () => {}
};

export default About;