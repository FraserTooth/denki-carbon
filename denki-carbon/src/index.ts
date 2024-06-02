import { Elysia, Static, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { db } from "./db";
import { JapanTsoName } from "./const";
import { areaDataProcessed } from "./schema";
import { between, eq, and } from "drizzle-orm";

const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName),
  from: t.Date(),
  to: t.Date(),
});
type AreaDataGetParamsValidated = Static<
  typeof areaDataGetQueryParamsValidator
>;
const areaDataGetHandler = async (query: AreaDataGetParamsValidated) => {
  const dbResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, query.tso),
        between(areaDataProcessed.datetimeFrom, query.from, query.to)
      )
    )
    .execute();
  return dbResult;
};

const app = new Elysia()
  .use(
    swagger({
      path: "/docs",
    })
  )
  .get("/v1/area_data", ({ query }) => areaDataGetHandler(query), {
    query: areaDataGetQueryParamsValidator,
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
