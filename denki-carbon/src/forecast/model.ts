import * as tf from "@tensorflow/tfjs-node";
import { mkdir } from "fs";
import { db } from "../db";
import { carbonIntensityForecastModels } from "../schema";
import { JapanTsoName } from "../const";
import { DateTime } from "luxon";
import { NormalisationFactors } from "./types";
import { logger } from "../utils";

export const trainModel = async ({
  inputData,
  inputFeatures,
  labelData,
  modelName,
  historyWindow,
  predictionWindow,
  n_epochs,
  learning_rate,
  n_layers,
  callback,
}: {
  inputData: number[][][];
  inputFeatures: number;
  labelData: number[][];
  modelName: string;
  historyWindow: number;
  predictionWindow: number;
  n_epochs: number;
  learning_rate: number;
  n_layers: number;
  callback: CallableFunction;
}) => {
  const batch_size = 32;

  // input dense layer
  // number of params, number of items in each param
  const inputLayerFeatures = inputFeatures;
  const inputLayerTimesteps = historyWindow;
  const input_layer_shape = [inputLayerFeatures, inputLayerTimesteps];
  const input_layer_neurons = 64;

  // LSTM
  const rnn_input_layer_features = 16;
  const rnn_input_layer_timesteps =
    input_layer_neurons / rnn_input_layer_features;
  const rnn_input_shape = [
    rnn_input_layer_features * inputLayerFeatures,
    rnn_input_layer_timesteps,
  ]; // the shape have to match input layer's shape
  const rnn_output_neurons = 16; // number of neurons per LSTM's cell

  // output dense layer
  const output_layer_shape = rnn_output_neurons; // dense layer input size is same as LSTM cell
  const output_layer_neurons = predictionWindow;

  // Load Data in Tensor and Normalize
  const inputTensor = tf.tensor3d(inputData, [
    inputData.length,
    inputData[0].length,
    inputData[0][0].length,
  ]);
  logger.debug("inputTensor", inputTensor.shape);
  const labelTensor = tf.tensor2d(labelData, [
    labelData.length,
    labelData[0].length,
  ]);

  const [xs, inputMax, inputMin] = normalizeTensorFit(inputTensor);
  logger.debug("xs", xs.shape);
  const [ys, labelMax, labelMin] = normalizeTensorFit(labelTensor);

  // ## define model

  const model = tf.sequential({ name: modelName });

  model.add(
    tf.layers.dense({
      units: input_layer_neurons,
      inputShape: input_layer_shape,
      name: "InputLayer",
    })
  );
  model.add(tf.layers.reshape({ targetShape: rnn_input_shape }));

  let lstm_cells = [];
  for (let index = 0; index < n_layers; index++) {
    lstm_cells.push(tf.layers.lstmCell({ units: rnn_output_neurons }));
  }

  model.add(
    tf.layers.rnn({
      cell: lstm_cells,
      inputShape: rnn_input_shape,
      returnSequences: false,
      name: "RNN",
    })
  );

  model.add(
    tf.layers.dense({
      units: output_layer_neurons,
      inputShape: [output_layer_shape],
      name: "OutputLayer",
    })
  );

  model.compile({
    optimizer: tf.train.adam(learning_rate),
    loss: "meanSquaredError",
  });

  logger.debug("model", model.summary());

  // ## fit model

  const hist = await model.fit(xs, ys, {
    batchSize: batch_size,
    epochs: n_epochs,
    callbacks: {
      onEpochEnd: async (epoch, log) => {
        callback(epoch, log);
      },
    },
  });

  return {
    model: model,
    stats: hist,
    normalize: {
      inputMax: inputMax,
      inputMin: inputMin,
      labelMax: labelMax,
      labelMin: labelMin,
    },
  };
};

function normalizeTensorFit(tensor: tf.Tensor) {
  const maxval = tensor.max();
  const minval = tensor.min();
  const normalizedTensor = normalizeTensor(tensor, maxval, minval);
  return [normalizedTensor, maxval, minval];
}

function normalizeTensor(
  tensor: tf.Tensor,
  maxval: tf.Tensor,
  minval: tf.Tensor
) {
  const normalizedTensor = tensor.sub(minval).div(maxval.sub(minval));
  return normalizedTensor;
}

function unNormalizeTensor(
  tensor: tf.Tensor,
  maxval: tf.Tensor,
  minval: tf.Tensor
) {
  const unNormTensor = tensor.mul(maxval.sub(minval)).add(minval);
  return unNormTensor;
}

export function makePredictions({
  predictionData,
  model,
  inputMax,
  inputMin,
  labelMax,
  labelMin,
}: {
  predictionData: number[][][];
  model: tf.LayersModel;
  inputMax: tf.Tensor;
  inputMin: tf.Tensor;
  labelMax: tf.Tensor;
  labelMin: tf.Tensor;
}) {
  const predictionTensor = tf.tensor3d(predictionData, [
    predictionData.length,
    predictionData[0].length,
    predictionData[0][0].length,
  ]);
  const normalizedInput = normalizeTensor(predictionTensor, inputMax, inputMin);
  const model_out = model.predict(normalizedInput) as tf.Tensor;
  const predictedResults = unNormalizeTensor(model_out, labelMax, labelMin);

  return Array.from(predictedResults.dataSync());
}

/**
 * Saves model and normalization tensors to a folder
 * Registers the model in the database
 *
 * @param model
 * @param normalizationTensors
 * @param folderpath
 * @param tso
 * @param trainingDataFrom from which date the training data was taken
 * @param trainingDataTo to which date the training data was taken
 */
export const saveModel = async ({
  model,
  normalizationTensors,
  folderpath,
  tso,
  trainingDataFrom,
  trainingDataTo,
}: {
  model: tf.Sequential;
  normalizationTensors: Record<string, tf.Tensor>;
  folderpath: string;
  tso: JapanTsoName;
  trainingDataFrom: DateTime;
  trainingDataTo: DateTime;
}) => {
  // Get the model name
  const modelName = model.name;
  const modelFolder = `${folderpath}/${modelName}`;

  // Make folder if it doesn't exist
  mkdir(modelFolder, { recursive: true }, logger.error);

  // Save model
  await model.save(`file://${modelFolder}`);

  // Save normalization tensors
  const normalisationFactors: NormalisationFactors = {
    inputMax: normalizationTensors.inputMax.arraySync(),
    inputMin: normalizationTensors.inputMin.arraySync(),
    labelMax: normalizationTensors.labelMax.arraySync(),
    labelMin: normalizationTensors.labelMin.arraySync(),
  };
  const tensorArrayJson = JSON.stringify(normalisationFactors);
  await Bun.write(`${modelFolder}/normalization.json`, tensorArrayJson);
  const insertModel: typeof carbonIntensityForecastModels.$inferInsert = {
    tso,
    trainingDataFrom: trainingDataFrom.toJSDate(),
    trainingDataTo: trainingDataTo.toJSDate(),
    modelName,
    normalisationFactors: normalisationFactors,
  };
  await db.insert(carbonIntensityForecastModels).values(insertModel).execute();
};

export const loadModelAndTensorsFromFile = async (filepath: string) => {
  const model = await tf.loadLayersModel(`file://${filepath}/model.json`);
  const normalizationFile = Bun.file(`${filepath}/normalization.json`);
  const normalization = await normalizationFile.json();
  const normalizationTensors: Record<
    string,
    tf.Tensor<tf.Rank>
  > = Object.fromEntries(
    Object.entries(normalization).map(([key, value]) => {
      return [key, tf.tensor(value as number)];
    })
  );
  return {
    model,
    normalizationTensors,
  };
};
