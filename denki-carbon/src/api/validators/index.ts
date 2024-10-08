import { t } from "elysia";

export const kWhValueValidations = {
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
};
