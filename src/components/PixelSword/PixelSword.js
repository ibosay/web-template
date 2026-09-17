import React from 'react';
import classNames from 'classnames';

import { useIntl } from '../../util/reactIntl';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EMBER_COLOR,
  FLAME_FRAMES,
  getFlamePixels,
  getSwordPixels,
} from './PixelSword.pixels';
import css from './PixelSword.module.css';

const SIZE_CLASSES = {
  small: css.small,
  medium: css.medium,
  large: css.large,
};

/**
 * Render a list of pixels as 1x1 SVG rects.
 *
 * @param {Array<{x: number, y: number, color?: string}>} pixels
 * @returns {Array<JSX.Element>} rect elements
 */
const renderPixels = pixels =>
  pixels.map(pixel => (
    <rect
      key={`${pixel.x}-${pixel.y}`}
      x={pixel.x}
      y={pixel.y}
      width="1"
      height="1"
      fill={pixel.color}
    />
  ));

/**
 * A pixel art sword that burns with an animated fire.
 *
 * The sprite and the flames are drawn as single pixels on a shared grid, and
 * the fire is animated by cycling through a handful of flame frames with CSS.
 * The whole thing is inline SVG, so it scales without blurring and renders on
 * the server as well. Animations are turned off for users who prefer reduced
 * motion.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {'small' | 'medium' | 'large'} props.size size of the rendered sword
 * @param {boolean} props.animate set to false to render a still frame of the fire
 * @param {string?} props.label accessible label, defaults to a translated description
 * @returns {JSX.Element} SVG image
 */
const PixelSword = props => {
  const { rootClassName, className, size = 'medium', animate = true, label } = props;
  const intl = useIntl();

  const swordPixels = getSwordPixels();
  const bladePixels = swordPixels.filter(pixel => pixel.isBlade);
  const ariaLabel = label || intl.formatMessage({ id: 'PixelSword.screenreader.label' });

  const classes = classNames(
    rootClassName || css.root,
    SIZE_CLASSES[size] || SIZE_CLASSES.medium,
    { [css.motionless]: !animate },
    className
  );

  return (
    <svg
      className={classes}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
    >
      {/* The fire burns behind the sword, so only its tongues and the glow
          show around the blade. Each frame is shown in turn. */}
      {FLAME_FRAMES.map((_, index) => (
        <g
          key={`flame-${index}`}
          className={classNames(css.flameFrame, css[`flameFrame${index + 1}`])}
          data-testid={`flame-frame-${index + 1}`}
        >
          {renderPixels(getFlamePixels(index))}
        </g>
      ))}

      <g data-testid="sword">{renderPixels(swordPixels)}</g>

      {/* The blade picks up the heat of the flames. */}
      <g className={css.ember} fill={EMBER_COLOR}>
        {renderPixels(bladePixels.map(pixel => ({ x: pixel.x, y: pixel.y })))}
      </g>
    </svg>
  );
};

export default PixelSword;
