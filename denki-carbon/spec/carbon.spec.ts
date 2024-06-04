import { expect, test, describe } from "bun:test";
import {
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_ALL_ZEROS,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ALL_ZEROS,
  EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ZERO_FOSSILS,
} from "./fixtures";
import { getTotalCarbonIntensityForAreaDataRow } from "../src/carbon";

describe("carbon calculations", () => {
  describe("new format", () => {
    test("should calculate carbon intensity", () => {
      const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO;
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      expect(carbonIntensity).toBe(520.119);
    });

    test("should calculate carbon intensity - all zeros", () => {
      const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_ALL_ZEROS;
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      expect(carbonIntensity).toBe(0);
    });
  });

  describe("old format", () => {
    test("should calculate carbon intensity", () => {
      const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT;
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      expect(carbonIntensity).toBe(541.981);
    });

    test("should calculate carbon intensity - all zeros", () => {
      const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ALL_ZEROS;
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      expect(carbonIntensity).toBe(0);
    });

    test("should calculate carbon intensity - zero fossils", () => {
      const row = EXAMPLE_AREA_DATA_PROCESSED_ROW_TEPCO_OLD_FORMAT_ZERO_FOSSILS;
      const carbonIntensity = getTotalCarbonIntensityForAreaDataRow(row);
      expect(carbonIntensity).toBe(39.845);
    });
  });
});
