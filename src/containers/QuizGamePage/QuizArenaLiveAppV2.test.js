import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import QuizArenaLiveAppV2, { QUESTIONS, getQuizCategoryTheme, isHardQuestion } from './QuizArenaLiveAppV2.tsx';

const historyCounts = (category) => {
  const pool = QUESTIONS.filter(question => question.category === category);
  return {
    total: pool.length,
    easy: pool.filter(question => !isHardQuestion(question)).length,
    hard: pool.filter(question => isHardQuestion(question)).length,
  };
};

describe('Quiz Arena mobile V2', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('maps every parent and subcategory to its visual theme', () => {
    expect(getQuizCategoryTheme('Alle')).toBe('core');
    expect(getQuizCategoryTheme('Islam')).toBe('islam');
    expect(getQuizCategoryTheme('Allgemeinwissen')).toBe('general');
    expect(getQuizCategoryTheme('Geografie')).toBe('geography');
    expect(getQuizCategoryTheme('Wissenschaft')).toBe('science');
    expect(getQuizCategoryTheme('Mathe Multiplikation')).toBe('math');
    expect(getQuizCategoryTheme('Geschichte japan')).toBe('history');
    expect(getQuizCategoryTheme('EU')).toBe('eu');
    expect(getQuizCategoryTheme('Staatsbürgerschaft Wien')).toBe('citizenship');
  });

  it('requires a category choice and explains XP with simple controls', () => {
    render(<QuizArenaLiveAppV2 />);
    const start = screen.getByRole('button', {name:'Spiel starten'});
    expect(start).toBeDisabled();
    expect(document.querySelector('.categoryRow.active')).toBeNull();
    expect(start.querySelector('svg')).toBeNull();
    expect(screen.getByRole('button',{name:'Meine Statistik'}).textContent).toBe('Meine Statistik');
    expect(screen.getByText('500 XP')).toBeInTheDocument();
    expect(screen.getByText('Belohnung: +1 Wissensstern')).toBeInTheDocument();
    expect(screen.getByText(/1 Wissensstern = 1 × 50:50/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Islam Fragen').closest('button'));
    expect(start).toBeEnabled();
  });

  it('shows the fifth-level bonus as the next reward', () => {
    window.localStorage.setItem('quiz-arena-progress', JSON.stringify({
      xp: 1500,
      rounds: 0,
      correct: 0,
      bestStreak: 0,
      gifts: 0,
      stars: 0,
      levelChests: 0,
      wrong: 0,
      jokerUses: 0,
    }));

    render(<QuizArenaLiveAppV2 />);

    expect(screen.getByText('Noch 500 XP bis Level 5')).toBeInTheDocument();
    expect(screen.getByText('Belohnung: +3 Wissenssterne + Levelkiste')).toBeInTheDocument();
  });

  it('contains the complete structured history learning pools without duplicate ids', () => {
    expect(historyCounts('Geschichte ww1')).toEqual({ total: 150, easy: 100, hard: 50 });
    expect(historyCounts('Geschichte ww2')).toEqual({ total: 150, easy: 100, hard: 50 });
    expect(historyCounts('Geschichte chechnya')).toEqual({ total: 80, easy: 50, hard: 30 });
    expect(historyCounts('Geschichte japan')).toEqual({ total: 150, easy: 100, hard: 50 });

    const history = QUESTIONS.filter(question => question.category.startsWith('Geschichte '));
    expect(history).toHaveLength(530);
    expect(new Set(QUESTIONS.map(question => question.id)).size).toBe(QUESTIONS.length);
    history.forEach(question => {
      expect(question.answers).toHaveLength(4);
      expect(question.explanation).toBeTruthy();
      expect(question.source).toBeTruthy();
    });
  });

  it('keeps Japanese history focused on historical events rather than deity quiz content', () => {
    const japan = QUESTIONS.filter(question => question.category === 'Geschichte japan');
    const visibleQuizText = japan.map(question => [question.question, ...question.answers].join(' ')).join(' ');
    expect(visibleQuizText).not.toMatch(/Götz|Gottheit|Kami|Shinto/i);
  });

  it('shows the four History subtopics with the requested easy counts', () => {
    render(<QuizArenaLiveAppV2 />);
    fireEvent.click(screen.getByRole('button', { name: /Geschichte/ }));

    expect(screen.getByText('Erster Weltkrieg')).toBeInTheDocument();
    expect(screen.getByText('Zweiter Weltkrieg')).toBeInTheDocument();
    expect(screen.getByText('Tschetschenische Geschichte')).toBeInTheDocument();
    expect(screen.getByText('Geschichte Japans')).toBeInTheDocument();

    expect(screen.getAllByText('100').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('allows the 50:50 joker only once per hard round', () => {
    window.localStorage.setItem('quiz-arena-difficulty', 'hard');
    window.localStorage.setItem('quiz-arena-progress', JSON.stringify({
      xp: 2000,
      rounds: 0,
      correct: 0,
      bestStreak: 0,
      gifts: 0,
      stars: 5,
      levelChests: 0,
      wrong: 0,
      jokerUses: 0,
    }));

    render(<QuizArenaLiveAppV2 />);
    fireEvent.click(screen.getByText('Islam Fragen').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    const joker = screen.getByRole('button', { name: '50:50 · 1 ★' });
    expect(joker).toBeEnabled();
    fireEvent.click(joker);

    const remainingAnswers = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false' && /^\d$/.test(button.textContent?.trim().charAt(0) || ''));
    expect(remainingAnswers).toHaveLength(2);
    fireEvent.click(remainingAnswers[0]);
    fireEvent.click(screen.getByRole('button', { name: /Weiter|Ergebnis ansehen/ }));

    const usedJoker = screen.getByRole('button', { name: '50:50 benutzt' });
    expect(usedJoker).toBeDisabled();
  });

  it('shows learning context and a source after answering a History question', () => {
    window.localStorage.setItem('quiz-arena-round-size', '5');
    render(<QuizArenaLiveAppV2 />);
    fireEvent.click(screen.getByRole('button', { name: /Geschichte/ }));
    fireEvent.click(screen.getByRole('button', { name: /Erster Weltkrieg/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    const answer = screen.getAllByRole('button').find(button => button.getAttribute('aria-disabled') === 'false' && /^\d/.test(button.textContent?.trim() || ''));
    expect(answer).toBeDefined();
    fireEvent.click(answer);

    expect(screen.getByText(/Lernhinweis:/)).toBeInTheDocument();
    expect(screen.getByText(/Quelle:/)).toBeInTheDocument();
  });

  it('renders achievement badges with unified SVG icons', () => {
    render(<QuizArenaLiveAppV2 />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Erfolge/ }));

    const icons = document.querySelectorAll('.achievementIcon svg');
    expect(icons.length).toBeGreaterThan(10);
  });
});
