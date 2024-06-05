import { Static, t } from "elysia";
import { db } from "../../db";
import { JapanTsoName } from "../../const";
import { areaDataProcessed, carbonIntensityForecasts } from "../../schema";
import { between, eq, and } from "drizzle-orm";
import { getTotalCarbonIntensityForAreaDataRow } from "../../carbon";
import { numberifyAreaDataRow, rTo3Dec, strToNum } from "../utils";
import { DateTime } from "luxon";

const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName),
  from: t.Date(),
  to: t.Date(),
  includeForecast: t.Optional(t.String()),
});

const areaDataGetResponseValidator200ElementHistoric = t.Object({
  tso: t.String(), // TODO: can't this be an enum?
  dateJST: t.String(),
  timeFromJST: t.String(),
  timeToJST: t.String(),
  datetimeFrom: t.Date({ nullable: false }),
  datetimeTo: t.Date(),
  totalDemandkWh: t.Nullable(t.Number()),
  nuclearkWh: t.Nullable(t.Number()),
  allfossilkWh: t.Nullable(t.Number()),
  lngkWh: t.Nullable(t.Number()),
  coalkWh: t.Nullable(t.Number()),
  oilkWh: t.Nullable(t.Number()),
  otherFossilkWh: t.Nullable(t.Number()),
  hydrokWh: t.Nullable(t.Number()),
  geothermalkWh: t.Nullable(t.Number()),
  biomasskWh: t.Nullable(t.Number()),
  solarOutputkWh: t.Nullable(t.Number()),
  solarThrottlingkWh: t.Nullable(t.Number()),
  windOutputkWh: t.Nullable(t.Number()),
  windThrottlingkWh: t.Nullable(t.Number()),
  pumpedStoragekWh: t.Nullable(t.Number()),
  batteryStoragekWh: t.Nullable(t.Number()),
  interconnectorskWh: t.Nullable(t.Number()),
  otherkWh: t.Nullable(t.Number()),
  totalkWh: t.Nullable(t.Number()),
  lastUpdated: t.Date(),
  carbonIntensity: t.Number(),
  averagePredictedCarbonIntensity: t.Optional(t.Number()),
});

const areaDataGetResponseValidator200ElementForecast = t.Object({
  tso: t.String(), // TODO: can't this be an enum?
  dateJST: t.String(),
  timeFromJST: t.String(),
  timeToJST: t.String(),
  datetimeFrom: t.Date({ nullable: false }),
  datetimeTo: t.Date(),
  predictedCarbonIntensity: t.Optional(t.Number()),
  createdAt: t.Date(),
});

const areaDataGetResponseValidator200Element = t.Union([
  areaDataGetResponseValidator200ElementHistoric,
  areaDataGetResponseValidator200ElementForecast,
]);

const areaDataGetResponseValidator200 = t.Array(
  areaDataGetResponseValidator200Element
);

const areaDataGetResponseValidator = {
  200: areaDataGetResponseValidator200,
};

export const areaDataGetValidator = {
  query: areaDataGetQueryParamsValidator,
  response: areaDataGetResponseValidator,
};

export const areaDataGetHandler = async (
  query: Static<typeof areaDataGetQueryParamsValidator>
): Promise<Static<typeof areaDataGetResponseValidator200>> => {
  const areaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, query.tso),
        between(areaDataProcessed.datetimeFrom, query.from, query.to)
      )
    )
    .orderBy(areaDataProcessed.datetimeFrom);

  const resultsWithIntensity = areaDataResult.map((row) => {
    const normalizedRow = numberifyAreaDataRow(row);

    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    // Trim to 2 decimal places
    const carbonIntensityRounded = Math.round(carbonIntensity * 100) / 100;
    const finalRow: Static<
      typeof areaDataGetResponseValidator200ElementHistoric
    > = {
      ...normalizedRow,
      carbonIntensity: carbonIntensityRounded,
    };
    return finalRow;
  });

  if (!query.includeForecast || query.includeForecast === "false") {
    return resultsWithIntensity;
  }

  // Get the forecasted data
  const forecastedDataResult = await db
    .select()
    .from(carbonIntensityForecasts)
    .where(
      and(
        eq(carbonIntensityForecasts.tso, query.tso),
        between(carbonIntensityForecasts.datetimeFrom, query.from, query.to)
      )
    )
    .orderBy(carbonIntensityForecasts.datetimeFrom);

  const resultsWithForecasts = resultsWithIntensity.map((row) => {
    const forecastsForRow = forecastedDataResult.filter(
      (forecast) =>
        forecast.datetimeFrom.getTime() === row.datetimeFrom.getTime()
    );
    if (forecastsForRow.length === 0) return row;
    // Average the forecasts
    const totalIntensity = forecastsForRow.reduce(
      (acc, forecast) => acc + parseFloat(forecast.predictedCarbonIntensity),
      0
    );
    const averageForecastedIntensity = totalIntensity / forecastsForRow.length;
    return {
      ...row,
      averagePredictedCarbonIntensity: rTo3Dec(averageForecastedIntensity),
    };
  });

  // Get forecasts for times after the last row of actual results
  const forecastsInFuture = forecastedDataResult.filter(
    (forecast) =>
      forecast.datetimeFrom.getTime() >
      resultsWithForecasts[
        resultsWithForecasts.length - 1
      ].datetimeFrom.getTime()
  );

  // Remove duplicates using the field that was last created
  const uniqueDatetimeFromsInFutureForecasts = Array.from(
    new Set(
      forecastsInFuture.map((forecast) => forecast.datetimeFrom.getTime())
    )
  );

  // Get the most recent forecast for each unique datetimeFrom
  const forecastsInFutureProcessed = uniqueDatetimeFromsInFutureForecasts.map(
    (datetimeFromEpoch) => {
      const forecastsForDatetime = forecastedDataResult.filter(
        (forecast) => forecast.datetimeFrom.getTime() === datetimeFromEpoch
      );
      // Sort descending by createdAt
      forecastsForDatetime.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      // Use the most recent forecast
      const forecast = forecastsForDatetime[0];
      const datetimeFrom = DateTime.fromJSDate(forecast.datetimeFrom);
      const datetimeTo = DateTime.fromJSDate(forecast.datetimeTo);
      if (!datetimeFrom.isValid) {
        throw new Error("Invalid datetimeFrom in forecast");
      }
      if (!datetimeTo.isValid) {
        throw new Error("Invalid datetimeTo in forecast");
      }
      // And return the forecast with only the necessary fields
      const row: Static<typeof areaDataGetResponseValidator200ElementForecast> =
        {
          tso: forecast.tso,
          dateJST: datetimeFrom.toISODate(),
          timeFromJST: datetimeFrom.toFormat("HH:mm:ss"),
          timeToJST: datetimeTo.toFormat("HH:mm:ss"),
          datetimeFrom: forecast.datetimeFrom,
          datetimeTo: forecast.datetimeTo,
          predictedCarbonIntensity: strToNum(forecast.predictedCarbonIntensity),
          createdAt: forecast.createdAt,
        };
      return row;
    }
  );

  const finalResults: Static<typeof areaDataGetResponseValidator200> = [
    ...resultsWithForecasts,
    ...forecastsInFutureProcessed,
  ];
  return finalResults;
};
