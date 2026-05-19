const Navbar = {
    render: () => `
        <nav class="global-nav">
            <div class="nav-brand">🚍 Halifax Smart Tracker</div>
            <div class="nav-links">
                <a href="#/">Dashboard</a>
                <a href="#/sponsors">Local Perks</a>
                <a href="#/about">How it Works</a>
            </div>
        </nav>
    `,
    init: () => {
        // Highlighting active states depending on current hash
        const updateActiveLinks = () => {
            const hash = window.location.hash || '#/';
            document.querySelectorAll('.nav-links a').forEach(link => {
                if (link.getAttribute('href') === hash) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        };
        window.addEventListener('hashchange', updateActiveLinks);
        updateActiveLinks();
    }
};

export default Navbar;