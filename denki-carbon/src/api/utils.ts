import { areaDataProcessed } from "../schema";

/**
 * Round a number to 3 decimal places
 *
 * @param num - The number to round
 * @returns {number}
 */
export const rTo3Dec = (num: number): number => {
  return Math.round(num * 1000) / 1000;
};

/**
 * Convert a numerical string to a rounded number
 *
 * @param str - The string to convert
 * @returns {number} - The number, rounded to 3 decimal places
 */
export const strToNum = (str: string): number => {
  const num = parseFloat(str);
  if (!Number.isFinite(num)) {
    throw new Error(`Could not convert string to number: ${str}`);
  }
  return rTo3Dec(num);
};

/**
 * Convert a numerical string to a rounded number
 *
 * @param str - The string to convert
 * @returns {number} - The number
 */
export const nullableStrToNum = (str: string | null): number | null => {
  if (str === null || str.length === 0) return null;
  return strToNum(str);
};

/**
 * Convert all the numerical strings in an area data row to numbers
 * Retains null values and other fields
 *
 * @param row - The row to convert
 */
export const numberifyAreaDataRow = (
  row: typeof areaDataProcessed.$inferSelect
) => {
  return {
    ...row,
    totalDemandkWh: nullableStrToNum(row.totalDemandkWh),
    nuclearkWh: nullableStrToNum(row.nuclearkWh),
    allfossilkWh: nullableStrToNum(row.allfossilkWh),
    lngkWh: nullableStrToNum(row.lngkWh),
    coalkWh: nullableStrToNum(row.coalkWh),
    oilkWh: nullableStrToNum(row.oilkWh),
    otherFossilkWh: nullableStrToNum(row.otherFossilkWh),
    hydrokWh: nullableStrToNum(row.hydrokWh),
    geothermalkWh: nullableStrToNum(row.geothermalkWh),
    biomasskWh: nullableStrToNum(row.biomasskWh),
    solarOutputkWh: nullableStrToNum(row.solarOutputkWh),
    solarThrottlingkWh: nullableStrToNum(row.solarThrottlingkWh),
    windOutputkWh: nullableStrToNum(row.windOutputkWh),
    windThrottlingkWh: nullableStrToNum(row.windThrottlingkWh),
    pumpedStoragekWh: nullableStrToNum(row.pumpedStoragekWh),
    batteryStoragekWh: nullableStrToNum(row.batteryStoragekWh),
    interconnectorskWh: nullableStrToNum(row.interconnectorskWh),
    otherkWh: nullableStrToNum(row.otherkWh),
    totalGenerationkWh: nullableStrToNum(row.totalGenerationkWh),
  };
};
