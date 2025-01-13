import { t } from "elysia";
import { JapanTsoName } from "../../const";
import { DateTime } from "luxon";
import { kWhValueValidations } from ".";

export const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName, {
    description: "The target Grid Operator",
    default: JapanTsoName.TEPCO,
  }),
  from: t.Date({
    description:
      "The start of the time range to get data for, in ISO 8601 format",
    default: DateTime.now().minus({ hours: 2 }).startOf("hour").toUTC().toISO(),
  }),
  to: t.Date({
    description:
      "The end of the time range to get data for, in ISO 8601 format",
    default: DateTime.now().plus({ hours: 2 }).startOf("hour").toUTC().toISO(),
  }),
  includeForecast: t.Optional(
    t.String({
      description: "Whether to include forecasted data",
      default: "true",
    })
  ),
});

export const areaDataGetResponseValidator200ElementHistoric = t.Object({
  tso: t.String({
    description: "The target Grid Operator",
    examples: [JapanTsoName.TEPCO],
  }),
  dateJST: t.String({
    description: "The date in JST timezone",
    examples: ["2024-06-23"],
  }),
  timeFromJST: t.String({
    description: "The start time in JST timezone",
    examples: ["20:00:00"],
  }),
  timeToJST: t.String({
    description: "The end time in JST timezone",
    examples: ["20:30:00"],
  }),
  datetimeFrom: t.Date({
    description: "The start time in UTC, as an ISO 8601 string",
    examples: ["2024-06-23T11:00:00.000Z"],
  }),
  datetimeTo: t.Date({
    description:
      "The end time in UTC, as an ISO 8601 string - , before Feb 2024, this will be 1 hour after timeFromJST, after Feb 2024, this will be 30 minutes after timeFromJST",
    examples: ["2024-06-23T11:30:00.000Z"],
  }),
  ...kWhValueValidations,
  lastUpdated: t.Date({
    description:
      "The time this row of data was last updated, in UTC, in ISO 8601 format",
    examples: ["2024-06-23T13:01:02.406Z"],
  }),
  carbonIntensity: t.Number({
    description: "The carbon intensity in gCO2eq/kWh",
    examples: [521.69],
  }),
  averagePredictedCarbonIntensity: t.Optional(
    t.Number({
      description:
        "The average of the previously made carbon intensity predictions for this period in gCO2eq/kWh - this will only be present if includeForecast is true",
      examples: [546.338],
    })
  ),
});

export const areaDataGetResponseValidator200ElementForecast = t.Object({
  tso: t.String({
    description: "The target Grid Operator",
    examples: [JapanTsoName.TEPCO],
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
  predictedCarbonIntensity: t.Optional(
    t.Number({
      description: "The predicted carbon intensity in gCO2eq/kWh",
      examples: [544.149],
    })
  ),
  createdAt: t.Date({
    description:
      "The time this forecast was created, in UTC, in ISO 8601 format",
    examples: ["2024-06-23T13:01:03.402Z"],
  }),
});

export const areaDataGetResponseValidator200 = t.Object({
  historic: t.Array(areaDataGetResponseValidator200ElementHistoric),
  forecast: t.Optional(t.Array(areaDataGetResponseValidator200ElementForecast)),
});

export const areaDataGetResponseValidator = {
  200: areaDataGetResponseValidator200,
};

export const areaDataGetValidator = {
  query: areaDataGetQueryParamsValidator,
  response: areaDataGetResponseValidator,
};
