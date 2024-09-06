import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import * as cheerio from 'cheerio';
import querystring from 'querystring';
import { parseInput, proxyConfiguration} from './utils.js';
import { handleStart, handlePagination } from './routes.js';
import { BASE_URL, PROJECTS_PER_PAGE } from './consts.js';

// Initialize the Apify SDK
await Actor.init();

const startUrls = ['https://www.kickstarter.com/projects/bitbotmedia/legacy-of-kain-soul-reaver-prequel-graphic-novel?ref=section-homepage-featured-project&category_id=Q2F0ZWdvcnktMjUy'];

const requestQueue = await Actor.openRequestQueue();
const input = await Actor.getInput();
const queryParameters = await parseInput(input);
let { maxResults } = input;
const { proxyConfig } = input;
const proxy = await proxyConfiguration({ proxyConfig });
const configuration = await Actor.createProxyConfiguration(proxyConfig);
console.log(configuration, proxyConfig)

if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE;
const params = querystring.stringify(queryParameters);
const firstUrl = `${BASE_URL}${params}&google_chrome_workaround`;

// Adding the first page to the queue to get the token
await requestQueue.addRequest({
    url: firstUrl,
    userData: {
        page: 1,
        label: 'START',
        searchResults: [],
        itemsToSave: [],
        savedItems: 0,
        maxResults,
    },
});

// Define Playwright Crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxy,
    requestHandler: async ({ page, request }) => {
        const { url, userData: { label } } = request;

        // Switch between handling different labels
        switch (label) {
            case 'START':
                await handleStart({ request, page, session: request.session }, queryParameters, requestQueue, proxy, maxResults);
                break;
            case 'PAGINATION-LIST':
                await handlePagination({ request, page, session: request.session }, requestQueue, proxy);
                break;
            default:
                // Default action (this could handle scraping additional pages or doing extra logic)
                console.log(`Processing URL: ${url}`);
                
                // Wait for the target CSS selector
                const targetSelector = 'CSS_SELECTOR'; // Replace with the actual selector
                await page.waitForSelector(targetSelector);

                // Get page content and parse it with Cheerio
                const content = await page.content();
                const $ = cheerio.load(content);
                const htmlContent = $(targetSelector).html();

                if (htmlContent) {
                    console.log(`Extracted content from ${targetSelector}`);
                    await Actor.pushData({
                        url: request.url,
                        extractedHtml: htmlContent,
                    });
                } else {
                    console.log(`No content found for the selector: ${targetSelector}`);
                }
                break;
        }
    },
    handleFailedRequestFunction: async ({ request, error }) => {
        console.error(`Request ${request.url} failed repeatedly. Error: ${error.message}`);
    },
});

// Run the crawler with the provided start URLs
await crawler.run(startUrls);

// Exit successfully
await Actor.exit();
