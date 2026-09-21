import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

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
    expect(QUESTIONS).toHaveLength(419);
    expect(new Set(QUESTIONS.map(question => question.id)).size).toBe(419);
    expect(CATEGORIES).toEqual([
      'Islam',
      'Alle',
      'Allgemeinwissen',
      'Geografie',
      'Wissenschaft',
      'Geschichte',
      'Kultur',
      'EU',
      'Staatsbürgerschaft',
    ]);

    QUESTIONS.forEach(question => {
      expect(question.answers).toHaveLength(4);
      expect(question.correct).toBeGreaterThanOrEqual(0);
      expect(question.correct).toBeLessThan(4);
      if (!question.category.startsWith('Staatsbürgerschaft')) {
        expect(QUESTION_TRANSLATIONS.EN?.[question.id]).toBeDefined();
        expect(QUESTION_TRANSLATIONS.EN?.[question.id].answers).toHaveLength(4);
      }
    });

    expect(HARD_QUESTION_IDS.size).toBeGreaterThan(0);

    const islamQuestions = QUESTIONS.filter(question => question.category === 'Islam');
    expect(islamQuestions).toHaveLength(60);
    expect(islamQuestions.filter(question => HARD_QUESTION_IDS.has(question.id))).toHaveLength(10);
    expect(islamQuestions.filter(question => !HARD_QUESTION_IDS.has(question.id))).toHaveLength(50);
    islamQuestions.forEach(question => {
      expect(question.source).toBeTruthy();
      expect(QUESTION_TRANSLATIONS.EN?.[question.id]).toBeDefined();
    });
    expect(islamQuestions.some(question => question.question.includes('Schahada'))).toBe(true);
    const islamCopy = islamQuestions.flatMap(question => [question.question, ...question.answers]).join(' ');
    expect(islamCopy).not.toMatch(/hanafi|maliki|schafi|hanbali|rechtsschule|madhhab/i);
    const austriaCitizenshipQuestions = QUESTIONS.filter(question => question.category === 'Staatsbürgerschaft Österreich');
    const viennaCitizenshipQuestions = QUESTIONS.filter(question => question.category === 'Staatsbürgerschaft Wien');
    expect(austriaCitizenshipQuestions).toHaveLength(97);
    expect(viennaCitizenshipQuestions).toHaveLength(62);
    const sourceNumbers = austriaCitizenshipQuestions
      .map(question => Number(question.source.split('10-')[1]))
      .sort((a, b) => a - b);
    expect(sourceNumbers).toEqual(Array.from({ length: 97 }, (_, index) => index + 1));
    austriaCitizenshipQuestions.forEach(question => {
      expect(question.source).toMatch(/^Geschichte Österreichs, 10-\d{3}$/);
    });
    expect(viennaCitizenshipQuestions[0].source).toBe('Wien, 39-001');
    expect(viennaCitizenshipQuestions[61].source).toBe('Wien, 39-062');
  });

  it('shows the same main categories and controls as the live app', () => {
    render(<QuizArenaLiveApp />);

    expect(screen.getByRole('heading', { name: 'Quiz Arena' })).toBeInTheDocument();
    expect(screen.getByText('Allgemeinwissen')).toBeInTheDocument();
    expect(screen.getByText('EU')).toBeInTheDocument();
    expect(screen.getByText('Staatsbürgerschaft')).toBeInTheDocument();
    expect(screen.getByText('Islam Fragen')).toBeInTheDocument();
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
    expect(screen.getByText(/20s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Runde verlassen' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Runde verlassen?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weiterspielen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('FRAGE 1/10')).toBeInTheDocument();
  });
  it('offers a Max round size that uses the full selected category pool', () => {
    render(<QuizArenaLiveApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    fireEvent.click(screen.getByRole('button', { name: '×' }));

    expect(screen.getByText('Islam Fragen').closest('button')).toHaveTextContent('60');
    expect(screen.getByText('Staatsbürgerschaft').closest('button')).toHaveTextContent('159');

    fireEvent.click(screen.getByText('Staatsbürgerschaft').closest('button'));
    expect(screen.getByText('Geschichte Österreichs').closest('button')).toHaveTextContent('97');
    expect(screen.getByText('Wien').closest('button')).toHaveTextContent('62');

    fireEvent.click(screen.getByText('Wien').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    expect(screen.getByText('FRAGE 1/62')).toBeInTheDocument();
  });

  it('keeps the second hard-mode mistake visible until the player continues', () => {
    jest.useFakeTimers();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    window.localStorage.setItem('quiz-arena-difficulty', 'hard');
    window.localStorage.setItem('quiz-arena-time-enabled', 'off');

    render(<QuizArenaLiveApp />);
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    const hardIslam = QUESTIONS.filter(question => question.category === 'Islam' && HARD_QUESTION_IDS.has(question.id));

    let answerButtons = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
    fireEvent.click(answerButtons[hardIslam[0].correct === 0 ? 1 : 0]);
    expect(screen.getByLabelText('Falsch')).toBeInTheDocument();
    expect(screen.getByLabelText('Richtig')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    answerButtons = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
    fireEvent.click(answerButtons[hardIslam[1].correct === 0 ? 1 : 0]);
    expect(screen.getByLabelText('Falsch')).toBeInTheDocument();
    expect(screen.getByLabelText('Richtig')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByText('FRAGE 2/10')).toBeInTheDocument();
    expect(screen.queryByText('Du hast im schweren Modus zweimal falsch geantwortet.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Du hast im schweren Modus zweimal falsch geantwortet.')).toBeInTheDocument();

    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shows animated correct and wrong status marks and allows disabling the timer', () => {
    render(<QuizArenaLiveApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aus' }));
    fireEvent.click(screen.getByRole('button', { name: '×' }));

    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));
    expect(screen.getByLabelText('Zeitlimit aus')).toHaveTextContent('∞');

    const answerButtons = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
    fireEvent.click(answerButtons[0]);
    expect(screen.queryByLabelText('Richtig') || screen.queryByLabelText('Falsch')).toBeTruthy();
  });

});