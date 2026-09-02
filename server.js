const express = require('express');[cite: 1]
const puppeteer = require('puppeteer');[cite: 1]
const cors = require('cors');[cite: 1]
const axios = require('axios');[cite: 1]
const cheerio = require('cheerio');[cite: 1]

// ГЛОБАЛНА ЗАЩИТА СРЕЩУ СРИВОВЕ
process.on('unhandledRejection', (reason) => {[cite: 1]
    if (reason && reason.message && reason.message.includes('Target closed')) return;[cite: 1]
    console.error('⚠️ Засечена и изолирана асинхронна грешка:', reason);[cite: 1]
});
process.on('uncaughtException', (error) => {[cite: 1]
    console.error('⚠️ Засечена и изолирана критична грешка:', error.message);[cite: 1]
});

const app = express();[cite: 1]
app.use(cors());[cite: 1]

// КЕШ ЗА СТРИЙМОВЕТЕ
let streamCache = {[cite: 1]
    diema1: '', diema2: '', diema3: '', maxOne: '',[cite: 1]
    max1: '', max2: '', max3: '', euro1: '', euro2: '',[cite: 1]
    bnt1: '', bnt3: '', btv_comedy: '', star_channel: '', star_life: '', lastUpdated: null[cite: 1]
};

// Конфигурация на каналите за сканиране на стриймове
const channelsConfig = [[cite: 1]
    {[cite: 1]
        id: 'diema1',[cite: 1]
        name: 'Diema Sport',[cite: 1]
        pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-hd&pass=',[cite: 1]
        fallbackUrl: 'https://www.seirsanduk.online/?id=hd-diema-sport-hd&pass=&hash='[cite: 1]
    },
    { id: 'diema2', name: 'Diema Sport 2', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-2-hd&pass=' },[cite: 1]
    { id: 'diema3', name: 'Diema Sport 3', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-3-hd&pass=' },[cite: 1]
    { id: 'maxOne', name: 'Max One', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-one-hd&pass=' },[cite: 1]
    { id: 'max1', name: 'Max Sport 1', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-sport-1-hd&pass=' },[cite: 1]
    { id: 'max2', name: 'Max Sport 2', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-sport-2-hd&pass=' },[cite: 1]
    { id: 'max3', name: 'Max Sport 3', pageUrl: 'https://www.seirsanduk.online/hd-max-sport-3-hd-online' },[cite: 1]
    { id: 'euro1', name: 'Eurosport 1', pageUrl: 'https://www.seirsanduk.online/?id=hd-eurosport-1-hd&pass=&hash=' },[cite: 1]
    { id: 'euro2', name: 'Eurosport 2', pageUrl: 'https://www.seirsanduk.online/?id=hd-eurosport-2-hd&pass=&hash=' },[cite: 1]
    { id: 'bnt1', name: 'BNT 1', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-bnt-1-hd&pass=' },[cite: 1]
    { id: 'bnt3', name: 'BNT 3', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-bnt-3-hd&pass=' },[cite: 1]
    { id: 'btv_comedy', name: 'BTV Comedy', pageUrl: 'https://www.seir-sanduk.com/hd-btv-comedy-hd-online?player=12&id=hd-btv-comedy-hd&pass=' },[cite: 1]
    { id: 'star_channel', name: 'Star Channel', pageUrl: 'https://www.seirsanduk.online/?id=hd-star-channel-hd&pass=&hash=' },[cite: 1]
    { id: 'star_life', name: 'Star Life', pageUrl: 'https://www.seirsanduk.online/?id=hd-star-life-hd&pass=&hash=' }[cite: 1]
];

/**
 * СКРАПЕР ЗА ВИДЕО ПОТОЦИ (m3u8)
 */
async function scrapeTokens() {[cite: 1]
    console.log('\n=========================================');[cite: 1]
    console.log('🚀 СТАРТИРАНЕ НА СКАТИРАНЕ ЗА СТРИЙМОВЕ');[cite: 1]
    console.log('=========================================');[cite: 1]
    
    let browser;[cite: 1]
    try {
        browser = await puppeteer.launch({[cite: 1]
            headless: "new",[cite: 1]
            args: [
                '--no-sandbox',[cite: 1]
                '--disable-setuid-sandbox',[cite: 1]
                '--disable-dev-shm-usage',[cite: 1]
                '--single-process',[cite: 1]
                '--no-zygote',[cite: 1]
                '--disable-gpu',[cite: 1]
                '--disable-audio-output',[cite: 1]
                '--blink-settings=imagesEnabled=false'[cite: 1]
            ]
        });

        browser.on('targetcreated', async (target) => {[cite: 1]
            try {
                if (target.type() === 'page' && target.opener()) {[cite: 1]
                    const popupPage = await target.page();[cite: 1]
                    if (popupPage && !popupPage.isClosed()) {[cite: 1]
                        await popupPage.close().catch(() => {});[cite: 1]
                    }
                }
            } catch (e) {}
        });

        for (const channel of channelsConfig) {[cite: 1]
            console.log(`🔄 Сканиране за: ${channel.name}...`);[cite: 1]
            let foundStream = await scanSingleChannel(browser, channel, channel.pageUrl);[cite: 1]

            if (!foundStream && channel.fallbackUrl) {[cite: 1]
                console.log(`   ⚠️ Опит за алтернативен линк за ${channel.name}...`);[cite: 1]
                foundStream = await scanSingleChannel(browser, channel, channel.fallbackUrl);[cite: 1]
            }

            if (foundStream) {
                // Преобразуване към HTTPS, за да не се блокира от iOS Safari (Mixed Content)
                streamCache[channel.id] = foundStream.startsWith('http://')[cite: 1]
                    ? foundStream.replace('http://', 'https://')[cite: 1]
                    : foundStream;[cite: 1]
            } else {
                console.log(`   ❌ Не бе намерен поток за ${channel.name}`);[cite: 1]
            }
        }

        streamCache.lastUpdated = new Date();[cite: 1]
        console.log('🏁 СКАНИРАНЕТО НА СТРИЙМОВЕ ЗАВЪРШИ');[cite: 1]
        console.log('=========================================\n');[cite: 1]

    } catch (error) {
        console.error('Критична грешка в Chromium:', error.message);[cite: 1]
    } finally {
        if (browser) await browser.close().catch(() => {});[cite: 1]
    }
}

async function scanSingleChannel(browser, channel, url) {[cite: 1]
    let page;[cite: 1]
    let foundStream = null;[cite: 1]

    try {
        page = await browser.newPage();[cite: 1]
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');[cite: 1]

        await page.evaluateOnNewDocument(() => {[cite: 1]
            window.open = () => null;[cite: 1]
            window.alert = () => null;[cite: 1]
            window.confirm = () => null;[cite: 1]
            Object.defineProperty(window, 'onbeforeunload', { writable: false, value: () => null });[cite: 1]
        });

        await page.setRequestInterception(true);[cite: 1]
        
        page.on('request', async (request) => {[cite: 1]
            try {
                const reqUrl = request.url();[cite: 1]
                const type = request.resourceType();[cite: 1]

                if (reqUrl.includes('.m3u8')) {[cite: 1]
                    foundStream = reqUrl;[cite: 1]
                    console.log(`   ✅ [УСПЕХ] Уловен линк за ${channel.name}`);[cite: 1]
                    await request.continue().catch(() => {});[cite: 1]
                    return;
                }

                const adKeywords = [[cite: 1]
                    'popads', 'adsterra', 'clickadu', 'exoclick', 'doubleclick',[cite: 1]
                    'google-analytics', 'histats', 'onclick', 'popunder', 'juicyads',[cite: 1]
                    'adbutt', 'adservice', 'bet365', '1xbet', 'yandex', 'analytics'[cite: 1]
                ];

                const isAdDomain = adKeywords.some(keyword => reqUrl.toLowerCase().includes(keyword));[cite: 1]
                const isHeavyResource = ['image', 'font', 'stylesheet', 'media'].includes(type) && !reqUrl.includes('.m3u8');[cite: 1]

                if (isAdDomain || isHeavyResource) {[cite: 1]
                    await request.abort().catch(() => {});[cite: 1]
                } else {
                    await request.continue().catch(() => {});[cite: 1]
                }
            } catch (err) {}
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});[cite: 1]

        await page.evaluate(() => {[cite: 1]
            const playerEl = document.getElementById('player');[cite: 1]
            if (!playerEl) return;[cite: 1]

            document.querySelectorAll('div, iframe, section, ins').forEach(el => {[cite: 1]
                const style = window.getComputedStyle(el);[cite: 1]
                if (
                    (style.position === 'absolute' || style.position === 'fixed') &&[cite: 1]
                    !el.contains(playerEl) &&[cite: 1]
                    el.id !== 'player'[cite: 1]
                ) {
                    el.remove();[cite: 1]
                }
            });
        }).catch(() => {});

        if (!foundStream) {[cite: 1]
            await page.mouse.click(640, 360).catch(() => {});[cite: 1]
            
            await page.evaluate(() => {[cite: 1]
                const videoContainer = document.getElementById('player') || document.querySelector('video');[cite: 1]
                if (videoContainer) {[cite: 1]
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });[cite: 1]
                    videoContainer.dispatchEvent(clickEvent);[cite: 1]
                }
            }).catch(() => {});
        }

        for (let i = 0; i < 20; i++) {[cite: 1]
            if (foundStream) break;[cite: 1]
            await new Promise(resolve => setTimeout(resolve, 200));[cite: 1]
        }

    } catch (err) {
        console.error(`   ❌ Проблем при ${channel.name}:`, err.message);[cite: 1]
    } finally {
        if (page && !page.isClosed()) {[cite: 1]
            await page.close().catch(() => {});[cite: 1]
        }
    }

    return foundStream;[cite: 1]
}

// Автоматично сканиране на всеки 20 минути
setInterval(scrapeTokens, 20 * 60 * 1000);[cite: 1]

// Стартиране веднага при пускане на сървъра
scrapeTokens();[cite: 1]

/**
 * API ЕНДПОИНТИ ЗА ФРОНТЕНДА
 */
app.get('/api/streams', (req, res) => {[cite: 1]
    res.json(streamCache);[cite: 1]
});

/**
 * PROXY ЗА ВИДЕО СТРИЙМОВЕТЕ
 */
const STREAM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';[cite: 1]

function getRefererForChannel(id) {[cite: 1]
    const channel = channelsConfig.find(c => c.id === id);[cite: 1]
    if (!channel) return 'https://www.seirsanduk.online/';[cite: 1]
    try {
        return `${new URL(channel.pageUrl).origin}/`;[cite: 1]
    } catch {
        return 'https://www.seirsanduk.online/';[cite: 1]
    }
}

async function proxyStream(targetUrl, referer, res) {[cite: 1]
    try {
        const response = await axios.get(targetUrl, {[cite: 1]
            headers: { 'User-Agent': STREAM_USER_AGENT, 'Referer': referer },[cite: 1]
            responseType: 'arraybuffer',[cite: 1]
            timeout: 15000[cite: 1]
        });

        const contentType = response.headers['content-type'] || '';[cite: 1]
        const isManifest = targetUrl.includes('.m3u8') || contentType.includes('mpegurl');[cite: 1]

        if (isManifest) {
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);[cite: 1]
            const text = Buffer.from(response.data).toString('utf-8');[cite: 1]
            const rewritten = text.split('\n').map(line => {[cite: 1]
                const trimmed = line.trim();[cite: 1]
                if (!trimmed || trimmed.startsWith('#')) return line;[cite: 1]
                const absoluteUrl = /^https?:\/\//i.test(trimmed) ? trimmed : baseUrl + trimmed;[cite: 1]
                return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(referer)}`;[cite: 1]
            }).join('\n');

            res.set('Content-Type', 'application/vnd.apple.mpegurl');[cite: 1]
            return res.send(rewritten);[cite: 1]
        }

        res.set('Content-Type', contentType || 'video/mp2t');[cite: 1]
        res.send(Buffer.from(response.data));[cite: 1]
    } catch (err) {
        console.error('   ❌ Грешка в proxy-то:', err.message);[cite: 1]
        res.status(502).send('Proxy error');[cite: 1]
    }
}

app.get('/api/proxy/:channelId', async (req, res) => {[cite: 1]
    const { channelId } = req.params;[cite: 1]
    const targetUrl = streamCache[channelId];[cite: 1]
    if (!targetUrl) return res.status(404).send('Няма активен стрийм за този канал');[cite: 1]
    await proxyStream(targetUrl, getRefererForChannel(channelId), res);[cite: 1]
});

app.get('/api/proxy', async (req, res) => {[cite: 1]
    const { url, ref } = req.query;[cite: 1]
    if (!url) return res.status(400).send('Missing url param');[cite: 1]
    await proxyStream(url, ref || 'https://www.seirsanduk.online/', res);[cite: 1]
});

const channelUrlMap = {[cite: 1]
    diema1: 'https://tv-programa.bg/diema-sport',[cite: 1]
    diema2: 'https://tv-programa.bg/diema-sport-2',[cite: 1]
    diema3: 'https://tv-programa.bg/diema-sport-3',[cite: 1]
    maxOne: 'https://www.xn----8sbafg9clhjcp.bg/tv/max-one/',[cite: 1]
    max1: 'https://tv-programa.bg/max-sport-1',[cite: 1]
    max2: 'https://tv-programa.bg/max-sport-2',[cite: 1]
    max3: 'https://tv-programa.bg/max-sport-3',[cite: 1]
    euro1: 'https://tv-programa.bg/eurosport-1',[cite: 1]
    euro2: 'https://tv-programa.bg/eurosport-2',[cite: 1]
    bnt1: 'https://tv-programa.bg/bnt-1',[cite: 1]
    bnt3: 'https://tv-programa.bg/bnt-3',[cite: 1]
    btv_comedy: 'https://tv-programa.bg/btv-comedy',[cite: 1]
    star_channel: 'https://tv-programa.bg/star-channel',[cite: 1]
    star_life: 'https://tv-programa.bg/star-life'[cite: 1]
};

let tvProgramCache = {};[cite: 1]

app.get('/api/program', async (req, res) => {[cite: 1]
    const { channel } = req.query;[cite: 1]

    if (!channel || !channelUrlMap[channel]) {[cite: 1]
        return res.status(400).json({ error: 'Невалиден или липсващ идентификатор на канал.' });[cite: 1]
    }

    const now = Date.now();[cite: 1]

    if (tvProgramCache[channel] && (now - tvProgramCache[channel].timestamp < 60 * 60 * 1000)) {[cite: 1]
        return res.json(tvProgramCache[channel].data);[cite: 1]
    }

    try {
        const targetUrl = channelUrlMap[channel];[cite: 1]
        const { data } = await axios.get(targetUrl, {[cite: 1]
            headers: {[cite: 1]
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'[cite: 1]
            },
            timeout: 5000[cite: 1]
        });

        const $ = cheerio.load(data);[cite: 1]
        const results = [];[cite: 1]

        $('.prog_row, tr, li, div').each((i, el) => {[cite: 1]
            const text = $(el).text().trim();[cite: 1]
            const timeMatch = text.match(/^(\d{2}[:\.]\d{2})/);[cite: 1]
            
            if (timeMatch) {
                const time = timeMatch[1].replace('.', ':');[cite: 1]
                let title = text.substring(timeMatch[1].length).replace(/^[-–\s:\.]+/g, '').trim();[cite: 1]
                title = title.split('\n')[0].trim();[cite: 1]

                if (title.length > 2 && !results.some(e => e.time === time)) {[cite: 1]
                    results.push({ time, title });[cite: 1]
                }
            }
        });

        results.sort((a, b) => a.time.localeCompare(b.time));[cite: 1]

        tvProgramCache[channel] = {[cite: 1]
            timestamp: now,[cite: 1]
            data: results[cite: 1]
        };
        
        res.json(results);[cite: 1]
    } catch (err) {
        console.error(`❌ Грешка при извличане на програма за ${channel}:`, err.message);[cite: 1]
        res.json([]);[cite: 1]
    }
});

const PORT = process.env.PORT || 3000;[cite: 1]
// ДОБАВЕН Е ИНТЕРФЕЙС '0.0.0.0', ЗА ДА РАБОТИ ПРЕЗ TAILSCALE
app.listen(PORT, '0.0.0.0', () => {[cite: 1]
    console.log(`🛡️ Стрийминг сървърът работи стабилно на порт ${PORT}`);[cite: 1]
});
