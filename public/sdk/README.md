# SuperInsights Browser SDK

## Installation

Add the SDK script to your site:

```html
<script src="/sdk/superinsights.js"></script>
```

## Initialization

Initialize with your **public API key** (must start with `pk_`).

```html
<script>
  SuperInsights.init('pk_your_public_key', {
    apiUrl: '',
    batchSize: 20,
    flushInterval: 5000,
    debug: false,
  });
</script>
```

### Configuration options

- `apiUrl` (string, optional)
  - Base URL where the ingestion API is hosted.
  - Default: current site origin.
- `batchSize` (number, optional)
  - Flush queues when they reach this size.
  - Default: `20` (max recommended `100`).
- `flushInterval` (number, optional)
  - Flush queues every N milliseconds.
  - Default: `5000`.
- `debug` (boolean, optional)
  - Enable console logging.
  - Default: `false`.

## Tracking

### Automatic page views

Page views are captured automatically on initialization, and also for SPA navigations via History API patching.

### Custom events

```js
SuperInsights.trackEvent('signup_completed', {
  plan: 'pro',
  method: 'google',
});
```

### Errors

The SDK automatically captures:
- `window.onerror`
- `unhandledrejection`

Duplicate errors are deduplicated via a simple fingerprint.

### Performance (Core Web Vitals)

The SDK collects:
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)

Metrics are queued and sent on `visibilitychange` (when the page becomes hidden) and periodically via batching.

## Public API

- `SuperInsights.init(apiKey, config)`
- `SuperInsights.trackEvent(eventName, properties)`
- `SuperInsights.setUser(userId, traits)`
- `SuperInsights.flush()`
- `SuperInsights.disable()`
- `SuperInsights.enable()`

## Notes

- The SDK is dependency-free (vanilla JS).
- Respects Do Not Track (DNT) when enabled.
- Uses `fetch` with `XMLHttpRequest` fallback.
- Uses `sendBeacon` on unload/visibility changes when available.
