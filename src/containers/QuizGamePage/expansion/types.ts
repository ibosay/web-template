export type LearningRow = [question: string, correct: string, wrong1: string, wrong2: string, wrong3: string, explanation: string];
export type LearningBlock = {
  chapter: string;
  difficulty: 'easy' | 'hard';
  rows: LearningRow[];
};
