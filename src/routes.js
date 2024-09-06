// Import necessary libraries from Apify SDK and Crawlee
import { Actor } from 'apify';
import { gotScraping } from 'got-scraping'; // Replacing requestAsBrowser for making HTTP requests
import querystring from 'querystring';
import { cleanProject, getToken, notifyAboutMaxResults } from './utils.js';
import { BASE_URL, MAX_PAGES, PROJECTS_PER_PAGE } from './consts.js';

// Handle the start of the crawler - Getting token and cookies
export const handleStart = async ({ request, session }, query, requestQueue, proxyConfig, maxResults) => {
    const { seed, cookies } = await getToken(request.url, session, proxyConfig);

    const page = 1;
    const totalProjects = 0;
    const savedProjects = 0;
    const maximumResults = Math.min(maxResults, MAX_PAGES * PROJECTS_PER_PAGE);
    const savedProjectIds = [];

    const params = querystring.stringify({
        ...query,
        page,
        seed,
    });
    const listUrl = `${BASE_URL}${params}`;

    // Add the first pagination page to the queue
    await requestQueue.addRequest({
        url: listUrl,
        userData: {
            cookies,
            page,
            label: 'PAGINATION-LIST',
            totalProjects,
            savedProjects,
            maximumResults,
            savedProjectIds,
        },
    });
};

// Handle the pagination - Scraping the paginated results
export const handlePagination = async ({ request, session }, requestQueue, proxyConfiguration) => {
    let { page, totalProjects, savedProjects } = request.userData;
    const { cookies, maximumResults, savedProjectIds } = request.userData;

    // Make the request using gotScraping (replacing deprecated requestAsBrowser)
    const { body } = await gotScraping({
        url: request.url,
        proxyUrl: proxyConfiguration.newUrl(session.id),
        headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookies,
        },
        responseType: 'json',
    });

    // If it's the first page, log the total hits and limit the results
    if (page === 1) {
        console.log(`Page ${page}: Found ${body.total_hits} projects in total.`);
        if (body.total_hits > maximumResults) notifyAboutMaxResults(body.total_hits, maximumResults);
        totalProjects = Math.min(body.total_hits, maximumResults);
    }

    console.log(`Number of saved projects: ${savedProjects}`);
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
        const newProjects = projectsToSave.filter((c) => !savedProjectIds.includes(c.id));
        newProjects.forEach((project) => savedProjectIds.push(project.id));

        await Actor.pushData(newProjects);
        console.log(`Page ${page}: Saved ${newProjects.length} projects.`);
        if (newProjects.length !== projectsToSave.length) {
            console.log(`Found ${projectsToSave.length - newProjects.length} duplicates in the request.`);
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
    }
};
