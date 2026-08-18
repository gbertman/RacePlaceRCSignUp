const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'raceplace-tests-'));
process.env.SQLITE_DB_FILE = path.join(testDataDirectory, 'test.sqlite');

const {
    buildSheetExtractionSchema,
    closeDatabase,
    ensureDriverNicknameColumn,
    normalizeMatchText,
    prepareSheetRows,
    replaceClassesForType,
    server,
} = require('./index');

after(() => {
    closeDatabase();
    fs.rmSync(testDataDirectory, { recursive: true, force: true });
});

test('creates the default admin account for an empty database', () => {
    const verificationDb = new Database(process.env.SQLITE_DB_FILE, { readonly: true });
    const user = verificationDb.prepare('SELECT username, password, role FROM users WHERE username = ?').get('admin');
    verificationDb.close();

    assert.equal(user.username, 'admin');
    assert.equal(user.role, 'administrator');
    assert.equal(bcrypt.compareSync('admin', user.password), true);
});

test('adds a separate nickname column to an existing drivers table without losing names', () => {
    const legacyFile = path.join(testDataDirectory, 'legacy.sqlite');
    const legacyDb = new Database(legacyFile);
    legacyDb.exec(`
        CREATE TABLE drivers (
            firstName TEXT NOT NULL COLLATE NOCASE,
            lastName TEXT NOT NULL COLLATE NOCASE,
            PRIMARY KEY (firstName, lastName)
        )
    `);
    legacyDb.prepare('INSERT INTO drivers (firstName, lastName) VALUES (?, ?)').run('Gene', 'Bertman');

    ensureDriverNicknameColumn(legacyDb);

    const columns = legacyDb.prepare('PRAGMA table_info(drivers)').all();
    const driver = legacyDb.prepare('SELECT firstName, lastName, nickname FROM drivers').get();
    legacyDb.close();

    assert.ok(columns.some(column => column.name === 'nickname'));
    assert.deepEqual(driver, { firstName: 'Gene', lastName: 'Bertman', nickname: '' });
});

test('creates, updates, and searches a driver by nickname', async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        const loginResponse = await fetch(`${baseUrl}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin' }),
        });
        const cookie = loginResponse.headers.get('set-cookie').split(';')[0];

        const createResponse = await fetch(`${baseUrl}/drivers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ firstName: 'Casey', lastName: 'Racer', nickname: 'Quick' }),
        });
        assert.equal(createResponse.status, 200);

        const initialMatches = await fetch(`${baseUrl}/drivers?name=quick`).then(response => response.json());
        assert.equal(initialMatches.length, 1);
        assert.equal(initialMatches[0].nickname, 'Quick');

        const updateResponse = await fetch(`${baseUrl}/drivers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ firstName: 'Casey', lastName: 'Racer', nickname: 'Rocket' }),
        });
        assert.equal(updateResponse.status, 200);

        const updatedMatches = await fetch(`${baseUrl}/drivers?name=rocket`).then(response => response.json());
        assert.equal(updatedMatches.length, 1);
        assert.deepEqual(updatedMatches[0], { firstName: 'Casey', lastName: 'Racer', nickname: 'Rocket' });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('replaces one track class group without changing Mini-Z', () => {
    replaceClassesForType('Mini-Z', ['Full Speed']);
    replaceClassesForType('On Road', ['Gt12', 'Lmh 25.5']);
    replaceClassesForType('On Road', ['Formula 1']);

    const verificationDb = new Database(process.env.SQLITE_DB_FILE, { readonly: true });
    const classes = verificationDb.prepare('SELECT name, type FROM classes ORDER BY type, name').all();
    verificationDb.close();

    assert.deepEqual(classes, [
        { name: 'Full Speed', type: 'Mini-Z' },
        { name: 'Formula 1', type: 'On Road' },
    ]);
});

test('normalizes names for case-insensitive database matching', () => {
    assert.equal(normalizeMatchText('  Eugène   Bertman '), 'eugene bertman');
});

test('grounds a reversed handwritten name in the existing driver list', () => {
    const raceClasses = [
        { name: '17.5 Buggy', type: 'Off Road' },
        { name: 'Mod Buggy', type: 'Off Road' },
    ];
    const drivers = [{ firstName: 'Brian', lastName: 'Shuma' }];
    const extraction = {
        rows: [{
            rowNumber: 3,
            rawName: 'Shuma Bran',
            firstName: 'Shuma',
            lastName: 'Bran',
            nameConfidence: 0.7,
            crossedOut: false,
            classSelections: [
                { className: '17.5 Buggy', selected: true, crossedOut: false, confidence: 0.95 },
                { className: 'Mod Buggy', selected: false, crossedOut: false, confidence: 0.9 },
            ],
            notes: '',
        }],
    };

    const [row] = prepareSheetRows(extraction, raceClasses, drivers);
    assert.equal(row.firstName, 'Brian');
    assert.equal(row.lastName, 'Shuma');
    assert.equal(row.isNewDriver, false);
    assert.deepEqual(row.classes, ['17.5 Buggy']);
});

test('grounds a handwritten nickname in the existing driver list', () => {
    const [row] = prepareSheetRows({
        rows: [{
            rowNumber: 2,
            rawName: 'Rocket Shuma',
            firstName: 'Rocket',
            lastName: 'Shuma',
            nameConfidence: 0.8,
            crossedOut: false,
            classSelections: [
                { className: '17.5 Buggy', selected: true, crossedOut: false, confidence: 0.95 },
            ],
            notes: '',
        }],
    }, [{ name: '17.5 Buggy', type: 'Off Road' }], [{
        firstName: 'Brian',
        lastName: 'Shuma',
        nickname: 'Rocket',
    }]);

    assert.equal(row.firstName, 'Brian');
    assert.equal(row.lastName, 'Shuma');
    assert.equal(row.existingDriver.nickname, 'Rocket');
    assert.equal(row.isNewDriver, false);
});

test('keeps an unmatched handwritten name as a provisional new driver', () => {
    const [row] = prepareSheetRows({
        rows: [{
            rowNumber: 1,
            rawName: 'Taylor Racer',
            firstName: 'Taylor',
            lastName: 'Racer',
            nameConfidence: 0.9,
            crossedOut: false,
            classSelections: [{ className: 'Novice', selected: true, crossedOut: false, confidence: 0.9 }],
            notes: '',
        }],
    }, [{ name: 'Novice', type: 'Oval' }], [{ firstName: 'Brian', lastName: 'Shuma' }]);

    assert.equal(row.isNewDriver, true);
    assert.equal(row.existingDriver, null);
});

test('constrains GPT race-class output to the selected track classes', () => {
    const schema = buildSheetExtractionSchema(['Novice', 'Stock'], 'Oval');
    const classNameSchema = schema.properties.rows.items.properties
        .classSelections.items.properties.className;
    const classSelectionRequired = schema.properties.rows.items.properties
        .classSelections.items.required;

    assert.deepEqual(classNameSchema.enum, ['Novice', 'Stock']);
    assert.ok(classSelectionRequired.includes('crossedOut'));
    assert.ok(schema.properties.rows.items.required.includes('crossedOut'));
    assert.deepEqual(schema.properties.trackName.enum, ['Oval']);
});

test('excludes a scratched-out row and removes scratched-out race marks by default', () => {
    const [row] = prepareSheetRows({
        rows: [{
            rowNumber: 4,
            rawName: 'Taylor Racer',
            firstName: 'Taylor',
            lastName: 'Racer',
            nameConfidence: 0.95,
            crossedOut: true,
            classSelections: [
                { className: 'Novice', selected: true, crossedOut: true, confidence: 0.9 },
                { className: 'Stock', selected: true, crossedOut: false, confidence: 0.95 },
            ],
            notes: 'The row has a line through it',
        }],
    }, [
        { name: 'Novice', type: 'Oval' },
        { name: 'Stock', type: 'Oval' },
    ], []);

    assert.equal(row.crossedOut, true);
    assert.equal(row.included, false);
    assert.deepEqual(row.crossedOutClasses, ['Novice']);
    assert.deepEqual(row.classes, ['Stock']);
    assert.ok(row.warnings.includes('Racer row appears crossed out'));
});
