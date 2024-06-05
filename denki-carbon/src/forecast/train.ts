import { trainModel, saveModelAndTensorsToFile } from "./model";
import { db } from "../db";
import { areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { eq, and, between } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { exit } from "process";
import { TrainingData } from "./types";
import { t } from "elysia";

const benchmarkStart = DateTime.now();

// The number of blocks used to predict the next set of blocks
const historyWindow = 32;
// The number of blocks to predict
const predictionWindow = 6;
const tso = JapanTsoName.TEPCO;

const nowJST = DateTime.fromISO("2024-05-15T15:00:00.000").setZone(
  "Asia/Tokyo"
);
const midnightToday = nowJST.startOf("day");
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
      eq(areaDataProcessed.tso, tso),
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

const trainingResult = await trainModel({
  inputData: trainingDataX,
  inputFeatures: trainingDataX[0].length,
  labelData: trainingDataY,
  historyWindow,
  predictionWindow,
  n_epochs: 5,
  learning_rate: 0.01,
  n_layers: 2,
  callback: console.log,
});

console.log(trainingResult.stats);
console.log("trainingResultNormalize", trainingResult.normalize);

const benchmarkEnd = DateTime.now();
console.log("timeTaken", benchmarkEnd.diff(benchmarkStart).toISO());

const filepath = `./temp/models/model-${tso}-${benchmarkEnd.toISO()}`;
await saveModelAndTensorsToFile(
  trainingResult.model,
  trainingResult.normalize,
  filepath
);

exit(0);