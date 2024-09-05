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
    // const requestQueue = await Apify.openRequestQueue();
    const input = await Apify.getInput();
    // GETTING PARAMS FROM THE INPUT
    const queryParameters = await parseInput(input);
    let { maxResults } = input;
    const { proxyConfig } = input;

    const proxy = await proxyConfiguration({ proxyConfig });
    if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE;
    const params = querystring.stringify(queryParameters);
    const firstUrl = `${BASE_URL}${params}`;
    // ADDING TO THE QUEUE FIRST PAGE TO GET TOKEN
    // await requestQueue.addRequest({
    //     url: firstUrl,
    //     userData: {
    //         page: 1,
    //         label: 'START',
    //         searchResults: [],
    //         itemsToSave: [],
    //         savedItems: 0,
    //         maxResults,
    //     },
    // });

    // CRAWLER
    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxConcurrency: 1,
        useSessionPool: true,
        proxyConfiguration: proxy, // Use proxy in the CheerioCrawler configuration
        handlePageFunction: async ({ request, $, response, body, session }) => {
            const { url, userData: { label } } = request;
            log.info('Page opened.', { label, url });

            // You can still use requestAsBrowser if needed, but typically CheerioCrawler handles page fetching
            // const { cookies } = await getToken("https://www.kickstarter.com/discover/advanced?term=3d%20print&sort=newest&page=1", session, proxy);
            // const jsonResponse = await requestAsBrowser({
            //     url: "https://www.kickstarter.com/projects/romain-p/modular-wizard-tower-1?ref=discovery&term=modular-wizard-tower-1&total_hits=1&category_id=34",
            //     proxyUrl: proxy.newUrl(session.id),
            //     headers: {
            //         Accept: 'application/json, text/javascript, */*; q=0.01',
            //         'X-Requested-With': 'XMLHttpRequest',
            //         Cookie: cookies,
            //     },
            //     responseType: 'json',
            // });

            // Log or process the JSON response
            console.log(util.inspect(body));
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            log.error(`Request ${request.url} failed repeatedly, running out of retries (Error: ${error.message})`);
        },
    });

    log.info('Starting crawler');
    await crawler.run();
    log.info('Crawler finished');
});
