const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
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
app.use(bodyParser.json());

const DATA_DIR = path.join(__dirname, 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const REG_FILE = path.join(DATA_DIR, 'registrations.json');
const TRACK_FILE = path.join(DATA_DIR, 'track.json');
const DRIVERS_FILE = path.join(DATA_DIR, 'drivers.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEFAULT_ADMIN_PASSWORD = 'admin';
const BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_ADMIN_USER = {
    username: 'admin',
    password: DEFAULT_ADMIN_PASSWORD,
    role: 'administrator',
};
const ADMIN_COOKIE_NAME = 'raceplace_admin_session';
const adminSessions = new Map();

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
    migrateJsonDataIfNeeded();
    ensureDefaultAdmin();
}

function migrateJsonDataIfNeeded() {
    const usersCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const classesCount = db.prepare('SELECT COUNT(*) AS count FROM classes').get().count;
    const trackCount = db.prepare('SELECT COUNT(*) AS count FROM track').get().count;
    const driversCount = db.prepare('SELECT COUNT(*) AS count FROM drivers').get().count;
    const registrationsCount = db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count;

    if (usersCount === 0 && fs.existsSync(USERS_FILE)) {
        replaceAllUsers(readUsersJson());
    }
    if (classesCount === 0 && fs.existsSync(CLASSES_FILE)) {
        replaceAllClasses(readClassesJson());
    }
    if (trackCount === 0 && fs.existsSync(TRACK_FILE)) {
        replaceAllTrackTypes(readTrackTypesJson());
    }
    if (driversCount === 0 && fs.existsSync(DRIVERS_FILE)) {
        replaceAllDrivers(readDriversJson());
    }
    if (registrationsCount === 0 && fs.existsSync(REG_FILE)) {
        replaceAllRegistrations(readRegistrationsJson());
    }
}

function ensureDefaultAdmin() {
    const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'administrator' LIMIT 1").get();
    if (!hasAdmin) {
        const normalized = normalizeStoredUser(DEFAULT_ADMIN_USER);
        db.prepare('INSERT OR REPLACE INTO users (username, password, role) VALUES (?, ?, ?)')
            .run(normalized.username, normalized.password, normalized.role);
    }
}

function readClassesJson() {
    if (!fs.existsSync(CLASSES_FILE)) return [];
    try {
        const json = fs.readFileSync(CLASSES_FILE, 'utf8');
        return JSON.parse(json).map(item => ({
            ...item,
            type: normalizeTrackType(item.type),
        }));
    } catch {
        return [];
    }
}

function readRegistrationsJson() {
    if (!fs.existsSync(REG_FILE)) return {};
    try {
        const txt = fs.readFileSync(REG_FILE, 'utf8');
        const regs = JSON.parse(txt);
        return Object.fromEntries(
            Object.entries(regs).map(([key, value]) => {
                const name = value.name || key;
                const [firstName = '', ...lastNameParts] = name.split(' ');
                return [
                    key,
                    {
                        ...value,
                        name,
                        firstName,
                        lastName: lastNameParts.join(' '),
                        registeredAt: value.registeredAt,
                    },
                ];
            })
        );
    } catch {
        return {};
    }
}

function readTrackTypesJson() {
    if (!fs.existsSync(TRACK_FILE)) return [];
    try {
        const json = fs.readFileSync(TRACK_FILE, 'utf8');
        return JSON.parse(json).map(normalizeTrackConfig);
    } catch {
        return [];
    }
}

function readDriversJson() {
    if (!fs.existsSync(DRIVERS_FILE)) return [];
    try {
        const json = fs.readFileSync(DRIVERS_FILE, 'utf8');
        return JSON.parse(json);
    } catch {
        return [];
    }
}

function readUsersJson() {
    if (!fs.existsSync(USERS_FILE)) {
        return [normalizeStoredUser(DEFAULT_ADMIN_USER)];
    }
    try {
        const json = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) return [normalizeStoredUser(DEFAULT_ADMIN_USER)];
        return parsed.map(normalizeStoredUser).filter(user => user.username);
    } catch {
        return [normalizeStoredUser(DEFAULT_ADMIN_USER)];
    }
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

function replaceAllUsers(users) {
    const normalizedUsers = users
        .map(normalizeStoredUser)
        .filter(user => user.username);
    const insert = db.prepare('INSERT OR REPLACE INTO users (username, password, role) VALUES (?, ?, ?)');
    const transaction = db.transaction((items) => {
        db.prepare('DELETE FROM users').run();
        for (const user of items) {
            insert.run(user.username, user.password, user.role);
        }
    });
    transaction(normalizedUsers);
    ensureDefaultAdmin();
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

    if (user.username === DEFAULT_ADMIN_USER.username && normalizedRole !== 'administrator') {
        return res.status(400).json({ error: 'The default admin user must keep admin access' });
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

    if (userToDelete.username === DEFAULT_ADMIN_USER.username) {
        return res.status(400).json({ error: 'The default admin user cannot be deleted' });
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
    if (!req.query.lastName && !isAuthenticated(req)) {
        return res.status(401).json({ error: 'Admin login required' });
    }

    const lastName = (req.query.lastName || '').trim();
    if (!lastName) {
        return res.json(readDrivers());
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
        const { classes, registrations, trackTypes, drivers } = req.body;
        if (Array.isArray(classes)) replaceAllClasses(classes);
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

function shutdown() {
    try {
        db.close();
    } catch (err) {
        console.error('Error closing database:', err);
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
