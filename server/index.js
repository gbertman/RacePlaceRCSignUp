const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
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

// read classes from file; format is JSON array of { name, type }
function readClasses() {
    if (!fs.existsSync(CLASSES_FILE)) return [];
    try {
        const json = fs.readFileSync(CLASSES_FILE, 'utf8');
        return JSON.parse(json).map(item => ({
            ...item,
            type: normalizeTrackType(item.type),
        }));
    } catch (e) {
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
    } catch (e) {
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
        return JSON.parse(json).map(normalizeTrackType);
    } catch (e) {
        return [];
    }
}

function saveTrackTypes(types) {
    fs.writeFileSync(
        TRACK_FILE,
        JSON.stringify(types.map(normalizeTrackType), null, 2),
        'utf8'
    );
}

function readDrivers() {
    if (!fs.existsSync(DRIVERS_FILE)) return [];
    try {
        const json = fs.readFileSync(DRIVERS_FILE, 'utf8');
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

function saveDrivers(drivers) {
    fs.writeFileSync(DRIVERS_FILE, JSON.stringify(drivers, null, 2), 'utf8');
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

app.get('/classes', (req, res) => {
    res.json(readClasses());
});

app.get('/track', (req, res) => {
    res.json(readTrackTypes());
});

app.get('/drivers', (req, res) => {
    const lastName = (req.query.lastName || '').trim().toLowerCase();
    const drivers = readDrivers();
    if (!lastName) {
        return res.json(drivers);
    }
    const matches = drivers.filter(d => d.lastName.toLowerCase() === lastName);
    res.json(matches);
});

app.post('/drivers', (req, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'firstName and lastName are required' });
    }
    addDriverIfMissing(firstName, lastName);
    res.json({ success: true });
});

app.delete('/drivers', (req, res) => {
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

app.get('/backup', (req, res) => {
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

app.post('/restore', (req, res) => {
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

app.post('/classes', (req, res) => {
    const { classes } = req.body;
    if (!Array.isArray(classes)) {
        return res.status(400).json({ error: 'classes must be array' });
    }
    console.log('Received POST /classes with:', classes);
    try {
        saveClasses(classes);
        console.log('Classes saved to', CLASSES_FILE);
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

app.delete('/registrations/:name', (req, res) => {
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
    if (!name) {
        return res.status(400).json({ error: 'name required' });
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

app.get('/download', (req, res) => {
    const regs = readRegistrations();
    const lines = ['FirstName,LastName,ClassName,IsPaid'];
    Object.values(regs).forEach(r => {
        const firstName = r.firstName || '';
        const lastName = r.lastName || '';
        r.classes.forEach(c => {
            lines.push(`"${firstName}","${lastName}","${c}","True"`);
        });
    });
    const csv = lines.join('\n');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date} Race Registrations.csv`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'text/csv');
    res.send(csv);
});

// clear all registrations
app.post('/reset', (req, res) => {
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


