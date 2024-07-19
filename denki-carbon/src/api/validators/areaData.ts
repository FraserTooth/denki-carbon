import { t } from "elysia";
import { JapanTsoName } from "../../const";
import { DateTime } from "luxon";

export const areaDataGetQueryParamsValidator = t.Object({
  tso: t.Enum(JapanTsoName, {
    description: "The target Grid Operator",
    default: JapanTsoName.TEPCO,
  }),
  from: t.Date({
    description:
      "The start of the time range to get data for, in ISO 8601 format",
    default: DateTime.now().minus({ hours: 2 }).startOf("hour").toISO(),
  }),
  to: t.Date({
    description:
      "The end of the time range to get data for, in ISO 8601 format",
    default: DateTime.now().plus({ hours: 2 }).startOf("hour").toISO(),
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
  totalDemandkWh: t.Nullable(
    t.Number({
      description: "The total demand in kWh",
      examples: [14582500],
    })
  ),
  nuclearkWh: t.Nullable(
    t.Number({
      description: "The nuclear power output in kWh",
      examples: [0],
    })
  ),
  allfossilkWh: t.Nullable(
    t.Number({
      description: "The total output of all fossil fuels in kWh",
      examples: [10917000],
    })
  ),
  lngkWh: t.Nullable(
    t.Number({
      description: "The LNG output in kWh",
      examples: [7207000],
    })
  ),
  coalkWh: t.Nullable(
    t.Number({
      description: "The coal output in kWh",
      examples: [3136000],
    })
  ),
  oilkWh: t.Nullable(
    t.Number({
      description: "The oil output in kWh",
      examples: [152500],
    })
  ),
  otherFossilkWh: t.Nullable(
    t.Number({
      description: "The output of other fossil fuels in kWh",
      examples: [421500],
    })
  ),
  hydrokWh: t.Nullable(
    t.Number({
      description: "The hydro power output in kWh",
      examples: [891500],
    })
  ),
  geothermalkWh: t.Nullable(
    t.Number({
      description: "The geothermal power output in kWh",
      examples: [0],
    })
  ),
  biomasskWh: t.Nullable(
    t.Number({
      description: "The biomass power output in kWh",
      examples: [243000],
    })
  ),
  solarOutputkWh: t.Nullable(
    t.Number({
      description: "The solar power output in kWh",
      examples: [0],
    })
  ),
  solarThrottlingkWh: t.Nullable(
    t.Number({
      description: "The solar power output that is being throttled in kWh",
      examples: [0],
    })
  ),
  windOutputkWh: t.Nullable(
    t.Number({
      description: "The wind power output in kWh",
      examples: [35000],
    })
  ),
  windThrottlingkWh: t.Nullable(
    t.Number({
      description: "The wind power output that is being throttled in kWh",
      examples: [0],
    })
  ),
  pumpedStoragekWh: t.Nullable(
    t.Number({
      description:
        "The total generation or consumption from pumped storage in kWh - positive values are generation, negative values are consumption",
      examples: [771000, -681000],
    })
  ),
  batteryStoragekWh: t.Nullable(
    t.Number({
      description:
        "The total generation or consumption from battery storage in kWh - positive values are generation, negative values are consumption",
      examples: [246000, -127000],
    })
  ),
  interconnectorskWh: t.Nullable(
    t.Number({
      description:
        "The total generation or consumption from interconnectors in kWh - positive values are generation, negative values are consumption",
      examples: [1558500, -1000000],
    })
  ),
  otherkWh: t.Nullable(
    t.Number({
      description:
        "The total generation or consumption from other sources in kWh - positive values are generation, negative values are consumption",
      examples: [0],
    })
  ),
  totalGenerationkWh: t.Nullable(
    t.Number({
      description: "The total generation + consumption in kWh",
      examples: [14582500],
    })
  ),
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
