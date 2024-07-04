import { DateTime } from "luxon";

const apiURL = process.env.REACT_APP_API_URL;
console.log("API URL: ", apiURL);

export const supportedUtilities = [
  "hepco",
  "tohoku",
  "tepco",
  "chubu",
  "chugoku",
  // "rikuden",
  // "kepco",
  // "yonden",
  // "kyuden",
  // "okiden",
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

/**
 * Generate Cache for Local Browser to prevent API overuse
 *
 * @returns Object containing getter and setter functions
 */
const createCache = <StoredDataType>() => {
  type Cache = {
    [K in Utilities]?: StoredDataType;
  };

  const cache: Cache = {};

  /**
   * Get Cache Data for Utility
   *
   * @param utility Utility Name
   * @returns Cached Data
   */
  const getCache = (utility: Utilities): StoredDataType | undefined =>
    cache[utility];

  /**
   * Sets Cache Data for Utility
   *
   * @param utility Utility Name
   * @param data Cached Data
   */
  const setCache = (utility: Utilities, data: StoredDataType): void => {
    cache[utility] = data;
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

    const cacheData = cache.getCache(utility);
    if (cacheData) {
      console.log(`Got ${endpointPath} for ${utility} from Local Cache`);
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

    cache.setCache(utility, data);
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
    return [...raw.historic, ...raw.forecast].map((element) => ({
      ...element,
      datetimeFrom: DateTime.fromISO(element.datetimeFrom),
      datetimeTo: DateTime.fromISO(element.datetimeTo),
    })) as DenkiCarbonGetAreaDataElement[];
  },
  "v1/area_data"
);

export const denkiCarbon = {
  denkiCarbon: {
    default: defaultDenkiCarbonGetAreaData,
    retrive: retriveDataDenkiCarbon,
  },
};
export default denkiCarbon;
