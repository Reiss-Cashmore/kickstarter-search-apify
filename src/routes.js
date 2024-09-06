import { createPlaywrightRouter, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import log from '@apify/log';
import { cleanProject, getToken, notifyAboutMaxResults } from './utils.js';
import { BASE_URL, MAX_PAGES, PROJECTS_PER_PAGE } from './consts.js';

// Create the Playwright router
export const router = createPlaywrightRouter();

router.addHandler('START', async ({ request, page, log, requestQueue, session }) => {
    const { query, maxResults, proxyConfig } = request.userData;
    const { seed, cookies } = await getToken(request.url, session, proxyConfig);

    const pageNum = 1;
    const totalProjects = 0;
    const savedProjects = 0;
    const maximumResults = Math.min(maxResults, MAX_PAGES * PROJECTS_PER_PAGE);
    const savedProjectIds = [];

    const params = new URLSearchParams({
        ...query,
        page: pageNum,
        seed,
    }).toString();
    const listUrl = `${BASE_URL}${params}`;

    // Add the first pagination page to the queue
    await requestQueue.addRequest({
        url: listUrl,
        userData: {
            cookies,
            page: pageNum,
            label: 'PAGINATION-LIST',
            totalProjects,
            savedProjects,
            maximumResults,
            savedProjectIds,
        },
    });

    log.info(`First page of projects added for URL: ${request.url}`);
});

router.addHandler('PAGINATION-LIST', async ({ request, log, requestQueue, session }) => {
    let { page, totalProjects, savedProjects } = request.userData;
    const { cookies, maximumResults, savedProjectIds } = request.userData;

    // Make the request using gotScraping
    const { body } = await gotScraping({
        url: request.url,
        proxyUrl: session.proxyUrl,  // Assuming session has a proxy URL
        headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookies,
        },
        responseType: 'json',
    });

    // If it's the first page, log the total hits and limit the results
    if (page === 1) {
        log.info(`Page ${page}: Found ${body.total_hits} projects in total.`);
        if (body.total_hits > maximumResults) {
            notifyAboutMaxResults(body.total_hits, maximumResults);
        }
        totalProjects = Math.min(body.total_hits, maximumResults);
    }

    log.info(`Number of saved projects so far: ${savedProjects}`);
    let projectsToSave;
    try {
        // Slice the projects to save within the maximum result limits and clean them
        projectsToSave = body.projects.slice(0, maximumResults - savedProjects).map(cleanProject);
    } catch (e) {
        throw new Error('The page didn\'t load as expected, will retry...');
    }

    const { seed } = body;

    // Save new projects
    if (projectsToSave.length > 0) {
        const newProjects = projectsToSave.filter((project) => !savedProjectIds.includes(project.id));
        newProjects.forEach((project) => savedProjectIds.push(project.id));

        await Dataset.pushData(newProjects);
        log.info(`Page ${page}: Saved ${newProjects.length} projects.`);
        if (newProjects.length !== projectsToSave.length) {
            log.info(`Found ${projectsToSave.length - newProjects.length} duplicates in the request.`);
        }

        savedProjects += newProjects.length;
    }

    // Check if there are more results and add the next page to the queue
    const hasMoreResults = body.has_more;
    if (hasMoreResults && savedProjects < totalProjects) {
        page++;
        const nextPage = request.url
            .replace(/page=([0-9.]+)/, `page=${page}`)
            .replace(/seed=([0-9.]+)/, `seed=${seed}`);

        await requestQueue.addRequest({
            url: nextPage,
            userData: {
                label: 'PAGINATION-LIST',
                page,
                savedProjects,
                maximumResults,
                totalProjects,
                savedProjectIds,
            },
        });

        log.info(`Enqueued next page (${page}) of projects.`);
    }
});

// Default handler for other pages (optional - you can add more specific handlers)
router.addDefaultHandler(async ({ enqueueLinks, log }) => {
    log.info(`Enqueueing new URLs for the next batch...`);
    await enqueueLinks({
        globs: ['https://www.kickstarter.com/*'],
        label: 'PAGINATION-LIST',
    });
});
