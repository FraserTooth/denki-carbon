import { describe, expect, it } from "bun:test";
import { startOfMostRecentHalfHour } from "../src/utils";
import { DateTime } from "luxon";

describe("utils", () => {
  describe("startOfMostRecentHalfHour", () => {
    it.each([
      ["2022-01-01T12:46:56.789+00:00", "2022-01-01T12:30:00.000Z"],
      ["2022-01-01T12:46:56.789+09:00", "2022-01-01T12:30:00.000+09:00"],
      ["2022-01-01T12:16:56.789+00:00", "2022-01-01T12:00:00.000Z"],
      ["2022-01-01T12:16:56.789+09:00", "2022-01-01T12:00:00.000+09:00"],
      ["2022-01-01T12:00:00.000+00:00", "2022-01-01T12:00:00.000Z"],
      ["2022-01-01T12:30:00.000+00:00", "2022-01-01T12:30:00.000Z"],
    ])(
      "should return the start of the most recent half hour",
      (input, expected) => {
        const datetime = DateTime.fromISO(input, { setZone: true });
        console.log(datetime.toISO());
        const result = startOfMostRecentHalfHour(datetime);
        expect(result.toISO()).toBe(expected);
      }
    );
  });
});
