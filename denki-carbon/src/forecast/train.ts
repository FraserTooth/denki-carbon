import { trainModel, saveModel } from "./model";
import { db } from "../db";
import { areaDataProcessed } from "../schema";
import { DateTime } from "luxon";
import { eq, and, gte } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { TrainingData } from "./types";
import { getModelName } from "./utils";
import { logger } from "../utils";

// For each TSO, when the new carbon intensity data starts
const startDatesByTso: Partial<Record<JapanTsoName, DateTime>> = {
  [JapanTsoName.HEPCO]: DateTime.fromISO("2024-04-01T00:00:00.000+09:00"),
  [JapanTsoName.TOHOKU]: DateTime.fromISO("2024-02-01T00:00:00.000+09:00"),
  [JapanTsoName.TEPCO]: DateTime.fromISO("2024-02-01T00:00:00.000+09:00"),
  [JapanTsoName.CHUBU]: DateTime.fromISO("2024-02-01T00:00:00.000+09:00"),
  [JapanTsoName.HOKUDEN]: DateTime.fromISO("2024-03-26T00:00:00.000+09:00"),
  // KEPCO
  [JapanTsoName.CHUGOKU]: DateTime.fromISO("2024-02-01T00:00:00.000+09:00"),
  // YONDEN
  // KYUDEN
  // OEPC
};

export const trainCarbonIntensityModel = async (tso: JapanTsoName) => {
  const benchmarkStart = DateTime.now();

  // The number of blocks used to predict the next set of blocks
  const historyWindow = 32;
  // The number of blocks to predict
  const predictionWindow = 6;

  // From the start of the 30min
  const startOfTrainingData = startDatesByTso[tso];
  if (!startOfTrainingData) {
    throw new Error("No start date found for TSO");
  }

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
        gte(areaDataProcessed.datetimeFrom, startOfTrainingData.toJSDate())
      )
    )
    .orderBy(areaDataProcessed.datetimeFrom);

  const lastRow = trainingDataAreaDataResult.at(-1);
  if (!lastRow) throw new Error("No data found in database");
  const endOfTrainingData = DateTime.fromJSDate(lastRow.datetimeFrom);

  const trainingDataSansHistory = trainingDataAreaDataResult.map(
    (row, index) => {
      // Get the block in the day
      const blockInDay = getBlockInDay(row.datetimeFrom);
      const dayOfWeek = row.datetimeFrom.getDay();
      const month = row.datetimeFrom.getMonth();
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      return { carbonIntensity, blockInDay, dayOfWeek, month };
    }
  );

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

  logger.info("trainingDataSnippet", trainingData[0]);
  logger.info("trainingDataLength", trainingData.length);

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

  // Model
  const modelName = getModelName(tso);
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
    callback: console.debug,
  });

  const benchmarkEnd = DateTime.now();
  logger.info("timeTaken", benchmarkEnd.diff(benchmarkStart).toISO());

  const folderpath = `./temp/models/`;
  await saveModel({
    model: trainingResult.model,
    normalizationTensors: trainingResult.normalize,
    folderpath: folderpath,
  });
};
