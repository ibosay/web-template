/** Minimale Typen für node:test / node:assert (ohne @types/node). Nur für Tests. */
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    match(value: string, pattern: RegExp, message?: string): void;
    throws(fn: () => unknown, message?: string | RegExp): void;
    rejects(fn: () => Promise<unknown>, message?: string | RegExp): Promise<void>;
  };
  export default assert;
}

/** CommonJS-Laufzeit (nur Tests, für das optionale Schreiben der Beispielausgaben). */
declare const require: (module: string) => any;
