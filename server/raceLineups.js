const { load } = require('cheerio');

const TRACKS = {
    'on-road': { name: 'On Road', url: 'https://raceplacerc.liverc.com/results/' },
    'off-road': { name: 'Off Road', url: 'https://raceplacercoffroad.liverc.com/results/' },
};
const clean = value => value.replace(/\s+/g, ' ').trim();

function parseEvent(html, sourceUrl) {
    const $ = load(html);
    const eventName = clean($('h3.page-header').first().text());
    if (!eventName) throw new Error('LiveRC event information could not be read.');
    const rounds = [];
    const rankings = [];
    $('a[href]').each((_, element) => {
        const link = $(element);
        const url = new URL(link.attr('href'), sourceUrl);
        if (url.origin !== new URL(sourceUrl).origin || url.pathname !== '/results/') return;
        const id = url.searchParams.get('id');
        const label = clean(link.text());
        if (!/^\d+$/.test(id || '')) return;
        const ranking = label.match(/^Qualifier Round (\d+) Rankings$/i);
        if (url.searchParams.get('p') === 'view_round_ranking' && ranking) {
            rankings.push({ number: Number(ranking[1]), label, sourceUrl: url.href });
            return;
        }
        if (url.searchParams.get('p') !== 'view_heat_sheet') return;
        const qualifier = label.match(/^Qualifier Round (1)$/i);
        const isMain = /^Main Events?$/i.test(label);
        if (!/^\d+$/.test(id || '') || (!qualifier && !isMain) || rounds.some(round => round.id === id)) return;
        rounds.push({ id, label: isMain ? 'Mains' : label, type: isMain ? 'mains' : 'qualifier',
            number: qualifier ? Number(qualifier[1]) : 0, sourceUrl: url.href });
    });
    rounds.sort((a, b) => (a.type === 'mains') - (b.type === 'mains') || a.number - b.number);
    rankings.sort((a, b) => b.number - a.number);
    return { eventName, rounds, ranking: rankings[0] || null };
}

function parseRankings(html) {
    const $ = load(html);
    const classes = [];
    $('table.round_rankings').each((_, element) => {
        const table = $(element);
        const name = clean(table.find('.class_header').first().text());
        const participants = [];
        table.find('tbody tr').each((_, row) => {
            const cells = $(row).children('td').clone();
            cells.find('.hidden').remove();
            if (cells.length < 3) return;
            const position = clean(cells.eq(0).text());
            const driver = clean(cells.eq(1).text());
            if (!position || !driver) throw new Error('Unable to read qualifying standings.');
            participants.push({ position, name: driver, result: clean(cells.eq(2).text()) });
        });
        if (!name) throw new Error('Unable to read qualifying class.');
        classes.push({ name, participants });
    });
    if (!classes.length) throw new Error('Qualifying standings are not available yet.');
    return classes;
}

function parseHeatSheet(html) {
    const $ = load(html);
    const races = [];
    let race;
    $('table.heat_sheet tr').each((_, element) => {
        const row = $(element);
        if (row.find('.race_num').length) {
            const number = Number(clean(row.find('.race_num').text()));
            const name = clean(row.find('.class_header').text());
            if (!Number.isInteger(number) || number < 1 || !name) throw new Error('LiveRC race information could not be read.');
            race = { number, name, participants: [] };
            races.push(race);
        } else if (race && row.find('.car_num').length) {
            const car = row.find('.car_num').first();
            const cell = car.parent().clone();
            cell.find('.car_num').remove();
            const name = clean(cell.text());
            if (!name) throw new Error('LiveRC participant information could not be read.');
            race.participants.push({ carNumber: clean(car.text()), name });
        }
    });
    if (!races.length) throw new Error('This lineup is not available from LiveRC yet.');
    return races.sort((a, b) => a.number - b.number);
}

async function readPage(url, fetchPage) {
    const response = await fetchPage(url, {
        signal: AbortSignal.timeout(12000), redirect: 'error',
        headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`LiveRC returned status ${response.status}.`);
    return response.text();
}

async function getRaceLineups(trackId, fetchPage = fetch) {
    const track = Object.hasOwn(TRACKS, trackId) ? TRACKS[trackId] : null;
    if (!track) {
        const error = new Error('Choose On Road or Off Road.');
        error.status = 400;
        throw error;
    }
    const event = parseEvent(await readPage(track.url, fetchPage), track.url);
    const results = await Promise.allSettled(event.rounds.map(async round => ({
        ...round, races: parseHeatSheet(await readPage(round.sourceUrl, fetchPage)),
    })));
    const rounds = results.map((result, index) => result.status === 'fulfilled' ? result.value : {
        ...event.rounds[index], races: [], error: 'This lineup could not be loaded. Refresh to try again or open it on LiveRC.',
    });
    let standings = null;
    if (!event.rounds.some(round => round.type === 'mains') && event.ranking) {
        try {
            standings = { ...event.ranking, classes: parseRankings(await readPage(event.ranking.sourceUrl, fetchPage)) };
        } catch {
            standings = { ...event.ranking, classes: [], error: 'Qualifying standings could not be loaded. Refresh to try again.' };
        }
    }
    return { track: track.name, eventName: event.eventName, sourceUrl: track.url,
        fetchedAt: new Date().toISOString(), rounds, standings };
}

module.exports = { getRaceLineups, parseEvent, parseHeatSheet, parseRankings };
