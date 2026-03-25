interface RgbColor {
  blue: number;
  green: number;
  red: number;
}

interface OklabColor {
  a: number;
  b: number;
  l: number;
}

interface OklchColor {
  c: number;
  h: number;
  l: number;
}

const clampChannel = (value: number): number => Math.min(Math.max(value, 0), 1);

const srgbToLinear = (channel: number): number =>
  channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.003_130_8
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;

const normalizeHex = (hexColor: string): string => {
  const value = hexColor.trim().toLowerCase();

  if (value.length === 4) {
    const [, red, green, blue] = value;
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return value;
};

const hexToRgb = (hexColor: string): RgbColor => {
  const normalizedHex = normalizeHex(hexColor);

  return {
    blue: Number.parseInt(normalizedHex.slice(5, 7), 16) / 255,
    green: Number.parseInt(normalizedHex.slice(3, 5), 16) / 255,
    red: Number.parseInt(normalizedHex.slice(1, 3), 16) / 255,
  };
};

const rgbToHex = ({ blue, green, red }: RgbColor): string => {
  const formatChannel = (value: number): string =>
    Math.round(clampChannel(value) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${formatChannel(red)}${formatChannel(green)}${formatChannel(blue)}`;
};

const rgbToOklab = ({ blue, green, red }: RgbColor): OklabColor => {
  const linearRed = srgbToLinear(red);
  const linearGreen = srgbToLinear(green);
  const linearBlue = srgbToLinear(blue);

  const l = Math.cbrt(
    0.412_221_470_8 * linearRed +
      0.536_332_536_3 * linearGreen +
      0.051_445_992_9 * linearBlue
  );
  const m = Math.cbrt(
    0.211_903_498_2 * linearRed +
      0.680_699_545_1 * linearGreen +
      0.107_396_956_6 * linearBlue
  );
  const s = Math.cbrt(
    0.088_302_461_9 * linearRed +
      0.281_718_837_6 * linearGreen +
      0.629_978_700_5 * linearBlue
  );

  return {
    a: 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    b: 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
    l: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
  };
};

const oklabToRgb = ({ a, b, l }: OklabColor): RgbColor => {
  const lComponent = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mComponent = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sComponent = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  return {
    blue: linearToSrgb(
      -0.004_196_086_3 * lComponent -
        0.703_418_614_7 * mComponent +
        1.707_614_701 * sComponent
    ),
    green: linearToSrgb(
      -1.268_438_004_6 * lComponent +
        2.609_757_401_1 * mComponent -
        0.341_319_396_5 * sComponent
    ),
    red: linearToSrgb(
      4.076_741_662_1 * lComponent -
        3.307_711_591_3 * mComponent +
        0.230_969_929_2 * sComponent
    ),
  };
};

const oklabToOklch = ({ a, b, l }: OklabColor): OklchColor => ({
  c: Math.sqrt(a * a + b * b),
  h: (Math.atan2(b, a) * 180) / Math.PI,
  l,
});

const oklchToOklab = ({ c, h, l }: OklchColor): OklabColor => {
  const hueRadians = (h * Math.PI) / 180;

  return {
    a: c * Math.cos(hueRadians),
    b: c * Math.sin(hueRadians),
    l,
  };
};

const interpolate = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

const interpolateHue = (
  fromHue: number,
  toHue: number,
  progress: number
): number => {
  const normalizedFrom = Number.isFinite(fromHue) ? fromHue : toHue;
  const normalizedTo = Number.isFinite(toHue) ? toHue : normalizedFrom;
  const delta = ((((normalizedTo - normalizedFrom) % 360) + 540) % 360) - 180;

  return normalizedFrom + delta * progress;
};

export const lerpOklch = (
  colorA: string,
  colorB: string,
  progress: number
): string => {
  const from = oklabToOklch(rgbToOklab(hexToRgb(colorA)));
  const to = oklabToOklch(rgbToOklab(hexToRgb(colorB)));

  return rgbToHex(
    oklabToRgb({
      ...oklchToOklab({
        c: interpolate(from.c, to.c, progress),
        h: interpolateHue(from.h, to.h, progress),
        l: interpolate(from.l, to.l, progress),
      }),
    })
  );
};
