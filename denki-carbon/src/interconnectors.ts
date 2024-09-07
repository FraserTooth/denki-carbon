import { DateTime } from "luxon";
import { db } from "./db";
import { areaDataProcessed, interconnectorDataProcessed } from "./schema";
import { eq } from "drizzle-orm";
import {
  INTERCONNECTOR_DETAILS,
  JapanInterconnectors,
  JapanTsoName,
} from "./const";
import { logger } from "./utils";
import { getTotalCarbonIntensityForAreaDataRow } from "./carbon";

const getCarbonIntensitiesUsingInterconnectorData = async () => {
  console.log("running");

  const datetimeFrom = DateTime.fromISO("2024-02-01T18:00:00.000+09:00");
  // const datetimeFrom = DateTime.fromISO("2024-05-01T21:00:00.000+09:00");

  // Get data for all TSOs for one HH period
  const areaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(eq(areaDataProcessed.datetimeFrom, datetimeFrom.toJSDate()));

  // console.log(areaDataResult);
  areaDataResult.forEach((row) => {
    console.log(row.tso, row.interconnectorskWh);
  });

  // Get interconnector data for same HH period
  const interconnectorDataResult = await db
    .select()
    .from(interconnectorDataProcessed)
    .where(
      eq(interconnectorDataProcessed.datetimeFrom, datetimeFrom.toJSDate())
    );

  // console.log(interconnectorDataResult);
  interconnectorDataResult.forEach((row) => {
    console.log(row.interconnector, row.powerkWh);
  });

  // Build graph based on direction of interconnector flow
  const graph = areaDataResult.map((row) => {
    // Get interconnectors associated with this TSO
    const interconnectors = INTERCONNECTOR_DETAILS.filter(
      (interconnector) =>
        interconnector.from === row.tso || interconnector.to === row.tso
    );

    // Happens for Okinawa, which has no interconnectors
    if (interconnectors.length === 0) {
      return {
        tso: row.tso as JapanTsoName,
        interconnectors: [],
        exportingTo: [],
        importingFrom: [],
      };
    }

    // For each interconnector, get the flow direction from the db data
    const interconnecterFlows = interconnectors.map((interconnectorDetails) => {
      const interconnectorData = interconnectorDataResult.find(
        (data) =>
          (data.interconnector as JapanInterconnectors) ===
          interconnectorDetails.id
      );
      if (!interconnectorData)
        throw new Error(
          `No data for ${interconnectorDetails.id} at ${datetimeFrom.toString()}`
        );

      return {
        interconnectorDetails,
        powerkWh: Number(interconnectorData.powerkWh),
      };
    });

    const exportingTo = interconnecterFlows
      .filter((flow) => {
        if (flow.interconnectorDetails.from === row.tso && flow.powerkWh >= 0) {
          return true;
        } else if (
          flow.interconnectorDetails.to === row.tso &&
          flow.powerkWh < 0
        ) {
          return true;
        }
        return false;
      })
      .map((flow) =>
        flow.interconnectorDetails.to === row.tso
          ? flow.interconnectorDetails.from
          : flow.interconnectorDetails.to
      );

    // Opposite of exportingTo
    const importingFrom = interconnecterFlows
      .filter((flow) => {
        if (flow.interconnectorDetails.from === row.tso && flow.powerkWh < 0) {
          return true;
        } else if (
          flow.interconnectorDetails.to === row.tso &&
          flow.powerkWh >= 0
        ) {
          return true;
        }
        return false;
      })
      .map((flow) =>
        flow.interconnectorDetails.to === row.tso
          ? flow.interconnectorDetails.from
          : flow.interconnectorDetails.to
      );

    return {
      tso: row.tso as JapanTsoName,
      interconnectors: interconnectors.map((ic) => ic.id),
      exportingTo,
      importingFrom,
    };
  });

  logger.debug(
    graph
      .map((node) => `${node.tso} -> ${node.exportingTo.join(" & ")}`)
      .join(", ")
  );

  const onlyImportingNodes = graph.filter(
    (node) => node.importingFrom.length > 0 && node.exportingTo.length === 0
  );

  logger.debug(
    onlyImportingNodes
      .map((node) => `${node.tso} <- ${node.importingFrom.join(" & ")}`)
      .join(", ")
  );

  const carbonIntensitiesTracker: Map<JapanTsoName, number> = new Map<
    JapanTsoName,
    number
  >();

  const calculateCarbonForNode = (node: (typeof graph)[0]): number => {
    const importingNodes = node.importingFrom;

    const intensityForImportingTsos = importingNodes.map((importingTso) => {
      const node = graph.find((node) => node.tso === importingTso);
      if (!node) throw new Error(`Node not found: ${importingTso}`);
      return calculateCarbonForNode(node);
    });

    // Calculate the average intensity for the importing nodes
    const averageIntensityForImports =
      intensityForImportingTsos.reduce((acc, intensity) => acc + intensity, 0) /
      intensityForImportingTsos.length;

    console.log(
      `Average intensity for ${node.tso}: ${averageIntensityForImports}`
    );

    const areaDataRow = areaDataResult.find((row) => {
      return (row.tso as JapanTsoName) === node.tso;
    });
    if (!areaDataRow) throw new Error(`No area data for ${node.tso}`);

    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(
      areaDataRow,
      !Number.isFinite(averageIntensityForImports)
        ? undefined
        : averageIntensityForImports
    );

    // Push to tracker
    carbonIntensitiesTracker.set(node.tso, carbonIntensity);

    return carbonIntensity;
  };

  onlyImportingNodes.forEach((node) => {
    calculateCarbonForNode(node);
  });

  // Logging and comparison -
  carbonIntensitiesTracker.forEach((intensity, tso) => {
    const areaDataForTso = areaDataResult.find((row) => row.tso === tso);
    const normalCarbonIntensityValue = getTotalCarbonIntensityForAreaDataRow(
      areaDataForTso!
    );
    const percentageDifference =
      ((intensity - normalCarbonIntensityValue) / normalCarbonIntensityValue) *
      100;
    const interconnectorkWhForArea = Number(areaDataForTso?.interconnectorskWh);
    const percentageInterconnectorForArea =
      interconnectorkWhForArea < 0
        ? 0
        : (interconnectorkWhForArea /
            Number(areaDataForTso?.totalGenerationkWh)) *
          100;
    logger.debug(
      `${tso}: IC Aware: ${intensity} vs IC Unaware: ${normalCarbonIntensityValue} - ${percentageInterconnectorForArea.toFixed(1)}% import - ${percentageDifference.toFixed(2)}%`
    );
  });

  return Array.from(carbonIntensitiesTracker.entries()).map(
    ([tso, intensity]) => ({ tso, intensity })
  );
};

// const output = await getCarbonIntensitiesUsingInterconnectorData();
// console.log(output);
// process.exit(0);
