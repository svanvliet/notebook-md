import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import { trackEvent } from '../hooks/useAnalytics';

/**
 * Report Core Web Vitals to PostHog.
 * Call once at app startup — metrics are sent as they become available.
 */
export function reportWebVitals() {
  const send = ({ name, value, rating }: { name: string; value: number; rating: string }) => {
    trackEvent('web_vital', { metric: name, value: Math.round(value), rating });
  };

  onCLS(send);
  onINP(send);
  onLCP(send);
  onFCP(send);
  onTTFB(send);
}
