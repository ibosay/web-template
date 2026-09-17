import PixelSword from './PixelSword';

export const Default = {
  component: PixelSword,
  props: {},
  group: 'images',
};

export const Small = {
  component: PixelSword,
  props: { size: 'small' },
  group: 'images',
};

export const Large = {
  component: PixelSword,
  props: { size: 'large' },
  group: 'images',
};

export const StillFrame = {
  component: PixelSword,
  props: { size: 'large', animate: false },
  group: 'images',
};
