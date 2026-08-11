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
    normalizeMatchText,
    prepareSheetRows,
    replaceClassesForType,
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
            classSelections: [
                { className: '17.5 Buggy', selected: true, confidence: 0.95 },
                { className: 'Mod Buggy', selected: false, confidence: 0.9 },
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

test('keeps an unmatched handwritten name as a provisional new driver', () => {
    const [row] = prepareSheetRows({
        rows: [{
            rowNumber: 1,
            rawName: 'Taylor Racer',
            firstName: 'Taylor',
            lastName: 'Racer',
            nameConfidence: 0.9,
            classSelections: [{ className: 'Novice', selected: true, confidence: 0.9 }],
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

    assert.deepEqual(classNameSchema.enum, ['Novice', 'Stock']);
    assert.deepEqual(schema.properties.trackName.enum, ['Oval']);
});
