import Navbar from './components/Navbar.js';
import Tracker from './components/Tracker.js';
import About from './components/About.js';
import Sponsors from './components/Sponsors.js';
import AlertDetail from './components/AlertDetail.js';

const routes = {
    '#/': Tracker,
    '#/about': About,
    '#/sponsors': Sponsors,
    '#/alert-detail': AlertDetail
};

function router() {
    // Render Global Navigation Bar once
    const navContainer = document.getElementById('navbar-container');
    if (!navContainer.innerHTML) {
        navContainer.innerHTML = Navbar.render();
        Navbar.init?.();
    }

    // Determine current route or fallback to home
    const currentHash = window.location.hash || '#/';
    const component = routes[currentHash] || Tracker;

    // Inject Component View HTML
    const appView = document.getElementById('app-view');
    appView.innerHTML = component.render();

    // Trigger local lifecycle events for logic initialization
    if (component.init) {
        component.init();
    }
}

// Watch navigation events
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);