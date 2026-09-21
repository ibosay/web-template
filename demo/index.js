import React from 'react';
import { createRoot } from 'react-dom/client';

// Contexts, configs, and util modules
import { IntlProvider } from '../src/util/reactIntl';

// Carries the CSS variables the screens refer to.
import '../src/styles/marketplaceDefaults.css';
import messages from '../src/translations/de.json';

// Modules from the same directory
import App from './App';

const LOCALE = 'de-AT';

createRoot(document.getElementById('root')).render(
  <IntlProvider locale={LOCALE} messages={messages} textComponent="span">
    <App />
  </IntlProvider>
);

// The service worker is what lets the app start without a signal, which is the point of installing
// it rather than keeping a tab open. It is registered after load so it never delays the first
// paint, and a failure is not worth bothering the driver about.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./serviceWorker.js').catch(() => {});
  });
}
