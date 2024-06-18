import axios from "axios";
import axiosRetry, { isNetworkOrIdempotentRequestError } from "axios-retry";
import { SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm/utils";
import pino from "pino";

const transport = () =>
  pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
    },
  });

const transportConfig =
  process.env.ENVIRONMENT === "local" ? transport() : undefined;

export const logger = pino(
  {
    level: process.env.PINO_LOG_LEVEL || "info",
  },
  transportConfig
);

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
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  beforeRedirect(options, responseDetails) {
    logger.warn(
      `Redirecting from ${responseDetails.headers} to ${options.url}...`
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
      isNetworkOrIdempotentRequestError(error) || error.code === "ECONNABORTED"
    );
  },
  onRetry(retryCount, _error, requestConfig) {
    logger.warn(
      `Retrying request to ${requestConfig.url} (retry #${retryCount})`
    );
    requestConfig.headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  },
  onMaxRetryTimesExceeded(error, retryCount) {
    logger.error(
      `Failed to make request after ${retryCount} retries: ${error.message}`
    );
  },
});
