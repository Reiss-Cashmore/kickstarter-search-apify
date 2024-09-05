/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://docs.apify.com/sdk/js
import { Actor } from 'apify';
// For more information, see https://crawlee.dev
import { PlaywrightCrawler } from 'crawlee';
// Import Cheerio for parsing
import * as cheerio from 'cheerio';

// Initialize the Apify SDK
await Actor.init();

// Start URL
const startUrls = ['https://www.kickstarter.com/projects/bitbotmedia/legacy-of-kain-soul-reaver-prequel-graphic-novel?ref=section-homepage-featured-project&category_id=Q2F0ZWdvcnktMjUy']

// Create proxy configuration
const proxyConfiguration = await Actor.createProxyConfiguration();

// Define the crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    requestHandler: async ({ page, request }) => {
        console.log(`Processing ${request.url}...`);

        // Replace 'CSS_SELECTOR' with the actual CSS selector you want to target
        const targetSelector = 'project-content';

        // Wait for the target selector to appear in the page
        await page.waitForSelector(targetSelector, { timeout: 3000 }); // waits for 30 seconds for the selector to appear

        // Get the page content
        const content = await page.content();

        // Load the content into Cheerio for DOM manipulation
        const $ = cheerio.load(content);

        // Extract the HTML content from the target selector
        const htmlContent = $(targetSelector).html();

        if (htmlContent) {
            console.log(`Extracted content from ${targetSelector}`);

            // Push the extracted HTML to Apify
            await Actor.pushData({
                url: request.url,
                extractedHtml: htmlContent
            });
        } else {
            console.log(`No content found for the selector: ${targetSelector}`);
        }
    },
});

// Run the crawler with the provided start URLs
await crawler.run(startUrls);

// Exit successfully
await Actor.exit();
