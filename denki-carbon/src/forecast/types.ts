/** For each datapoint */
export type TrainingData = {
  previousCarbonIntensities: number[];
  blockInDay: number;
  dayOfWeek: number;
  month: number;
  carbonIntensity: number;
  futureCarbonIntensities: number[];
};

export type TensorArray =
  | number
  | number[]
  | number[][]
  | number[][][]
  | number[][][][]
  | number[][][][][]
  | number[][][][][][];

export type NormalisationFactors = {
  inputMax: TensorArray;
  inputMin: TensorArray;
  labelMax: TensorArray;
  labelMin: TensorArray;
};
