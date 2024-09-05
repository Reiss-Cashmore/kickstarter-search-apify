const Apify = require('apify');
const querystring = require('querystring');
const { utils: { log, requestAsBrowser } } = Apify;
const { parseInput, proxyConfiguration, getToken } = require('./src/utils');
const { BASE_URL, PROJECTS_PER_PAGE } = require('./src/consts');
const { handleStart, handlePagination } = require('./src/routes');
var util = require('util')

Apify.main(async () => {
    const input = await Apify.getInput();
    const queryParameters = await parseInput(input);
    let { maxResults } = input;
    const { proxyConfig } = input;

    const proxy = await proxyConfiguration({ proxyConfig });
    if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE;
    const params = querystring.stringify(queryParameters);
    const firstUrl = `${BASE_URL}${params}`;

    // Playwright Crawler Configuration
    const crawler = new Apify.PlaywrightCrawler({
        headless: false,
        maxConcurrency: 1,
        useSessionPool: true,
        launchContext: {
            // Launch options for Playwright
            launchOptions: {
                headless: true, // Run browser in headless mode
                proxy: proxy ? { server: proxy.newUrl() } : undefined, // Use proxy if configured
            },
        },
        handlePageFunction: async ({ parseWithCheerio, request, enqueueLinks }) => {
            const { url, userData: { label } } = request;
            log.info('Page opened.', { label, url });

            // Use Playwright's page object to interact with the website
            const $ = await parseWithCheerio();
            // Optionally, you can log the page content for debugging
            console.log(util.inspect($('body')));

            // Push data to the Apify dataset
            await Apify.pushData({ body: $('body') });
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            log.error(`Request ${request.url} failed repeatedly, running out of retries (Error: ${error.message})`);
        },
    });
    await crawler.addRequests([{
        url: 'https://www.kickstarter.com/projects/romain-p/modular-wizard-tower-1?ref=discovery&term=modular-wizard-tower-1&total_hits=1&category_id=34',
        label: 'start-url',
    }]);
    log.info('Starting crawler');
    await crawler.run();
    log.info('Crawler finished');
});
