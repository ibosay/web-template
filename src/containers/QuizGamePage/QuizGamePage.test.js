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
    expect(QUESTIONS).toHaveLength(399);
    expect(new Set(QUESTIONS.map(question => question.id)).size).toBe(399);
    expect(CATEGORIES).toEqual([
      'Alle',
      'Islam',
      'Allgemeinwissen',
      'Geografie',
      'Wissenschaft',
      'Geschichte',
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

  it('does not repeat answered questions in the next round', () => {
    window.localStorage.setItem('quiz-arena-time-enabled', 'off');
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    render(<QuizArenaLiveApp />);
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    const seenIds = new Set();

    for (let step = 0; step < 10; step += 1) {
      const current = QUESTIONS.find(question => screen.queryByText(question.question));
      expect(current).toBeDefined();
      seenIds.add(current.id);

      const answerButtons = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
      fireEvent.click(answerButtons[current.correct]);
      fireEvent.click(screen.getByRole('button', { name: step === 9 ? 'Ergebnis ansehen' : 'Weiter' }));
    }

    expect(screen.getByText('RUNDE BEENDET')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('quiz-arena-mastery'))['Islam:easy'].seen).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Noch eine Runde' }));

    const nextQuestion = QUESTIONS.find(question => screen.queryByText(question.question));
    expect(nextQuestion).toBeDefined();
    expect(seenIds.has(nextQuestion.id)).toBe(false);

    randomSpy.mockRestore();
  });

  it('awards a golden knowledge chest for a perfect complete pool', () => {
    window.localStorage.setItem('quiz-arena-difficulty', 'hard');
    window.localStorage.setItem('quiz-arena-time-enabled', 'off');
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    render(<QuizArenaLiveApp />);
    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));

    for (let step = 0; step < 10; step += 1) {
      const current = QUESTIONS.find(question => screen.queryByText(question.question));
      expect(current).toBeDefined();

      const answerButtons = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
      fireEvent.click(answerButtons[current.correct]);
      fireEvent.click(screen.getByRole('button', { name: step === 9 ? 'Ergebnis ansehen' : 'Weiter' }));
    }

    expect(screen.getByText('Goldene Wissenskiste')).toBeInTheDocument();
    expect(screen.getByText('+500 XP · +2 ★')).toBeInTheDocument();

    const storedProgress = JSON.parse(window.localStorage.getItem('quiz-arena-progress'));
    expect(storedProgress.gifts).toBe(1);
    expect(storedProgress.stars).toBeGreaterThanOrEqual(2);

    randomSpy.mockRestore();
  });

  it('uses earned knowledge stars for a 50:50 joker', () => {
    window.localStorage.setItem('quiz-arena-time-enabled', 'off');
    window.localStorage.setItem('quiz-arena-progress', JSON.stringify({
      xp: 2000,
      rounds: 0,
      correct: 0,
      bestStreak: 0,
      gifts: 0,
      stars: 1,
      levelChests: 0,
    }));

    render(<QuizArenaLiveApp />);
    expect(screen.getByText('Kenner')).toBeInTheDocument();
    expect(screen.getByText('★ 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Spiel starten/ }));
    const joker = screen.getByRole('button', { name: '50:50 · 1 ★' });
    expect(joker).toBeEnabled();

    fireEvent.click(joker);

    const availableAnswers = screen.getAllByRole('button').filter(button => button.getAttribute('aria-disabled') === 'false');
    expect(availableAnswers).toHaveLength(2);

    const storedProgress = JSON.parse(window.localStorage.getItem('quiz-arena-progress'));
    expect(storedProgress.stars).toBe(0);
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