// Import necessary libraries from Apify SDK and Crawlee
import { Actor } from 'apify'; // Updated Actor import remains valid
import log from '@apify/log';
import { gotScraping } from 'got-scraping'; // Replacing requestAsBrowser for making HTTP requests
import moment from 'moment';
import * as cheerio from 'cheerio';

import { EMPTY_SELECT, LOCATION_SEARCH_ACTOR_ID, DEFAULT_SORT_ORDER, DATE_FORMAT } from './consts.js';
import { statuses, categories, pledges, goals, raised, sorts } from './filters.js';

// Clean project function (no major changes here)
export function cleanProject(project) {
    const cleanedProject = {
        ...project,
        image: project.photo?.full ?? null,
        creatorId: project.creator?.id ?? null,
        creatorName: project.creator?.name ?? null,
        creatorAvatar: project.creator?.avatar?.medium ?? null,
        creatorUrl: project.creator?.urls?.web?.user ?? null,
        locationId: project.location?.id ?? null,
        locationName: project.location?.displayable_name ?? null,
        categoryId: project.category?.id ?? null,
        categoryName: project.category?.name ?? null,
        categorySlug: project.category?.slug ?? null,
        url: project.urls?.web?.project ?? null,
        title: project.name,
        description: `<img src="${project.photo?.full}"> ${project.blurb}`,
        link: project.urls?.web?.project ?? null,
        pubDate: moment.unix(project.launched_at).format(DATE_FORMAT),
        created_at_formatted: moment.unix(project.created_at).format(DATE_FORMAT),
        launched_at_formatted: moment.unix(project.launched_at).format(DATE_FORMAT),
    };

    // Removing unnecessary properties
    delete cleanedProject.creator;
    delete cleanedProject.location;
    delete cleanedProject.category;
    delete cleanedProject.urls;
    delete cleanedProject.profile;

    return cleanedProject;
}

// The rest of the file remains the same


// Function to process location (uses the Actor.call() function)
export async function processLocation(location) {
    log.info(`Querying Kickstarter for location ID of "${location}"...`);

    // Call another actor to get the location ID
    const run = await Actor.call(LOCATION_SEARCH_ACTOR_ID, { query: location });
    if (run.status !== 'SUCCEEDED') {
        log.warning(`Actor ${LOCATION_SEARCH_ACTOR_ID} did not finish correctly. Please check your "location" field in the input, and try again.`);
        return;
    }

    // Get locations
    const { locations } = run.output.body;
    if (!locations.length) {
        log.warning(`Location "${location}" was not found. Please check your "location" field in the input, and try again.`);
        return;
    }

    log.info(`Location found, woe_id is - ${locations[0].id}`);
    return locations[0].id;
}

// Function to parse input and generate queryParams
export async function parseInput(input) {
    if (!input) {
        log.warning('Key-value store does not contain INPUT. Actor will be stopped.');
        return;
    }

    const queryParams = { woe_id: 0 };

    // Filter out empty filter values
    const filledInFilters = {};
    Object.keys(input).forEach((key) => {
        const filterValue = (typeof input[key] === 'string') ? input[key].trim() : input[key];
        if (!filterValue || filterValue === EMPTY_SELECT) return;
        filledInFilters[key] = filterValue;
    });

    // Process search term
    if (filledInFilters.query) queryParams.term = filledInFilters.query;

    // Process category
    if (filledInFilters.category) {
        const fromInputLowerCase = filledInFilters.category.toLowerCase();
        const foundCategories = categories.filter((category) => {
            return fromInputLowerCase === category.slug.toLowerCase();
        });

        if (!foundCategories.length) {
            log.warning(`Input parameter "category" contains invalid value: "${filledInFilters.category}". Please check the input. Actor will be stopped`);
            return;
        }
        queryParams.category_id = foundCategories[0].id;
    }

    // Process status
    if (filledInFilters.status) {
        const state = statuses[filledInFilters.status];
        if (!state) {
            log.warning(`Input parameter "status" contains invalid value: "${filledInFilters.state}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.state = state;
    }

    // Process pledged
    if (filledInFilters.pledged) {
        const pledged = pledges.indexOf(filledInFilters.pledged.toLowerCase());
        if (pledged === -1) {
            log.warning(`Input parameter "pledged" contains invalid value: "${filledInFilters.pledged}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.pledged = pledged;
    }

    // Process goal
    if (filledInFilters.goal) {
        const goal = goals.indexOf(filledInFilters.goal.toLowerCase());
        if (goal === -1) {
            log.warning(`Input parameter "goal" contains invalid value: "${filledInFilters.goal}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.goal = goal;
    }

    // Process raised
    if (filledInFilters.raised) {
        const amountRaised = raised.indexOf(filledInFilters.raised.toLowerCase());
        if (amountRaised === -1) {
            log.warning(`Input parameter "raised" contains invalid value: "${filledInFilters.raised}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.raised = amountRaised;
    }

    // Process sort
    if (filledInFilters.sort) {
        const sort = sorts.indexOf(filledInFilters.sort.toLowerCase());
        if (sort === -1) {
            log.warning(`Input parameter "sort" contains invalid value: "${filledInFilters.sort}". Please check the input. Actor will be stopped.`);
            return;
        }
        queryParams.sort = filledInFilters.sort.toLowerCase();
    } else {
        queryParams.sort = DEFAULT_SORT_ORDER;
    }

    // Process location
    if (filledInFilters.location) {
        queryParams.woe_id = await processLocation(filledInFilters.location);
    }

    queryParams.page = 1;
    return queryParams;
}

// Function to get token and cookies (using gotScraping instead of requestAsBrowser)
export async function getToken(url, session, proxyConfiguration) {
    const proxyUrl = proxyConfiguration.newUrl(session.id);

    // Make request with gotScraping (replacing requestAsBrowser)
    const response = await gotScraping({
        url,
        proxyUrl,
    });

    // Load the seed and cookies from the response
    const $ = cheerio.load(response.body);
    const seed = $('.js-project-group[data-seed]').attr('data-seed');
    const cookies = (response.headers['set-cookie'] || []).map((s) => s.split(';', 2)[0]).join('; ');

    if (!seed) {
        throw new Error('Could not resolve seed. Will retry...');
    }

    return { seed, cookies };
}

// Function to notify about Kickstarter result limits
export function notifyAboutMaxResults(foundProjects, limit) {
    log.info('|');
    log.info(`| Found ${foundProjects} projects in total.`);
    log.info(`| Will output: ${limit} projects.`);
    log.info('|');
}

// Proxy configuration utility
export const proxyConfiguration = async ({ proxyConfig, required = true, force = Actor.isAtHome(), blacklist = ['GOOGLESERP'], hint = [] }) => {
    const configuration = await Actor.createProxyConfiguration(proxyConfig);
    // Ensure the correct proxy is used when required
    if (Actor.isAtHome() && required) {
        if (!configuration || (!configuration.usesApifyProxy && (!configuration.proxyUrls || !configuration.proxyUrls.length)) || !configuration.newUrl()) {
            throw new Error('\n=======\nYou must use Apify proxy or custom proxy URLs\n\n=======');
        }
    }

    // Check if the proxy groups are allowed
    if (force && configuration && configuration.usesApifyProxy) {
        if (blacklist.some((blacklisted) => (configuration.groups || []).includes(blacklisted))) {
            throw new Error(`\n=======\nThese proxy groups cannot be used in this actor. Choose another group or contact support.\n\n`);
        }

        if (hint.length && !hint.some((group) => (configuration.groups || []).includes(group))) {
            log.info(`\n=======\nYou can pick specific proxy groups for better experience:\n\n* ${hint.join('\n* ')}\n\n=======`);
        }
    }

    return configuration;
};
