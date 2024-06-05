import { loadModelAndTensorsFromFile, makePredictions } from "./model";
import { db } from "../db";
import { areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { eq, and, between } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { exit } from "process";
import { getBlockInDay, getFilesInFolder } from "./utils";
require("@tensorflow/tfjs-node");

const benchmarkStart = DateTime.now();

const nowJST = DateTime.fromISO("2024-05-15T15:00:00.000").setZone(
  "Asia/Tokyo"
);
const midnightToday = nowJST.startOf("day");
const validationDataEnd = midnightToday.minus({ days: 1 });
const validationDataStart = validationDataEnd.minus({ days: 1 });
const validationEnd = midnightToday;

// The number of blocks used to predict the next set of blocks
const historyWindow = 32;

// Search files for models
// TODO: save this in a config file
const modelPath = "./temp/models";
const modelFiles = await getFilesInFolder(modelPath);
if (!modelFiles) {
  console.log("No models found");
  exit(1);
}
// Sort files by name descending
modelFiles.sort((a, b) => {
  return b.localeCompare(a);
});
console.log("modelFiles", modelFiles);

const { model, normalizationTensors } = await loadModelAndTensorsFromFile(
  modelFiles[0]
);

/**
 * Make predictions for validation window
 */
const predictionDataAreaDataResult = await db
  .select()
  .from(areaDataProcessed)
  .where(
    and(
      eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
      between(
        areaDataProcessed.datetimeFrom,
        validationDataStart.toJSDate(),
        validationDataEnd.toJSDate()
      )
    )
  )
  .orderBy(areaDataProcessed.datetimeFrom);

console.log("predictionData", predictionDataAreaDataResult.length);
const predictionSeriesPrepped = predictionDataAreaDataResult.map((row) => {
  const blockInDay = getBlockInDay(row.datetimeFrom);
  const dayOfWeek = row.datetimeFrom.getDay();
  const month = row.datetimeFrom.getMonth();
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return { ...row, carbonIntensity, blockInDay, dayOfWeek, month };
});

// Make prediction for the next window of blocks
const windowSlice = predictionSeriesPrepped.slice(
  predictionSeriesPrepped.length - historyWindow
);
const predictionData: number[][][] = [
  [
    windowSlice.map((row) => row.carbonIntensity),
    // [windowSlice[windowSlice.length - 1].blockInDay + 1],
    // [windowSlice[windowSlice.length - 1].dayOfWeek],
    // [windowSlice[windowSlice.length - 1].month],
  ],
];
console.log("predictionData", predictionData);
const predictions = makePredictions({
  model,
  predictionData,
  labelMax: normalizationTensors.labelMax,
  labelMin: normalizationTensors.labelMin,
  inputMax: normalizationTensors.inputMax,
  inputMin: normalizationTensors.inputMin,
});
console.log("predictions", predictions);

const finalPrediction: { carbonIntensity: number; datetimeFrom: Date }[] =
  predictions.map((prediction, index) => {
    return {
      carbonIntensity: prediction,
      datetimeFrom:
        predictionSeriesPrepped[
          predictionSeriesPrepped.length - historyWindow + index
        ].datetimeFrom,
    };
  });

// Get actual data for the validation window
const predictionActualAreaDataResult = await db
  .select()
  .from(areaDataProcessed)
  .where(
    and(
      eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
      between(
        areaDataProcessed.datetimeFrom,
        validationDataEnd.plus({ minutes: 30 }).toJSDate(),
        validationEnd.toJSDate()
      )
    )
  )
  .orderBy(areaDataProcessed.datetimeFrom);

const actualSeriesPrepped = predictionActualAreaDataResult.map((row) => {
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return {
    datetimeFrom: DateTime.fromJSDate(row.datetimeFrom),
    carbonIntensity,
  };
});

const leadUpWithActual = [
  ...predictionSeriesPrepped,
  { carbonIntensity: "|" },
  ...actualSeriesPrepped,
];
console.log(
  "actual",
  leadUpWithActual.map((row) => row.carbonIntensity)
);

const leadUpWithPrediction = [
  ...predictionSeriesPrepped,
  { carbonIntensity: "|" },
  ...finalPrediction,
];
console.log(
  "prediction",
  leadUpWithPrediction.map((row) => row.carbonIntensity)
);

const benchmarkEnd = DateTime.now();
console.log("timeTaken", benchmarkEnd.diff(benchmarkStart).toISO());

exit(0);
