import { loadModelAndTensorsFromFile, makePredictions } from "./model";
import { db } from "../db";
import { areaDataProcessed, carbonIntensityForecastModels } from "../schema";
import { DateTime } from "luxon";
import { eq, and, between, desc } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { getFilesInFolder } from "./utils";
import { exit } from "process";
require("@tensorflow/tfjs-node");

// The number of blocks used to predict the next set of blocks
export const HISTORY_WINDOW_LENGTH = 32;

export const getLatestModel = async () => {
  const modelResult = await db
    .select()
    .from(carbonIntensityForecastModels)
    .where(eq(carbonIntensityForecastModels.tso, JapanTsoName.TEPCO))
    .orderBy(desc(carbonIntensityForecastModels.createdAt));
  if (modelResult.length === 0) {
    throw new Error("No models found in database");
  }
  const mostRecentModel = modelResult[0];

  // Search files for models
  const modelPath = "./temp/models";
  const modelFiles = await getFilesInFolder(modelPath);
  if (!modelFiles) {
    throw new Error("No models found in files");
  }
  const mostRecentModelFilepath = modelFiles.find((file) => {
    return file.includes(mostRecentModel.modelName);
  });
  if (!mostRecentModelFilepath) {
    throw new Error(
      `Target file ${mostRecentModel.modelName} not found in files`
    );
  }

  const { model, normalizationTensors } = await loadModelAndTensorsFromFile(
    mostRecentModelFilepath
  );
  console.log("Using model", mostRecentModel.modelName);
  return { model, normalizationTensors };
};

export const predictCarbonIntensity = async (
  predictFrom: DateTime
): Promise<{ datetimeFrom: DateTime; predictedCarbonIntensity: number }[]> => {
  // Get models from db
  const { model, normalizationTensors } = await getLatestModel();

  // Get time WINDOW blocks before the prediction time
  const dataFrom = predictFrom.minus({
    minutes: 30 * (HISTORY_WINDOW_LENGTH + 1),
  });

  // Get prediction data
  const predictionDataAreaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, JapanTsoName.TEPCO),
        between(
          areaDataProcessed.datetimeFrom,
          dataFrom.toJSDate(),
          predictFrom.toJSDate()
        )
      )
    )
    .orderBy(areaDataProcessed.datetimeFrom);

  console.log("predictionDataLength", predictionDataAreaDataResult.length);

  // Prepare the data
  const predictionSeriesPrepped = predictionDataAreaDataResult.map((row) => {
    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    return { ...row, carbonIntensity };
  });

  // Ensure we have the right number of blocks for the input layer
  const windowSlice = predictionSeriesPrepped.slice(
    predictionSeriesPrepped.length - HISTORY_WINDOW_LENGTH
  );

  const predictionData: number[][][] = [
    [windowSlice.map((row) => row.carbonIntensity)],
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

  const finalPrediction = predictions.map((prediction, index) => {
    const datetimeFrom = predictFrom.plus({ minutes: 30 * (index + 1) });
    return {
      predictedCarbonIntensity: prediction,
      datetimeFrom,
    };
  });
  return finalPrediction;
};
