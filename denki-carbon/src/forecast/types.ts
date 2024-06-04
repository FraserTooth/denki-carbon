/** For each datapoint */
export type TrainingData = {
  previousCarbonIntensities: number[];
  blockInDay: number;
  dayOfWeek: number;
  month: number;
  carbonIntensity: number;
  futureCarbonIntensities: number[];
};
