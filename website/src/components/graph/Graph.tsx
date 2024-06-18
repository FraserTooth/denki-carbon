import React, { useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import {
  CarbonIntensityForecast,
  DailyCarbonDataByMonth,
  DenkiCarbonV2,
} from "../api/denkicarbon";

import { CircularProgress, Card, makeStyles } from "@material-ui/core";

import Title from "./Title";
import useWindowDimensions from "./resize";
import CustomTooltip, { timeFormatter } from "./Tooltip";

import { useTranslation } from "react-i18next";

const useStyles = makeStyles({
  graphCard: {
    padding: "10px",
  },
});

const INDUSTRY_TARGET_2030 = 370;
// From https://www.nationalgrideso.com/news/record-breaking-2020-becomes-greenest-year-britains-electricity
const UK_AVERAGE_2020 = 181;

interface GraphProps {
  intensityData: DenkiCarbonV2[];
}

export default function Graph(props: GraphProps) {
  const classes = useStyles();
  const { t } = useTranslation();

  const now = new Date();
  const month = now.getMonth();

  const [monthChoice, setMonthChoice] = useState(month);

  const { width } = useWindowDimensions();
  const graphWidth = width > 700 ? 500 : width - 100;

  const lineInfo = {
    average: {
      color: "orange",
      type: "line",
      name: String(t("graph.averageLine")),
    },
    forecast: {
      color: "#8884d8",
      type: "line",
      name: String(t("graph.forecast")),
    },
    target: {
      color: "red",
      type: "line",
      strokeDasharray: "6 6",
      name: String(t("graph.targetLine")),
    },
    averageUK: {
      color: "green",
      type: "line",
      strokeDasharray: "6 6",
      name: String(t("graph.averageUKLine")),
    },
  };

  const legendPayload: any[] = [
    {
      value: lineInfo.forecast.name,
      id: 1,
      type: "line",
      color: lineInfo.forecast.color,
    },
    {
      value: lineInfo.average.name,
      id: 2,
      type: "line",
      color: lineInfo.average.color,
    },
    {
      value: lineInfo.target.name,
      id: 4,
      type: "plainline",
      payload: {
        strokeDasharray: lineInfo.target.strokeDasharray,
      },
      color: lineInfo.target.color,
    },
    {
      value: lineInfo.averageUK.name,
      id: 5,
      type: "plainline",
      payload: {
        strokeDasharray: lineInfo.averageUK.strokeDasharray,
      },
      color: lineInfo.averageUK.color,
    },
  ];

  if (Object.keys(props.intensityData).length < 2) {
    //Don't render if no data
    return <CircularProgress />;
  }

  const data = props.intensityData.map((dp, i: number) => {
    // Add 2030 target and UK average
    const newDP: any = {
      target2030: INDUSTRY_TARGET_2030,
      averageUK2020: UK_AVERAGE_2020,
      intensity: dp.carbonIntensity,
      forecast: dp.predictedCarbonIntensity,
      from: dp.datetimeFrom.toISO(),
    };

    return newDP;
  });

  console.log(data);

  // Copy first Datapoint to the Back, with hour '24' so we get a neat 'midnight to midnight' line
  // const adjustedData = JSON.parse(JSON.stringify(data));
  // const wrapAround = JSON.parse(JSON.stringify(adjustedData[0]));
  // wrapAround.hour = 24;
  // adjustedData.push(wrapAround);

  const renderLineChart = (
    <LineChart width={graphWidth} height={300} data={data}>
      <Line
        name={lineInfo.average.name}
        type="monotone"
        dataKey="intensity"
        stroke={lineInfo.average.color}
      />
      <Line
        name={lineInfo.forecast.name}
        type="monotone"
        dataKey="forecast"
        stroke={lineInfo.forecast.color}
      />
      <Line
        name={lineInfo.target.name}
        type="monotone"
        dataKey="target2030"
        stroke={lineInfo.target.color}
        strokeDasharray="3 3"
        dot={false}
      />
      <Line
        name={lineInfo.target.name}
        type="monotone"
        dataKey="averageUK2020"
        stroke={lineInfo.averageUK.color}
        strokeDasharray="3 3"
        dot={false}
      />
      <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
      <XAxis
        dataKey="from"
        tickFormatter={timeFormatter}
        interval="preserveStartEnd"
        domain={[data[0].from, data.at(-1).from]}
      />
      <YAxis
        label={{ value: "gCO₂/kWh", angle: -90, position: "insideLeft" }}
        domain={[0, 900]}
      />
      <Tooltip content={<CustomTooltip />} />
      <Legend verticalAlign="bottom" height={36} payload={legendPayload} />
    </LineChart>
  );

  return (
    <Card className={classes.graphCard}>
      <Title setMonthChoice={setMonthChoice} monthChoice={monthChoice} />
      <br />
      {renderLineChart}
    </Card>
  );
}
