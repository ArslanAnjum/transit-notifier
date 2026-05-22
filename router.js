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
    const navContainer = document.getElementById('navbar-container');
    if (!navContainer.innerHTML) {
        navContainer.innerHTML = Navbar.render();
        Navbar.init?.();
    }

    // Extract route path without query parameters
    const fullHash = window.location.hash || '#/';
    const currentHash = fullHash.split('?')[0]; // Gets '#/alert-detail' from '#/alert-detail?pk=...'
    const component = routes[currentHash] || Tracker;

    const appView = document.getElementById('app-view');
    appView.innerHTML = component.render();

    if (component.init) {
        component.init();
    }
}


// Watch navigation events
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);