import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.servano.mobile',
  appName: 'Servano Wien',
  webDir: 'web',
  server: {
    url: 'https://servano-wien-app-vorschau-o8v1i7.v2.appdeploy.ai/',
    cleartext: false,
  },
};

export default config;
