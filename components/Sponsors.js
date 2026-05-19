const Sponsors = {
    render: () => `
        <header class="app-header">
            <h1>Local Commuter Perks</h1>
            <p>Show these transit watch tokens directly at checkout to redeem local savings near your stops!</p>
        </header>

        <div class="sponsors-grid">
            <div class="card sponsor-card">
                <span class="deal-tag">10% OFF</span>
                <h3>☕ Spring Garden Café</h3>
                <p>Located right beside Stop 6411. Warm up while checking your smart tracker run time status.</p>
                <small>Valid at Spring Garden location only</small>
            </div>

            <div class="card sponsor-card">
                <span class="deal-tag">FREE UPGRADE</span>
                <h3>🍔 Quinpool Burgers</h3>
                <p>Get a free fry upgrade on any transit route combo bundle purchase near Stop 8012.</p>
                <small>Must present active tracker view screen</small>
            </div>
        </div>
    `,
    init: () => {
        console.log("Local Perks screen successfully mounted.");
    }
};

export default Sponsors;