import { defaultSettings, loadSettings, saveSettings } from './quizSettings';

describe('quizSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses safe defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it('persists valid preferences', () => {
    expect(saveSettings({ hapticsEnabled: false, soundEnabled: true })).toEqual({
      hapticsEnabled: false,
      soundEnabled: true,
    });
    expect(loadSettings()).toEqual({ hapticsEnabled: false, soundEnabled: true });
  });

  it('repairs damaged stored settings', () => {
    window.localStorage.setItem(
      'quizGameSettings',
      JSON.stringify({ hapticsEnabled: 'yes', soundEnabled: false })
    );
    expect(loadSettings()).toEqual({ hapticsEnabled: true, soundEnabled: false });
  });

  it('handles invalid JSON without breaking the game', () => {
    window.localStorage.setItem('quizGameSettings', 'not-json');
    expect(loadSettings()).toEqual(defaultSettings);
  });
});
