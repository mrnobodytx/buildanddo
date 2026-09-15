import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import '@/motion.css';
import { initTelemetry } from '@/lib/telemetry';
import { initObservability } from '@/lib/observability/runtime';

document.getElementById('static-page-schema')?.remove();
// Helmet replaces only tags it owns. Mark generated metadata before mounting
// so route changes do not leave the first route's social tags behind.
document.head
    .querySelectorAll(
        'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',
    )
    .forEach((tag) => tag.setAttribute('data-react-helmet', 'true'));

initTelemetry();
initObservability();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
