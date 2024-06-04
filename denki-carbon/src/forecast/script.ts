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

function computeSma(
  data: number[],
  window_size: number
): { set: number[]; avg: number }[] {
  let r_avgs = [],
    avg_prev = 0;
  for (let i = 0; i <= data.length - window_size; i++) {
    let curr_avg = 0.0,
      t = i + window_size;
    for (let k = i; k < t && k <= data.length; k++) {
      curr_avg += data[k] / window_size;
    }
    r_avgs.push({ set: data.slice(i, i + window_size), avg: curr_avg });
    avg_prev = curr_avg;
  }
  return r_avgs;
}

/**
 * Get training data
 */

// Get db training data
const midnightToday = DateTime.now().startOf("day");
const startOfTrainingData = midnightToday.minus({ days: 14 });
const trainingDataAreaDataResult = await db
  .select()
  .from(areaDataProcessed)
  .where(
    and(
      eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
      between(
        areaDataProcessed.datetimeFrom,
        startOfTrainingData.toJSDate(),
        midnightToday.toJSDate()
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

const sma = computeSma(trainingSeriesPrepped, windowSize);

const trainingDataX = sma.map((row) => row.set);
const trainingDataY = sma.map((row) => row.avg);

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
 * Make predictions
 */

const startOf2HoursAgo = DateTime.now().startOf("hour").minus({ hours: 2 });
const windowAgo = startOf2HoursAgo.minus({ hours: windowSize / 2 });
const predictionDataAreaDataResult = await db
  .select()
  .from(areaDataProcessed)
  .where(
    and(
      eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
      between(
        areaDataProcessed.datetimeFrom,
        windowAgo.toJSDate(),
        startOf2HoursAgo.toJSDate()
      )
    )
  )
  .orderBy(areaDataProcessed.datetimeFrom);

console.log("predictionData", predictionDataAreaDataResult.length);
const predictionSeriesPrepped = predictionDataAreaDataResult.map((row) => {
  const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
  return carbonIntensity;
});

// Make prediction for the next half window of blocks
const finalPrediction: number[] = [];
for (let i = 0; i < windowSize / 2; i++) {
  const windowForPrediction = [...predictionSeriesPrepped, ...finalPrediction];
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
  finalPrediction.push(roundedPrediction);
}

console.log("final Prediction", finalPrediction);

const trendWithPrediction = [...predictionSeriesPrepped, ...finalPrediction];

console.log("trend plus prediction", trendWithPrediction);

exit(0);
