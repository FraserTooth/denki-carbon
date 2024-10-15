import React, { useState, useEffect } from "react";
import Graph from "./graph/Graph";
import Explanation from "./Explanation";
import Title from "./Title";
import Social from "./Social";
import Map from "./map/Map";
import intensity, { supportedUtilities } from "./api/denkicarbon";
import { DateTime } from "luxon";

import {
  Box,
  Container,
  Typography,
  Divider,
  CircularProgress,
} from "@material-ui/core";
import { getCarbonIntensityColor } from "../utils";

const now = DateTime.now();
// Get the start of the most recent half hour block
const startOfLatestHalfHour = now.startOf("hour").set({
  minute: now.minute >= 30 ? 30 : 0,
});
const nowJST = now.setZone("Asia/Tokyo");

// Most utilities have a 2hr lag, and we predict the next 3 hrs, so get from 2 hrs into the future
const predictionLimit = nowJST.plus({ hours: 2 });

const oneDayAgo = nowJST.minus({ days: 1 });

export default function Main() {
  // Utility Choice
  const [utility, setUtility] = useState(supportedUtilities[2]); // Default to TEPCO, TODO: swap to Enum

  // Date Choice
  const [graphDate, setGraphDate] = useState<DateTime | null>(null);

  // Store Carbon Intensity Now
  const [carbonIntensityNow, setCarbonIntensityNow] = useState<number>(0);

  // API Data
  const [carbonIntensityData, setCarbonIntensityData] = useState(
    intensity.denkiCarbon.default
  );
  const [overviewData, setOverviewData] = useState(
    intensity.denkiCarbon.overviewDefault
  );

  // Changes to be made when utility is updated
  useEffect(() => {
    // Reset the graph date
    setGraphDate(null);
    // Reset the carbon intensity
    setCarbonIntensityNow(0);
    // Fetch new data
    intensity.denkiCarbon.retrive(setCarbonIntensityData, utility, {
      tso: utility,
      from: oneDayAgo.toISO() ?? "",
      to: predictionLimit.toISO() ?? "",
      includeForecast: true,
    });

    intensity.denkiCarbon.retrieveOverview(setOverviewData, utility, {});
  }, [utility]);

  // Changes to be made when graphDate is updated
  useEffect(() => {
    const from = graphDate === null ? oneDayAgo : graphDate;
    const to =
      graphDate === null
        ? predictionLimit
        : from.plus({ hours: 23, minutes: 59 }); // Not quite 24 hours, to avoid next day's block
    console.log(
      `Fetching Carbon Intensity Data for ${utility} from ${from} to ${to}`
    );

    intensity.denkiCarbon.retrive(setCarbonIntensityData, utility, {
      tso: utility,
      from: from.toISO() ?? "",
      to: to.toISO() ?? "",
      includeForecast: graphDate === null ? true : false,
    });
  }, [graphDate]);

  // Changes to be made when data is updated
  useEffect(() => {
    if (graphDate === null) {
      const rawCarbonIntensityNow =
        carbonIntensityData.find((dp) => {
          return dp.datetimeFrom.valueOf() === startOfLatestHalfHour.valueOf();
        })?.predictedCarbonIntensity ?? 0;
      console.log(
        `The current Carbon Intensity is ${rawCarbonIntensityNow}gC02/kWh`
      );
      setCarbonIntensityNow(Math.round(rawCarbonIntensityNow));
    }
  }, [carbonIntensityData]);

  return (
    <Container maxWidth="sm">
      <Box my={4}>
        <Title
          updateUtility={setUtility}
          utilityIndex={supportedUtilities.indexOf(utility)}
          supportedUtilities={supportedUtilities}
        />
        {carbonIntensityNow === 0 ? (
          <CircularProgress />
        ) : (
          <div>
            <Typography
              variant="h2"
              component="h1"
              gutterBottom
              style={{
                display: "inline-block",
                color: getCarbonIntensityColor(carbonIntensityNow),
              }}
            >
              {carbonIntensityNow}
            </Typography>
            <Typography style={{ display: "inline-block" }}>
              gCO₂/kWh
            </Typography>
            <Graph
              intensityData={carbonIntensityData}
              setGraphDate={setGraphDate}
              graphDate={graphDate}
            />
          </div>
        )}
        <Social carbonIntensity={carbonIntensityNow} utility={utility} />
        <Divider variant="middle" />
        {overviewData.intensities.length === 0 ? (
          <CircularProgress />
        ) : (
          <Map overviewData={overviewData}></Map>
        )}
        <Divider variant="middle" />
        <Explanation />
      </Box>
    </Container>
  );
}
