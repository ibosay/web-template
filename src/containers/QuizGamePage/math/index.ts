export const MATH_TOPICS = [
  { key: 'Mathe addition', de: 'Addition', en: 'Addition', symbol: '+' },
  { key: 'Mathe subtraction', de: 'Subtraktion', en: 'Subtraction', symbol: '−' },
  { key: 'Mathe multiplication', de: 'Multiplikation', en: 'Multiplication', symbol: '×' },
  { key: 'Mathe division', de: 'Division', en: 'Division', symbol: '÷' },
  { key: 'Mathe fractions', de: 'Bruchrechnung', en: 'Fractions', symbol: 'a/b' },
];
export const mathLabel = (key: string, language: string) => key === 'Mathe'
  ? (language === 'EN' ? 'Maths' : 'Mathe')
  : MATH_TOPICS.find(t => t.key === key)?.[language === 'EN' ? 'en' : 'de'];

type Fraction = { n: number; d: number };
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
const fraction = (n: number, d = 1): Fraction => {
  if (!d) throw new Error('Division by zero');
  const factor = gcd(n, d) * Math.sign(d);
  return { n: n / factor, d: d / factor };
};
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
const text = (a: Fraction) => a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
const decimal = (a: Fraction, language: string) => {
  const value = String(Number((a.n / a.d).toFixed(4)));
  return language === 'EN' ? value : value.replace('.', ',');
};
const operations = { add, sub, mul, div, simplify: (a: Fraction, _b: Fraction) => fraction(a.n, a.d), combined: (a: Fraction, b: Fraction) => mul(add(a, b), fraction(2)) };
type Operation = keyof typeof operations;

function task(topic: number, difficulty: 'easy' | 'hard', index: number, a: Fraction, b: Fraction, operation: Operation) {
  const result = operations[operation](a, b);
  const isFraction = topic === 4;
  const format = (x: Fraction, language: string) => isFraction ? text(x) : decimal(x, language);
  const alternatives = [result];
  const candidates = isFraction
    ? [fraction(result.n + 1, result.d), fraction(result.n, result.d + 1), fraction(result.n + 2, result.d), fraction(result.n + 1, result.d + 1), add(result, fraction(1)), add(result, fraction(2))]
    : [add(result, fraction(1)), sub(result, fraction(1)), add(result, fraction(10)), sub(result, fraction(10))];
  for (const candidate of candidates) {
    if (!alternatives.some(x => x.n === candidate.n && x.d === candidate.d)) alternatives.push(candidate);
    if (alternatives.length === 4) break;
  }
  const symbol = { add: '+', sub: '−', mul: '×', div: ':', simplify: '', combined: '+' }[operation];
  const variants = (language: 'DE' | 'EN') => {
    const value = (x: Fraction) => x.n < 0 ? `(${format(x, language)})` : format(x, language);
    const expression = operation === 'simplify' ? `${a.n}/${a.d}` : operation === 'combined'
      ? `(${value(a)} + ${value(b)}) × 2` : `${value(a)} ${symbol} ${value(b)}`;
    const rule = isFraction ? ({
      add: ['Bringe die Brüche auf einen gemeinsamen Nenner und addiere die Zähler. Kürze das Ergebnis.', 'Use a common denominator and add the numerators. Simplify the result.'],
      sub: ['Bringe die Brüche auf einen gemeinsamen Nenner und subtrahiere die Zähler. Kürze das Ergebnis.', 'Use a common denominator and subtract the numerators. Simplify the result.'],
      mul: ['Multipliziere Zähler mit Zähler und Nenner mit Nenner. Kürze das Ergebnis.', 'Multiply numerator by numerator and denominator by denominator. Simplify the result.'],
      div: ['Multipliziere den ersten Bruch mit dem Kehrwert des zweiten. Kürze das Ergebnis.', 'Multiply the first fraction by the reciprocal of the second. Simplify the result.'],
      simplify: ['Teile Zähler und Nenner durch ihren größten gemeinsamen Teiler.', 'Divide numerator and denominator by their greatest common divisor.'],
      combined: ['Berechne zuerst die Summe in der Klammer mit gemeinsamem Nenner. Verdopple danach das Ergebnis und kürze.', 'First add the fractions inside the brackets using a common denominator. Then double and simplify the result.'],
    }[operation][language === 'EN' ? 1 : 0]) : ({
      add: ['Addiere die Werte. Bei Dezimalzahlen stehen die Kommastellen untereinander; beachte negative Vorzeichen.', 'Add the values. Align decimal places and pay attention to negative signs.'],
      sub: ['Ziehe den zweiten Wert vom ersten ab. Eine negative Zahl abzuziehen bedeutet, ihren positiven Wert zu addieren.', 'Subtract the second value from the first. Subtracting a negative means adding its positive value.'],
      mul: ['Multipliziere die Beträge und beachte die Vorzeichen. Zwei negative Faktoren ergeben ein positives Ergebnis.', 'Multiply the magnitudes and track the signs. Two negative factors give a positive result.'],
      div: ['Teile den ersten Wert durch den zweiten. Zur Probe ergibt Ergebnis mal Divisor wieder den ersten Wert.', 'Divide the first value by the second. Check by multiplying the answer by the divisor.'],
      simplify: ['', ''], combined: ['', ''],
    }[operation][language === 'EN' ? 1 : 0]);
    const working = isFraction && ['add', 'sub'].includes(operation)
      ? `${a.n * b.d}/${a.d * b.d} ${symbol} ${b.n * a.d}/${a.d * b.d} = `
      : isFraction && operation === 'div' ? `${text(a)} × ${text(fraction(b.d, b.n))} = ` : '';
    return {
      question: `${operation === 'simplify' ? (language === 'EN' ? 'Simplify fully' : 'Kürze vollständig') : (language === 'EN' ? 'Calculate' : 'Berechne')}: ${expression}`,
      answers: alternatives.map(x => format(x, language)),
      explanation: `${rule} ${expression} = ${working}${format(result, language)}.`,
      chapter: mathLabel(MATH_TOPICS[topic].key, language)!,
    };
  };
  return {
    id: 40000 + topic * 1000 + (difficulty === 'hard' ? 100 : 0) + index,
    category: MATH_TOPICS[topic].key, difficulty, correct: 0,
    ...variants('DE'), en: variants('EN'),
    calculation: { a, b, operation, result },
  };
}

// Deterministic operands keep question IDs and persisted progress stable across builds.
const easyPairs: [number, number][][] = [[], [], [], []];
for (let a = 2; a <= 30; a++) for (let b = a; b <= 30; b++) easyPairs[0].push([a, b]);
for (let a = 5; a <= 50; a++) for (let b = 1; b < a; b++) easyPairs[1].push([a, b]);
for (let a = 2; a <= 12; a++) for (let b = a; b <= 12; b++) easyPairs[2].push([a, b]);
for (let divisor = 2; divisor <= 12; divisor++) for (let quotient = 2; quotient <= 14; quotient++) easyPairs[3].push([divisor * quotient, divisor]);

export const MATH_QUESTIONS = MATH_TOPICS.flatMap((_topic, topic) => {
  const easy = Array.from({ length: 65 }, (_, i) => {
    if (topic < 4) {
      const pairs = easyPairs[topic];
      const [a, b] = pairs[Math.round(i * (pairs.length - 1) / 64)];
      return task(topic, 'easy', i, fraction(a), fraction(b), (['add', 'sub', 'mul', 'div'] as const)[topic]);
    }
    const group = Math.floor(i / 13);
    const k = i % 13;
    const denominator = k + 3;
    if (group === 4) return task(topic, 'easy', i, { n: 2 * (k + 1), d: 2 * (k + 3) }, fraction(1), 'simplify');
    const a = fraction(group === 1 ? 2 : 1, denominator);
    const b = fraction(1, group < 2 ? denominator : k + 2);
    return task(topic, 'easy', i, a, b, (['add', 'sub', 'mul', 'div'] as const)[group]);
  });
  const hard = Array.from({ length: 30 }, (_, i) => {
    if (topic === 0 || topic === 1) {
      const a = fraction((i % 3 === 0 ? -1 : 1) * (1237 + i * 137), i % 2 ? 100 : 1);
      const b = fraction((i % 4 === 0 ? -1 : 1) * (419 + i * 83), i % 2 ? 100 : 1);
      return task(topic, 'hard', i, a, b, topic === 0 ? 'add' : 'sub');
    }
    if (topic === 2) return task(topic, 'hard', i, fraction((i % 4 === 0 ? -1 : 1) * (23 + i * 3), i % 2 ? 10 : 1), fraction(17 + i, i % 2 ? 10 : 1), 'mul');
    if (topic === 3) {
      const divisor = fraction(12 + i);
      const quotient = fraction((i % 4 === 0 ? -1 : 1) * (137 + i * 11), i % 2 ? 10 : 1);
      return task(topic, 'hard', i, mul(divisor, quotient), divisor, 'div');
    }
    const group = Math.floor(i / 6);
    const k = i % 6;
    return task(topic, 'hard', i, fraction(7 + k * 2, 3 + k * 2), fraction(3 + k, 8 + k * 3), (['add', 'sub', 'mul', 'div', 'combined'] as const)[group]);
  });
  return [...easy, ...hard];
});
