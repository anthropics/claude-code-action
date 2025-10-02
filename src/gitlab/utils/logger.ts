type LogLevel = "debug" | "info" | "warn" | "error";

function formatMessage(level: LogLevel, message: string, metadata?: unknown) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (metadata === undefined) {
    return base;
  }

  const serialized = (() => {
    try {
      return JSON.stringify(metadata);
    } catch (error) {
      return String(metadata);
    }
  })();

  return `${base} ${serialized}`;
}

export const logger = {
  debug(message: string, metadata?: unknown) {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(formatMessage("debug", message, metadata));
    }
  },
  info(message: string, metadata?: unknown) {
    console.log(formatMessage("info", message, metadata));
  },
  warn(message: string, metadata?: unknown) {
    console.warn(formatMessage("warn", message, metadata));
  },
  error(message: string, metadata?: unknown) {
    console.error(formatMessage("error", message, metadata));
  },
};

