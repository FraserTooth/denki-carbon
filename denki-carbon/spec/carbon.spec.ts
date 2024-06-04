import { expect, test, describe } from "bun:test";
import {
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_ALL_ZEROS,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT,
} from "./fixtures";
import { getTotalCarbonIntensityForAreaDataRow } from "../src/carbon";
import exp from "constants";

describe("carbon calculations", () => {
  test("should calculate carbon intensity", () => {
    const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO;
    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    expect(carbonIntensity).toBe(520.119);
  });

  test("should calculate carbon intensity - old format", () => {
    const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT;
    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    expect(carbonIntensity).toBe(541.981);
  });

  test("should calculate carbon intensity - all zeros", () => {
    const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_ALL_ZEROS;
    const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
    expect(carbonIntensity).toBe(0);
  });
});
