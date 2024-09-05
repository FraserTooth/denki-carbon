/**
 * The type of scraping to perform
 */
export enum ScrapeType {
  // Scrape all data, including old data
  All = "all",
  // Scrape only new data
  New = "new",
  // Scrape only most recent file
  Latest = "latest",
}
