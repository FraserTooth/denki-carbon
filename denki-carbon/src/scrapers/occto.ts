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

const getDownloadForm = async (axiosInstance: AxiosInstance) => {
  // Prep the initial request
  const formData = {
    "fwExtention.actionType": "reference",
    "fwExtention.actionSubType": "ok",
    "fwExtention.pagingTargetTable": "",
    "fwExtention.pathInfo": "CF01S010C",
    "fwExtention.prgbrh": "0",
    "fwExtention.formId": "CF01S010P",
    "fwExtention.jsonString": "",
    ajaxToken: "",
    requestToken: "03bd32af34123a83f3da0290698663a71dfd036bc11f3759",
    requestTokenBk: "",
    transitionContextKey: "DEFAULT",
    tabSntk: "0",
    downloadKey: "20240902151333_CF01S010C",
    akyuryTkKkn: "(2022〜2033)",
    akyuryYrKkn: "(2017〜2025)",
    akyuryMnKkn: "(2016/07〜2024/10)",
    akyuryWkKkn: "(2016/06/04〜2024/09/13)",
    akyuryYokYokDayKkn: "(2016/06/04〜2024/09/04)",
    akyuryNdKkn: "(2016/06/02〜2024/09/02)",
    akyuryTdKkn: "(2024/09/02)",
    dvlSlashLblUpdaf: "1",
    pchgFkaknKkn: "(2016/09/13〜2018/09/30)",
    tchgFkaknKkn: "(2016/09/07〜2018/09/30)",
    rklDataKnd: "11",
    rklFlowRsltKkn: "(2023/04/01〜2024/09/02)",
    tchgRecptStopInfKkn: "(2016/09/08〜2024/08/26)",
    rklNnd: "2024",
    rklNndHdn:
      "2033,2033,2032,2032,2031,2031,2030,2030,2029,2029,2028,2028,2027,2027,2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    rklNngpFrom: "2024/09/02",
    rklNngpTo: "2024/09/02",
    rklNngp: "2024/09/02",
    rklYear: "2024",
    rklYearHdn:
      "2033,2033,2032,2032,2031,2031,2030,2030,2029,2029,2028,2028,2027,2027,2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    monthCd: "09",
    rklYearFrom: "2024",
    rklYearFromHdn:
      "2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    monthCdFrom: "09",
    rklYearTo: "2025",
    rklYearToHdn:
      "2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    monthCdTo: "09",
    // allTgtRklSectDwld: "Y",
    rklNmHdn:
      "01,北海道-本州間,02,東北-東京間,03,東京-中部間,04,中部-関西間,05,中部-北陸間,06,北陸-関西間,07,関西-中国間,08,関西-四国間,09,中国-四国間,10,中国-九州間,11,中部・関西-北陸間,12,関西-中国間（東）,13,関西-中国間（西）",
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
    // Also get the Hokuriku Fence
    // rkl11: "11",
    checkedRklNmHdn:
      "北海道-本州間,東北-東京間,東京-中部間,中部-関西間,中部-北陸間,北陸-関西間,関西-中国間,関西-四国間,中国-四国間,中国-九州間",
    // Also get the Hokuriku Fence
    // "北海道-本州間,東北-東京間,東京-中部間,中部-関西間,中部-北陸間,北陸-関西間,関西-中国間,関西-四国間,中国-四国間,中国-九州間,中部・関西-北陸間",
    areaDataKnd: "22",
    koikRcvKoikBlockWkKkn: "(2023/04/01〜2024/09/13)",
    koikRcvKoikBlockYokYokDayKkn: "(2024/03/13〜2024/09/03)",
    koikRcvKoikBlockNdKkn: "(2023/04/01〜2024/09/02)",
    koikRcvKoikBlockTdKkn: "(2024/09/02)",
    koikRcvAreaKoikBlockWkKkn: "(2023/04/01〜2024/09/13)",
    koikRcvAreaKoikBlockYokYokDayKkn: "(2024/03/13〜2024/09/03)",
    koikRcvAreaKoikBlockNdKkn: "(2023/04/01〜2024/09/02)",
    koikRcvAreaKoikBlockTdKkn: "(2024/09/02)",
    hoseiRyokinSanteiIndexNdKkn: "(2023/04/01〜2024/03/31)",
    hoseiRyokinSanteiIndexTdKkn: "(2024/09/02)",
    elJyyuPekInfTkKkn: "",
    elJyyuPekInfYrKkn: "(2016〜2025)",
    elJyyuPekInfMnKkn: "(2016/05〜2024/10)",
    elJyyuPekInfWkKkn: "(2016/04/09〜2024/09/13)",
    elJyyuPekInfYokYokDayKkn: "(2024/03/13〜2024/09/03)",
    elJyyuPekInfNdKkn: "(2016/04/01〜2024/09/02)",
    elJyyuPekInfTdKkn: "(2016/04/01〜2024/09/02)",
    elcForecastElCmpnyFmtKkn: "(2016/04/09〜2024/09/03)",
    tjyyuSyuuha50HzPwrsysKkn: "(2016/04/07〜2024/09/02)",
    tjyyuSyuuha60HzPwrsysKkn: "(2016/04/07〜2024/09/02)",
    jyyuRsltYrKkn: "(2016〜2024)",
    jyyuRsltMnKkn: "(2016/04〜2024/09)",
    jyyuRsltDbtKkn: "(2016/04/01〜2024/09/01)",
    abbSdlUnyrYsuFlowTkKkn: "(2016〜2028)",
    abbSdlUnyrYsuFlowYrKkn: "(2016〜2024)",
    abbSdlUnyrYsuFlowTdKkn: "(2024/09/02)",
    abbsdlUnyrYsuflowRsltkkn: "(2023/04/01〜2024/09/03)",
    abbFlowRsltKkn: "(2023/04/01〜2024/09/02)",
    sgSplnRsltKkn: "(2016/03/19〜9999/12/31)",
    fltInfKkn: "(2016/07/29〜2024/08/27)",
    reEnYksRsltNndKkn: "(2015/05〜2024/09)",
    reEnYksRsltNngtKkn: "(2015/05〜2024/09)",
    areaNnd: "2024",
    areaNndHdn:
      "2033,2033,2032,2032,2031,2031,2030,2030,2029,2029,2028,2028,2027,2027,2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    areaNngpFrom: "2024/09/02",
    areaNngpTo: "2024/09/02",
    areaNngp: "2024/09/02",
    areaYear: "2024",
    areaYearHdn:
      "2026,2026,2025,2025,2024,2024,2023,2023,2022,2022,2021,2021,2020,2020,2019,2019",
    monthCd2: "09",
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
  timestamp: DateTime;
  interconnector: JapanInterconnectors;
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

  logger.info("Scraping OCCTO interconnector data, logging in...");
  const cookies = await getOcctoCookies(axiosInstance);
  axiosInstance.defaults.headers.Cookie = cookies.join("; ");

  logger.info("Getting download link...");
  const formData = await getDownloadForm(axiosInstance);

  logger.info("Downloading OCCTO interconnector data...");
  const rawCsv = await downloadFile(axiosInstance, formData);

  const parsedData = parseCsv(rawCsv);

  logger.info(`Scraped OCCTO interconnector data, ${parsedData.length} lines`);
};

// scrapeOccto();
