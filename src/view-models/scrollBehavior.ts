export const STICKY_BOTTOM_THRESHOLD_PX = 96;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isNearScrollBottom(
  metrics: ScrollMetrics,
  threshold = STICKY_BOTTOM_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= threshold;
}

export function shouldAutoScroll(isStickyBottom: boolean): boolean {
  return isStickyBottom;
}
