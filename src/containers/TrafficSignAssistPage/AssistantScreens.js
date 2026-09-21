import React from 'react';

// Modules from the same directory
import { SCREEN_REVIEW } from './useTrafficSignAssistant';
import StartScreen from './StartScreen/StartScreen';
import DriveScreen from './DriveScreen/DriveScreen';
import ReviewScreen from './ReviewScreen/ReviewScreen';

/**
 * Shows whichever screen the assistant is on.
 *
 * Separated from the page so that the standalone app in `demo/` can show the same screens without
 * the marketplace around them.
 *
 * @param {Object} props
 * @param {Object} props.assistant - The assistant, from `useTrafficSignAssistant`
 * @returns {JSX.Element} the current screen
 */
const AssistantScreens = props => {
  const { assistant } = props;

  if (assistant.screen === SCREEN_REVIEW) {
    return <ReviewScreen recorder={assistant.recorder} onBack={assistant.closeReview} />;
  }

  if (assistant.isDriving) {
    return (
      <DriveScreen
        videoRef={assistant.camera.registerVideo}
        overlayRef={assistant.overlayRef}
        limitKmh={assistant.hud.limitKmh}
        speedKmh={assistant.speedKmh}
        isOverLimit={assistant.hud.isOver}
        lastSign={assistant.lastSign}
        gps={assistant.gps}
        cameraError={assistant.camera.error}
        wasCameraInterrupted={assistant.camera.wasInterrupted}
        frameStats={assistant.frameStats}
        isDebugVisible={assistant.isDebugVisible}
        recorder={assistant.recorder}
        onToggleDebug={assistant.toggleDebug}
        onStop={assistant.stop}
      />
    );
  }

  return (
    <StartScreen
      isCameraSupported={assistant.camera.isSupported}
      isGpsSupported={assistant.gps.isSupported}
      isSpeechSupported={assistant.speech.isSupported}
      cameraError={assistant.camera.error}
      recordedFrameCount={assistant.recorder.isSupported ? assistant.recorder.frameCount : 0}
      onStart={assistant.start}
      onReview={assistant.openReview}
    />
  );
};

export default AssistantScreens;
