import { DateTime } from "luxon";

const apiURL = process.env.REACT_APP_API_URL;
console.log("API URL: ", apiURL);

export const supportedUtilities = [
  "hepco",
  "tohoku",
  "tepco",
  "chubu",
  "chugoku",
  "hokuden",
  "kepco",
  "yonden",
  "kyuden",
  "okinawa",
] as const;

export type Utilities = (typeof supportedUtilities)[number];

export interface DenkiCarbonGetAreaDataQueryParams {
  tso: string;
  from: string;
  to: string;
  includeForecast: boolean;
}

export interface DenkiCarbonGetAreaData {
  historic: DenkiCarbonGetAreaDataElement[];
  forecast: DenkiCarbonGetAreaDataElement[];
}
export interface DenkiCarbonGetAreaDataElement {
  tso: string;
  datetimeFrom: DateTime;
  datetimeTo: DateTime;
  carbonIntensity?: number;
  averagePredictedCarbonIntensity?: number;
  predictedCarbonIntensity?: number;
}
const defaultDenkiCarbonGetAreaData: DenkiCarbonGetAreaDataElement[] = [
  {
    tso: "tepco",
    datetimeFrom: DateTime.fromISO("2020-01-01T15:00:00.000Z"),
    datetimeTo: DateTime.fromISO("2020-01-01T15:30:00.000Z"),
    carbonIntensity: 1,
    averagePredictedCarbonIntensity: 1,
    predictedCarbonIntensity: 1,
  },
];

export interface DenkiCarbonGetOverviewIntensitiesDataElement {
  tso: string;
  dateJST: string;
  timeFromJST: string;
  timeToJST: string;
  datetimeFrom: DateTime;
  datetimeTo: DateTime;
  carbonIntensity: number;
  isForecast: boolean;
  createdAt: DateTime;
  allAreaData?: {
    totalDemandkWh: number;
    nuclearkWh: number;
    allfossilkWh: number;
    lngkWh: number;
    coalkWh: number;
    oilkWh: number;
    otherFossilkWh: number;
    hydrokWh: number;
    geothermalkWh: number;
    biomasskWh: number;
    solarOutputkWh: number;
    solarThrottlingkWh: number;
    windOutputkWh: number;
    windThrottlingkWh: number;
    pumpedStoragekWh: number;
    batteryStoragekWh: number;
    interconnectorskWh: number;
    otherkWh: number;
    totalGenerationkWh: number;
  };
}
export interface DenkiCarbonGetOverviewData {
  intensities: DenkiCarbonGetOverviewIntensitiesDataElement[];
}
const defaultDenkiCarbonGetAreaDataElement: DenkiCarbonGetOverviewData = {
  intensities: [],
};

/**
 * Generate Cache for Local Browser to prevent API overuse
 *
 * @returns Object containing getter and setter functions
 */
const createCache = <StoredDataType>() => {
  type Cache = {
    [K in string]?: StoredDataType;
  };

  const cache: Cache = {};

  /**
   * Get Cache Data for Utility
   *
   * @param utility Utility Name
   * @returns Cached Data
   */
  const getCache = (paramString: string): StoredDataType | undefined =>
    cache[paramString];

  /**
   * Sets Cache Data for Utility
   *
   * @param utility Utility Name
   * @param data Cached Data
   */
  const setCache = (paramString: string, data: StoredDataType): void => {
    cache[paramString] = data;
  };
  return { getCache, setCache };
};

/**
 * Create API Interface
 *
 * @param endpointPath endpoint path, don't put '/' on the ends
 * @param defaultData the default data for useState
 * @param unpacker basic function to unpack the data down to the main array
 *
 * @returns API calling interface
 */
function createAPIInterface<DataType, Params>(
  defaultData: DataType,
  unpacker: (raw: any) => DataType = (raw) => raw,
  endpointPath: string
) {
  // Cache in closure
  const cache = createCache<DataType>();

  // Return Function
  const callAPI = async (
    setData: (data: DataType) => void,
    utility: Utilities,
    params: Params
  ): Promise<void> => {
    setData(defaultData);

    const paramString = JSON.stringify(params);

    const cacheData = cache.getCache(paramString);
    if (cacheData) {
      console.log(`Got ${endpointPath} for ${paramString} from Local Cache`);
      return setData(cacheData);
    }

    const requestURL =
      `${apiURL}/${endpointPath}?` +
      new URLSearchParams(params as Record<string, string>);
    const response = await fetch(requestURL);

    if (response.ok === false) {
      console.error("API Call Failed Retrying...");
      console.error(response);
      setTimeout(() => callAPI(setData, utility, params), 2000);
      return;
    }

    const result: DataType = await response.json();

    const data: DataType = unpacker(result);

    cache.setCache(paramString, data);
    setData(data);
  };
  return callAPI;
}

const retriveDataDenkiCarbon = createAPIInterface<
  DenkiCarbonGetAreaDataElement[],
  DenkiCarbonGetAreaDataQueryParams
>(
  defaultDenkiCarbonGetAreaData,
  (raw: { historic: any; forecast: any }): DenkiCarbonGetAreaDataElement[] => {
    // TODO: set up a better validator
    console.log("Raw Data: ", raw);
    const forecast = raw?.forecast ? raw.forecast : [];
    return [...raw.historic, ...forecast].map((element) => ({
      ...element,
      datetimeFrom: DateTime.fromISO(element.datetimeFrom),
      datetimeTo: DateTime.fromISO(element.datetimeTo),
    })) as DenkiCarbonGetAreaDataElement[];
  },
  "v1/area_data"
);

const retrieveOverviewDenkiCarbon = createAPIInterface<
  DenkiCarbonGetOverviewData,
  {}
>(
  defaultDenkiCarbonGetAreaDataElement,
  (raw: any): DenkiCarbonGetOverviewData => {
    console.log("Raw Overview Data: ", raw);
    return {
      intensities: raw.intensities.map((element: any) => ({
        ...element,
        datetimeFrom: DateTime.fromISO(element.datetimeFrom),
        datetimeTo: DateTime.fromISO(element.datetimeTo),
        createdAt: DateTime.fromISO(element.createdAt),
      })),
    };
  },
  "v1/overview"
);

export const denkiCarbon = {
  denkiCarbon: {
    default: defaultDenkiCarbonGetAreaData,
    retrive: retriveDataDenkiCarbon,
    overviewDefault: defaultDenkiCarbonGetAreaDataElement,
    retrieveOverview: retrieveOverviewDenkiCarbon,
  },
};
export default denkiCarbon;
