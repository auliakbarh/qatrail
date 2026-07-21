import pino from "pino";

// Process-wide structured JSON logger. Level via LOG_LEVEL (default "info").
// Pipe stdout through `npx pino-pretty` locally for readable output.
// `base: undefined` drops pid/hostname.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
});
