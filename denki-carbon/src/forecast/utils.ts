import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { JapanTsoName } from "../const";
import { logger } from "../utils";

export const getBlockInDay = (datetime: Date): number => {
  return datetime.getHours() * 2 + Math.floor(datetime.getMinutes() / 30);
};

/**
 * @param {string} directoryPath
 * @returns {Promise<string[]>} - Array of long file paths
 */
export async function getFilesInFolder(directoryPath: string) {
  try {
    const fileNames = await readdir(directoryPath); // returns a JS array of just short/local file-names, not paths.
    const filePaths = fileNames.map((fn) => join(directoryPath, fn));
    return filePaths;
  } catch (err) {
    logger.error(err); // depending on your application, this `catch` block (as-is) may be inappropriate; consider instead, either not-catching and/or re-throwing a new Error with the previous err attached.
  }
}

/**
 * Create a model name based on the TSO and a time-based hash suffix
 *
 * @param tso
 * @returns {string}
 */
export const getModelName = (tso: JapanTsoName): string => {
  return `carbonintensity-${tso}-${Date.now().toString(36)}`;
};
