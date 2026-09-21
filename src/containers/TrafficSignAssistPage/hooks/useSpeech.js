import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speaks short warnings out loud, through the speech synthesis built into the browser.
 *
 * Nothing is sent anywhere: the voice comes from the phone, which is what keeps the assistant
 * working without a signal.
 *
 * Two details of the browsers decide how this is built:
 *
 * - the list of voices arrives late, so it is read again on the `voiceschanged` event,
 * - iOS only allows speech after the user has asked for it once, directly from a tap. `enable` is
 *   meant to be called from the button that starts the assistant, and speaks one short line to get
 *   permission for all the warnings that follow.
 */

/** Austrian German first, then any German, then whatever the browser offers. */
const PREFERRED_LANGUAGES = ['de-AT', 'de-DE', 'de'];

const pickVoice = (voices, language) => {
  const wanted = [language, ...PREFERRED_LANGUAGES].filter(Boolean);

  for (let i = 0; i < wanted.length; i++) {
    const exact = voices.find(voice => voice.lang.replace('_', '-') === wanted[i]);
    if (exact) {
      return exact;
    }
  }
  for (let i = 0; i < wanted.length; i++) {
    const prefix = wanted[i].split('-')[0];
    const loose = voices.find(voice => voice.lang.toLowerCase().startsWith(prefix.toLowerCase()));
    if (loose) {
      return loose;
    }
  }
  return null;
};

/**
 * @param {Object} [params]
 * @param {string} [params.language] - Language tag to speak in, e.g. 'de-AT'
 * @returns {Object} `{ isSupported, isEnabled, enable, speak, cancel }`
 */
const useSpeech = ({ language = 'de-AT' } = {}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const voiceRef = useRef(null);

  useEffect(() => {
    const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synthesis) {
      return undefined;
    }
    setIsSupported(true);

    const readVoices = () => {
      voiceRef.current = pickVoice(synthesis.getVoices() || [], language);
    };
    readVoices();
    synthesis.addEventListener('voiceschanged', readVoices);

    return () => {
      synthesis.removeEventListener('voiceschanged', readVoices);
      synthesis.cancel();
    };
  }, [language]);

  const say = useCallback(
    (text, { interrupt = false } = {}) => {
      const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (!synthesis || !text) {
        return;
      }
      if (interrupt) {
        synthesis.cancel();
      }

      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = language;
      // A warning has to be understood at the first go, over road noise.
      utterance.rate = 1.05;
      utterance.volume = 1;
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }
      synthesis.speak(utterance);
    },
    [language]
  );

  /**
   * Asks the browser for permission to speak, and confirms out loud that it has it. Has to be
   * called from a tap.
   *
   * @param {string} [greeting] - What to say to confirm that the voice works
   */
  const enable = useCallback(
    greeting => {
      say(greeting || '', { interrupt: true });
      setIsEnabled(true);
    },
    [say]
  );

  /**
   * Speaks a warning. Warnings interrupt each other: the newest one is always the one that
   * matters, and a queue of stale warnings would be spoken long after the sign has passed.
   *
   * @param {string} text - What to say
   */
  const speak = useCallback(
    text => {
      if (!isEnabled) {
        return;
      }
      say(text, { interrupt: true });
    },
    [isEnabled, say]
  );

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { isSupported, isEnabled, enable, speak, cancel };
};

export default useSpeech;
