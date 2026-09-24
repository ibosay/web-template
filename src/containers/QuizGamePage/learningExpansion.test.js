import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import QuizArenaLiveAppV2, { QUESTIONS, eligibleQuestions } from './QuizArenaLiveAppV2.tsx';
import { MATH_QUESTIONS, MATH_TOPICS } from './math/index.ts';

describe('Mobile learning expansion', () => {
  beforeEach(() => { window.localStorage.clear(); });
  it('integrates 450 additional facts and revised Islam without duplicate IDs', () => {
    expect(new Set(QUESTIONS.map(q => q.id)).size).toBe(QUESTIONS.length);
    for (const category of ['Geografie', 'Wissenschaft', 'EU']) {
      const added = QUESTIONS.filter(q => q.category === category && q.id >= 20000 && q.id < 23000);
      expect(added.filter(q => q.difficulty === 'easy')).toHaveLength(100);
      expect(added.filter(q => q.difficulty === 'hard')).toHaveLength(50);
      expect(added.every(q => q.explanation && new Set(q.answers).size === 4)).toBe(true);
    }
    expect(eligibleQuestions('Islam','easy','DE')).toHaveLength(50);
    expect(eligibleQuestions('Islam','hard','DE')).toHaveLength(20);
    for (const language of ['DE', 'EN']) {
      expect(eligibleQuestions('Islam','easy',language).concat(eligibleQuestions('Islam','hard',language)).map(q => q.question).join(' ')).not.toMatch(/bukhari|buhari|sahih|tirmidhi|hadith/i);
    }
  });
  it('keeps every math operation and mixed pool separate by difficulty and language', () => {
    expect(MATH_QUESTIONS).toHaveLength(475);
    for (const language of ['DE','EN']) {
      for (const topic of MATH_TOPICS) {
        expect(eligibleQuestions(topic.key,'easy',language)).toHaveLength(65);
        expect(eligibleQuestions(topic.key,'hard',language)).toHaveLength(30);
      }
      expect(eligibleQuestions('Mathe','easy',language)).toHaveLength(325);
      expect(eligibleQuestions('Mathe','hard',language)).toHaveLength(150);
    }
  });
  it('checks every mathematical result independently', () => {
    const value = s => { const [n,d='1'] = s.replace(',','.').split('/'); return Number(n)/Number(d); };
    MATH_QUESTIONS.forEach(q => {
      const {a,b,operation}=q.calculation, x=a.n/a.d, y=b.n/b.d;
      const expected={add:x+y,sub:x-y,mul:x*y,div:x/y,simplify:x,combined:(x+y)*2}[operation];
      for (const variant of [q,q.en]) {
        expect(value(variant.answers[q.correct])).toBeCloseTo(expected,8);
        expect(new Set(variant.answers.map(value)).size).toBe(4);
      }
    });
  });
  it('plays a mixed Max math round with a solution and no repeat across restart', () => {
    window.localStorage.setItem('quiz-arena-round-size','max');
    window.localStorage.setItem('quiz-arena-sound','off');
    window.localStorage.setItem('quiz-arena-haptics','off');
    render(<QuizArenaLiveAppV2 />);
    fireEvent.click(screen.getByText('Mathe').closest('button'));
    expect(screen.getByText('Alle Matheaufgaben · gemischt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Spiel starten/}));
    expect(screen.getByText('FRAGE 1/325')).toBeInTheDocument();
    const prompt=document.querySelector('h2').textContent;
    const q=QUESTIONS.find(q=>q.question===prompt);
    const option=Array.from(document.querySelectorAll('.answer')).find(el=>el.textContent.slice(1)===q.answers[q.correct]);
    fireEvent.click(option);
    expect(screen.getByText('Rechenweg:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Runde verlassen'}));
    fireEvent.click(screen.getAllByRole('button',{name:'Runde verlassen'}).find(el=>el.closest('[role=dialog]')));
    fireEvent.click(screen.getByRole('button',{name:/Spiel starten/}));
    expect(screen.getByText('FRAGE 1/324')).toBeInTheDocument();
    expect(document.querySelector('h2').textContent).not.toBe(prompt);
  });
});
