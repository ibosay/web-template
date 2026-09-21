import React, { useCallback, useEffect, useRef, useState } from 'react';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton, SecondaryButton } from '../../../components';

// Modules from parent directory
import { detectSigns } from '../detection/signDetector';
import { DEFAULT_FRAME_OPTIONS } from '../hooks/useFrameDetection';
import { signLabelId } from '../signTypes';

// Modules from the same directory
import css from './ReviewScreen.module.css';

/** Colours of the boxes, matching the ones drawn during the drive. */
const BOX_COLOURS = { speedLimit: '#38bdf8', stop: '#f87171' };

/**
 * Describes a list of detections in one short line.
 *
 * @param {Array<Object>} detections - What was found
 * @param {Object} intl - The intl object
 * @returns {string} something like "Tempolimit 50", or a dash
 */
const describeDetections = (detections, intl) => {
  if (!detections || detections.length === 0) {
    return '–';
  }
  return detections
    .map(detection => {
      const name = intl.formatMessage({ id: signLabelId(detection.type) });
      return detection.limitKmh === null ? name : `${name} ${detection.limitKmh}`;
    })
    .join(', ');
};

/**
 * Looks through a recorded drive, one frame at a time.
 *
 * Every frame carries what the detector made of it while driving, and the detector is run over it
 * again as it is shown. Side by side those two answer the question a test drive is for: did it miss
 * this sign, and does it still miss it now that a threshold has changed.
 *
 * @param {Object} props
 * @param {Object} props.recorder - The recorder, from `useFrameRecorder`
 * @param {Function} props.onBack - Called when the driver leaves the review
 * @returns {JSX.Element} review screen
 */
const ReviewScreen = props => {
  const intl = useIntl();
  const { recorder, onBack } = props;

  const [frames, setFrames] = useState(null);
  const [index, setIndex] = useState(0);
  const [detectionsNow, setDetectionsNow] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const canvasRef = useRef(null);
  const analysisCanvasRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    recorder
      .loadFrameList()
      .then(list => {
        if (!isCancelled) {
          setFrames(list);
          setIndex(0);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFrames([]);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [recorder]);

  const frame = frames && frames.length > 0 ? frames[index] : null;

  /** Draws the frame and runs the detector over it again. */
  const showFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!frame || !canvas) {
      return;
    }

    const picture = await recorder.loadFramePicture(frame.id);
    if (!picture) {
      return;
    }

    const url = URL.createObjectURL(picture);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = url;
      });

      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      context.drawImage(image, 0, 0);

      // Run the detector at exactly the size it works at while driving, so that what is shown here
      // is what it would do on the road.
      if (!analysisCanvasRef.current) {
        analysisCanvasRef.current = document.createElement('canvas');
        analysisCanvasRef.current.width = DEFAULT_FRAME_OPTIONS.analysisWidth;
        analysisCanvasRef.current.height = DEFAULT_FRAME_OPTIONS.analysisHeight;
      }
      const analysisCanvas = analysisCanvasRef.current;
      const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
      analysisContext.drawImage(image, 0, 0, analysisCanvas.width, analysisCanvas.height);
      const detections = detectSigns(
        analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)
      );
      setDetectionsNow(detections);

      // The boxes come back in the detector's coordinates and are drawn on the larger picture.
      const scaleX = canvas.width / analysisCanvas.width;
      const scaleY = canvas.height / analysisCanvas.height;
      context.lineWidth = 3;
      context.font = '18px sans-serif';
      context.textBaseline = 'bottom';
      detections.forEach(detection => {
        const { box, type, limitKmh } = detection;
        context.strokeStyle = BOX_COLOURS[type] || '#ffffff';
        context.fillStyle = context.strokeStyle;
        context.strokeRect(
          box.x0 * scaleX,
          box.y0 * scaleY,
          (box.x1 - box.x0) * scaleX,
          (box.y1 - box.y0) * scaleY
        );
        context.fillText(
          limitKmh === null ? 'STOP' : String(limitKmh),
          box.x0 * scaleX,
          box.y0 * scaleY - 2
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [frame, recorder]);

  useEffect(() => {
    showFrame();
  }, [showFrame]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await recorder.exportRecording();
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = async () => {
    await recorder.clear();
    setFrames([]);
    setDetectionsNow(null);
  };

  if (frames === null) {
    return (
      <section className={css.root}>
        <p className={css.empty}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewLoading' })}
        </p>
      </section>
    );
  }

  return (
    <section className={css.root}>
      <H2 className={css.heading}>
        {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewHeading' })}
      </H2>

      {frames.length === 0 ? (
        <p className={css.empty}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewEmpty' })}
        </p>
      ) : (
        <>
          <canvas ref={canvasRef} className={css.frame} />

          <p className={css.position}>
            {intl.formatMessage(
              { id: 'TrafficSignAssistPage.reviewPosition' },
              { current: index + 1, total: frames.length }
            )}
          </p>

          <div className={css.stepper}>
            <SecondaryButton
              className={css.stepButton}
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewPrevious' })}
            </SecondaryButton>
            <SecondaryButton
              className={css.stepButton}
              type="button"
              disabled={index >= frames.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewNext' })}
            </SecondaryButton>
          </div>

          <dl className={css.facts}>
            <div className={css.fact}>
              <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.reviewThen' })}</dt>
              <dd>{describeDetections(frame.detections, intl)}</dd>
            </div>
            <div className={css.fact}>
              <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.reviewNow' })}</dt>
              <dd>{detectionsNow === null ? '…' : describeDetections(detectionsNow, intl)}</dd>
            </div>
            <div className={css.fact}>
              <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.reviewSpeed' })}</dt>
              <dd>
                {frame.speedKmh === null || frame.speedKmh === undefined
                  ? '–'
                  : `${Math.round(frame.speedKmh)} km/h`}
              </dd>
            </div>
            <div className={css.fact}>
              <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.reviewLimit' })}</dt>
              <dd>
                {frame.limitKmh === null || frame.limitKmh === undefined ? '–' : frame.limitKmh}
              </dd>
            </div>
          </dl>
        </>
      )}

      <div className={css.actions}>
        {frames.length > 0 ? (
          <PrimaryButton
            className={css.actionButton}
            type="button"
            inProgress={isExporting}
            onClick={handleExport}
          >
            {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewExport' })}
          </PrimaryButton>
        ) : null}
        <SecondaryButton className={css.actionButton} type="button" onClick={onBack}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewBack' })}
        </SecondaryButton>
        {frames.length > 0 ? (
          <SecondaryButton className={css.actionButton} type="button" onClick={handleClear}>
            {intl.formatMessage({ id: 'TrafficSignAssistPage.reviewClear' })}
          </SecondaryButton>
        ) : null}
      </div>
    </section>
  );
};

export default ReviewScreen;
