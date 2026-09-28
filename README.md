# Servano Wien App Vorschau

Eigenständige mobile Servano Oberfläche. Die bestehende Webversion bleibt unverändert.

Die App liest ausschließlich öffentliche Verzeichnis und Detaildaten der bestehenden Servano Vorschau. In dieser Fassung erscheinen Testbetriebe. Sie sind in der Oberfläche deutlich gekennzeichnet. Favoriten liegen lokal auf dem Gerät. Es gibt keinen Besitzerzugang und keine Firmenverwaltung in der App.

## AppDeploy

Vorschau: https://servano-wien-app-vorschau-o8v1i7.v2.appdeploy.ai/

Die Dateien `src/App.tsx`, `src/index.css`, `backend/index.ts` und `tests/tests.json` sind die Quelländerungen gegenüber der React Vite Vorlage von AppDeploy. Der Server verwendet fest die öffentliche Datenquelle der Servano Vorschau. Vor einer Veröffentlichung mit echten Betrieben muss die öffentliche Servano Seite eine freigegebene Verzeichnis API bereitstellen und die Datenquelle gezielt umgestellt werden.

## iPhone und Android

Die nativen Projekte benutzen Capacitor und öffnen die getrennt bereitgestellte Servano App. Das ist eine technische Vorschau. Für eine Einreichung in Apple App Store und Google Play sind echte Firmendaten, endgültige Icons, Produktkennung, Datenschutzangaben, Geräteprüfung und signierte Release Builds erforderlich. Eine reine Webhülle kann bei der Store Prüfung abgelehnt werden.

Mit Node.js 22 oder neuer:

```sh
npm install
npx cap add android
npx cap add ios
npx cap sync
npx cap open android
npx cap open ios
```

Das Android Projekt kann auf Windows, macOS oder Linux mit Android Studio bearbeitet werden. Das iOS Projekt braucht macOS mit Xcode und ein Apple Entwicklerkonto für die Verteilung. Der veröffentlichte AppDeploy Server muss erreichbar bleiben, da die mobile Oberfläche von dort geladen wird.

Im GitHub Zweig liegen die reproduzierbaren Quelldateien. Die erzeugten `android` und `ios` Ordner entstehen mit den obigen Befehlen. Im vollständigen Archiv sind sie bereits enthalten.

## Grenzen

Die Testbetriebe sind nicht für eine Store Veröffentlichung bestimmt. Die Favoriten werden nicht zwischen Geräten synchronisiert. Die Webversion, ihre Datenbank, die öffentliche Servano Hauptseite und die private Servano Vorschau wurden für dieses Projekt nicht geändert.
