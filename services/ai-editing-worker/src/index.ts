import './globals';
import {
  createWorkerTraceConfig,
  instrument,
} from '@conation/observability/worker';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isOriginAllowed } from './cors';
import endpoints from './endpoints';
import type { Bindings } from './env';

const app = new Hono<{ Bindings: Bindings }>();

// The web app calls /edit directly from the browser; auth is the document
// permission token in the body, so we scope CORS to exact operator-configured
// Conation origins.
app.use(
  '*',
  cors({
    origin: (origin, context) =>
      isOriginAllowed(origin, context.env.ALLOWED_ORIGINS) ? origin : null,
  })
);
app.route('/', endpoints);

// instrument() wraps fetch with a request root span, registers the global
// tracer provider/context manager (which Telemetry.span resolves through),
// propagates traceparent, and flushes spans via waitUntil after the response.
export default instrument({ fetch: app.fetch }, (env: Bindings) =>
  createWorkerTraceConfig({
    serviceName: 'ai-editing-worker',
    environment: env.ENVIRONMENT ?? 'local',
    tracesUrl: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    tracesHeaders: env.DD_API_KEY
      ? { 'dd-api-key': env.DD_API_KEY }
      : undefined,
  })
);
