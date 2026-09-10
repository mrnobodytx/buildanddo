import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { initTelemetry } from '@/lib/telemetry';
import { initDatadogRum } from '@/lib/datadogRum';

initTelemetry();
initDatadogRum();

ReactDOM.createRoot(document.getElementById('root')).render(
	<App />
);
