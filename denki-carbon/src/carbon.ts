import { GenerationSource, JapanTsoName } from "./const";
import { areaDataProcessed } from "./schema";
import { onlyPositive } from "./utils";

// TODO: find a more up-to-date source for this data
// https://criepi.denken.or.jp/jp/kenkikaku/report/detail/Y06.html
const japanLifecycleCarbonIntensitiesBySource: Record<
  GenerationSource,
  number
> = {
  [GenerationSource.COAL]: 943,
  [GenerationSource.OIL]: 738,
  [GenerationSource.LNG]: 474,
  [GenerationSource.OTHER_FOSSIL]: 500, // Use an average Grid Intensity for now
  [GenerationSource.NUCLEAR]: 19,
  [GenerationSource.HYDRO]: 11,
  [GenerationSource.PUMPED_HYDRO]: 11,
  [GenerationSource.GEOTHERMAL]: 13,
  [GenerationSource.SOLAR]: 59,
  [GenerationSource.WIND]: 26,
  [GenerationSource.BIOMASS]: 120, // Still use the UK factor
  [GenerationSource.BATTERY]: 0, // Assume 0 for now
  [GenerationSource.INTERCONNECTORS]: 500, // Use an average Grid Intensity for now
  [GenerationSource.OTHER]: 500, // VVPs often use a mix of sources, so use an average Grid Intensity for now
};

/**
 * For each TSO, the comparative volume of each fuel type used in their thermal generation
 * The units used are not consistent, but thats okay as we are only interested in the relative proportions
 * This is used to calculate the carbon intensity of the TSO's generation for periods where the fuel mix is not provided
 */
const fuelTypeTotalsByTso: Record<
  JapanTsoName,
  Record<
    GenerationSource.COAL | GenerationSource.OIL | GenerationSource.LNG,
    number
  >
> = {
  [JapanTsoName.HEPCO]: {
    // Thermal Energy Percentages: https://wwwc.hepco.co.jp/hepcowwwsite/english/ir/pdf/hepco_group_report_2019.pdf
    [GenerationSource.COAL]: 25.9,
    [GenerationSource.OIL]: 23.8,
    [GenerationSource.LNG]: 6.5,
  },
  [JapanTsoName.TOHOKU]: {
    // Thermal Energy Percentages: https://www.tohoku-epco.co.jp/ir/report/factbook/pdf/fact01.pdf
    [GenerationSource.COAL]: 23,
    [GenerationSource.OIL]: 2,
    [GenerationSource.LNG]: 24,
  },
  [JapanTsoName.TEPCO]: {
    // Thermal Data: https://www7.tepco.co.jp/fp/thermal-power/list-e.html
    [GenerationSource.COAL]: 2,
    [GenerationSource.OIL]: 5.66 + 1.05 + 4.4,
    [GenerationSource.LNG]:
      4.38 + 3.6 + 3.6 + 5.16 + 3.42 + 3.541 + 1.15 + 2 + 1.14,
  },
  [JapanTsoName.CHUBU]: {
    // Thermal Energy Percentages: https://www.chuden.co.jp/english/resource/corporate/ecsr_report_2019_3.pdf
    [GenerationSource.COAL]: 4.1 + 1.07,
    [GenerationSource.OIL]: 1.4,
    [GenerationSource.LNG]: 3.966 + 1.708 + 3.058 + 2.376 + 4.802 + 0.585,
  },
  [JapanTsoName.HOKUDEN]: {
    // Thermal Energy Percentages:http://www.rikuden.co.jp/eng_ir/attach/integratedreport2019-1.pdf
    [GenerationSource.COAL]: 0.5 + 0.7 + 0.25 + 0.5 + 0.7 + 0.25 + 0.25,
    [GenerationSource.OIL]: 0.25 + 0.5 + 0.5,
    [GenerationSource.LNG]: 0.4247,
  },
  [JapanTsoName.KEPCO]: {
    // Thermal Energy Percentages: https://www.kepco.co.jp/english/corporate/list/report/pdf/e2019.pdf
    [GenerationSource.COAL]: 18,
    [GenerationSource.OIL]: 9,
    [GenerationSource.LNG]: 37,
  },
  [JapanTsoName.CHUGOKU]: {
    // Thermal Energy Percentages: https://www.energia.co.jp/corp/active/csr/kankyou/pdf/2019/csr-2019.pdf
    [GenerationSource.COAL]: 1 + 0.156 + 0.259 + 0.5 + 0.5 + 0.175,
    [GenerationSource.OIL]: 0.35 + 0.35 + 0.5 + 0.35 + 0.5 + 0.7 + 0.4,
    [GenerationSource.LNG]: 0.285 + 1.4,
  },
  [JapanTsoName.YONDEN]: {
    // Thermal Data: https://www.yonden.co.jp/english/assets/pdf/ir/tools/ann_r/annual_e_2019.pdf
    [GenerationSource.COAL]: 0.156 + 0.25 + 0.7,
    [GenerationSource.OIL]: 0.45 + 0.45 + 0.45,
    [GenerationSource.LNG]: 0.296 + 0.289 + 0.35,
  },
  [JapanTsoName.KYUDEN]: {
    // Thermal Data: https://www.kyuden.co.jp/var/rev0/0220/1476/c57wp8gc_16.pdf
    [GenerationSource.COAL]: 0.36 + 0.7 + 1.4,
    [GenerationSource.OIL]: 1 + 0.875 + 1,
    [GenerationSource.LNG]: 1.8 + 2.825,
  },
  [JapanTsoName.OEPC]: {
    // Thermal Energy Percentages: https://www.okiden.co.jp/shared/pdf/ir/ar/ar2017/180516_02.pdf
    [GenerationSource.COAL]: 61,
    [GenerationSource.OIL]: 13,
    [GenerationSource.LNG]: 21,
  },
};

export const gCO2BySource = (source: GenerationSource) => {
  const intensity = japanLifecycleCarbonIntensitiesBySource[source];
  if (intensity === undefined) {
    throw new Error(`Unsupported source: ${source}`);
  }
  return intensity;
};

export const getTotalCarbonIntensityForAreaDataRow = (
  row: typeof areaDataProcessed.$inferSelect,
  c02ForInterconnectors: number = gCO2BySource(GenerationSource.INTERCONNECTORS)
): number => {
  const {
    tso,
    nuclearkWh,
    allfossilkWh,
    hydrokWh,
    geothermalkWh,
    biomasskWh,
    solarOutputkWh,
    windOutputkWh,
    pumpedStoragekWh,
    interconnectorskWh,
    lngkWh,
    coalkWh,
    oilkWh,
    otherFossilkWh,
    batteryStoragekWh,
    otherkWh,
  } = row;

  const hasFossilTypesSeparated =
    lngkWh !== null &&
    coalkWh !== null &&
    oilkWh !== null &&
    otherFossilkWh !== null;

  const intensityContributors = (() => {
    if (hasFossilTypesSeparated) {
      return [
        parseFloat(lngkWh) * gCO2BySource(GenerationSource.LNG),
        parseFloat(coalkWh) * gCO2BySource(GenerationSource.COAL),
        parseFloat(oilkWh) * gCO2BySource(GenerationSource.OIL),
        parseFloat(otherFossilkWh) *
          gCO2BySource(GenerationSource.OTHER_FOSSIL),
        parseFloat(nuclearkWh ?? "0") * gCO2BySource(GenerationSource.NUCLEAR),
        parseFloat(hydrokWh ?? "0") * gCO2BySource(GenerationSource.HYDRO),
        parseFloat(geothermalkWh ?? "0") *
          gCO2BySource(GenerationSource.GEOTHERMAL),
        parseFloat(biomasskWh ?? "0") * gCO2BySource(GenerationSource.BIOMASS),
        parseFloat(solarOutputkWh ?? "0") *
          gCO2BySource(GenerationSource.SOLAR),
        parseFloat(windOutputkWh ?? "0") * gCO2BySource(GenerationSource.WIND),
        parseFloat(pumpedStoragekWh ?? "0") *
          gCO2BySource(GenerationSource.PUMPED_HYDRO),
        parseFloat(interconnectorskWh ?? "0") * c02ForInterconnectors,
        parseFloat(batteryStoragekWh ?? "0") *
          gCO2BySource(GenerationSource.BATTERY),
        parseFloat(otherkWh ?? "0") * gCO2BySource(GenerationSource.OTHER),
      ];
    } else {
      const stations = fuelTypeTotalsByTso[tso as JapanTsoName];
      const totalFossilPercentage = Object.values(stations).reduce(
        (acc, val) => acc + val,
        0
      );
      const fossilIntensity =
        (stations[GenerationSource.COAL] * gCO2BySource(GenerationSource.COAL) +
          stations[GenerationSource.OIL] * gCO2BySource(GenerationSource.OIL) +
          stations[GenerationSource.LNG] * gCO2BySource(GenerationSource.LNG)) /
        totalFossilPercentage;

      return [
        parseFloat(allfossilkWh ?? "0") * fossilIntensity,
        parseFloat(nuclearkWh ?? "0") * gCO2BySource(GenerationSource.NUCLEAR),
        parseFloat(hydrokWh ?? "0") * gCO2BySource(GenerationSource.HYDRO),
        parseFloat(geothermalkWh ?? "0") *
          gCO2BySource(GenerationSource.GEOTHERMAL),
        parseFloat(biomasskWh ?? "0") * gCO2BySource(GenerationSource.BIOMASS),
        parseFloat(solarOutputkWh ?? "0") *
          gCO2BySource(GenerationSource.SOLAR),
        parseFloat(windOutputkWh ?? "0") * gCO2BySource(GenerationSource.WIND),
        parseFloat(pumpedStoragekWh ?? "0") *
          gCO2BySource(GenerationSource.PUMPED_HYDRO),
        parseFloat(interconnectorskWh ?? "0") * c02ForInterconnectors,
        parseFloat(batteryStoragekWh ?? "0") *
          gCO2BySource(GenerationSource.BATTERY),
        parseFloat(otherkWh ?? "0") * gCO2BySource(GenerationSource.OTHER),
      ];
    }
  })();

  const totalGenerationKwh = parseFloat(row.totalGenerationkWh ?? "0");
  // Avoid division by zero, happens once legitmately in the data
  if (totalGenerationKwh === 0) return 0;
  const totalintensity =
    intensityContributors.reduce(
      (total, source) => total + onlyPositive(source),
      0
    ) / totalGenerationKwh;

  // Set to 3 decimal places
  const roundedIntensity = Math.round(totalintensity * 1000) / 1000;
  return roundedIntensity;
};
