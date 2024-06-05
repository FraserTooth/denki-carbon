import { loadModelAndTensorsFromFile, makePredictions } from "./model";
import { db } from "../db";
import {
  areaDataProcessed,
  carbonIntensityForecastModels,
  carbonIntensityForecasts,
} from "../schema";
import { DateTime } from "luxon";
import { eq, and, between, desc } from "drizzle-orm";
import { JapanTsoName } from "../const";
import { getTotalCarbonIntensityForAreaDataRow } from "../carbon";
import { getFilesInFolder } from "./utils";
import { LayersModel } from "@tensorflow/tfjs-layers";
import { Rank, Tensor } from "@tensorflow/tfjs-core";
require("@tensorflow/tfjs-node");

// The number of blocks used to predict the next set of blocks
export const HISTORY_WINDOW_LENGTH = 32;
export const BLOCK_SIZE_MINUTES = 30;

export const getLatestModel = async (tso: JapanTsoName) => {
  const modelResult = await db
    .select()
    .from(carbonIntensityForecastModels)
    .where(eq(carbonIntensityForecastModels.tso, tso))
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
  return { model, normalizationTensors, modelDetails: mostRecentModel };
};

export const predictCarbonIntensity = async ({
  tso,
  model,
  normalizationTensors,
  predictFrom,
}: {
  tso: JapanTsoName;
  model: LayersModel;
  normalizationTensors: Record<string, Tensor<Rank>>;
  predictFrom: DateTime;
}): Promise<
  {
    datetimeFrom: DateTime;
    datetimeTo: DateTime;
    predictedCarbonIntensity: number;
  }[]
> => {
  // Get time WINDOW blocks before the prediction time
  const dataFrom = predictFrom.minus({
    minutes: BLOCK_SIZE_MINUTES * (HISTORY_WINDOW_LENGTH + 1),
  });

  // Get prediction data
  const predictionDataAreaDataResult = await db
    .select()
    .from(areaDataProcessed)
    .where(
      and(
        eq(areaDataProcessed.tso, tso),
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
    const datetimeFrom = predictFrom.plus({
      minutes: BLOCK_SIZE_MINUTES * (index + 1),
    });
    const datetimeTo = datetimeFrom.plus({ minutes: BLOCK_SIZE_MINUTES });
    return {
      predictedCarbonIntensity: prediction,
      datetimeFrom,
      datetimeTo,
    };
  });
  return finalPrediction;
};

export const predictAndSaveCarbonIntensity = async (
  predictFrom: DateTime,
  tso: JapanTsoName
) => {
  const { model, normalizationTensors, modelDetails } =
    await getLatestModel(tso);

  const predictions = await predictCarbonIntensity({
    tso,
    model,
    normalizationTensors,
    predictFrom,
  });

  // Save predictions to db
  const predictionsToSave: (typeof carbonIntensityForecasts.$inferInsert)[] =
    predictions.map((prediction) => {
      // Round to 3 decimal places
      const roundedIntensity =
        Math.round(prediction.predictedCarbonIntensity * 1000) / 1000;
      return {
        tso,
        datetimeFrom: prediction.datetimeFrom.toJSDate(),
        datetimeTo: prediction.datetimeTo.toJSDate(),
        predictedCarbonIntensity: roundedIntensity.toString(),
        modelUsedId: modelDetails.id,
      };
    });
  await db.insert(carbonIntensityForecasts).values(predictionsToSave);
};

// FOR TESTING
// const predictFrom = DateTime.fromISO("2024-05-01T00:00:00.000+09:00");
// await predictAndSaveCarbonIntensity(predictFrom, JapanTsoName.TOHOKU);
// process.exit(0);
