import { trainModel, makePredictions } from "./model";
import { db } from "../db";
import { areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { eq, and, between } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { exit } from "process";

// 48 blocks in a day
const windowSize = 48;

const nowJST = DateTime.now().setZone("Asia/Tokyo");
const midnightToday = nowJST.startOf("day");

const validationDataEnd = midnightToday.minus({ days: 1 });
const validationDataStart = validationDataEnd.minus({ days: 1 });
const validationEnd = midnightToday;

const endOfTrainingData = midnightToday.minus({ days: 3 });
const startOfTrainingData = endOfTrainingData.minus({ days: 14 });

function getNextValueForEachWindow(
  data: number[],
  window_size: number
): { set: number[]; next: number }[] {
  let sets = [];
  for (let i = 0; i <= data.length - window_size; i++) {
    const nextChunkValues = data.slice(i + 1, i + 3);
    console.log("nextChunkValues", nextChunkValues);
    const averageOfNextChunk =
      nextChunkValues.reduce((a, b) => a + b, 0) / nextChunkValues.length;
    console.log("averageOfNextChunk", averageOfNextChunk);

    sets.push({
      set: data.slice(i, i + window_size),
      next: averageOfNextChunk,
    });
  }
  return sets;
}

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

console.log("trainingData", trainingDataAreaDataResult.length);

const trainingSeriesPrepped = trainingDataAreaDataResult.map((row) => {
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return carbonIntensity;
});

/**
 * Train model
 */

const trainingData = getNextValueForEachWindow(
  trainingSeriesPrepped,
  windowSize
);

console.log(
  "trainingData",
  trainingData.slice(0, 5).map((row) => [row.set, row.next])
);

const trainingDataX = trainingData.map((row) => row.set);
const trainingDataY = trainingData.map((row) => row.next);

const trainingResult = await trainModel({
  X: trainingDataX,
  Y: trainingDataY,
  window_size: windowSize,
  n_epochs: 10,
  learning_rate: 0.01,
  n_layers: 2,
  callback: console.log,
});

console.log(trainingResult.stats);

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
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return { ...row, carbonIntensity };
});

// Make prediction for the next window of blocks
const finalPrediction: { carbonIntensity: number; datetimeFrom: DateTime }[] =
  [];
let finalPredictionTimeStart = validationDataEnd;
for (let i = 0; i < windowSize; i++) {
  finalPredictionTimeStart = finalPredictionTimeStart.plus({ minutes: 30 });
  const windowForPrediction = [
    ...predictionSeriesPrepped.map((row) => row.carbonIntensity),
    ...finalPrediction.map((row) => row.carbonIntensity),
  ];
  // Get last window blocks
  const windowSlice = windowForPrediction.slice(
    windowForPrediction.length - windowSize
  );
  const predictions = makePredictions({
    model: trainingResult.model,
    X: [windowSlice],
    labelMax: trainingResult.normalize.labelMax,
    labelMin: trainingResult.normalize.labelMin,
    inputMax: trainingResult.normalize.inputMax,
    inputMin: trainingResult.normalize.inputMin,
  });
  const roundedPrediction = Math.round(predictions[0] * 1000) / 1000;
  finalPrediction.push({
    carbonIntensity: roundedPrediction,
    datetimeFrom: finalPredictionTimeStart,
  });
}

console.log(
  "final Prediction",
  finalPrediction.map((row) => row.carbonIntensity)
);

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

exit(0);
