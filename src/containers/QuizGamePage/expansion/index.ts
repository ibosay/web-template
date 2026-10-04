import { geography } from './geography.ts';
import { science } from './science.ts';
import { eu } from './eu.ts';
import { expansionSources } from './sources.ts';

export const EXPANSION_POOLS = [
  { category: 'Geografie', baseId: 20000, blocks: geography },
  { category: 'Wissenschaft', baseId: 21000, blocks: science },
  { category: 'EU', baseId: 22000, blocks: eu },
];

// Keep published block and row order stable: IDs are persisted in player progress.
export const EXPANSION_QUESTIONS = EXPANSION_POOLS.flatMap((pool) =>
  pool.blocks.flatMap((block, blockIndex) =>
    block.rows.map(([question, correct, wrong1, wrong2, wrong3, explanation], rowIndex) => ({
      id: pool.baseId + blockIndex * 20 + rowIndex,
      category: pool.category,
      difficulty: block.difficulty,
      chapter: block.chapter,
      question,
      answers: [correct, wrong1, wrong2, wrong3],
      correct: 0,
      explanation,
      source: expansionSources[pool.baseId + blockIndex * 20 + rowIndex],
    })),
  ),
);
