export type HistoryBlock = {
  topic: string;
  difficulty: 'easy' | 'hard';
  chapter: string;
  source: string;
  context: string;
  rows: string;
};

export const bilingual = (text: string, language: 'DE' | 'EN') => {
  const parts = text.split('~');
  return parts[language === 'EN' ? 1 : 0] || parts[0];
};
