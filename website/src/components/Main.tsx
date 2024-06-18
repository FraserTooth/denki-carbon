import React, { useState, useEffect } from "react";
import Graph from "./graph/Graph";
import Explanation from "./Explanation";
import Title from "./Title";
import Social from "./Social";
import intensity, { supportedUtilities } from "./api/denkicarbon";
import { DateTime } from "luxon";

import {
  Box,
  Container,
  Typography,
  Divider,
  CircularProgress,
} from "@material-ui/core";

const carbonIntensityColor = (carbonIntensity: number): string => {
  const maxIntensity = 900;
  const hueCalc = 100 - Math.floor((carbonIntensity / maxIntensity) * 100);
  const hue = hueCalc > 0 ? hueCalc : 0;
  console.log(`hsl(${hue},100%,100%)`);
  return `hsl(${hue},100%,50%)`;
};
const now = DateTime.now();
// Get the start of the most recent half hour block
const startOfLatestHalfHour = now.startOf("hour").set({
  minute: now.minute >= 30 ? 30 : 0,
});
const nowJST = now.setZone("Asia/Tokyo");
const startOfDayJST = nowJST.startOf("day");
const lastBlockOfDayJST = startOfDayJST
  .plus({ days: 1 })
  .minus({ minutes: 30 });

export default function Main() {
  const date = new Date();
  const hourIndex = date.getHours();

  // Utility Choice
  const [utility, setUtility] = useState(supportedUtilities[0]);

  // V2 Data
  const [carbonIntensityData, setCarbonIntensityData] = useState(
    intensity.denkiCarbonV2.default
  );
  useEffect(() => {
    intensity.denkiCarbonV2.retrive(setCarbonIntensityData, utility, {
      tso: utility,
      from: startOfDayJST.toISO() ?? "",
      to: lastBlockOfDayJST.toISO() ?? "",
      includeForecast: true,
    });
  }, [utility]);

  // // Monthly Data
  // const [dailyCarbonByMonth, setDailyCarbonByMonth] = useState(
  //   intensity.byMonth.default
  // );
  // useEffect(() => {
  //   intensity.byMonth.retrive(setDailyCarbonByMonth, utility);
  // }, [utility]);

  // // Forecast
  // const [intensityForecast, setIntensityForecast] = useState(
  //   intensity.forecast.default
  // );
  // useEffect(() => {
  //   intensity.forecast.retrive(
  //     setIntensityForecast,
  //     utility,
  //     todayString,
  //     todayString
  //   );
  // }, [utility]);

  // const todaysForecastData =
  //   intensity.forecast.findTodaysData(intensityForecast);

  // Set Big Number
  // const carbonIntensity =
  //   Math.round(todaysForecastData[hourIndex]?.forecast_value) || 0;

  const rawCarbonIntensityNow =
    carbonIntensityData.find((dp) => {
      return dp.datetimeFrom.valueOf() === startOfLatestHalfHour.valueOf();
    })?.predictedCarbonIntensity ?? 0;
  console.log(
    `The current Carbon Intensity is ${rawCarbonIntensityNow}gC02/kWh`
  );
  const displayCarbonIntensityNow = Math.round(rawCarbonIntensityNow);

  return (
    <Container maxWidth="sm">
      <Box my={4}>
        <Title
          updateUtility={setUtility}
          utilityIndex={supportedUtilities.indexOf(utility)}
          supportedUtilities={supportedUtilities}
        />
        {displayCarbonIntensityNow === 0 ? (
          <CircularProgress />
        ) : (
          <div>
            <Typography
              variant="h2"
              component="h1"
              gutterBottom
              style={{
                display: "inline-block",
                color: carbonIntensityColor(displayCarbonIntensityNow),
              }}
            >
              {displayCarbonIntensityNow}
            </Typography>
            <Typography style={{ display: "inline-block" }}>
              gCO₂/kWh
            </Typography>
            <Graph intensityData={carbonIntensityData} />
          </div>
        )}
        <Social carbonIntensity={displayCarbonIntensityNow} utility={utility} />
        <Divider variant="middle" />
        <Explanation />
      </Box>
    </Container>
  );
}
