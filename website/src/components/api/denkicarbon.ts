import { DateTime } from "luxon";

const apiURL = process.env.REACT_APP_API_URL;
console.log("API URL: ", apiURL);

export const supportedUtilities = [
  // "hepco",
  "tohoku",
  "tepco",
  "chubu",
  // "cepco",
  // "rikuden",
  // "kepco",
  // "yonden",
  // "kyuden",
  // "okiden",
] as const;

export type Utilities = (typeof supportedUtilities)[number];

export interface DenkiCarbonV2QueryParams {
  tso: string;
  from: string;
  to: string;
  includeForecast: boolean;
}
export interface DenkiCarbonV2 {
  tso: string;
  datetimeFrom: DateTime;
  datetimeTo: DateTime;
  carbonIntensity?: number;
  averagePredictedCarbonIntensity?: number;
  predictedCarbonIntensity?: number;
}
const defaultDenkiCarbonV2: DenkiCarbonV2[] = [
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

  // const cache = {};

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
function createAPIInterface<DataType, PathFormat>(
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
    ...restOfPathVariables: PathFormat[]
  ): Promise<void> => {
    setData(defaultData);

    const cacheData = cache.getCache(utility);
    if (cacheData) {
      console.log(`Got ${endpointPath} for ${utility} from Local Cache`);
      return setData(cacheData);
    }

    const requestURL = restOfPathVariables.reduce(
      (fullPath, currentVar) => `${fullPath}/${currentVar}`,
      `${apiURL}/${endpointPath}/${utility}`
    );
    const response = await fetch(requestURL);

    if (response.ok === false) {
      console.error("API Call Failed Retrying...");
      console.error(response);
      setTimeout(() => callAPI(setData, utility, ...restOfPathVariables), 2000);
      return;
    }

    const result: DataType = await response.json();

    const data: DataType = unpacker(result);

    cache.setCache(utility, data);
    setData(data);
  };
  return callAPI;
}

/**
 * Create API Interface
 *
 * @param endpointPath endpoint path, don't put '/' on the ends
 * @param defaultData the default data for useState
 * @param unpacker basic function to unpack the data down to the main array
 *
 * @returns API calling interface
 */
function createAPIV2Interface<DataType, Params>(
  defaultData: DataType,
  unpacker: (raw: any) => DataType = (raw) => raw,
  endpointPath: string
) {
  // Cache in closure
  // const cache = createCache<DataType>();

  // Return Function
  const callAPI = async (
    setData: (data: DataType) => void,
    utility: Utilities,
    params: Params
  ): Promise<void> => {
    setData(defaultData);

    // const cacheData = cache.getCache(utility);
    // if (cacheData) {
    //   console.log(`Got ${endpointPath} for ${utility} from Local Cache`);
    //   return setData(cacheData);
    // }

    const requestURL =
      `${apiURL}/${endpointPath}?` +
      new URLSearchParams(params as Record<string, string>);
    const response = await fetch(requestURL);

    if (response.ok === false) {
      console.error("API Call Failed Retrying...");
      console.error(response);
      // setTimeout(() => callAPI(setData, utility, params), 2000);
      return;
    }

    const result: DataType = await response.json();

    const data: DataType = unpacker(result);

    // cache.setCache(utility, data);
    setData(data);
  };
  return callAPI;
}

const retriveDataDenkiCarbonV2 = createAPIV2Interface<
  DenkiCarbonV2[],
  DenkiCarbonV2QueryParams
>(
  defaultDenkiCarbonV2,
  (raw: Record<string, string>[]): DenkiCarbonV2[] => {
    return raw.map((raw) => ({
      ...raw,
      datetimeFrom: DateTime.fromISO(raw.datetimeFrom),
      datetimeTo: DateTime.fromISO(raw.datetimeTo),
    })) as DenkiCarbonV2[]; // Trust me bro
  },
  "v1/area_data"
);

export const denkiCarbon = {
  denkiCarbonV2: {
    default: defaultDenkiCarbonV2,
    retrive: retriveDataDenkiCarbonV2,
  },
};
export default denkiCarbon;
