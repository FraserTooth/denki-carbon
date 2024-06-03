import { Elysia, Static, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { db } from "../db";
import { JapanTsoName } from "../const";
import { areaDataProcessed } from "../schema";
import { between, eq, and } from "drizzle-orm";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";

const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName),
  from: t.Date(),
  to: t.Date(),
});
type AreaDataGetParamsValidated = Static<
  typeof areaDataGetQueryParamsValidator
>;
const areaDataGetHandler = async (query: AreaDataGetParamsValidated) => {
  const areaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, query.tso),
        between(areaDataProcessed.datetimeFrom, query.from, query.to)
      )
    )
    .execute();

  const resultsWithIntensity = areaDataResult.map((row) => {
    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    // Trim to 2 decimal places
    const carbonIntensityRounded = Math.round(carbonIntensity * 100) / 100;
    return { ...row, carbonIntensity: carbonIntensityRounded };
  });
  return resultsWithIntensity;
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
