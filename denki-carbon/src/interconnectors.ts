import { DateTime } from "luxon";
import { db } from "./db";
import { areaDataProcessed } from "./schema";
import { eq, and, max, min, sql } from "drizzle-orm";
import {
  INTERCONNECTOR_DETAILS,
  JapanInterconnectors,
  JapanTsoName,
} from "./const";
import graphlib from "graphlib";

const run = async () => {
  console.log("running");

  // Get data for all TSOs for one HH period
  const areaDataResult = await db
    .select({
      tso: areaDataProcessed.tso,
      interconnectorskWh: areaDataProcessed.interconnectorskWh,
      timeDiffHrs: sql<number>`(EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeTo}) - EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeFrom}))/3600`,
    })
    .from(areaDataProcessed)
    .where(
      eq(
        areaDataProcessed.datetimeFrom,
        DateTime.fromISO("2024-05-01T18:00:00.000+09:00").toJSDate()
      )
    );

  console.log(areaDataResult);
  areaDataResult.forEach((row) => {
    console.log(row.tso, row.interconnectorskWh);
  });

  // For each TSO, get max interconnector value
  Object.values(JapanTsoName).forEach(async (tso) => {
    const interconnector = await db
      .select({
        // kWh times time period in hrs
        maxinterconnectorskW: sql<number>`MAX(${areaDataProcessed.interconnectorskWh} / cast((EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeTo}) - EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeFrom}))/3600 as float))`,
        mininterconnectorskW: sql<number>`MIN(${areaDataProcessed.interconnectorskWh} / cast((EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeTo}) - EXTRACT(EPOCH FROM ${areaDataProcessed.datetimeFrom}))/3600 as float))`,
        maxInterconnectorskWh: max(areaDataProcessed.interconnectorskWh),
        minInterconnectorskWh: min(areaDataProcessed.interconnectorskWh),
      })
      .from(areaDataProcessed)
      .where(eq(areaDataProcessed.tso, tso));
    // console.log(tso, interconnector[0]);
  });
};

// await run();
// process.exit(0);
