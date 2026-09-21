import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { TrafficSignAssistPageComponent } from './TrafficSignAssistPage';

const { cleanup, screen, userEvent, waitFor } = testingLibrary;

// The page needs a camera, a GPS and a voice, none of which exist in a test run. They are stood in
// for here, which is exactly the point of keeping them behind the hooks: the page can be rendered
// and driven without any of them being real.
const installBrowserApis = () => {
  const spoken = [];
  const getUserMedia = jest.fn(() => Promise.resolve({ getTracks: () => [{ stop: jest.fn() }] }));

  navigator.mediaDevices = { getUserMedia };
  navigator.geolocation = {
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
  };
  window.speechSynthesis = {
    getVoices: () => [],
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    speak: utterance => spoken.push(utterance.text),
    cancel: jest.fn(),
  };
  window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
    this.text = text;
  };
  // jsdom has no media playback.
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());

  return { spoken, getUserMedia };
};

const removeBrowserApis = () => {
  // The page has to come down before its stand-ins go away, otherwise it tears itself down
  // against a browser that no longer has a camera or a GPS.
  cleanup();
  delete navigator.mediaDevices;
  delete navigator.geolocation;
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
};

const renderPage = () => render(<TrafficSignAssistPageComponent scrollingDisabled={false} />);

const startAssistant = () =>
  userEvent.click(screen.getByRole('button', { name: 'TrafficSignAssistPage.start' }));

describe('TrafficSignAssistPage', () => {
  afterEach(removeBrowserApis);

  describe('before the drive', () => {
    it('explains what the assistant is and warns what it is not', () => {
      installBrowserApis();
      renderPage();

      expect(screen.getByText('TrafficSignAssistPage.startHeading')).toBeInTheDocument();
      expect(screen.getByText('TrafficSignAssistPage.safetyHeading')).toBeInTheDocument();
      expect(screen.getByText('TrafficSignAssistPage.safetyText')).toBeInTheDocument();
    });

    it('lists what it needs', () => {
      installBrowserApis();
      renderPage();

      expect(screen.getByText('TrafficSignAssistPage.requirement_camera')).toBeInTheDocument();
      expect(screen.getByText('TrafficSignAssistPage.requirement_gps')).toBeInTheDocument();
      expect(screen.getByText('TrafficSignAssistPage.requirement_speech')).toBeInTheDocument();
    });

    it('can be started when the browser has a camera', () => {
      installBrowserApis();
      renderPage();

      expect(screen.getByRole('button', { name: 'TrafficSignAssistPage.start' })).toBeEnabled();
    });

    it('cannot be started without a camera', () => {
      // No `installBrowserApis`: this browser has nothing the assistant needs.
      renderPage();

      expect(screen.getByRole('button', { name: 'TrafficSignAssistPage.start' })).toBeDisabled();
      expect(
        screen.getByText('TrafficSignAssistPage.requirementMissingRequired')
      ).toBeInTheDocument();
    });
  });

  describe('during the drive', () => {
    it('asks for the camera on the back of the phone', async () => {
      const { getUserMedia } = installBrowserApis();
      renderPage();
      await startAssistant();

      await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
      const constraints = getUserMedia.mock.calls[0][0];
      expect(constraints.video.facingMode).toEqual({ ideal: 'environment' });
      expect(constraints.audio).toBe(false);
    });

    it('starts tracking the position', async () => {
      installBrowserApis();
      renderPage();
      await startAssistant();

      await waitFor(() => expect(navigator.geolocation.watchPosition).toHaveBeenCalled());
    });

    it('confirms out loud that the voice works', async () => {
      const { spoken } = installBrowserApis();
      renderPage();
      await startAssistant();

      expect(spoken).toContain('TrafficSignAssistPage.speakReady');
    });

    it('shows the speed and the limit, both still unknown', async () => {
      installBrowserApis();
      renderPage();
      await startAssistant();

      // The GPS is there but has not reported a fix yet, and that is what the status line says.
      await waitFor(() =>
        expect(screen.getByText('TrafficSignAssistPage.waitingForGps')).toBeInTheDocument()
      );
      // Two dashes: no limit has been read and there is no speed yet.
      expect(screen.getAllByText('–')).toHaveLength(2);
      expect(screen.getByText('TrafficSignAssistPage.kmh')).toBeInTheDocument();
    });

    it('shows the detection boxes only when asked', async () => {
      installBrowserApis();
      renderPage();
      await startAssistant();

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'TrafficSignAssistPage.showDebug' })
        ).toBeInTheDocument()
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'TrafficSignAssistPage.showDebug' })
      );

      expect(screen.getByText('TrafficSignAssistPage.debugFps')).toBeInTheDocument();
      expect(screen.getByText('TrafficSignAssistPage.debugLastSign')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'TrafficSignAssistPage.hideDebug' })
      ).toBeInTheDocument();
    });

    it('goes back to the start screen and lets go of the camera', async () => {
      installBrowserApis();
      renderPage();
      await startAssistant();

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'TrafficSignAssistPage.stop' })
        ).toBeInTheDocument()
      );
      await userEvent.click(screen.getByRole('button', { name: 'TrafficSignAssistPage.stop' }));

      expect(
        screen.getByRole('button', { name: 'TrafficSignAssistPage.start' })
      ).toBeInTheDocument();
      expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
    });
  });
});
