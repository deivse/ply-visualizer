/**
 * Upper end of a point size slider: ten times the cloud's recommended size,
 * and at least 0.25. Shared by the per-file sliders and the All Sizes /
 * Selection size slider so they cover the same range. Fixed per cloud: a
 * range that followed the current size grew during a drag and ran away.
 */
export function pointSizeSliderMax(recommendedPointSize: number | undefined): number {
  return Math.max(
    0.25,
    typeof recommendedPointSize === 'number' && recommendedPointSize > 0
      ? recommendedPointSize * 10
      : 0
  );
}
