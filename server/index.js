const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const OpenAI = require('openai');
const path = require('path');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === 'production';
const io = new Server(server, {
    cors: {
        origin: '*',
    },
});
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const INITIAL_ADMIN_USERNAME = (process.env.INITIAL_ADMIN_USERNAME || 'admin').trim();
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'admin';
const BCRYPT_SALT_ROUNDS = 10;
const ADMIN_COOKIE_NAME = 'raceplace_admin_session';
const adminSessions = new Map();
const sheetUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        callback(allowedTypes.has(file.mimetype) ? null : new Error('Upload a JPEG, PNG, or WebP image'), allowedTypes.has(file.mimetype));
    },
});

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const DB_FILE = process.env.SQLITE_DB_FILE || path.join(DATA_DIR, 'raceplace.sqlite');
const db = new Database(DB_FILE);

function initializeDatabase() {
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY COLLATE NOCASE,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS classes (
            name TEXT PRIMARY KEY,
            type TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS track (
            name TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS drivers (
            firstName TEXT NOT NULL COLLATE NOCASE,
            lastName TEXT NOT NULL COLLATE NOCASE,
            PRIMARY KEY (firstName, lastName)
        );
        CREATE TABLE IF NOT EXISTS registrations (
            name TEXT PRIMARY KEY,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            registeredAt TEXT NOT NULL,
            classes TEXT NOT NULL
        );
    `);
    ensureInitialAdmin();
}

function ensureInitialAdmin() {
    const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'administrator' LIMIT 1").get();
    if (hasAdmin) {
        return;
    }

    const normalized = normalizeStoredUser({
        username: INITIAL_ADMIN_USERNAME,
        password: INITIAL_ADMIN_PASSWORD,
        role: 'administrator',
    });
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
        .run(normalized.username, normalized.password, normalized.role);
}

function readUsers() {
    return db.prepare('SELECT username, password, role FROM users').all();
}

function getUserByUsername(username) {
    return db.prepare('SELECT username, password, role FROM users WHERE username = ?').get(username);
}

function countAdministrators() {
    return db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'administrator'").get().count;
}

function readClasses() {
    return db.prepare('SELECT name, type FROM classes').all().map(item => ({
        name: item.name,
        type: normalizeTrackType(item.type),
    }));
}

function readTrackTypes() {
    return db.prepare('SELECT name, enabled FROM track').all().map(row => ({
        name: row.name,
        enabled: Boolean(row.enabled),
    }));
}

function readDrivers() {
    return db.prepare('SELECT firstName, lastName FROM drivers ORDER BY lastName, firstName').all();
}

function findDriversByLastName(lastName) {
    return db.prepare('SELECT firstName, lastName FROM drivers WHERE lastName = ? ORDER BY firstName').all(lastName);
}

function readRegistrations() {
    const rows = db.prepare('SELECT name, firstName, lastName, registeredAt, classes FROM registrations').all();
    return Object.fromEntries(
        rows.map(row => [
            row.name,
            {
                name: row.name,
                firstName: row.firstName,
                lastName: row.lastName,
                registeredAt: row.registeredAt,
                classes: JSON.parse(row.classes || '[]'),
            },
        ])
    );
}

function insertUser({ username, password, role }) {
    const normalized = normalizeStoredUser({ username, password, role });
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
        .run(normalized.username, normalized.password, normalized.role);
}

function updateUserRecord(originalUsername, { password, role }) {
    if (password != null && password !== '') {
        const hashed = isBcryptHash(password) ? password : hashPassword(password);
        db.prepare('UPDATE users SET role = ?, password = ? WHERE username = ?')
            .run(role, hashed, originalUsername);
    } else {
        db.prepare('UPDATE users SET role = ? WHERE username = ?')
            .run(role, originalUsername);
    }
}

function deleteUserByUsername(username) {
    return db.prepare('DELETE FROM users WHERE username = ?').run(username).changes > 0;
}

function upsertRegistration({ name, firstName, lastName, classes, originalName }) {
    const transaction = db.transaction(() => {
        let preservedRegisteredAt = null;
        if (originalName && originalName !== name) {
            const old = db.prepare('SELECT registeredAt FROM registrations WHERE name = ?').get(originalName);
            if (old) {
                preservedRegisteredAt = old.registeredAt;
                db.prepare('DELETE FROM registrations WHERE name = ?').run(originalName);
            }
        }
        if (!preservedRegisteredAt) {
            const current = db.prepare('SELECT registeredAt FROM registrations WHERE name = ?').get(name);
            preservedRegisteredAt = current?.registeredAt || new Date().toISOString();
        }
        db.prepare(
            'INSERT OR REPLACE INTO registrations (name, firstName, lastName, registeredAt, classes) VALUES (?, ?, ?, ?, ?)'
        ).run(name, firstName || '', lastName || '', preservedRegisteredAt, JSON.stringify(classes || []));
    });
    transaction();
}

function deleteRegistrationByName(name) {
    return db.prepare('DELETE FROM registrations WHERE name = ?').run(name).changes > 0;
}

function deleteDriverByName(firstName, lastName) {
    return db.prepare('DELETE FROM drivers WHERE firstName = ? AND lastName = ?')
        .run(firstName, lastName).changes > 0;
}

function addDriverIfMissing(firstName, lastName) {
    const normalizedFirstName = (firstName || '').trim();
    const normalizedLastName = (lastName || '').trim();
    if (!normalizedFirstName || !normalizedLastName) return;

    db.prepare('INSERT OR IGNORE INTO drivers (firstName, lastName) VALUES (?, ?)')
        .run(normalizedFirstName, normalizedLastName);
}

function replaceAllClasses(list) {
    const normalized = list.map(item => ({
        ...item,
        type: normalizeTrackType(item.type),
    }));
    const insert = db.prepare('INSERT OR REPLACE INTO classes (name, type) VALUES (?, ?)');
    const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM classes').run();
        for (const item of items) {
            insert.run(item.name, item.type);
        }
    });
    transaction(normalized);
}

function replaceClassesForType(type, list) {
    const normalizedType = normalizeTrackType(type);
    const names = list
        .map(item => (typeof item === 'string' ? item : item?.name))
        .map(name => (name || '').trim())
        .filter(Boolean);
    const insert = db.prepare('INSERT OR REPLACE INTO classes (name, type) VALUES (?, ?)');
    const transaction = db.transaction((classNames) => {
        db.prepare('DELETE FROM classes WHERE type = ?').run(normalizedType);
        for (const name of classNames) {
            insert.run(name, normalizedType);
        }
    });
    transaction(names);
}

function replaceAllTrackTypes(types) {
    const normalized = types.map(normalizeTrackConfig);
    const insert = db.prepare('INSERT OR REPLACE INTO track (name, enabled) VALUES (?, ?)');
    const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM track').run();
        for (const item of items) {
            insert.run(item.name, item.enabled ? 1 : 0);
        }
    });
    transaction(normalized);
}

function replaceAllDrivers(drivers) {
    const insert = db.prepare('INSERT OR IGNORE INTO drivers (firstName, lastName) VALUES (?, ?)');
    const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM drivers').run();
        for (const driver of items) {
            const firstName = (driver?.firstName || '').trim();
            const lastName = (driver?.lastName || '').trim();
            if (firstName && lastName) {
                insert.run(firstName, lastName);
            }
        }
    });
    transaction(drivers);
}

function replaceAllRegistrations(regs) {
    const insert = db.prepare(
        'INSERT OR REPLACE INTO registrations (name, firstName, lastName, registeredAt, classes) VALUES (?, ?, ?, ?, ?)'
    );
    const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM registrations').run();
        for (const [name, value] of Object.entries(items)) {
            insert.run(
                name,
                value.firstName || '',
                value.lastName || '',
                value.registeredAt || new Date().toISOString(),
                JSON.stringify(value.classes || [])
            );
        }
    });
    transaction(regs);
}

function replaceDriversAndRegistrations(drivers, regs) {
    const insertDriver = db.prepare(
        'INSERT OR IGNORE INTO drivers (firstName, lastName) VALUES (?, ?)'
    );
    const insertRegistration = db.prepare(
        'INSERT OR REPLACE INTO registrations (name, firstName, lastName, registeredAt, classes) VALUES (?, ?, ?, ?, ?)'
    );
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM drivers').run();
        for (const driver of drivers) {
            const firstName = (driver?.firstName || '').trim();
            const lastName = (driver?.lastName || '').trim();
            if (firstName && lastName) {
                insertDriver.run(firstName, lastName);
            }
        }

        db.prepare('DELETE FROM registrations').run();
        for (const [name, value] of Object.entries(regs)) {
            insertRegistration.run(
                name,
                value.firstName || '',
                value.lastName || '',
                value.registeredAt || new Date().toISOString(),
                JSON.stringify(value.classes || [])
            );
        }
    });
    transaction();
}

function normalizeUser(user) {
    const username = (user?.username || '').trim();
    const password = String(user?.password || '');
    const role = user?.role === 'administrator' ? 'administrator' : 'user';

    return {
        username,
        password,
        role,
    };
}

function isBcryptHash(password) {
    return /^\$2[aby]\$\d{2}\$/.test(password || '');
}

function hashPassword(password) {
    return bcrypt.hashSync(String(password || ''), BCRYPT_SALT_ROUNDS);
}

function normalizeStoredUser(user) {
    const normalized = normalizeUser(user);
    return {
        ...normalized,
        password: normalized.password
            ? (isBcryptHash(normalized.password) ? normalized.password : hashPassword(normalized.password))
            : '',
    };
}

function normalizeTrackType(type) {
    const value = (type || '').trim();
    if (!value) return 'Other';
    return value;
}

function normalizeTrackConfig(track) {
    if (typeof track === 'string') {
        return {
            name: normalizeTrackType(track),
            enabled: true,
        };
    }

    const normalizedName = normalizeTrackType(track?.name);
    return {
        name: normalizedName,
        enabled: track?.enabled !== false,
    };
}

function getEnabledTrackTypes() {
    return readTrackTypes()
        .filter(track => track.enabled)
        .map(track => track.name);
}

function broadcastRegistrationsUpdated() {
    io.emit('registrationsUpdated');
}

function broadcastClassesUpdated() {
    io.emit('classesUpdated');
}

function parseCookies(cookieHeader = '') {
    return cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, pair) => {
            const separatorIndex = pair.indexOf('=');
            if (separatorIndex === -1) {
                return cookies;
            }

            const key = pair.slice(0, separatorIndex).trim();
            const value = pair.slice(separatorIndex + 1).trim();
            cookies[key] = decodeURIComponent(value);
            return cookies;
        }, {});
}

function getAdminSessionToken(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[ADMIN_COOKIE_NAME];
}

function getAdminSession(req) {
    const token = getAdminSessionToken(req);
    const session = token ? adminSessions.get(token) : null;
    if (!session?.username) {
        return null;
    }

    const user = getUserByUsername(session.username);
    if (!user) {
        if (token) {
            adminSessions.delete(token);
        }
        return null;
    }

    return {
        username: user.username,
        role: user.role,
    };
}

function isAuthenticated(req) {
    return Boolean(getAdminSession(req));
}

function isAdminAuthenticated(req) {
    return getAdminSession(req)?.role === 'administrator';
}

function setAdminCookie(res, token) {
    const cookieParts = [
        `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
    ];

    if (isProduction) {
        cookieParts.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearAdminCookie(res) {
    const cookieParts = [
        `${ADMIN_COOKIE_NAME}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0',
    ];

    if (isProduction) {
        cookieParts.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function requireAuthenticated(req, res, next) {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'Admin login required' });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!isAdminAuthenticated(req)) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildRegistrationCsv(trackName) {
    const regs = readRegistrations();
    const classes = readClasses();
    const trackLabel = trackName ? normalizeTrackType(trackName) : null;
    const classNames = trackLabel
        ? classes.filter(item => item.type === trackLabel).map(item => item.name)
        : null;
    const classNameSet = classNames ? new Set(classNames) : null;
    const lines = ['FirstName,LastName,ClassName,IsPaid'];

    Object.values(regs).forEach(r => {
        const firstName = r.firstName || '';
        const lastName = r.lastName || '';
        (r.classes || []).forEach(c => {
            if (!classNameSet || classNameSet.has(c)) {
                lines.push(`${csvCell(firstName)},${csvCell(lastName)},${csvCell(c)},"True"`);
            }
        });
    });

    return {
        csv: lines.join('\n'),
        trackLabel,
    };
}

initializeDatabase();

function normalizeMatchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function levenshteinDistance(left, right) {
    const a = normalizeMatchText(left);
    const b = normalizeMatchText(right);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        for (let column = 1; column <= b.length; column += 1) {
            current[column] = Math.min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
            );
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[b.length];
}

function driverSimilarity(candidateName, driver) {
    const forward = `${driver.firstName} ${driver.lastName}`;
    const reverse = `${driver.lastName} ${driver.firstName}`;
    const candidate = normalizeMatchText(candidateName);
    const distance = Math.min(
        levenshteinDistance(candidate, forward),
        levenshteinDistance(candidate, reverse)
    );
    const length = Math.max(candidate.length, normalizeMatchText(forward).length, 1);
    return Math.max(0, 1 - (distance / length));
}

function findDriverSuggestions(firstName, lastName, rawName, drivers) {
    const candidateName = `${firstName || ''} ${lastName || ''}`.trim() || rawName;
    return drivers
        .map(driver => ({
            firstName: driver.firstName,
            lastName: driver.lastName,
            similarity: driverSimilarity(candidateName, driver),
        }))
        .filter(driver => driver.similarity >= 0.55)
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, 3);
}

function buildSheetExtractionSchema(classNames, trackName) {
    const classSelection = {
        type: 'object',
        additionalProperties: false,
        properties: {
            className: { type: 'string', enum: classNames },
            selected: { type: 'boolean' },
            crossedOut: { type: 'boolean' },
            confidence: { type: 'number' },
        },
        required: ['className', 'selected', 'crossedOut', 'confidence'],
    };

    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            trackName: { type: 'string', enum: [trackName] },
            rows: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        rowNumber: { type: 'integer' },
                        rawName: { type: 'string' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        nameConfidence: { type: 'number' },
                        crossedOut: { type: 'boolean' },
                        classSelections: {
                            type: 'array',
                            items: classSelection,
                        },
                        notes: { type: 'string' },
                    },
                    required: [
                        'rowNumber',
                        'rawName',
                        'firstName',
                        'lastName',
                        'nameConfidence',
                        'crossedOut',
                        'classSelections',
                        'notes',
                    ],
                },
            },
        },
        required: ['trackName', 'rows'],
    };
}

async function analyzeRegistrationSheet({ imageBuffer, mimeType, trackName, raceClasses, drivers }) {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error('Set OPENAI_API_KEY on the server to enable GPT sheet scanning');
        error.statusCode = 503;
        throw error;
    }

    const classNames = raceClasses.map(item => item.name);
    const driverNames = drivers.map(driver => `${driver.firstName} ${driver.lastName}`);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = [
        'Read this photographed RacePlaceRC registration sheet.',
        `The verified track is: ${trackName}.`,
        `Each race column is labeled with its full class name. From left to right, the columns are: ${classNames.join('; ')}.`,
        `Known driver names are: ${driverNames.length ? driverNames.join('; ') : '(none)'}.`,
        'Return every non-empty handwritten racer row, including rows that were crossed out.',
        'Names may be written first-last or last-first. Use known drivers only as spelling evidence, never invent a person.',
        'Preserve an unknown handwritten name as closely as possible and split it into likely firstName and lastName.',
        'Set the row crossedOut field true only when the racer name or the entire row is clearly scratched through or canceled.',
        'For every returned row, include every supplied race class once and in order.',
        'For a race cell, set selected true only for a clear active mark. Set crossedOut true when a previous mark was clearly scratched out or canceled, and set selected false for that cell.',
        'A race selection cannot be both selected and crossedOut. Use false for both when the cell is blank.',
        'Confidence values must be between 0 and 1. Use notes for ambiguous scratch-outs, overwritten marks, or unclear handwriting.',
    ].join('\n');

    const response = await client.responses.create({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-5.6-terra',
        store: false,
        input: [
            {
                role: 'user',
                content: [
                    { type: 'input_text', text: prompt },
                    {
                        type: 'input_image',
                        image_url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
                        detail: 'high',
                    },
                ],
            },
        ],
        text: {
            format: {
                type: 'json_schema',
                name: 'race_registration_sheet',
                strict: true,
                schema: buildSheetExtractionSchema(classNames, trackName),
            },
        },
    });

    if (!response.output_text) {
        throw new Error('GPT did not return registration sheet data');
    }

    return JSON.parse(response.output_text);
}

function prepareSheetRows(extraction, raceClasses, drivers) {
    const availableClassNames = new Set(raceClasses.map(item => item.name));

    return (Array.isArray(extraction?.rows) ? extraction.rows : [])
        .filter(row => row && String(row.rawName || `${row.firstName || ''} ${row.lastName || ''}`).trim())
        .map((row, index) => {
            const firstName = String(row.firstName || '').trim();
            const lastName = String(row.lastName || '').trim();
            const rawName = String(row.rawName || `${firstName} ${lastName}`).trim();
            const suggestions = findDriverSuggestions(firstName, lastName, rawName, drivers);
            const bestSuggestion = suggestions[0];
            const runnerUp = suggestions[1];
            const hasClearMatch = bestSuggestion?.similarity >= 0.88 &&
                (!runnerUp || bestSuggestion.similarity - runnerUp.similarity >= 0.08);
            const classes = (Array.isArray(row.classSelections) ? row.classSelections : [])
                .filter(item => item?.selected && !item?.crossedOut && availableClassNames.has(item.className))
                .map(item => item.className);
            const crossedOutClasses = (Array.isArray(row.classSelections) ? row.classSelections : [])
                .filter(item => item?.crossedOut && availableClassNames.has(item.className))
                .map(item => item.className);
            const lowConfidenceMarks = (Array.isArray(row.classSelections) ? row.classSelections : [])
                .filter(item => (item?.selected || item?.crossedOut) && Number(item.confidence) < 0.7)
                .map(item => item.className);
            const warnings = [];
            const crossedOut = row.crossedOut === true;

            if (crossedOut) warnings.push('Racer row appears crossed out');
            if (crossedOutClasses.length) warnings.push(`Crossed-out race marks: ${crossedOutClasses.join(', ')}`);
            if (Number(row.nameConfidence) < 0.75) warnings.push('Check the handwritten name');
            if (lowConfidenceMarks.length) warnings.push(`Check race marks: ${lowConfidenceMarks.join(', ')}`);
            if (!classes.length) warnings.push('No race class was selected');
            if (!firstName || !lastName) warnings.push('First and last name are required');

            return {
                id: crypto.randomUUID(),
                rowNumber: Number.isInteger(row.rowNumber) ? row.rowNumber : index + 1,
                rawName,
                firstName: hasClearMatch ? bestSuggestion.firstName : firstName,
                lastName: hasClearMatch ? bestSuggestion.lastName : lastName,
                nameConfidence: Math.max(0, Math.min(1, Number(row.nameConfidence) || 0)),
                classes: [...new Set(classes)],
                crossedOut,
                crossedOutClasses: [...new Set(crossedOutClasses)],
                existingDriver: hasClearMatch ? {
                    firstName: bestSuggestion.firstName,
                    lastName: bestSuggestion.lastName,
                } : null,
                suggestions,
                isNewDriver: !hasClearMatch,
                included: !crossedOut,
                notes: String(row.notes || '').trim(),
                warnings,
            };
        });
}

function uploadRegistrationSheet(req, res, next) {
    sheetUpload.single('sheet')(req, res, error => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'The sheet image must be 10 MB or smaller'
            : error.message;
        res.status(400).json({ error: message });
    });
}

app.get('/classes', (req, res) => {
    res.json(readClasses());
});

app.get('/admin/session', (req, res) => {
    const session = getAdminSession(req);
    res.json({
        authenticated: Boolean(session),
        username: session?.username || null,
        role: session?.role || null,
    });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    const normalizedUsername = (username || '').trim();
    const user = getUserByUsername(normalizedUsername);

    if (!user || !bcrypt.compareSync(String(password || ''), user.password)) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    adminSessions.set(token, {
        username: user.username,
    });
    setAdminCookie(res, token);
    res.json({
        success: true,
        username: user.username,
        role: user.role,
    });
});

app.post('/admin/logout', requireAuthenticated, (req, res) => {
    const token = getAdminSessionToken(req);
    if (token) {
        adminSessions.delete(token);
    }

    clearAdminCookie(res);
    res.json({ success: true });
});

app.get('/admin/users', requireAdmin, (req, res) => {
    const users = readUsers().map(user => ({
        username: user.username,
        role: user.role,
    }));

    res.json(users);
});

app.post('/admin/users', requireAdmin, (req, res) => {
    const { username, password, role } = req.body || {};
    const normalizedUsername = (username || '').trim();
    const normalizedPassword = String(password || '');
    const normalizedRole = role === 'administrator' ? 'administrator' : 'user';

    if (!normalizedUsername || !normalizedPassword) {
        return res.status(400).json({ error: 'username and password are required' });
    }

    try {
        insertUser({
            username: normalizedUsername,
            password: normalizedPassword,
            role: normalizedRole,
        });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'A user with that username already exists' });
        }
        throw err;
    }

    res.json({ success: true });
});

app.put('/admin/users/:username', requireAdmin, (req, res) => {
    const originalUsername = decodeURIComponent(req.params.username || '').trim();
    const { password, role } = req.body || {};
    const normalizedPassword = password == null ? null : String(password);
    const normalizedRole = role === 'administrator' ? 'administrator' : 'user';
    const user = getUserByUsername(originalUsername);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (
        user.role === 'administrator' &&
        normalizedRole !== 'administrator' &&
        countAdministrators() <= 1
    ) {
        return res.status(400).json({ error: 'At least one admin user is required' });
    }

    updateUserRecord(user.username, {
        password: normalizedPassword,
        role: normalizedRole,
    });

    res.json({ success: true });
});

app.delete('/admin/users/:username', requireAdmin, (req, res) => {
    const username = decodeURIComponent(req.params.username || '').trim();
    const userToDelete = getUserByUsername(username);

    if (!userToDelete) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (userToDelete.role === 'administrator' && countAdministrators() <= 1) {
        return res.status(400).json({ error: 'At least one admin user is required' });
    }

    deleteUserByUsername(userToDelete.username);

    for (const [token, session] of adminSessions.entries()) {
        if (session.username === userToDelete.username) {
            adminSessions.delete(token);
        }
    }

    res.json({ success: true });
});

app.get('/track', (req, res) => {
    res.json(readTrackTypes());
});

app.post('/track', requireAuthenticated, (req, res) => {
    const { trackTypes } = req.body;
    if (!Array.isArray(trackTypes)) {
        return res.status(400).json({ error: 'trackTypes must be array' });
    }

    try {
        replaceAllTrackTypes(trackTypes);
        broadcastClassesUpdated();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/drivers', (req, res) => {
    const name = (req.query.name || '').trim().toLowerCase();
    const lastName = (req.query.lastName || '').trim().toLowerCase();

    if (!name && !lastName && !isAuthenticated(req)) {
        return res.status(401).json({ error: 'Admin login required' });
    }

    const drivers = readDrivers();
    if (name) {
        const terms = name.split(/\s+/);
        const matches = drivers.filter(driver => {
            const nameParts = [driver.firstName, driver.lastName]
                .map(part => (part || '').trim().toLowerCase());
            return terms.every(term => nameParts.some(part => part.includes(term)));
        });
        return res.json(matches);
    }
    if (!lastName) {
        return res.json(drivers);
    }
    res.json(findDriversByLastName(lastName));
});

app.post('/drivers', requireAuthenticated, (req, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    addDriverIfMissing(firstName, lastName);
    res.json({ success: true });
});

app.delete('/drivers', requireAuthenticated, (req, res) => {
    const firstName = (req.query.firstName || '').trim();
    const lastName = (req.query.lastName || '').trim();
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'firstName and lastName query params required' });
    }
    deleteDriverByName(firstName, lastName);
    res.json({ success: true });
});

app.post(
    '/admin/sheet-import/analyze',
    requireAuthenticated,
    uploadRegistrationSheet,
    async (req, res) => {
        const trackName = String(req.body?.trackName || '').trim();
        const track = readTrackTypes().find(item => item.name === trackName && item.enabled);
        const raceClasses = readClasses().filter(item => item.type === trackName);

        if (!track || raceClasses.length === 0) {
            return res.status(400).json({ error: 'Select an open track with configured race classes' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Take or select a registration sheet photo' });
        }

        try {
            const drivers = readDrivers();
            const extraction = await analyzeRegistrationSheet({
                imageBuffer: req.file.buffer,
                mimeType: req.file.mimetype,
                trackName,
                raceClasses,
                drivers,
            });
            const rows = prepareSheetRows(extraction, raceClasses, drivers);
            res.json({
                trackName,
                raceClasses,
                rows,
                model: process.env.OPENAI_VISION_MODEL || 'gpt-5.6-terra',
            });
        } catch (error) {
            console.error('Unable to analyze registration sheet:', error);
            const statusCode = error.statusCode === 503
                ? 503
                : (error.status === 429 ? 429 : 502);
            res.status(statusCode).json({ error: error.message || 'Unable to analyze registration sheet' });
        }
    }
);

app.post('/admin/sheet-import/commit', requireAuthenticated, (req, res) => {
    const trackName = String(req.body?.trackName || '').trim();
    const rows = req.body?.rows;
    const raceClasses = readClasses().filter(item => item.type === trackName);
    const availableClassNames = new Set(raceClasses.map(item => item.name));

    if (!trackName || raceClasses.length === 0) {
        return res.status(400).json({ error: 'The selected track has no configured race classes' });
    }
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) {
        return res.status(400).json({ error: 'Include between 1 and 100 verified racer rows' });
    }

    const verifiedRows = rows
        .filter(row => row?.included !== false)
        .map(row => ({
            firstName: String(row.firstName || '').trim().replace(/\s+/g, ' '),
            lastName: String(row.lastName || '').trim().replace(/\s+/g, ' '),
            classes: [...new Set(Array.isArray(row.classes) ? row.classes : [])],
        }));

    const invalidRow = verifiedRows.find(row =>
        !row.firstName ||
        !row.lastName ||
        row.firstName.length > 80 ||
        row.lastName.length > 80 ||
        row.classes.length === 0 ||
        row.classes.some(className => !availableClassNames.has(className))
    );
    if (invalidRow) {
        return res.status(400).json({
            error: 'Every included racer needs a valid first name, last name, and at least one race class',
        });
    }
    if (verifiedRows.length === 0) {
        return res.status(400).json({ error: 'Include at least one verified racer' });
    }

    try {
        const registrations = readRegistrations();
        const drivers = readDrivers();
        let newDriverCount = 0;

        verifiedRows.forEach(row => {
            const submittedName = `${row.firstName} ${row.lastName}`;
            const normalizedSubmittedName = normalizeMatchText(submittedName);
            const existingDriver = drivers.find(driver =>
                normalizeMatchText(`${driver.firstName} ${driver.lastName}`) === normalizedSubmittedName
            );
            const canonicalFirstName = existingDriver?.firstName || row.firstName;
            const canonicalLastName = existingDriver?.lastName || row.lastName;
            const canonicalName = `${canonicalFirstName} ${canonicalLastName}`;

            if (!existingDriver) {
                drivers.push({ firstName: canonicalFirstName, lastName: canonicalLastName });
                newDriverCount += 1;
            }

            const existingKey = Object.keys(registrations).find(key =>
                normalizeMatchText(key) === normalizeMatchText(canonicalName)
            );
            const existingRegistration = existingKey ? registrations[existingKey] : null;
            if (existingKey && existingKey !== canonicalName) {
                delete registrations[existingKey];
            }
            registrations[canonicalName] = {
                name: canonicalName,
                firstName: canonicalFirstName,
                lastName: canonicalLastName,
                classes: [...new Set([...(existingRegistration?.classes || []), ...row.classes])],
                registeredAt: existingRegistration?.registeredAt || new Date().toISOString(),
            };
        });

        replaceDriversAndRegistrations(drivers, registrations);
        broadcastRegistrationsUpdated();
        res.json({
            success: true,
            importedCount: verifiedRows.length,
            newDriverCount,
            downloadUrl: `/download/${encodeURIComponent(trackName)}`,
        });
    } catch (error) {
        console.error('Unable to import verified registration sheet:', error);
        res.status(500).json({ error: 'Unable to save the verified registration sheet' });
    }
});

app.get('/backup', requireAuthenticated, (req, res) => {
    const backup = {
        classes: readClasses(),
        registrations: readRegistrations(),
        trackTypes: readTrackTypes(),
        drivers: readDrivers(),
    };
    const filename = `raceplace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
});

app.post('/restore', requireAuthenticated, (req, res) => {
    try {
        const { classes, classesByType, registrations, trackTypes, drivers } = req.body;
        if (Array.isArray(classes)) replaceAllClasses(classes);
        if (classesByType && typeof classesByType === 'object' && !Array.isArray(classesByType)) {
            for (const [type, classList] of Object.entries(classesByType)) {
                if (!Array.isArray(classList)) {
                    throw new Error(`Classes for ${type} must be an array`);
                }
                replaceClassesForType(type, classList);
            }
        }
        if (registrations && typeof registrations === 'object') replaceAllRegistrations(registrations);
        if (Array.isArray(trackTypes)) replaceAllTrackTypes(trackTypes);
        if (Array.isArray(drivers)) replaceAllDrivers(drivers);
        broadcastRegistrationsUpdated();
        broadcastClassesUpdated();
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/classes', requireAuthenticated, (req, res) => {
    const { classes } = req.body;
    if (!Array.isArray(classes)) {
        return res.status(400).json({ error: 'classes must be array' });
    }
    try {
        replaceAllClasses(classes);
        broadcastClassesUpdated();
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving classes:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/registrations', (req, res) => {
    const regs = readRegistrations();
    res.json(regs);
});

app.delete('/registrations/:name', requireAuthenticated, (req, res) => {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }

    if (!deleteRegistrationByName(name)) {
        return res.status(404).json({ error: 'registration not found' });
    }

    broadcastRegistrationsUpdated();
    res.json({ success: true });
});

app.post('/register', (req, res) => {
    const { firstName, lastName, classes, originalName } = req.body;
    const normalizedFirstName = (firstName || '').trim();
    const normalizedLastName = (lastName || '').trim();
    const name = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const enabledTrackTypes = getEnabledTrackTypes();
    const availableClasses = readClasses()
        .filter(item => enabledTrackTypes.includes(item.type))
        .map(item => item.name);

    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    if (enabledTrackTypes.length === 0) {
        return res.status(400).json({ error: 'Registrations are closed at this time' });
    }
    if (!Array.isArray(classes) || classes.some(item => !availableClasses.includes(item))) {
        return res.status(400).json({ error: 'One or more selected classes are unavailable' });
    }

    upsertRegistration({
        name,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        classes,
        originalName,
    });
    addDriverIfMissing(normalizedFirstName, normalizedLastName);
    broadcastRegistrationsUpdated();
    res.json({ success: true });
});

app.get('/download', requireAuthenticated, (req, res) => {
    const { csv } = buildRegistrationCsv();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date} Race Registrations.csv`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'text/csv');
    res.send(csv);
});

app.get('/download/:trackName', requireAuthenticated, (req, res) => {
    const { csv, trackLabel } = buildRegistrationCsv(req.params.trackName);
    const date = new Date().toISOString().slice(0, 10);
    const filenameLabel = (trackLabel || req.params.trackName || 'Track').replace(/[^\w\s-]/g, '').trim() || 'Track';
    const filename = `${date} ${filenameLabel} Race Registrations.csv`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'text/csv');
    res.send(csv);
});

app.post('/reset', requireAuthenticated, (req, res) => {
    replaceAllRegistrations({});
    broadcastRegistrationsUpdated();
    res.json({ success: true });
});

if (isProduction) {
    const buildDir = path.join(__dirname, '../client/build');
    const indexFile = path.join(buildDir, 'index.html');

    app.use(express.static(buildDir));

    app.use((req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }
        if (!fs.existsSync(indexFile)) {
            return next(new Error(`Missing production build file: ${indexFile}`));
        }

        res.sendFile(indexFile);
    });
}

function closeDatabase() {
    try {
        db.close();
    } catch (err) {
        console.error('Error closing database:', err);
    }
}

function shutdown() {
    closeDatabase();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 4000;
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
    });
}

module.exports = {
    app,
    buildSheetExtractionSchema,
    closeDatabase,
    normalizeMatchText,
    prepareSheetRows,
    replaceClassesForType,
    server,
};
