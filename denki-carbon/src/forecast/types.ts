/** For each datapoint */
export type TrainingData = {
  previousCarbonIntensities: number[];
  blockInDay: number;
  carbonIntensity: number;
  futureCarbonIntensities: number[];
};
