import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { CANVAS_HEIGHT, CANVAS_WIDTH, FLAME_FRAMES, getFlamePixels } from './PixelSword.pixels';
import PixelSword from './PixelSword';

const { screen } = testingLibrary;

describe('PixelSword', () => {
  it('renders the sword with an accessible label', () => {
    render(<PixelSword />);
    const sword = screen.getByRole('img', { name: 'PixelSword.screenreader.label' });
    expect(sword).toBeInTheDocument();
    expect(sword).toHaveAttribute('viewBox', `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
  });

  it('allows overriding the accessible label', () => {
    render(<PixelSword label="Flaming sword" />);
    expect(screen.getByRole('img', { name: 'Flaming sword' })).toBeInTheDocument();
  });

  it('renders every flame frame so that CSS can cycle through them', () => {
    render(<PixelSword />);
    FLAME_FRAMES.forEach((_, index) => {
      expect(screen.getByTestId(`flame-frame-${index + 1}`)).toBeInTheDocument();
    });
  });

  it('keeps all flame pixels inside the canvas', () => {
    FLAME_FRAMES.forEach((_, index) => {
      const pixels = getFlamePixels(index);
      expect(pixels.length).toBeGreaterThan(0);
      pixels.forEach(({ x, y }) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(CANVAS_WIDTH);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(CANVAS_HEIGHT);
      });
    });
  });

  it('draws at most one flame pixel per position in a frame', () => {
    FLAME_FRAMES.forEach((_, index) => {
      const pixels = getFlamePixels(index);
      const positions = new Set(pixels.map(({ x, y }) => `${x}-${y}`));
      expect(positions.size).toEqual(pixels.length);
    });
  });
});
