import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry with configuration from environment variables
 */
export function initSentry() {
  const sentryDsn = process.env.SENTRY_DSN;
  
  if (!sentryDsn) {
    console.log("SENTRY_DSN not configured - Sentry monitoring disabled");
    return;
  }
  
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    enableLogs: true,
    tracesSampleRate: 1.0, // Capture 100% of traces for better visibility
    integrations: [
      Sentry.postgresIntegration(),
    ],
  });
  
  console.log("✅ Sentry monitoring initialized");
}