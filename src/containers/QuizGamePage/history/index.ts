import { bilingual } from './types.ts';
import { ww1 } from './ww1.ts';
import { ww2 } from './ww2.ts';
import { chechnya } from './chechnya.ts';
import { japan } from './japan.ts';

export const HISTORY_TOPICS = [
  {
    key: 'Geschichte ww1',
    label: 'Erster Weltkrieg~First World War',
    period: '1914–1918',
    expected: [100, 50],
  },
  {
    key: 'Geschichte ww2',
    label: 'Zweiter Weltkrieg~Second World War',
    period: '1939–1945',
    expected: [100, 50],
  },
  {
    key: 'Geschichte chechnya',
    label: 'Tschetschenische Geschichte~Chechen History',
    period: 'Frühzeit bis Gegenwart~Early history to the present',
    expected: [50, 30],
  },
  {
    key: 'Geschichte japan',
    label: 'Geschichte Japans~History of Japan',
    period: 'Frühzeit bis Gegenwart~Early history to the present',
    expected: [100, 50],
  },
] as const;

export const HISTORY_BLOCKS = [...ww1, ...ww2, ...chechnya, ...japan];

export const HISTORY_QUESTIONS = HISTORY_BLOCKS.flatMap((block, blockIndex) =>
  block.rows
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, rowIndex) => {
      const cells = line.split('|');
      if (cells.length !== 5)
        throw new Error(`Invalid history row ${blockIndex}:${rowIndex}`);
      const [prompt, ...choices] = cells;
      const localize = (language: 'DE' | 'EN') => ({
        question: bilingual(prompt, language),
        answers: choices.map((choice) => bilingual(choice, language)),
        chapter: bilingual(block.chapter, language),
        explanation: bilingual(block.context, language),
      });
      return {
        id: 10000 + blockIndex * 100 + rowIndex,
        category: `Geschichte ${block.topic}`,
        correct: 0,
        difficulty: block.difficulty,
        source: block.source,
        ...localize('DE'),
        en: localize('EN'),
      };
    }),
);

export function historyLabel(
  key: string,
  language: string,
): string | undefined {
  const topic = HISTORY_TOPICS.find((item) => item.key === key);
  return topic
    ? bilingual(topic.label, language === 'EN' ? 'EN' : 'DE')
    : undefined;
}
