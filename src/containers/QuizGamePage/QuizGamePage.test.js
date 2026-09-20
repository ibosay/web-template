import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import QuizArenaLiveApp, {
  CATEGORIES,
  HARD_QUESTION_IDS,
  QUESTIONS,
  QUESTION_TRANSLATIONS,
} from './QuizArenaLiveApp';

describe('current Quiz Arena experience', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('contains the complete current question bank with valid answers and English copy', () => {
    expect(QUESTIONS).toHaveLength(280);
    expect(new Set(QUESTIONS.map(question => question.id)).size).toBe(280);
    expect(CATEGORIES).toEqual([
      'Islam',
      'Alle',
      'Allgemeinwissen',
      'Geografie',
      'Wissenschaft',
      'Geschichte',
      'Kultur',
      'Österreich',
      'EU',
    ]);

    QUESTIONS.forEach(question => {
      expect(question.answers).toHaveLength(4);
      expect(question.correct).toBeGreaterThanOrEqual(0);
      expect(question.correct).toBeLessThan(4);
      expect(QUESTION_TRANSLATIONS.EN?.[question.id]).toBeDefined();
      expect(QUESTION_TRANSLATIONS.EN?.[question.id].answers).toHaveLength(4);
    });

    expect(HARD_QUESTION_IDS.size).toBeGreaterThan(0);

    const islamQuestions = QUESTIONS.filter(question => question.category === 'Islam');
    expect(islamQuestions).toHaveLength(60);
    expect(islamQuestions.filter(question => HARD_QUESTION_IDS.has(question.id))).toHaveLength(25);
    expect(islamQuestions.filter(question => !HARD_QUESTION_IDS.has(question.id))).toHaveLength(35);
    islamQuestions.forEach(question => {
      expect(question.source).toBeTruthy();
      expect(QUESTION_TRANSLATIONS.EN?.[question.id]).toBeDefined();
    });
  });

  it('shows the same main categories and controls as the live app', () => {
    render(<QuizArenaLiveApp />);

    expect(screen.getByRole('heading', { name: 'Quiz Arena' })).toBeInTheDocument();
    expect(screen.getByText('Allgemeinwissen')).toBeInTheDocument();
    expect(screen.getByText('Österreich')).toBeInTheDocument();
    expect(screen.getByText('EU')).toBeInTheDocument();
    expect(screen.getByText('Sunnitischer Islam')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Spiel starten/ })).toBeInTheDocument();
  });

  it('switches the visible experience from German to English', () => {
    render(<QuizArenaLiveApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByText('English').closest('button'));

    expect(screen.getByRole('button', { name: /Start game/ })).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();
  });

  it('starts a ten question round and protects leaving the round', () => {
    render(<QuizArenaLiveApp />);

    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    expect(screen.getByText('FRAGE 1/10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Runde verlassen' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Runde verlassen?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weiterspielen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('FRAGE 1/10')).toBeInTheDocument();
  });
});
