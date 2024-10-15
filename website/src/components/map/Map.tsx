import React, { useCallback } from "react";
import { ReactComponent as JapanGridRegionsMap } from "./JAPAN GRID REGIONS MAP.svg";
import {
  DenkiCarbonGetOverviewData,
  supportedUtilities,
  Utilities,
} from "../api/denkicarbon";
import { DateTime } from "luxon";
import { getCarbonIntensityColor } from "../../utils";
import { Tooltip } from "react-tooltip";
import { t } from "i18next";
import { Box, makeStyles, Typography } from "@material-ui/core";

interface MapProps {
  overviewData: DenkiCarbonGetOverviewData;
}

const useStyles = makeStyles({
  mapBox: {
    marginTop: "30px",
  },
  mapTitle: {
    textTransform: "capitalize",
  },
  map: {
    width: 500,
    height: 500,
    display: "block",
    margin: "20px",
    outline: "none",
  },
});

const utilityToSVGId = (utility: Utilities): string => {
  switch (utility) {
    case "hepco":
      return "HEPCO";
    case "tohoku":
      return "TOHOKUDEN";
    case "tepco":
      return "TEPCO";
    case "chubu":
      return "CHUDEN";
    case "chugoku":
      return "CHUGOKU";
    case "hokuden":
      return "HOKURIKU";
    case "kepco":
      return "KEPCO";
    case "yonden":
      return "YONDEN";
    case "kyuden":
      return "KYUDEN";
    case "okinawa":
      return "OKINAWADEN";
  }
  throw new Error(`Utility ${utility} not found`);
};

export default function Map(props: MapProps) {
  const classes = useStyles();
  const { overviewData } = props;

  const now = DateTime.now();

  const utilityIntensities = supportedUtilities.map((utility) => {
    const data = overviewData.intensities.find(
      (data) =>
        data.tso === utility &&
        data.datetimeFrom.valueOf() < now.valueOf() &&
        now.valueOf() <= data.datetimeTo.valueOf()
    );
    return {
      utility,
      intensity: data?.carbonIntensity,
    };
  });

  // Run this function when the SVG is loaded
  const measuredRef = useCallback(
    (node: SVGSVGElement) => {
      if (node) {
        // Restyle the SVG
        const paths = node.querySelectorAll("path");
        paths.forEach((path) => {
          path.setAttribute("stroke-width", "1");
        });

        // Color the utilities based on the carbon intensity
        utilityIntensities.forEach(({ utility, intensity }) => {
          const carbonIntensityColor = intensity
            ? getCarbonIntensityColor(intensity)
            : "black";

          const svgId = utilityToSVGId(utility);
          const path = node.querySelector(`#${svgId}`);
          if (path) {
            console.log("Editing color for", utility);
            // TODO: Change the color of the fill based on the carbon intensity
            // right now, randomly change the color
            path.setAttribute("fill", carbonIntensityColor);
          }
        });
      }
    },
    [overviewData]
  );

  const tooltips = utilityIntensities.map(({ utility, intensity }) => {
    return (
      <Tooltip
        anchorSelect={"#" + utilityToSVGId(utility)}
        content={t("map.tooltip", {
          utility: t(`utilities.${utility}`),
          carbonIntensity: intensity?.toFixed(0) ?? 0,
        })}
        delayHide={100}
      />
    );
  });

  return (
    <Box className={classes.mapBox}>
      <Typography variant="h5" className={classes.mapTitle}>
        {t("map.title")}
      </Typography>
      <JapanGridRegionsMap ref={measuredRef} className={classes.map} />
      {tooltips}
    </Box>
  );
}
