const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

// ГЛОБАЛНА ЗАЩИТА СРЕЩУ СРИВОВЕ
process.on('unhandledRejection', (reason) => {
    // Игнорираме остатъчни съобщения от затворени табове по време на мрежови заявки
    if (reason && reason.message && reason.message.includes('Target closed')) return;
    console.error('⚠️ Засечена и изолирана асинхронна грешка:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Засечена и изолирана критична грешка:', error.message);
});

const app = express();
app.use(cors());

// КЕШ ЗА СТРИЙМОВЕТЕ
let streamCache = {
    diema1: '', diema2: '', diema3: '',maxOne: '',
    max1: '', max2: '', euro1: '', euro2: '',
    bnt1: '', bnt3: '', btv_comedy: '', star_channel: '', star_life: '', lastUpdated: null
};

// Конфигурация на каналите за сканиране на стриймове
const channelsConfig = [
    { 
        id: 'diema1', 
        name: 'Diema Sport', 
        pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-hd&pass=',
        fallbackUrl: 'https://www.seirsanduk.online/?id=hd-diema-sport-hd&pass=&hash=' 
    },
    { id: 'diema2', name: 'Diema Sport 2', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-2-hd&pass=' },
    { id: 'diema3', name: 'Diema Sport 3', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-diema-sport-3-hd&pass=' },
    { id: 'maxOne', name: 'Max One', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-one-hd&pass=' },
    { id: 'max1', name: 'Max Sport 1', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-sport-1-hd&pass=' },
    { id: 'max2', name: 'Max Sport 2', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-max-sport-2-hd&pass=' },
    { id: 'euro1', name: 'Eurosport 1', pageUrl: 'https://www.seirsanduk.online/?id=hd-eurosport-1-hd&pass=&hash=' },
    { id: 'euro2', name: 'Eurosport 2', pageUrl: 'https://www.seirsanduk.online/?id=hd-eurosport-2-hd&pass=&hash=' },
    { id: 'bnt1', name: 'BNT 1', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-bnt-1-hd&pass=' },
    { id: 'bnt3', name: 'BNT 3', pageUrl: 'https://www.seirsanduk.online/?player=12&id=hd-bnt-3-hd&pass=' },
    { id: 'btv_comedy', name: 'BTV Comedy', pageUrl: 'https://www.seir-sanduk.com/hd-btv-comedy-hd-online?player=12&id=hd-btv-comedy-hd&pass=' },
    { id: 'star_channel', name: 'Star Channel', pageUrl: 'https://www.seirsanduk.online/?id=hd-star-channel-hd&pass=&hash=' },
    { id: 'star_life', name: 'Star Life', pageUrl: 'https://www.seirsanduk.online/?id=hd-star-life-hd&pass=&hash=' }
];

/**
 * СКРАПЕР ЗА ВИДЕО ПОТОЦИ (m3u8)
 */
async function scrapeTokens() {
    console.log('\n=========================================');
    console.log('🚀 СТАРТИРАНЕ НА СКАНИРАНЕ ЗА СТРИЙМОВЕ');
    console.log('=========================================');
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new",
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        '--disable-gpu',
        '--disable-audio-output',
        '--blink-settings=imagesEnabled=false'
    ]
        });

        // ФИКС: Затваряме САМО табове, които са отворени от друг таб (т.е. истински попъп реклами)
        browser.on('targetcreated', async (target) => {
            try {
                if (target.type() === 'page' && target.opener()) {
                    const popupPage = await target.page();
                    if (popupPage && !popupPage.isClosed()) {
                        await popupPage.close().catch(() => {});
                    }
                }
            } catch (e) {}
        });

        for (const channel of channelsConfig) {
            console.log(`🔄 Сканиране за: ${channel.name}...`);
            let foundStream = await scanSingleChannel(browser, channel, channel.pageUrl);

            if (!foundStream && channel.fallbackUrl) {
                console.log(`   ⚠️ Опит за алтернативен линк за ${channel.name}...`);
                foundStream = await scanSingleChannel(browser, channel, channel.fallbackUrl);
            }

            if (foundStream) {
                streamCache[channel.id] = foundStream;
            } else {
                console.log(`   ❌ Не бе намерен поток за ${channel.name}`);
            }
        }

        streamCache.lastUpdated = new Date();
        console.log('🏁 СКАНИРАНЕТО НА СТРИЙМОВЕ ЗАВЪРШИ');
        console.log('=========================================\n');

    } catch (error) {
        console.error('Критична грешка в Chromium:', error.message);
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function scanSingleChannel(browser, channel, url) {
    let page;
    let foundStream = null;

    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        // Защита от пренасочвания и диалогови прозорци
        await page.evaluateOnNewDocument(() => {
            window.open = () => null;
            window.alert = () => null;
            window.confirm = () => null;
            Object.defineProperty(window, 'onbeforeunload', { writable: false, value: () => null });
        });

        // Блокиране на реклами на мрежово ниво
        await page.setRequestInterception(true);
        
        page.on('request', async (request) => {
            try {
                const reqUrl = request.url();
                const type = request.resourceType();

                if (reqUrl.includes('.m3u8')) {
                    foundStream = reqUrl;
                    console.log(`   ✅ [УСПЕХ] Уловен линк за ${channel.name}`);
                    await request.continue().catch(() => {});
                    return;
                }

                const adKeywords = [
                    'popads', 'adsterra', 'clickadu', 'exoclick', 'doubleclick', 
                    'google-analytics', 'histats', 'onclick', 'popunder', 'juicyads', 
                    'adbutt', 'adservice', 'bet365', '1xbet', 'yandex', 'analytics'
                ];

                const isAdDomain = adKeywords.some(keyword => reqUrl.toLowerCase().includes(keyword));
                const isHeavyResource = ['image', 'font', 'stylesheet', 'media'].includes(type) && !reqUrl.includes('.m3u8');

                if (isAdDomain || isHeavyResource) {
                    await request.abort().catch(() => {});
                } else {
                    await request.continue().catch(() => {});
                }
            } catch (err) {
                // Предотвратява краш, ако табът се затвори по средата на заявката
            }
        });

        // Зареждаме само докато се построи DOM дървото
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

        // Изчистване на невидими рекламни слоеве над плеъра
        await page.evaluate(() => {
            const playerEl = document.getElementById('player');
            if (!playerEl) return;

            document.querySelectorAll('div, iframe, section, ins').forEach(el => {
                const style = window.getComputedStyle(el);
                if (
                    (style.position === 'absolute' || style.position === 'fixed') && 
                    !el.contains(playerEl) && 
                    el.id !== 'player'
                ) {
                    el.remove();
                }
            });
        }).catch(() => {});

        // Ако не е уловен автоматично при зареждане, правим сигурен клик върху контейнера
        if (!foundStream) {
            await page.mouse.click(640, 360).catch(() => {});
            
            await page.evaluate(() => {
                const videoContainer = document.getElementById('player') || document.querySelector('video');
                if (videoContainer) {
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    videoContainer.dispatchEvent(clickEvent);
                }
            }).catch(() => {});
        }

        // Динамично изчакване (макс 4 секунди, но спира веднага щом линкът е намерен)
        for (let i = 0; i < 20; i++) {
            if (foundStream) break;
            await new Promise(resolve => setTimeout(resolve, 200));
        }

    } catch (err) {
        console.error(`   ❌ Проблем при ${channel.name}:`, err.message);
    } finally {
        if (page && !page.isClosed()) {
            await page.close().catch(() => {});
        }
    }

    return foundStream;
}

// Автоматично сканиране на всеки 20 минути
setInterval(scrapeTokens, 20 * 60 * 1000);

// Стартиране веднага при пускане на сървъра
scrapeTokens();

/**
 * API ЕНДПОИНТИ ЗА ФРОНТЕНДА
 */
app.get('/api/streams', (req, res) => { 
    res.json(streamCache); 
});

// ФИКС: Карта с ИСТИНСКИТЕ и работещи линкове към каналите в tv-programa.bg
const channelUrlMap = {
    diema1: 'https://tv-programa.bg/diema-sport',
    diema2: 'https://tv-programa.bg/diema-sport-2',
    diema3: 'https://tv-programa.bg/diema-sport-3',
    maxOne: 'https://www.xn----8sbafg9clhjcp.bg/tv/max-one/',
    max1: 'https://tv-programa.bg/max-sport-1',
    max2: 'https://tv-programa.bg/max-sport-2',
    euro1: 'https://tv-programa.bg/eurosport-1',
    euro2: 'https://tv-programa.bg/eurosport-2',
    bnt1: 'https://tv-programa.bg/bnt-1',
    bnt3: 'https://tv-programa.bg/bnt-3',
    btv_comedy: 'https://tv-programa.bg/btv-comedy',
    star_channel: 'https://tv-programa.bg/star-channel',
    star_life: 'https://tv-programa.bg/star-life'
};

// Кеш памет за програмата
let tvProgramCache = {};

app.get('/api/program', async (req, res) => {
    const { channel } = req.query;

    if (!channel || !channelUrlMap[channel]) {
        return res.status(400).json({ error: 'Невалиден или липсващ идентификатор на канал.' });
    }

    const now = Date.now();

    // Ако имаме кеширана програма от последните 60 минути, я връщаме веднага
    if (tvProgramCache[channel] && (now - tvProgramCache[channel].timestamp < 60 * 60 * 1000)) {
        return res.json(tvProgramCache[channel].data);
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--blink-settings=imagesEnabled=false'
            ]
        });
        const page = await browser.newPage();
        
        // КРИТИЧЕН ФИКС: Задаваме реален User-Agent, за да прескочим защитата на сайта
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        // Спираме тежките ресурси
        await page.setRequestInterception(true);
        page.on('request', async (req) => {
            try {
                if (['image', 'font', 'media'].includes(req.resourceType())) {
                    await req.abort();
                } else {
                    await req.continue();
                }
            } catch (e) {}
        });

        const targetUrl = channelUrlMap[channel];
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Извличане на часовете и заглавията
        const liveEvents = await page.evaluate(() => {
            const results = [];
            // По-агресивен селектор, за да хване структурата, дори ако има лека промяна
            const rows = document.querySelectorAll('.prog_row, tr, li, div');
            
            rows.forEach(row => {
                const text = row.innerText ? row.innerText.trim() : '';
                const timeMatch = text.match(/^(\d{2}[:\.]\d{2})/);
                
                if (timeMatch) {
                    const time = timeMatch[1].replace('.', ':');
                    let title = text.substring(timeMatch[1].length).replace(/^[-–\s:\.]+/g, '').trim();
                    title = title.split('\n')[0].trim();

                    // Игнорираме твърде къси заглавия и дублирани часове
                    if (title.length > 2 && !results.some(e => e.time === time)) {
                        results.push({ time, title });
                    }
                }
            });
            return results;
        });

        if (liveEvents.length > 0) {
            // Подреждаме ги хронологично за всеки случай
            liveEvents.sort((a, b) => a.time.localeCompare(b.time));

            tvProgramCache[channel] = {
                timestamp: now,
                data: liveEvents
            };
            res.json(liveEvents);
        } else {
            res.json([]);
        }

    } catch (err) {
        console.error(`❌ Грешка при извличане на жива програма за ${channel}:`, err.message);
        res.status(500).json({ error: 'Неуспешно извличане на данни в реално време.' });
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
});

app.listen(3000, () => { 
    console.log('🛡️ Стрийминг сървърът работи стабилно на http://localhost:3000'); 
});