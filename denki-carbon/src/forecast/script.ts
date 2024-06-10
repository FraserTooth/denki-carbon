import { trainModel, makePredictions } from "./model";
import { db } from "../db";
import { areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { eq, and, between } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { exit } from "process";
import { TrainingData } from "./types";
import { mkdir } from "fs";
import { getModelName } from "./utils";

const benchmarkStart = DateTime.now();

// The number of blocks used to predict the next set of blocks
const historyWindow = 32;
// The number of blocks to predict
const predictionWindow = 6;

const nowJST = DateTime.fromISO("2024-05-15T15:00:00.000").setZone(
  "Asia/Tokyo"
);
const midnightToday = nowJST.startOf("day");

const validationDataEnd = midnightToday.minus({ days: 1 });
const validationDataStart = validationDataEnd.minus({ days: 1 });
const validationEnd = midnightToday;

const endOfTrainingData = midnightToday.minus({ days: 3 });
const startOfTrainingData = endOfTrainingData.minus({ weeks: 4 });

const getBlockInDay = (datetime: Date): number => {
  return datetime.getHours() * 2 + Math.floor(datetime.getMinutes() / 30);
};

/**
 * Get training data
 */

// Get db training data

const trainingDataAreaDataResult = await db
  .select()
  .from(areaDataProcessed)
  .where(
    and(
      eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
      between(
        areaDataProcessed.datetimeFrom,
        startOfTrainingData.toJSDate(),
        endOfTrainingData.toJSDate()
      )
    )
  )
  .orderBy(areaDataProcessed.datetimeFrom);

const trainingDataSansHistory = trainingDataAreaDataResult.map((row, index) => {
  // Get the block in the day
  const blockInDay = getBlockInDay(row.datetimeFrom);
  const dayOfWeek = row.datetimeFrom.getDay();
  const month = row.datetimeFrom.getMonth();
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return { carbonIntensity, blockInDay, dayOfWeek, month };
});

const trainingData: TrainingData[] = [];
// Add windows to training data
for (
  let i = historyWindow;
  i < trainingDataSansHistory.length - 1 - predictionWindow;
  i++
) {
  const trainingDataSansHistoryRow = trainingDataSansHistory[i];
  trainingData.push({
    ...trainingDataSansHistoryRow,
    previousCarbonIntensities: trainingDataSansHistory
      .slice(i - historyWindow, i)
      .map((row) => row.carbonIntensity),
    futureCarbonIntensities: trainingDataSansHistory
      .slice(i, i + predictionWindow)
      .map((row) => row.carbonIntensity),
  });
}

console.log("trainingDataSnippet", trainingData[0]);
console.log("trainingDataLength", trainingData.length);

/**
 * Train model
 */

const trainingDataX: number[][][] = trainingData.map((row) => [
  row.previousCarbonIntensities,
  // [row.blockInDay],
  // [row.dayOfWeek],
  // [row.month],
]);
const trainingDataY: number[][] = trainingData.map(
  (row) => row.futureCarbonIntensities
);

const modelName = getModelName(JapanTsoName.TEPCO);
const trainingResult = await trainModel({
  inputData: trainingDataX,
  inputFeatures: trainingDataX[0].length,
  labelData: trainingDataY,
  modelName,
  historyWindow,
  predictionWindow,
  n_epochs: 5,
  learning_rate: 0.01,
  n_layers: 2,
  callback: console.log,
});

console.log(trainingResult.stats);

const filepath = `./temp/models/model-${nowJST.toISO()}`;
mkdir(filepath, { recursive: true }, (err) => {});
await trainingResult.model.save(`file://${filepath}`);

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
  model: trainingResult.model,
  predictionData,
  labelMax: trainingResult.normalize.labelMax,
  labelMin: trainingResult.normalize.labelMin,
  inputMax: trainingResult.normalize.inputMax,
  inputMin: trainingResult.normalize.inputMin,
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
