const About = {
    render: () => `
        <header class="app-header">
            <h1>How It Works</h1>
            <p>Behind the scenes of your automated real-time transit proximity system</p>
        </header>

        <div class="card info-card">
            <h3>1. Selection & Registration</h3>
            <p>Choose your regular daily stop numbers and route intervals. Our system registers an encrypted handshake utilizing secure Browser Push notifications APIs.</p>

            <h3>2. Predictive Tracking</h3>
            <p>Our server-side cloud infrastructure continually references Halifax Transit scheduling real-time positioning feeds against your custom proximity parameters.</p>

            <h3>3. Instant Delivery</h3>
            <p>Even if your phone is resting in your pocket or the browser app is completely closed down, the active system worker pushes a native OS alert to ensure you walk out exactly on time.</p>
        </div>
    `,
    init: () => {}
};

export default About;