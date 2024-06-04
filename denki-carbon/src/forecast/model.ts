import * as tf from "@tensorflow/tfjs";

export const trainModel = async ({
  inputData,
  labelData,
  historyWindow,
  predictionWindow,
  n_epochs,
  learning_rate,
  n_layers,
  callback,
}: {
  inputData: number[][];
  labelData: number[][];
  historyWindow: number;
  predictionWindow: number;
  n_epochs: number;
  learning_rate: number;
  n_layers: number;
  callback: CallableFunction;
}) => {
  const batch_size = 32;

  // input dense layer
  const input_layer_shape = historyWindow;
  const input_layer_neurons = 64;

  // LSTM
  const rnn_input_layer_features = 16;
  const rnn_input_layer_timesteps =
    input_layer_neurons / rnn_input_layer_features;
  const rnn_input_shape = [rnn_input_layer_features, rnn_input_layer_timesteps]; // the shape have to match input layer's shape
  const rnn_output_neurons = 16; // number of neurons per LSTM's cell

  // output dense layer
  const output_layer_shape = rnn_output_neurons; // dense layer input size is same as LSTM cell
  const output_layer_neurons = predictionWindow;

  // Load Data in Tensor and Normalize
  const inputTensor = tf.tensor2d(inputData, [
    inputData.length,
    inputData[0].length,
  ]);
  const labelTensor = tf.tensor2d(labelData, [
    labelData.length,
    labelData[0].length,
  ]);

  const [xs, inputMax, inputMin] = normalizeTensorFit(inputTensor);
  const [ys, labelMax, labelMin] = normalizeTensorFit(labelTensor);

  // ## define model

  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      units: input_layer_neurons,
      inputShape: [input_layer_shape],
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

  // return { model: model, stats: hist };
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
  predictionData: number[][];
  model: tf.Sequential;
  inputMax: tf.Tensor;
  inputMin: tf.Tensor;
  labelMax: tf.Tensor;
  labelMin: tf.Tensor;
}) {
  // const predictedResults = model.predict(tf.tensor2d(X, [X.length, X[0].length]).div(tf.scalar(10))).mul(10); // old method

  const predictionTensor = tf.tensor2d(predictionData, [
    predictionData.length,
    predictionData[0].length,
  ]);
  const normalizedInput = normalizeTensor(predictionTensor, inputMax, inputMin);
  const model_out = model.predict(normalizedInput) as tf.Tensor;
  const predictedResults = unNormalizeTensor(model_out, labelMax, labelMin);

  return Array.from(predictedResults.dataSync());
}
