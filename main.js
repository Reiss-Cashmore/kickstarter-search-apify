const Apify = require('apify');
const querystring = require('querystring');
const { utils: { log, requestAsBrowser } } = Apify;
const { parseInput, proxyConfiguration, getToken } = require('./src/utils');
const { BASE_URL, PROJECTS_PER_PAGE } = require('./src/consts');
const { handleStart, handlePagination } = require('./src/routes');
var util = require('util')

Apify.main(async () => {
    const requestList = new Apify.RequestList({
        sources: [{ url: 'https://www.kickstarter.com/projects/romain-p/modular-wizard-tower-1?ref=discovery&term=modular-wizard-tower-1&total_hits=1&category_id=34' }],
    });
    await requestList.initialize();

    const input = await Apify.getInput();
    const queryParameters = await parseInput(input);
    let { maxResults } = input;
    const { proxyConfig } = input;

    const proxy = await proxyConfiguration({ proxyConfig });
    if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE;
    const params = querystring.stringify(queryParameters);
    const firstUrl = `${BASE_URL}${params}`;

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        maxConcurrency: 1,
        useSessionPool: true,
        launchContext: {
            // Launch options for Puppeteer
            launchOptions: {
                headless: true, // Run browser in headless mode
                args: proxy ? [`--proxy-server=${proxy.newUrl()}`] : [], // Use proxy if configured
            },
        },
        handlePageFunction: async ({ request, page, browserController }) => {
            const { url, userData: { label } } = request;
            log.info('Page opened.', { label, url });

            // Use Puppeteer's page object to interact with the website
            await page.waitForSelector('body'); // Ensure page has loaded

            // Extracting content from the page (modify this according to your scraping needs)
            const bodyHTML = await page.content();

            // Optionally, you can log the page content for debugging
            console.log(util.inspect(bodyHTML));

            // Push data to the Apify dataset
            await Apify.pushData({ bodyHTML });
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            log.error(`Request ${request.url} failed repeatedly, running out of retries (Error: ${error.message})`);
        },
    });

    log.info('Starting crawler');
    await crawler.run();
    log.info('Crawler finished');
});
