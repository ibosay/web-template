const SETTINGS_KEY = 'quizGameSettings';

export const defaultSettings = {
  hapticsEnabled: true,
  soundEnabled: true,
};

const normalizeSettings = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultSettings };
  }
  return {
    hapticsEnabled:
      typeof value.hapticsEnabled === 'boolean'
        ? value.hapticsEnabled
        : defaultSettings.hapticsEnabled,
    soundEnabled:
      typeof value.soundEnabled === 'boolean' ? value.soundEnabled : defaultSettings.soundEnabled,
  };
};

export const loadSettings = () => {
  if (typeof window === 'undefined') return { ...defaultSettings };
  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)));
  } catch (e) {
    return { ...defaultSettings };
  }
};

export const saveSettings = settings => {
  const normalized = normalizeSettings(settings);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    } catch (e) {
      // Settings are optional; storage failures must not interrupt the quiz.
    }
  }
  return normalized;
};
