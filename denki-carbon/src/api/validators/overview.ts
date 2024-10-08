import { t } from "elysia";
import { kWhValueValidations } from ".";

export const overviewGetResponseIntensitiesElement = t.Object({
  tso: t.String({
    description: "The target Grid Operator",
    examples: ["TEPCO"],
  }),
  dateJST: t.String({
    description: "The date in JST timezone",
    examples: ["2024-06-23"],
  }),
  timeFromJST: t.String({
    description: "The start time in JST timezone",
    examples: ["22:00:00"],
  }),
  timeToJST: t.String({
    description: "The end time in JST timezone",
    examples: ["22:30:00"],
  }),
  datetimeFrom: t.Date({
    description: "The start time in UTC, as an ISO 8601 string",
    examples: ["2024-06-23T13:00:00.000Z"],
  }),
  datetimeTo: t.Date({
    description: "The end time in UTC, as an ISO 8601 string",
    examples: ["2024-06-23T13:30:00.000Z"],
  }),
  carbonIntensity: t.Number({
    description: "The carbon intensity in gCO2eq/kWh",
    examples: [123.456],
  }),
  isForecast: t.Boolean({
    description: "Whether this is a forecasted value or not",
    examples: [false],
  }),
  createdAt: t.Date({
    description:
      "The time this value was scraped or forecasted, in UTC, in ISO 8601 format",
    examples: ["2024-06-23T13:01:03.402Z"],
  }),
  allAreaData: t.Nullable(
    t.Object({
      ...kWhValueValidations,
    })
  ),
});

export const overviewGetResponseValidator200 = t.Object({
  intensities: t.Array(overviewGetResponseIntensitiesElement),
});

const overviewGetResponseValidator = {
  200: overviewGetResponseValidator200,
};

export const overviewGetValidator = {
  response: overviewGetResponseValidator,
};
