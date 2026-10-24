# QuizGamePage

A quiz game at the route `/quiz`. The player picks a category, answers a round of questions with 4
answer options each against a countdown, and gets a score. The page is not connected to the
Marketplace API: it only reads the marketplace name from the configuration, so the whole game state
lives in component state instead of a Redux duck.

## Screens

The page moves between three screens, which live in their own directories:

- **StartScreen**: the category picker, the rules, the best score of the picked category, and the
  button that starts a round.
- **QuestionScreen**: the progress of the round, the running score, a streak indicator, the
  countdown, the current question with its 4 options, and the feedback for the given answer. Answers
  can be picked with the mouse or with the number keys 1–4, and Enter moves on. The countdown is
  kept in this component, which the page renders with the question id as key so that it restarts on
  every question.
- **ResultScreen**: the final score, the number of correct answers, a summary of every question of
  the round, and the buttons to replay the category or to go back to the start.

## Questions

`quizQuestions.js` holds the structure of the quiz: the categories, the question bank, and the
functions that build the translation keys and draw the questions of a round. The copy texts of the
questions are translation keys in the translation files, so they can be translated and overridden
with hosted translations.

The categories are geography, science, art & culture, history, and Islam, next to the "all
categories" option. The questions of the Islam category are about the Mothers of the Believers, the
wives of the Prophet Muhammad, peace and blessings of Allah be upon him.

To add a question:

1. add an entry to `QUIZ_QUESTIONS` in `quizQuestions.js` with an id, a category, and the index of
   the correct option
2. add the `QuizGamePage.question.{id}.text` and `QuizGamePage.question.{id}.option{1-4}` keys to
   `src/translations/{en,de,es,fr}.json`

`quizQuestions.test.js` checks that every question has a valid category, a valid correct option, and
a default translation for the question and all of its options, so a missing translation fails the
test suite.

### Category notes

A category can carry a note that is shown with it on the start screen, for example an honorific that
belongs with the people its questions are about. A category gets one by being listed in
`CATEGORIES_WITH_NOTE` in `quizQuestions.js` and by having a
`QuizGamePage.categoryNote.{categoryId}` key in the translation files. The Islam category uses this
for the honorific of the Mothers of the Believers.

A round draws `QUESTIONS_PER_ROUND` questions at random. The drawing happens when the player starts
a round, never during the initial render, so the randomness does not break server-side rendering.

## Scoring

`quizScoring.js` holds the scoring rules and the high score storage. A correct answer is worth
`POINTS_FOR_CORRECT_ANSWER`, plus `POINTS_PER_SECOND_LEFT` for every second that is left on the
clock, plus `POINTS_PER_STREAK_STEP` for every correct answer in a row after the first one, capped
at `MAX_STREAK_STEPS` steps. Running out of time counts as a wrong answer and reveals the correct
one.

The best score per category is stored in the `localStorage` of the player. It is read after mount,
and every access is wrapped in try/catch, so the game also works when the storage is not available.

## Adding a link to the game

The route is registered in `src/routing/routeConfiguration.js`. Links in the topbar and the footer
are not part of this page: they come from the hosted `top-bar.json` and `footer.json` assets, so a
marketplace operator adds a custom link pointing to `/quiz` in Sharetribe Console.
