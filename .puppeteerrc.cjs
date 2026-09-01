const { join } = require('path');

/**
 * Фиксира кеш директорията на Puppeteer към проектно-относителен път,
 * за да съвпада мястото на инсталация по време на build с мястото,
 * от което runtime търси Chrome (на Render те могат да се различават).
 * https://pptr.dev/guides/configuration
 */
module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
