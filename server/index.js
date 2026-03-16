const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DATA_DIR = path.join(__dirname, 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const OLD_CLASSES_TXT = path.join(DATA_DIR, 'classes.txt');
const REG_FILE = path.join(DATA_DIR, 'registrations.json');
const TRACK_FILE = path.join(DATA_DIR, 'track.json');

// ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// read classes from file; format is JSON array of { name, type }
function readClasses() {
    // migrate old text file if present
    if (!fs.existsSync(CLASSES_FILE) && fs.existsSync(OLD_CLASSES_TXT)) {
        const txt = fs.readFileSync(OLD_CLASSES_TXT, 'utf8');
        const names = txt.split(/\r?\n/).filter(Boolean);
        const arr = names.map(n => ({ name: n, type: 'offroad' }));
        fs.writeFileSync(CLASSES_FILE, JSON.stringify(arr, null, 2), 'utf8');
        fs.unlinkSync(OLD_CLASSES_TXT);
        return arr;
    }

    if (!fs.existsSync(CLASSES_FILE)) return [];
    try {
        const json = fs.readFileSync(CLASSES_FILE, 'utf8');
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

// save classes array to file
function saveClasses(list) {
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// read registrations JSON, returns object keyed by name
function readRegistrations() {
    if (!fs.existsSync(REG_FILE)) return {};
    const txt = fs.readFileSync(REG_FILE, 'utf8');
    try {
        return JSON.parse(txt);
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
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

function saveTrackTypes(types) {
    fs.writeFileSync(TRACK_FILE, JSON.stringify(types, null, 2), 'utf8');
}

app.get('/classes', (req, res) => {
    res.json(readClasses());
});

app.get('/track', (req, res) => {
    res.json(readTrackTypes());
});

app.get('/backup', (req, res) => {
    const backup = {
        classes: readClasses(),
        registrations: readRegistrations(),
        trackTypes: readTrackTypes(),
    };
    const filename = `raceplace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
});

app.post('/restore', (req, res) => {
    try {
        const { classes, registrations, trackTypes } = req.body;
        if (Array.isArray(classes)) saveClasses(classes);
        if (registrations && typeof registrations === 'object') saveRegistrations(registrations);
        if (Array.isArray(trackTypes)) saveTrackTypes(trackTypes);
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

app.post('/register', (req, res) => {
    const { firstName, lastName, classes, originalName } = req.body;
    const name = `${firstName} ${lastName}`.trim();
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    const regs = readRegistrations();
    if (originalName && originalName !== name && regs[originalName]) {
        delete regs[originalName];
    }
    regs[name] = { name, classes: classes || [] };
    saveRegistrations(regs);
    res.json({ success: true });
});

app.get('/download', (req, res) => {
    const regs = readRegistrations();
    let lines = [];
    Object.values(regs).forEach(r => {
        r.classes.forEach(c => {
            lines.push(`"${r.name}","${c}"`);
        });
    });
    const csv = lines.join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=registrations.csv');
    res.set('Content-Type', 'text/csv');
    res.send(csv);
});

// clear all registrations
app.post('/reset', (req, res) => {
    saveRegistrations({});
    res.json({ success: true });
});

// serve static react build
app.use(express.static(path.join(__dirname, '../client/build')));

// catch-all handler for client-side routing (use generic middleware, not path-to-regexp)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});


