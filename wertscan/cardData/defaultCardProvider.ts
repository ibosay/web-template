/**
 * Standard-Kartenanbieter für WertScan.
 *
 * Pokémon: TCGdex (kostenlos, ohne API-Key, ohne Zugangsdaten). TCGdex liefert
 * Kartenidentität und Preisführer (Cardmarket/TCGplayer), aber keine Verkäufe. Marktwerte
 * entstehen deshalb ausschließlich aus echten Vergleichsverkäufen der erlaubten
 * Marktplatzsuche (cardScrapeFallback), nachdem TCGdex die Karte eindeutig bestätigt hat.
 *
 * Scrydex bleibt optional: Wer Zugangsdaten hat, kann einen ScrydexProvider explizit als
 * options.cardProvider an liveMarketLookup übergeben.
 */
import { TcgDexProvider } from './tcgdexProvider';
import { CardDataProvider } from './types';

export function createDefaultPokemonCardProvider(): CardDataProvider {
  return new TcgDexProvider();
}
