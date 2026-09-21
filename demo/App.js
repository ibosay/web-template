import React from 'react';

// Contexts, configs, and util modules
import { useIntl } from '../src/util/reactIntl';

// Modules from the app
import useTrafficSignAssistant from '../src/containers/TrafficSignAssistPage/useTrafficSignAssistant';
import AssistantScreens from '../src/containers/TrafficSignAssistPage/AssistantScreens';

// Modules from the same directory
import css from './App.module.css';

/**
 * The assistant as an app of its own.
 *
 * Same assistant and same screens as the marketplace page, without the marketplace around them:
 * on a phone in a holder every row of chrome is a row of road that is not visible.
 *
 * @returns {JSX.Element} the app
 */
const App = () => {
  const intl = useIntl();

  const assistant = useTrafficSignAssistant();

  return (
    <div className={css.root}>
      <header className={css.header}>
        <span className={css.title}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.title' })}
        </span>
        <span className={css.badge}>{intl.formatMessage({ id: 'Demo.badge' })}</span>
      </header>

      <main className={css.main}>
        <AssistantScreens assistant={assistant} />
      </main>
    </div>
  );
};

export default App;
