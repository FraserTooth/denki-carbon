import axios from "axios";
import axiosRetry, { isNetworkOrIdempotentRequestError } from "axios-retry";
import { SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm/utils";
import { createPinoLogger } from "@bogeychan/elysia-logger";

// Generate a pretty logger for local development
const prettyTransport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    ignore: "pid,hostname,app",
  },
};

// Generate a Loki logger for non-local environments
const lokiTransport = {
  target: "pino-loki",
  options: {
    batching: true,
    interval: 5,
    host: process.env.GRAFANA_LOKI_HOST || "",
    basicAuth: {
      username: process.env.GRAFANA_LOKI_USERNAME || "",
      password: process.env.GRAFANA_LOKI_PASSWORD || "",
    },
  },
};

const transportConfig =
  process.env.ENVIRONMENT === "local" ? prettyTransport : lokiTransport;

export const logger = createPinoLogger({
  level: process.env.PINO_LOG_LEVEL || "info",
  base: { app: "denki-carbon" },
  transport: transportConfig,
});

export const conflictUpdateAllExcept = <
  T extends PgTable,
  E extends (keyof T["$inferInsert"])[],
>(
  table: T,
  except: E
) => {
  const columns = getTableColumns(table);
  const updateColumns = Object.entries(columns).filter(
    ([col]) => !except.includes(col as keyof typeof table.$inferInsert)
  );

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`),
    }),
    {}
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>;
};

export const axiosInstance = axios.create({
  timeout: 5000,
  headers: {
    Accept:
      "application/json, text/csv, application/vnd.ms-excel, application/zip",
    "Content-Type": "application/json",
  },
  beforeRedirect(options, responseDetails) {
    logger.warn(
      `Redirecting from ${JSON.stringify(responseDetails.headers)} to ${options.url}...`
    );
  },
});

axiosRetry(axiosInstance, {
  retries: 5,
  retryDelay: axiosRetry.exponentialDelay,
  shouldResetTimeout: true,
  retryCondition: (error) => {
    logger.warn(`${error.message} to ${error?.config?.url}`);
    // logger.debug(error);
    return (
      isNetworkOrIdempotentRequestError(error) ||
      error.code === "ECONNABORTED" ||
      error.code === "ERR_CANCELED"
    );
  },
  onRetry(retryCount, _error, requestConfig) {
    logger.warn(
      `Retrying request to ${requestConfig.url} (retry #${retryCount})`
    );
    requestConfig.headers = {
      Accept:
        "application/json, text/csv, application/vnd.ms-excel, application/zip",
      "Content-Type": "application/json",
    };
    // Reset abort signal, increasing timeout
    const newAbortSignal = AbortSignal.timeout(1000 * retryCount);
    requestConfig.signal = newAbortSignal;
  },
  onMaxRetryTimesExceeded(error, retryCount) {
    logger.error(
      `Failed to make request after ${retryCount} retries: ${error.message}`
    );
  },
});

export const onlyPositive = (value: number | null) => {
  return value && value > 0 ? value : 0;
};
