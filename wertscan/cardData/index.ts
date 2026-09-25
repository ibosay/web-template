export * from './types';
export * from './conditions';
export * from './expansionAliases';
export * from './cardIdentity';
export * from './cardValuation';
export * from './cardMarketLookup';
export * from './fx';
export { InMemoryCardDataProvider, StaticFxRateProvider } from './testProvider';
// Der Scrydex-Adapter wird bewusst NICHT hier exportiert, damit er nie versehentlich in ein
// Client-Bundle gelangt. Serverseitig direkt importieren: './cardData/scrydexProvider'.

// Kostenlos, ohne API-Key. Darf auch in serverseitigen Builds direkt importiert werden.
export { TcgDexProvider, tcgdexLocalId } from './tcgdexProvider';
