import { Static, t } from "elysia";
import {
  overviewGetResponseIntensitiesElement,
  overviewGetResponseValidator200,
} from "../validators/overview";
import { db } from "../../db";
import { and, between, eq, max } from "drizzle-orm";
import { areaDataProcessed, carbonIntensityForecasts } from "../../schema";
import { DateTime, Interval } from "luxon";
import { startOfMostRecentHalfHour } from "../../utils";
import { getTotalCarbonIntensityForAreaDataRow } from "../../carbon";
import { numberifyAreaDataRow, strToNum } from "../utils";

/**
 * A simple, all TSO, no query params query that will contain data required for the frontend landing page.
 * Should be very cacheable.
 *
 * @returns a set of recent carbon intensity data and forecasts for all TSOS
 */
export const overviewGetHandler = async (): Promise<
  Static<typeof overviewGetResponseValidator200>
> => {
  const now = DateTime.now();

  // Query times
  const mostRecentHalfHour = startOfMostRecentHalfHour(now);
  const queryFrom = mostRecentHalfHour.minus({ hours: 2 });
  const queryTo = mostRecentHalfHour.plus({ hours: 1 });

  const recentAreaDataAllTsos = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        between(
          areaDataProcessed.datetimeFrom,
          queryFrom.toJSDate(),
          mostRecentHalfHour.toJSDate()
        )
      )
    )
    .orderBy(areaDataProcessed.tso, areaDataProcessed.datetimeFrom);

  // Get all forecasted data for the query range
  const forecastedDataSubquery = await db
    .select({
      tso: carbonIntensityForecasts.tso,
      datetimeFrom: carbonIntensityForecasts.datetimeFrom,
      lastUpdated: max(carbonIntensityForecasts.createdAt).as("lastUpdated"),
    })
    .from(carbonIntensityForecasts)
    .where(
      and(
        between(
          carbonIntensityForecasts.datetimeFrom,
          queryFrom.toJSDate(),
          queryTo.toJSDate()
        )
      )
    )
    .groupBy(
      carbonIntensityForecasts.tso,
      carbonIntensityForecasts.datetimeFrom
    )
    .as("forecastedDataSubquery");

  const forecastedDataResult = await db
    .select({
      tso: carbonIntensityForecasts.tso,
      datetimeFrom: carbonIntensityForecasts.datetimeFrom,
      datetimeTo: carbonIntensityForecasts.datetimeTo,
      predictedCarbonIntensity:
        carbonIntensityForecasts.predictedCarbonIntensity,
      createdAt: carbonIntensityForecasts.createdAt,
    })
    .from(carbonIntensityForecasts)
    .innerJoin(
      forecastedDataSubquery,
      and(
        eq(carbonIntensityForecasts.tso, forecastedDataSubquery.tso),
        eq(
          carbonIntensityForecasts.datetimeFrom,
          forecastedDataSubquery.datetimeFrom
        ),
        eq(
          carbonIntensityForecasts.createdAt,
          forecastedDataSubquery.lastUpdated
        )
      )
    )
    .orderBy(
      carbonIntensityForecasts.tso,
      carbonIntensityForecasts.datetimeFrom
    );

  // For all datetimes in query range, use all recent data, then fill in with forecasted data
  const datetimeIntervals = Interval.fromDateTimes(queryFrom, queryTo).splitBy({
    minutes: 30,
  });

  const overviewIntensities = datetimeIntervals
    .flatMap((interval) => {
      const startOfInterval = interval.start;
      const endOfInterval = interval.end;
      if (
        !startOfInterval ||
        !startOfInterval.isValid ||
        !endOfInterval ||
        !endOfInterval.isValid
      )
        throw new Error("Invalid interval");
      const areaDataRowsForInterval = recentAreaDataAllTsos.filter(
        (row) =>
          row.datetimeFrom.getTime() === startOfInterval.valueOf() &&
          row.datetimeTo.getTime() === endOfInterval.valueOf()
      );

      const uniqueTsos = new Set(areaDataRowsForInterval.map((row) => row.tso));

      // Get forecasted data for this interval if TSO didn't have any data
      const forecastedDataForInterval = forecastedDataResult.filter((row) => {
        return (
          !uniqueTsos.has(row.tso) &&
          row.datetimeFrom.getTime() === startOfInterval.valueOf() &&
          row.datetimeTo.getTime() === endOfInterval.valueOf()
        );
      });

      const areaDataRowsFormatted: Static<
        typeof overviewGetResponseIntensitiesElement
      >[] = areaDataRowsForInterval.map((row) => {
        const validatedRow = numberifyAreaDataRow(row);
        return {
          tso: row.tso,
          dateJST: row.dateJST,
          timeFromJST: row.timeFromJST,
          timeToJST: row.timeToJST,
          datetimeFrom: row.datetimeFrom,
          datetimeTo: row.datetimeTo,
          carbonIntensity: getTotalCarbonIntensityForAreaDataRow(row),
          isForecast: false,
          createdAt: row.lastUpdated,
          allAreaData: {
            totalDemandkWh: validatedRow.totalDemandkWh,
            nuclearkWh: validatedRow.nuclearkWh,
            allfossilkWh: validatedRow.allfossilkWh,
            lngkWh: validatedRow.lngkWh,
            coalkWh: validatedRow.coalkWh,
            oilkWh: validatedRow.oilkWh,
            otherFossilkWh: validatedRow.otherFossilkWh,
            hydrokWh: validatedRow.hydrokWh,
            geothermalkWh: validatedRow.geothermalkWh,
            biomasskWh: validatedRow.biomasskWh,
            solarOutputkWh: validatedRow.solarOutputkWh,
            solarThrottlingkWh: validatedRow.solarThrottlingkWh,
            windOutputkWh: validatedRow.windOutputkWh,
            windThrottlingkWh: validatedRow.windThrottlingkWh,
            pumpedStoragekWh: validatedRow.pumpedStoragekWh,
            batteryStoragekWh: validatedRow.batteryStoragekWh,
            interconnectorskWh: validatedRow.interconnectorskWh,
            otherkWh: validatedRow.otherkWh,
            totalGenerationkWh: validatedRow.totalGenerationkWh,
          },
        };
      });

      const forecastedDataFormatted: Static<
        typeof overviewGetResponseIntensitiesElement
      >[] = forecastedDataForInterval.map((row) => {
        const datetimeFromJST = DateTime.fromJSDate(row.datetimeFrom).setZone(
          "Asia/Tokyo"
        );
        const datetimeToJST = DateTime.fromJSDate(row.datetimeTo).setZone(
          "Asia/Tokyo"
        );
        if (!datetimeFromJST.isValid || !datetimeToJST.isValid)
          throw new Error("Invalid datetime in forecast");
        return {
          tso: row.tso,
          dateJST: datetimeFromJST.toISODate(),
          timeFromJST: datetimeFromJST.toFormat("HH:mm:ss"),
          timeToJST: datetimeToJST.toFormat("HH:mm:ss"),
          datetimeFrom: row.datetimeFrom,
          datetimeTo: row.datetimeTo,
          carbonIntensity: strToNum(row.predictedCarbonIntensity),
          isForecast: true,
          createdAt: row.createdAt,
          allAreaData: null,
        };
      });

      const overviewIntensityData = [
        ...areaDataRowsFormatted,
        ...forecastedDataFormatted,
      ];

      return overviewIntensityData;
    })
    .toSorted(
      (a, b) =>
        // Sort by TSO, then by datetimeFrom
        a.tso.localeCompare(b.tso) ||
        a.datetimeFrom.getTime() - b.datetimeFrom.getTime()
    );

  return { intensities: overviewIntensities };
};
