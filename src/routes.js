import { Dataset, createPlaywrightRouter } from 'crawlee';

export const router = createPlaywrightRouter();

router.addDefaultHandler(async ({ enqueueLinks, log, request }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });
    

    await Dataset.pushData({
        url: request.loadedUrl,
        title,
    });
});

router.addHandler('detail', async ({ request, page, log }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });
    

    await Dataset.pushData({
        url: request.loadedUrl,
        title,
    });
});