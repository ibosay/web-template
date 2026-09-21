import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

// Contexts, configs, and util modules
import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { isScrollingDisabled } from '../../ducks/ui.duck';

// Shared components
import { H1, LayoutSingleColumn, Page } from '../../components';

// Modules from parent directory
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

// Modules from the same directory
import useTrafficSignAssistant from './useTrafficSignAssistant';
import AssistantScreens from './AssistantScreens';
import css from './TrafficSignAssistPage.module.css';

/**
 * Traffic sign assistant.
 *
 * Reads Austrian speed limits and stop signs from the rear camera while driving, remembers the
 * limit in force, compares it with the speed from the GPS and warns out loud.
 *
 * Everything runs on the phone: the camera picture is analysed frame by frame in the browser, is
 * never uploaded and never stored, and the voice is the one built into the phone. That is also why
 * it keeps working in a valley without a signal.
 *
 * How the pieces fit together:
 *
 * 1. `useCameraStream` opens the rear camera,
 * 2. `useFrameDetection` shrinks every frame and hands it to the detector,
 * 3. `detection/signDetector` finds signs in that single frame,
 * 4. `logic/detectionStabilizer` only lets through what several frames in a row agree on,
 * 5. `logic/assistantState` keeps the limit in force and decides what is worth saying,
 * 6. `useSpeech` says it.
 *
 * Steps 3 to 5 are plain functions without a browser in them, which is where the tests are.
 *
 * This page is the marketplace frame around the assistant. The assistant itself lives in
 * `useTrafficSignAssistant`, so that it can also run as the standalone app in `demo/`.
 *
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @returns {JSX.Element} traffic sign assistant page
 */
export const TrafficSignAssistPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const { scrollingDisabled } = props;

  const assistant = useTrafficSignAssistant();

  const title = intl.formatMessage(
    { id: 'TrafficSignAssistPage.schemaTitle' },
    { marketplaceName: config.marketplaceName }
  );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H1 className={css.title}>{intl.formatMessage({ id: 'TrafficSignAssistPage.title' })}</H1>
          <p className={css.subtitle}>
            {intl.formatMessage({ id: 'TrafficSignAssistPage.subtitle' })}
          </p>

          <AssistantScreens assistant={assistant} />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  return {
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const TrafficSignAssistPage = compose(connect(mapStateToProps))(TrafficSignAssistPageComponent);

export default TrafficSignAssistPage;
