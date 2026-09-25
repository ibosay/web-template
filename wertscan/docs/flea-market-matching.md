# WertScan Flohmarkt Matching Architektur

Diese Schicht verhindert, dass WertScan jeden Flohmarktgegenstand wie einen Barcodeartikel behandelt.

## Drei Identitätsmodi

### 1. exact_product

Für standardisierte Produkte mit belastbarer Produktkennung.

Beispiele:
* Elektronik mit Modellnummer
* Werkzeug mit Typenschild
* Haushaltsgerät mit E Nummer
* Buch mit ISBN

Ein exakter Marktwert ist nur erlaubt, wenn die geforderten Identitätsmerkmale erfüllt sind.

### 2. exact_collectible

Für Sammlerobjekte, deren Identität aus mehreren spezifischen Merkmalen besteht.

Beispiele:
* Pokémon TCG Karte mit Name und vollständiger Nummer
* Pokémon Zukan oder Carddass mit Name und Nummer
* Hot Wheels mit Casting plus Base Code oder Toy Number
* Modellauto mit Hersteller des Miniaturmodells, Fahrzeugmodell und Maßstab
* Münze mit Nominal, Jahr und Land
* Porzellan mit Hersteller plus Dekor oder Formnummer

### 3. comparable_object

Für Gegenstände, bei denen keine sichere Modellreferenz vorhanden ist.

Beispiele:
* alte Aristo Uhr ohne Modellreferenz
* handgeknüpfter Teppich ohne Hersteller Modellcode
* unmarkierte Antiquität
* generisches Flohmarktobjekt mit mehreren sichtbaren Merkmalen

In diesem Modus darf kein exakter Marktwert ausgegeben werden. Stattdessen kann WertScan einen Vergleichsbereich anzeigen, wenn genug passende Vergleichsobjekte vorhanden sind.

## Bewertungslabel

* Exakt identifiziert
* Sehr gut vergleichbar
* Nur ähnliche Marktobjekte

Die Bezeichnung beschreibt die Identitätsqualität, nicht den Preis.

## Grundregeln

1. Sichtbare Merkmale haben Vorrang vor abgeleiteten Vermutungen.
2. Seriennummern sind keine Modellnummern.
3. Ein Widerspruch bei einer stabilen Kennung, etwa Modellnummer, ISBN, Kartennummer oder Base Code, verwirft den Treffer.
4. Farbe allein beweist keine seltene Variante.
5. Für vergleichbare Objekte werden mehrere Merkmale gemeinsam verlangt.
6. Ein vergleichbares Objekt darf nie als exakt identisch bezeichnet werden.
7. Karten behalten ihre strengere Karten Preislogik: Marktwert nur aus mindestens zwei passenden Verkäufen.
8. Preisführer bleiben von Verkäufen getrennt.

## Kategorieprofile

| Kategorie | Exakt über | Vergleich über |
| --- | --- | --- |
| Technik | Marke plus Modellnummer, SKU oder GTIN | Marke plus Produktmerkmale |
| Uhren | Marke plus Referenz oder sichtbarer Modellname | Marke plus mindestens zwei Gehäuse, Material, Markierungs, Werk oder Farbmerkmale |
| Sammelkarten | vollständige Nummer plus Name oder Set | nur wenn exakte Identität nicht ausreichend belegt |
| Hot Wheels und Spielzeug | Hersteller plus Casting, Toy Number oder Base Code | Hersteller, Name, Farbe, Markierung, Jahr |
| Modellautos | Miniaturhersteller plus Artikelnummer oder Fahrzeugmodell und Maßstab | Hersteller, Fahrzeug, Maßstab, Farbe |
| Teppiche | Hersteller plus Modellcode | Material, Muster, Maße, Herkunft, Markierungen |
| Porzellan und Glas | Hersteller plus Formnummer, Dekor oder Serie | Bodenmarke, Form, Dekor, Maße |
| Bücher und Medien | ISBN oder EAN, sonst Titel plus Ausgabe | Titel, Ausgabe, Jahr |
| Schmuck und Münzen | Modellcode oder Nominal, Jahr und Land | Punze, Material, Markierung, Typ |
| Werkzeug | Marke plus Modell oder Typnummer | Marke plus Produktart und Größe |
| Haushaltsgeräte | Marke plus E Nummer oder Produktcode | Marke plus Produktart und Modellfamilie |
| Kunst und Antiquitäten | belastbare Signatur oder Katalogreferenz | Material, Form, Maße, Markierung, Epoche |

## Beispiel Aristo

Sichtbar:
* Aristo
* WALZGOLDDOUBLE 20 MIKRON
* BODEN EDELSTAHL
* rechteckige Gehäuseform
* schwarzes Zifferblatt

Nicht sichtbar:
* sichere Modellreferenz

Ergebnis:
* Modus: comparable_object
* Kein exakter Marktwert
* Vergleichstreffer müssen Marke und mehrere sichtbare Merkmale bestätigen
* Eine moderne Aristo Diver Uhr darf nicht als Vergleich akzeptiert werden

## Beispiel Articuno Zukan

Sichtbar:
* 2004 POKEMON ZUKAN
* ARTICUNO
* #379
* HOLO
* PSA
* GEM MT 10

Ergebnis:
* Non TCG Sammelkarte
* Name und Nummer bilden gemeinsam die Primäridentität
* Pokémon TCG Kataloge dürfen diese Karte nicht erzwingen
* PSA 10 bleibt ein eigenes Marktsegment
