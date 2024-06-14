import { SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm/utils";
import pino from "pino";

const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    ignore: "pid,hostname",
  },
});

const config = process.env.ENVIRONMENT === "local" ? transport : undefined;
export const logger = pino(config);

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
