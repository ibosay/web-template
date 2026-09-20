import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { LayoutSingleColumn, Page } from '../../components';

import QuizArenaLiveApp from './QuizArenaLiveApp';
import css from './QuizGamePage.module.css';

export const QuizGamePageComponent = props => {
  const { scrollingDisabled } = props;

  return (
    <Page title="Quiz Arena" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={null}
        footer={null}
      >
        <div className="quizArenaRoot">
          <QuizArenaLiveApp />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const QuizGamePage = compose(connect(mapStateToProps))(QuizGamePageComponent);

export default QuizGamePage;
