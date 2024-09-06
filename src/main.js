import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js'; // Import the router from routes.js
import { parseInput, proxyConfiguration } from './utils.js';
import { BASE_URL, PROJECTS_PER_PAGE } from './consts.js';

// Initialize the Apify SDK
await Actor.init();

// Fetch the input parameters for the crawler
const input = await Actor.getInput();
const requestQueue = await Actor.openRequestQueue(); // Open or create the request queue
const queryParameters = await parseInput(input); // Parse input for filters, etc.

let { maxResults } = input;
if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE; // Set default max results

const { proxyConfig } = input;
const proxy = await proxyConfiguration({ proxyConfig }); // Configure proxy

// Generate the first URL to start crawling (base Kickstarter URL with query parameters)
const params = new URLSearchParams(queryParameters).toString();
const firstUrl = `${BASE_URL}${params}&google_chrome_workaround`;

// Add the first page request to the queue with the label 'START'
await requestQueue.addRequest({
    url: firstUrl,
    userData: {
        label: 'START',
        query: queryParameters,
        maxResults,
        proxyConfig,
    },
});

// Set up the PlaywrightCrawler with the router
const crawler = new PlaywrightCrawler({
    requestQueue,  // The request queue used by the crawler
    proxyConfiguration: proxy,  // Proxy settings
    requestHandler: router,  // Use the router from routes.js
});

// Run the crawler
await crawler.run();

// Exit successfully after the crawl is completed
await Actor.exit();
