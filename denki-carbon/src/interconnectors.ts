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

/**
 * The limit for flows, if the power is above this value
 * then it is considered to be exporting, otherwise importing.
 *
 * This simplifies the logic for determining the direction of the flow and helps avoid
 * circular dependencies in the graph.
 *
 * As a note, this value would only represent about 0.5% of the total generation for even the smallest TSOs.
 */
const KWH_LIMIT_FOR_FLOW_CALC = 1000;

const getCarbonIntensitiesUsingInterconnectorData = async (
  datetimeFrom: DateTime
) => {
  // Get data for all TSOs for one HH period
  const areaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(eq(areaDataProcessed.datetimeFrom, datetimeFrom.toJSDate()));

  // Temporarily log area data, REMOVE
  // areaDataResult.forEach((row) => {
  //   console.log(row.tso, row.interconnectorskWh);
  // });

  // Get interconnector data for same HH period
  const interconnectorDataResult = await db
    .select()
    .from(interconnectorDataProcessed)
    .where(
      eq(interconnectorDataProcessed.datetimeFrom, datetimeFrom.toJSDate())
    );

  // Temporarily log interconnector data, REMOVE
  // interconnectorDataResult.forEach((row) => {
  //   console.log(row.interconnector, row.powerkWh);
  // });

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
        if (
          flow.interconnectorDetails.from === row.tso &&
          flow.powerkWh >= KWH_LIMIT_FOR_FLOW_CALC
        ) {
          return true;
        } else if (
          flow.interconnectorDetails.to === row.tso &&
          flow.powerkWh < -KWH_LIMIT_FOR_FLOW_CALC
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
        if (
          flow.interconnectorDetails.from === row.tso &&
          flow.powerkWh < -KWH_LIMIT_FOR_FLOW_CALC
        ) {
          return true;
        } else if (
          flow.interconnectorDetails.to === row.tso &&
          flow.powerkWh >= KWH_LIMIT_FOR_FLOW_CALC
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
    `Paths: ${graph
      .map((node) => `${node.tso} -> ${node.exportingTo.join(" & ")}`)
      .join(", ")}`
  );

  const onlyImportingNodes = graph.filter(
    (node) => node.importingFrom.length > 0 && node.exportingTo.length === 0
  );

  logger.debug(
    `Only Importing: ${onlyImportingNodes
      .map((node) => `${node.tso} <- ${node.importingFrom.join(" & ")}`)
      .join(", ")}`
  );

  const circularDependencyPaths: JapanTsoName[][] = [];

  // Detect circular dependencies for node import paths
  const detectCircularDependencies = (
    node: (typeof graph)[0],
    visitedNodesInPath: JapanTsoName[]
  ) => {
    if (visitedNodesInPath.includes(node.tso)) {
      // Circular dependency detected
      return visitedNodesInPath.slice(visitedNodesInPath.indexOf(node.tso));
    }
    const paths = node.importingFrom.map((importingTso) => {
      const importingNode = graph.find((node) => node.tso === importingTso);
      if (!importingNode) throw new Error(`Node not found: ${importingTso}`);
      return detectCircularDependencies(importingNode, [
        ...visitedNodesInPath,
        node.tso,
      ]);
    });
    const circles = paths.filter((path) => path !== null);
    if (circles.length > 0) {
      circularDependencyPaths.push(circles.flat());
    }
    return null;
  };

  onlyImportingNodes.forEach((node) => {
    detectCircularDependencies(node, []);
  });

  // Remove duplicate circular paths
  const uniqueCircularPaths = Array.from(
    new Set(circularDependencyPaths.map((path) => path.join(" -> ")))
  ).map((path) => path.split(" -> ")) as JapanTsoName[][];

  logger.debug(
    `Circular Dependencies: ${uniqueCircularPaths
      .map((path) => path.join(" -> "))
      .join(", ")}`
  );

  const lowestPowerInterconnectorInCircularPaths = uniqueCircularPaths.map(
    (path) => {
      const interconnectorsInCircle = path
        .map((tso) => graph.find((node) => node.tso === tso))
        .map((node) => node?.interconnectors)
        .flat()
        .filter((interconnector) => interconnector !== undefined)
        .filter((ic) => {
          const details = INTERCONNECTOR_DETAILS.find((icd) => icd.id === ic);
          if (!details) throw new Error(`No details for ${ic}`);
          return path.includes(details.from) && path.includes(details.to);
        });

      const uniqueInterconnectorsInCircle = Array.from(
        new Set(interconnectorsInCircle)
      );

      const interconnecterFlows = uniqueInterconnectorsInCircle.map(
        (interconnector) => {
          const interconnectorData = interconnectorDataResult.find(
            (data) =>
              (data.interconnector as JapanInterconnectors) === interconnector
          );
          if (!interconnectorData)
            throw new Error(
              `No data for ${interconnector} at ${datetimeFrom.toString()}`
            );

          return {
            interconnector,
            interconnectorDetails: INTERCONNECTOR_DETAILS.find(
              (ic) => ic.id === interconnector
            )!,
            powerkWh: Number(interconnectorData.powerkWh),
          };
        }
      );

      return interconnecterFlows.sort(
        (a, b) => Math.abs(a.powerkWh) - Math.abs(b.powerkWh)
      )[0];
    }
  );

  logger.debug(
    `Lowest Power Interconnectors: ${lowestPowerInterconnectorInCircularPaths
      .map(
        (interconnector) =>
          `${interconnector.interconnectorDetails.from} -> ${interconnector.interconnectorDetails.to} (${interconnector.powerkWh})`
      )
      .join(", ")}`
  );

  // lowestPowerInterconnectorInCircularPaths.forEach((ic) => {
  //   // Log the percentage of the total generation for the consuming TSO
  //   const { to, from } = ic.interconnectorDetails;

  //   const node = graph.find((node) => node.tso === to || node.tso === from);
  //   if (
  //     node?.importingFrom.includes(from) ||
  //     node?.importingFrom.includes(to)
  //   ) {
  //     const areaDataRow = areaDataResult.find((row) => row.tso === node.tso);
  //     console.log(
  //       `Percentage of total generation for ${node.tso} by area data: ${
  //         (Number(areaDataRow?.interconnectorskWh) /
  //           Number(areaDataRow?.totalGenerationkWh)) *
  //         100
  //       }% and interconnector power: ${(ic.powerkWh / Number(areaDataRow?.totalGenerationkWh)) * 100}%`
  //     );
  //   }
  // });

  // Trim interconnector in circular path with lowest power
  const graphWithTrimmedCircles = graph.map((node) => {
    const interconnectorWithLowestPower =
      lowestPowerInterconnectorInCircularPaths.find((interconnector) =>
        node.interconnectors.includes(interconnector.interconnector)
      );
    if (!interconnectorWithLowestPower) return node;

    const { from, to } = interconnectorWithLowestPower.interconnectorDetails;

    const updatedImports = node.importingFrom.filter(
      (importingTso) => ![from, to].includes(importingTso)
    );
    const updatedExports = node.exportingTo.filter(
      (exportingTso) => ![from, to].includes(exportingTso)
    );

    return {
      ...node,
      importingFrom: updatedImports,
      exportingTo: updatedExports,
    };
  });

  // console.log({ graph, graphWithTrimmedCircles });

  const carbonIntensitiesTracker: Map<JapanTsoName, number> = new Map<
    JapanTsoName,
    number
  >();

  // Recursive function to calculate carbon intensity for a given node and its importing nodes
  const calculateCarbonForNode = (
    node: (typeof graphWithTrimmedCircles)[0],
    visitedNodesInPath: JapanTsoName[]
  ): number => {
    const importingNodes = node.importingFrom;

    const intensityForImportingTsos = importingNodes.map((importingTso) => {
      const node = graphWithTrimmedCircles.find(
        (node) => node.tso === importingTso
      );
      if (!node) throw new Error(`Node not found: ${importingTso}`);

      const interconnector = node.interconnectors.find((ic) => {
        const details = INTERCONNECTOR_DETAILS.find((icd) => icd.id === ic);
        if (!details) throw new Error(`No details for ${ic}`);
        return details.from === importingTso || details.to === importingTso;
      });
      if (!interconnector)
        throw new Error(`No interconnector for ${importingTso}`);
      const interconnectorDataRow = interconnectorDataResult.find(
        (data) =>
          (data.interconnector as JapanInterconnectors) === interconnector
      );
      if (!interconnectorDataRow)
        throw new Error(
          `No data for ${interconnector} at ${datetimeFrom.toString()}`
        );

      return {
        tso: importingTso,
        intensity: calculateCarbonForNode(node, [
          ...visitedNodesInPath,
          node.tso,
        ]),
        icFlowKwh: Number(interconnectorDataRow.powerkWh),
      };
    });

    // Calculate the weighted average intensity for the importing nodes based on size of imports
    // Note, that any concerns about the disparity between the OCCTO and area data are not considered here
    // as we only use OCCTO data to get the weighting
    const totalImportKwh = intensityForImportingTsos.reduce(
      (acc, intensity) => acc + Math.abs(intensity.icFlowKwh),
      0
    );
    const weightedAverageIntensity = intensityForImportingTsos.reduce(
      (acc, intensity) =>
        acc +
        (Math.abs(intensity.icFlowKwh) / totalImportKwh) * intensity.intensity,
      0
    );

    const areaDataRow = areaDataResult.find((row) => {
      return (row.tso as JapanTsoName) === node.tso;
    });
    if (!areaDataRow) throw new Error(`No area data for ${node.tso}`);

    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(
      areaDataRow,
      !Number.isFinite(weightedAverageIntensity)
        ? undefined
        : weightedAverageIntensity
    );

    // Push to tracker
    carbonIntensitiesTracker.set(node.tso, carbonIntensity);

    return carbonIntensity;
  };

  onlyImportingNodes.forEach((node) => {
    calculateCarbonForNode(node, [node.tso]);
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

// const datetimeFrom = DateTime.fromISO("2024-02-01T18:00:00.000+09:00");
// const datetimeFrom = DateTime.fromISO("2024-05-01T21:00:00.000+09:00");

// const output = await getCarbonIntensitiesUsingInterconnectorData(datetimeFrom);

// For every HH period from 2023-04-01
// const datetimeFromStart = DateTime.fromISO("2023-04-01T00:00:00.000+09:00");
// const datetimeFromEnd = DateTime.fromISO("2024-09-07T00:00:00.000+09:00");

// let datetimeFrom = datetimeFromStart;
// while (datetimeFrom < datetimeFromEnd) {
//   if (datetimeFrom.hour === 0) {
//     console.log(datetimeFrom.toISO());
//   }
//   const output =
//     await getCarbonIntensitiesUsingInterconnectorData(datetimeFrom);
//   datetimeFrom = datetimeFrom.plus({ minutes: 30 });
// }

// await getCarbonIntensitiesUsingInterconnectorData(
//   DateTime.fromISO("2023-04-09T01:00:00.000+09:00")
// );

// process.exit(0);
