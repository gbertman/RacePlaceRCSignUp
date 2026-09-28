const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent, parseHeatSheet, getRaceLineups } = require('./raceLineups');

const source = 'https://raceplacerc.liverc.com/results/';
const event = `<h3 class="page-header">9/26/2026 Club Race</h3>
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

test('discovers only track heat sheets and sorts qualifiers before mains', () => {
    const result = parseEvent(event, source);
    assert.equal(result.eventName, '9/26/2026 Club Race');
    assert.deepEqual(result.rounds.map(round => round.label), ['Qualifier Round 1', 'Qualifier Round 2', 'Mains']);
    assert.deepEqual(result.rounds.map(round => round.id), ['1', '2', '3']);
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
        return { ok: !url.includes('id=2'), status: 503, text: async () => url === source ? event : heat };
    };
    const result = await getRaceLineups('on-road', fakeFetch);
    assert.equal(result.rounds[0].races.length, 2);
    assert.ok(result.rounds[1].error);
    assert.equal(result.rounds[2].races.length, 2);
    await getRaceLineups('on-road', fakeFetch);
    assert.equal(calls, 8);
});

test('rejects unknown tracks without fetching and propagates upstream failures', async () => {
    await assert.rejects(getRaceLineups('__proto__', () => assert.fail('must not fetch')), { status: 400 });
    await assert.rejects(getRaceLineups('off-road', async () => ({ ok: false, status: 503 })), /503/);
});
