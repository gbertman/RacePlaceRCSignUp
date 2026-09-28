const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent, parseHeatSheet, getRaceLineups, parseRankings } = require('./raceLineups');

const source = 'https://raceplacerc.liverc.com/results/';
const event = `<h3 class="page-header">9/26/2026 Club Race</h3>
    <a href="?p=view_entry_list&id=6">Entry List</a>
    <a href="?p=view_heat_sheet&id=2">Qualifier Round 2</a>
    <a href="?p=view_heat_sheet&id=1">Qualifier Round 1</a>
    <a href="?p=view_heat_sheet&id=3">Main Events</a>
    <a href="?p=view_round_ranking&id=4">Qualifier Round 1 Rankings</a>
    <a href="https://example.com/results/?p=view_heat_sheet&id=5">Qualifier Round 4</a>`;
const heat = `<table class="heat_sheet"><tbody>
    <tr><th><div class="race_num">2</div><span class="class_header">Stock &amp; Modified A-Main</span></th></tr>
    <tr><th>Pos</th><th>Car # / Driver</th></tr>
    <tr><td>1</td><td><span class="car_num">5</span>JANE &amp; JOHN</td><td>123456</td></tr>
    <tr><td>2</td><td><span class="car_num">2</span>ALEX RACER</td></tr>
    <tr><th><div class="race_num">1</div><span class="class_header">Stock B-Main</span></th></tr>
    <tr><td>1</td><td><span class="car_num">7</span>TAYLOR RACER</td></tr>
    </tbody></table>`;

test('uses Qualifier 1 and mains, excluding entry lists and later qualifiers', () => {
    const result = parseEvent(event, source);
    assert.equal(result.eventName, '9/26/2026 Club Race');
    assert.deepEqual(result.rounds.map(round => round.label), ['Qualifier Round 1', 'Mains']);
    assert.deepEqual(result.rounds.map(round => round.id), ['1', '3']);
});

test('orders races numerically, preserving lineup order and car numbers', () => {
    const races = parseHeatSheet(heat);
    assert.deepEqual(races.map(race => race.number), [1, 2]);
    assert.equal(races[1].name, 'Stock & Modified A-Main');
    assert.deepEqual(races[1].participants, [
        { carNumber: '5', name: 'JANE & JOHN' }, { carNumber: '2', name: 'ALEX RACER' },
    ]);
});

test('distinguishes no posted rounds from an unreadable page', () => {
    assert.deepEqual(parseEvent('<h3 class="page-header">New Event</h3>', source).rounds, []);
    assert.throws(() => parseEvent('<h1>Service unavailable</h1>', source));
    assert.throws(() => parseHeatSheet('<h1>Service unavailable</h1>'));
});

test('loads fresh postings on each request and reports individual sheet failures', async () => {
    let calls = 0;
    const fakeFetch = async url => {
        calls++;
        return { ok: !url.includes('id=3'), status: 503, text: async () => url === source ? event : heat };
    };
    const result = await getRaceLineups('on-road', fakeFetch);
    assert.equal(result.rounds[0].races.length, 2);
    assert.ok(result.rounds[1].error);
    await getRaceLineups('on-road', fakeFetch);
    assert.equal(calls, 6);
});

test('rejects unknown tracks without fetching and propagates upstream failures', async () => {
    await assert.rejects(getRaceLineups('__proto__', () => assert.fail('must not fetch')), { status: 400 });
    await assert.rejects(getRaceLineups('off-road', async () => ({ ok: false, status: 503 })), /503/);
});

const rankings = `<table class="round_rankings"><thead><tr><th class="class_header">Stock &amp; Modified</th></tr></thead>
<tbody><tr><td>1</td><td>JANE RACER</td><td><div class="hidden">0020/9999</div>20/5:01.123</td></tr>
<tr><td>2</td><td>ALEX RACER</td><td><div class="hidden">0000</div>DNS</td></tr></tbody></table>`;

test('parses class standings without hidden sorting values', () => {
    assert.deepEqual(parseRankings(rankings), [{ name: 'Stock & Modified', participants: [
        { position: '1', name: 'JANE RACER', result: '20/5:01.123' },
        { position: '2', name: 'ALEX RACER', result: 'DNS' },
    ] }]);
    assert.throws(() => parseRankings('<h1>Unavailable</h1>'));
});

test('loads the newest ranking round before mains and preserves Qualifier 1', async () => {
    const qualifyingEvent = event.replace('<a href="?p=view_heat_sheet&id=3">Main Events</a>', '')
        + '<a href="?p=view_round_ranking&id=10">Qualifier Round 10 Rankings</a>'
        + '<a href="?p=view_round_ranking&id=9">Qualifier Round 9 Rankings</a>';
    const urls = [];
    const result = await getRaceLineups('on-road', async url => {
        urls.push(url);
        return { ok: true, text: async () => url === source ? qualifyingEvent : url.includes('view_round_ranking') ? rankings : heat };
    });
    assert.equal(result.standings.number, 10);
    assert.equal(result.standings.classes[0].participants.length, 2);
    assert.deepEqual(result.rounds.map(round => round.number), [1]);
    assert.equal(urls.filter(url => url.includes('view_round_ranking')).length, 1);
});

test('does not fetch standings once mains are posted', async () => {
    const result = await getRaceLineups('on-road', async url => {
        assert.ok(!url.includes('view_round_ranking'));
        return { ok: true, text: async () => url === source ? event : heat };
    });
    assert.equal(result.standings, null);
});

test('keeps lineups available when rankings fail', async () => {
    const qualifyingEvent = event.replace('<a href="?p=view_heat_sheet&id=3">Main Events</a>', '');
    const result = await getRaceLineups('on-road', async url => ({
        ok: !url.includes('view_round_ranking'), status: 503,
        text: async () => url === source ? qualifyingEvent : heat,
    }));
    assert.ok(result.standings.error);
    assert.equal(result.rounds[0].races.length, 2);
});
