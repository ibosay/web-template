import React, { act } from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { TrafficSignAssistPageComponent } from './TrafficSignAssistPage';

const { cleanup, screen, userEvent, waitFor } = testingLibrary;

// The page needs a camera, a GPS and a voice, none of which exist in a test run. They are stood in
// for here, which is exactly the point of keeping them behind the hooks: the page can be rendered
// and driven without any of them being real.
const installBrowserApis = ({ cameraFails = false } = {}) => {
  const spoken = [];
  // A stand-in for a MediaStream, with the parts the camera hook uses: the tracks it stops when
  // the drive ends, and the 'ended' event it listens for to notice a camera taken by the system.
  const track = { stop: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = jest.fn(() =>
    cameraFails ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(stream)
  );

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
  // jsdom has no IndexedDB either. This is just enough of it for the page to see that a recording
  // could be stored; opening it then fails, which the recorder is expected to shrug off.
  window.indexedDB = {
    open: () => {
      const request = {};
      setTimeout(() => {
        if (request.onerror) {
          request.onerror();
        }
      }, 0);
      return request;
    },
  };

  return { spoken, getUserMedia, stream, track };
};

const removeBrowserApis = () => {
  // The page has to come down before its stand-ins go away, otherwise it tears itself down
  // against a browser that no longer has a camera or a GPS.
  cleanup();
  delete window.indexedDB;
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

    it('hands the camera picture to the video element', async () => {
      // The camera is asked for while the start screen is still up, so the video element does not
      // exist yet. If the stream were attached right after getUserMedia resolves, it would attach
      // to nothing, and the viewport would stay black with no detection at all.
      const { stream } = installBrowserApis();
      const { container } = renderPage();
      await startAssistant();

      await waitFor(() => expect(container.querySelector('video')).toBeInTheDocument());
      await waitFor(() => expect(container.querySelector('video').srcObject).toBe(stream));
    });

    it('stays on the start screen when the camera refuses', async () => {
      installBrowserApis({ cameraFails: true });
      renderPage();
      await startAssistant();

      // The error belongs on the screen that explains what to do about it.
      await waitFor(() =>
        expect(screen.getByText('TrafficSignAssistPage.cameraError')).toBeInTheDocument()
      );
      expect(
        screen.getByRole('button', { name: 'TrafficSignAssistPage.start' })
      ).toBeInTheDocument();
      expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
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

    it('can record the drive, and says how much it has', async () => {
      installBrowserApis();
      renderPage();
      await startAssistant();

      const recordButton = await screen.findByRole('button', {
        name: 'TrafficSignAssistPage.recordStart',
      });
      expect(screen.getByText('TrafficSignAssistPage.recordCount')).toBeInTheDocument();

      await userEvent.click(recordButton);

      expect(
        screen.getByRole('button', { name: 'TrafficSignAssistPage.recordStop' })
      ).toBeInTheDocument();
    });

    it('says so when the system takes the camera away mid-drive', async () => {
      // On a phone another app can claim the camera, and iOS does it when the app goes to the
      // background. Without this the picture just freezes and the assistant goes quiet.
      const { track } = installBrowserApis();
      renderPage();
      await startAssistant();

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'TrafficSignAssistPage.stop' })
        ).toBeInTheDocument()
      );

      const [, endTheTrack] = track.addEventListener.mock.calls.find(
        ([event]) => event === 'ended'
      );
      await act(async () => endTheTrack());

      expect(screen.getByText('TrafficSignAssistPage.cameraInterrupted')).toBeInTheDocument();
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
