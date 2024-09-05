const Apify = require('apify');
const querystring = require('querystring');
const { BASE_URL, PROJECTS_PER_PAGE } = require('./src/consts');
var util = require('util')
const log = require('@apify/log');
const {PlaywrightCrawler} = require('@crawlee/playwright');

async function parseInput(input) {
    if (!input) {
        log.warning('Key-value store does not contain INPUT. Actor will be stopped.');
        return;
    }
    const queryParams = {
    };

    // FILTER OUT EMPTY FILTER VALUES
    const filledInFilters = {};
    Object.keys(input).forEach((key) => {
        const filterValue = (typeof (input[key]) === 'string') ? input[key].trim() : input[key];
        if (!filterValue || filterValue === EMPTY_SELECT) return;
        filledInFilters[key] = filterValue;
    });

    // process search term
    if (filledInFilters.query) queryParams.term = filledInFilters.query;

    // process category
    if (filledInFilters.category) {
        const fromInputLowerCase = filledInFilters.category.toLowerCase();
        const foundCategories = categories.filter((category) => {
            return fromInputLowerCase.category === category.id || fromInputLowerCase === category.slug.toLowerCase();
        });

        if (!foundCategories.length) {
            log.warning(`Input parameter "category" contains invalid value: "${filledInFilters.category}".\n
            Please check the input. Actor will be stopped`);
            return;
        }
        queryParams.category_id = foundCategories[0].id;
    }

    // process status
    if (filledInFilters.status) {
        const state = statuses[filledInFilters.status];
        if (!state) {
            log.warning(`Input parameter "status" contains invalid value: "${filledInFilters.state}".\n
            Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.state = state;
    }

    // process pledged
    if (filledInFilters.pledged) {
        const pledged = pledges.indexOf(filledInFilters.pledged.toLowerCase());
        if (pledged === -1) {
            log.warning(`Input parameter "pledged" contains invalid value: "${filledInFilters.pledged}".\n
            Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.pledged = pledged;
    }

    // process goal
    if (filledInFilters.goal) {
        const goal = goals.indexOf(filledInFilters.goal.toLowerCase());
        if (goal === -1) {
            log.warning(`Input parameter goal contains invalid value: "${filledInFilters.goal}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.goal = goal;
    }

    // process raised
    if (filledInFilters.raised) {
        const amountRaised = raised.indexOf(filledInFilters.raised.toLowerCase());
        if (amountRaised === -1) {
            log.warning(`Input parameter "raised" contains invalid value: "${filledInFilters.raised}".\n
            Please check the input. Actor will be finished.`);
            return;
        }
        queryParams.raised = amountRaised;
    }

    // process raised
    if (filledInFilters.sort) {
        const sort = sorts.indexOf(filledInFilters.sort.toLowerCase());
        if (sort === -1) {
            log.warning(`Input parameter "sort" contains invalid value: "${filledInFilters.sort}". Please check the input. Actor will be stopped`);
            return;
        }
        queryParams.sort = filledInFilters.sort.toLowerCase();
    } else {
        queryParams.sort = DEFAULT_SORT_ORDER;
    }

    if (filledInFilters.location) queryParams.woe_id = filledInFilters.location;

    queryParams.page = 1;

    return queryParams;
}

const proxyConfiguration = async ({
    proxyConfig,
    required = true,
    force = Apify.Actor.isAtHome(),
    blacklist = ['GOOGLESERP'],
    hint = [],
}) => {
    const configuration = await Apify.Actor.createProxyConfiguration(proxyConfig);

    // this works for custom proxyUrls
    if (Apify.Actor.isAtHome() && required) {
        if (!configuration || (!configuration.usesApifyProxy && (!configuration.proxyUrls || !configuration.proxyUrls.length)) || !configuration.newUrl()) {
            throw new Error('\n=======\nYou must use Apify proxy or custom proxy URLs\n\n=======');
        }
    }

    // check when running on the platform by default
    if (force) {
        // only when actually using Apify proxy it needs to be checked for the groups
        if (configuration && configuration.usesApifyProxy) {
            if (blacklist.some((blacklisted) => (configuration.groups || []).includes(blacklisted))) {
                throw new Error(`\n=======\nThese proxy groups cannot be used in this actor. Choose other group or contact support@apify.com to give you proxy trial:\n\n*  ${blacklist.join('\n*  ')}\n\n=======`);
            }

            // specific non-automatic proxy groups like RESIDENTIAL, not an error, just a hint
            if (hint.length && !hint.some((group) => (configuration.groups || []).includes(group))) {
                // Apify.utils.log.info(`\n=======\nYou can pick specific proxy groups for better experience:\n\n*  ${hint.join('\n*  ')}\n\n=======`);
            }
        }
    }

    return configuration;
};
















Apify.Actor.main(async () => {

    const input = await Apify.Actor.getInput();
    const queryParameters = await parseInput(input);
    let { maxResults } = input;
    const { proxyConfig } = input;

    const proxy = await proxyConfiguration({ proxyConfig });
    if (!maxResults) maxResults = 200 * PROJECTS_PER_PAGE;
    const params = querystring.stringify(queryParameters);
    const firstUrl = `${BASE_URL}${params}`;

    // Playwright Crawler Configuration
    const crawler = new PlaywrightCrawler({
        requestList,
        maxConcurrency: 1,
        useSessionPool: true,
        launchContext: {
            // Launch options for Playwright
            launchOptions: {
                headless: true, // Run browser in headless mode
                proxy: proxy ? { server: proxy.newUrl() } : undefined, // Use proxy if configured
            },
        },
        handlePageFunction: async ({ parseWithCheerio, request, enqueueLinks, sendRequest }) => {
            const { url, userData: { label } } = request;
            log.info('Page opened.', { label, url });

            // Use Playwright's page object to interact with the website
            const $ = await parseWithCheerio();
            // Optionally, you can log the page content for debugging
            console.log(util.inspect($('body')));

            // Push data to the Apify dataset
            await Apify.Actor.pushData({ body: $('body') });
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            log.error(`Request ${request.url} failed repeatedly, running out of retries (Error: ${error.message})`);
        },
    });

    const result = await crawler.addRequests([{ url: 'https://www.kickstarter.com/projects/romain-p/modular-wizard-tower-1?ref=discovery&term=modular-wizard-tower-1&total_hits=1&category_id=34' }]);

    log.info('Starting crawler');
    await crawler.run();
    log.info('Crawler finished');
});


