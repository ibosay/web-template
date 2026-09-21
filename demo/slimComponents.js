/**
 * The handful of shared components the assistant screens actually use.
 *
 * The screens import from `src/components`, the barrel that re-exports the whole component library
 * of this marketplace — which is the right thing for a page of the marketplace, and far too much
 * for an app that shows three screens. Pulling the barrel in dragged 61 lazily loaded chunks and
 * three quarters of a megabyte of marketing photographs into the build, none of which the app ever
 * requests.
 *
 * The demo build redirects that import here (see `webpack.config.js`). Nothing in `src` changes:
 * the marketplace page keeps using the real barrel.
 *
 * The order matters for the same reason it does in `src/components/index.js`: Button imports the
 * two icons from this same module, so they have to be exported before it.
 */
export { default as IconSpinner } from '../src/components/IconSpinner/IconSpinner';
export { default as IconCheckmark } from '../src/components/IconCheckmark/IconCheckmark';
export { Heading, H1, H2, H3, H4, H5, H6 } from '../src/components/Heading/Heading';
export {
  default as Button,
  PrimaryButton,
  PrimaryButtonInline,
  SecondaryButton,
  SecondaryButtonInline,
  InlineTextButton,
} from '../src/components/Button/Button';
