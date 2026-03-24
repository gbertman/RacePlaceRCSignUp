const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
const DEFAULT_ADMIN_USER = {
    username: 'admin',
    password: 'admin',
    role: 'administrator',
};
const ADMIN_COOKIE_NAME = 'raceplace_admin_session';
const adminSessions = new Map();
const TRACK_TYPE_ALIASES = {
    'on-road': 'On Road',
    'off-road': 'Off Road',
    'on road': 'On Road',
    'off road': 'Off Road',
};

// ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// ensure driver list file exists
if (!fs.existsSync(DRIVERS_FILE)) {
    fs.writeFileSync(DRIVERS_FILE, JSON.stringify([], null, 2), 'utf8');
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([DEFAULT_ADMIN_USER], null, 2), 'utf8');
}

// read classes from file; format is JSON array of { name, type }
function readClasses() {
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

// save classes array to file
function saveClasses(list) {
    const normalized = list.map(item => ({
        ...item,
        type: normalizeTrackType(item.type),
    }));
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

// read registrations JSON, returns object keyed by name
function readRegistrations() {
    if (!fs.existsSync(REG_FILE)) return {};
    const txt = fs.readFileSync(REG_FILE, 'utf8');
    try {
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
                        firstName: value.firstName || firstName,
                        lastName: value.lastName || lastNameParts.join(' '),
                    },
                ];
            })
        );
    } catch {
        return {};
    }
}

function saveRegistrations(regs) {
    fs.writeFileSync(REG_FILE, JSON.stringify(regs, null, 2), 'utf8');
}

function readTrackTypes() {
    if (!fs.existsSync(TRACK_FILE)) return [];
    try {
        const json = fs.readFileSync(TRACK_FILE, 'utf8');
        return JSON.parse(json).map(normalizeTrackConfig);
    } catch {
        return [];
    }
}

function saveTrackTypes(types) {
    fs.writeFileSync(
        TRACK_FILE,
        JSON.stringify(types.map(normalizeTrackConfig), null, 2),
        'utf8'
    );
}

function readDrivers() {
    if (!fs.existsSync(DRIVERS_FILE)) return [];
    try {
        const json = fs.readFileSync(DRIVERS_FILE, 'utf8');
        return JSON.parse(json);
    } catch {
        return [];
    }
}

function saveDrivers(drivers) {
    fs.writeFileSync(DRIVERS_FILE, JSON.stringify(drivers, null, 2), 'utf8');
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

function readUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        return [DEFAULT_ADMIN_USER];
    }

    try {
        const json = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(json);
        const users = Array.isArray(parsed) ? parsed.map(normalizeUser).filter(user => user.username) : [];
        const hasAdmin = users.some(user => user.role === 'administrator');

        if (!hasAdmin) {
            users.unshift(DEFAULT_ADMIN_USER);
            saveUsers(users);
        }

        return users;
    } catch {
        return [DEFAULT_ADMIN_USER];
    }
}

function saveUsers(users) {
    const normalizedUsers = users
        .map(normalizeUser)
        .filter(user => user.username);
    const hasAdmin = normalizedUsers.some(user => user.role === 'administrator');
    const finalUsers = hasAdmin ? normalizedUsers : [DEFAULT_ADMIN_USER, ...normalizedUsers];

    fs.writeFileSync(USERS_FILE, JSON.stringify(finalUsers, null, 2), 'utf8');
}

function addDriverIfMissing(firstName, lastName) {
    const normalizedFirstName = (firstName || '').trim();
    const normalizedLastName = (lastName || '').trim();

    if (!normalizedFirstName || !normalizedLastName) {
        return;
    }

    const drivers = readDrivers();
    const exists = drivers.some(
        driver =>
            driver.firstName.trim().toLowerCase() === normalizedFirstName.toLowerCase() &&
            driver.lastName.trim().toLowerCase() === normalizedLastName.toLowerCase()
    );

    if (!exists) {
        drivers.push({ firstName: normalizedFirstName, lastName: normalizedLastName });
        saveDrivers(drivers);
    }
}

function broadcastRegistrationsUpdated() {
    io.emit('registrationsUpdated');
}

function broadcastClassesUpdated() {
    io.emit('classesUpdated');
}

function normalizeTrackType(type) {
    const value = (type || '').trim();
    if (!value) return 'Other';
    return TRACK_TYPE_ALIASES[value.toLowerCase()] || value;
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

    const user = readUsers().find(item => item.username === session.username);
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
                lines.push(`"${firstName}","${lastName}","${c}","True"`);
            }
        });
    });

    return {
        csv: lines.join('\n'),
        trackLabel,
    };
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
    const users = readUsers();
    const user = users.find(item => item.username === normalizedUsername);

    if (!user || user.password !== password) {
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

    const users = readUsers();
    if (users.some(user => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
        return res.status(400).json({ error: 'A user with that username already exists' });
    }

    users.push({
        username: normalizedUsername,
        password: normalizedPassword,
        role: normalizedRole,
    });
    saveUsers(users);
    res.json({ success: true });
});

app.put('/admin/users/:username', requireAdmin, (req, res) => {
    const originalUsername = decodeURIComponent(req.params.username || '').trim();
    const { password, role } = req.body || {};
    const normalizedPassword = password == null ? null : String(password);
    const normalizedRole = role === 'administrator' ? 'administrator' : 'user';
    const users = readUsers();
    const index = users.findIndex(user => user.username === originalUsername);

    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (users[index].username === DEFAULT_ADMIN_USER.username && normalizedRole !== 'administrator') {
        return res.status(400).json({ error: 'The default admin user must keep admin access' });
    }

    users[index] = {
        ...users[index],
        role: normalizedRole,
        password: normalizedPassword !== null && normalizedPassword !== '' ? normalizedPassword : users[index].password,
    };

    saveUsers(users);

    res.json({ success: true });
});

app.delete('/admin/users/:username', requireAdmin, (req, res) => {
    const username = decodeURIComponent(req.params.username || '').trim();
    const users = readUsers();
    const userToDelete = users.find(user => user.username === username);

    if (!userToDelete) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (userToDelete.username === DEFAULT_ADMIN_USER.username) {
        return res.status(400).json({ error: 'The default admin user cannot be deleted' });
    }

    const remainingAdmins = users.filter(user => user.username !== username && user.role === 'administrator');
    if (userToDelete.role === 'administrator' && remainingAdmins.length === 0) {
        return res.status(400).json({ error: 'At least one admin user is required' });
    }

    saveUsers(users.filter(user => user.username !== username));

    for (const [token, session] of adminSessions.entries()) {
        if (session.username === username) {
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
        saveTrackTypes(trackTypes);
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

    const lastName = (req.query.lastName || '').trim().toLowerCase();
    const drivers = readDrivers();
    if (!lastName) {
        return res.json(drivers);
    }
    const matches = drivers.filter(d => d.lastName.toLowerCase() === lastName);
    res.json(matches);
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
    const drivers = readDrivers();
    const filtered = drivers.filter(
        d =>
            d.firstName.toLowerCase() !== firstName.toLowerCase() ||
            d.lastName.toLowerCase() !== lastName.toLowerCase()
    );
    saveDrivers(filtered);
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
        if (Array.isArray(classes)) saveClasses(classes);
        if (registrations && typeof registrations === 'object') saveRegistrations(registrations);
        if (Array.isArray(trackTypes)) saveTrackTypes(trackTypes);
        if (Array.isArray(drivers)) saveDrivers(drivers);
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
        saveClasses(classes);
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

    const regs = readRegistrations();
    if (!regs[name]) {
        return res.status(404).json({ error: 'registration not found' });
    }

    delete regs[name];
    saveRegistrations(regs);
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

    const regs = readRegistrations();
    if (originalName && originalName !== name && regs[originalName]) {
        delete regs[originalName];
    }
    regs[name] = {
        name,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        classes: classes || [],
    };
    saveRegistrations(regs);
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

// clear all registrations
app.post('/reset', requireAuthenticated, (req, res) => {
    saveRegistrations({});
    broadcastRegistrationsUpdated();
    res.json({ success: true });
});

if (isProduction) {
    const buildDir = path.join(__dirname, '../client/build');
    const indexFile = path.join(buildDir, 'index.html');

    app.use(express.static(buildDir));

    // catch-all handler for client-side routing (use generic middleware, not path-to-regexp)
    app.use((req, res, next) => {
        if (!fs.existsSync(indexFile)) {
            return next(new Error(`Missing production build file: ${indexFile}`));
        }

        res.sendFile(indexFile);
    });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});


