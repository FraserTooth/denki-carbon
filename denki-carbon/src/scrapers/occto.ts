import axios, { AxiosInstance } from "axios";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { DateTime } from "luxon";
import { INTERCONNECTOR_DETAILS, JapanInterconnectors } from "../const";
import { logger } from "../utils";

const getOcctoCookies = async (axiosInstance: AxiosInstance) => {
  const response = await axiosInstance.get(
    "http://occtonet.occto.or.jp/public/dfw/RP11/OCCTO/SD/LOGIN_login"
  );
  return response.headers["set-cookie"] || [];
};

/**
 *
 * @param axiosInstance Axios instance with cookies set
 * @param fromDatetime where FROM is inclusive
 * @param toDatetime where TO is inclusive
 * @returns Form data to download the OCCTO data
 */
const getDownloadForm = async (
  axiosInstance: AxiosInstance,
  fromDatetime: DateTime,
  toDatetime: DateTime
) => {
  // Get Date strings
  const fromDate = fromDatetime.toFormat("yyyy/MM/dd");
  const toDate = toDatetime.toFormat("yyyy/MM/dd");

  // Prep the initial request
  const formData = {
    "fwExtention.actionType": "reference",
    "fwExtention.actionSubType": "ok",
    "fwExtention.pagingTargetTable": "",
    // Standard path for all downloads
    "fwExtention.pathInfo": "CF01S010C",
    "fwExtention.prgbrh": "0",
    // Specific path for this form
    "fwExtention.formId": "CF01S010P",
    "fwExtention.jsonString": "",
    ajaxToken: "",
    requestToken: "",
    requestTokenBk: "",
    transitionContextKey: "DEFAULT",
    tabSntk: "0",
    downloadKey: "",
    dvlSlashLblUpdaf: "1",
    rklDataKnd: "11",
    rklNngpFrom: fromDate,
    rklNngpTo: toDate,
    // Each number corresponds to a different interconnector
    rkl1: "01",
    rkl2: "02",
    rkl3: "03",
    rkl4: "04",
    rkl5: "05",
    rkl6: "06",
    rkl7: "07",
    rkl8: "08",
    rkl9: "09",
    rkl10: "10",
    // Also get the Hokuriku Fence, not sure whether this is needed
    // rkl11: "11",
  };
  const downloadLinkResponse = await axiosInstance.postForm(
    "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/CF01S010C",
    formData
  );
  const dataRoot = downloadLinkResponse?.data?.root;
  if (!dataRoot || dataRoot.errFields || dataRoot.errMessage) {
    logger.error(downloadLinkResponse.data);
    throw Error("Error when getting download link. Error in response.");
  }
  const downloadLinkHeader = dataRoot?.bizRoot?.header;
  const downloadKey = downloadLinkHeader?.downloadKey?.value;
  const requestToken = downloadLinkHeader?.requestToken?.value;
  if (!downloadKey || !requestToken) {
    throw Error(
      "Error when getting download link. Missing download key or request token."
    );
  }

  // Update form data with download key and request token
  formData.downloadKey = downloadKey;
  formData.requestToken = requestToken;
  formData["fwExtention.actionSubType"] = "download";

  return formData;
};

const downloadFile = async (axiosInstance: AxiosInstance, formData: any) => {
  const downloadResponse = await axiosInstance.postForm(
    "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/CF01S010C",
    formData,
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(downloadResponse.data);
  const data = iconv.decode(buffer, "SHIFT_JIS");
  const rawCsv: string[][] = parse(data, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  });
  return rawCsv;
};

const parseCsv = (
  rawCsv: string[][]
): {
  interconnectorNameRaw: string;
  dateRaw: string;
  timeRaw: string;
  interconnector: JapanInterconnectors;
  /** Timestamp represents the END of the 5min period */
  timestamp: DateTime;
  /** Seems to be the Average Power througout the period */
  powerMW: number;
}[] => {
  // Trim the header
  const headerIndex = rawCsv.findIndex((row) => row[0] === "連系線");

  const parsedData = rawCsv.slice(headerIndex + 1).map((row) => {
    // Parse out the bits we want
    // "連系線", "対象日付", "対象時刻", "運用容量(順方向)", "運用容量(逆方向)", "広域調整枠(順方向)", "広域調整枠(逆方向)", "マージン(順方向)", "マージン(逆方向)", "空容量(順方向)", "空容量(逆方向)", "計画潮流(順方向)", "計画潮流(逆方向)", "潮流実績", "運用容量拡大分(順方向)", "運用容量拡大分(逆方向)"

    const interconnectorNameRaw = row[0];
    const dateRaw = row[1];
    const timeRaw = row[2];
    const powerMW = parseFloat(row[13]);

    // Match the interconnector name to the enum
    const interconnector = Object.values(JapanInterconnectors).find((ic) => {
      return (
        INTERCONNECTOR_DETAILS[ic as JapanInterconnectors].occtoName ===
        interconnectorNameRaw
      );
    });
    if (!interconnector) {
      logger.error(
        `Could not find interconnector for ${interconnectorNameRaw}`
      );
      throw Error("Could not find interconnector");
    }

    const timestamp = DateTime.fromFormat(
      `${dateRaw} ${timeRaw}`,
      "yyyy/MM/dd HH:mm",
      { zone: "Asia/Tokyo" }
    );
    if (!timestamp.isValid) {
      logger.error(`Invalid timestamp ${dateRaw} ${timeRaw}`);
      throw Error("Invalid timestamp");
    }

    return {
      interconnectorNameRaw,
      dateRaw,
      timeRaw,
      timestamp,
      interconnector,
      powerMW,
    };
  });

  return parsedData;
};

const scrapeOccto = async () => {
  const axiosInstance = axios.create({
    withCredentials: true,
  });

  const now = DateTime.now().setZone("Asia/Tokyo");

  // Just get today's data
  const fromDatetime = now.startOf("day");
  const toDatetime = now.startOf("day");

  logger.info("Scraping OCCTO interconnector data, logging in...");
  const cookies = await getOcctoCookies(axiosInstance);
  axiosInstance.defaults.headers.Cookie = cookies.join("; ");

  logger.info("Getting download link...");
  const formData = await getDownloadForm(
    axiosInstance,
    fromDatetime,
    toDatetime
  );

  logger.info("Downloading OCCTO interconnector data...");
  const rawCsv = await downloadFile(axiosInstance, formData);

  // Parse raw data from the CSV without changing the format
  const parsedData = parseCsv(rawCsv);

  logger.info(`Scraped OCCTO interconnector data, ${parsedData.length} lines`);

  return parsedData;
};

// await scrapeOccto();
