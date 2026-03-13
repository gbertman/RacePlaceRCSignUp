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
const REG_FILE = path.join(DATA_DIR, 'registrations.json');
const TRACK_FILE = path.join(DATA_DIR, 'track.json');

// ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// read classes from file; format is JSON array of { name, type }
function readClasses() {
    if (!fs.existsSync(CLASSES_FILE)) return [];
    try {
        const json = fs.readFileSync(CLASSES_FILE, 'utf8');
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

function readTracks() {
    if (!fs.existsSync(TRACK_FILE)) return [];
    try {
        const json = fs.readFileSync(TRACK_FILE, 'utf8');
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

function buildFullName(firstName = '', lastName = '') {
    return `${firstName} ${lastName}`.trim();
}

app.get('/classes', (req, res) => {
    res.json(readClasses());
});

app.get('/track', (req, res) => {
    res.json(readTracks());
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
    const normalized = Object.fromEntries(
        Object.values(regs).map((entry) => {
            const firstName = (entry?.firstName || '').trim();
            const lastName = (entry?.lastName || '').trim();
            const registration = {
                firstName,
                lastName,
                name: buildFullName(firstName, lastName),
                classes: Array.isArray(entry?.classes) ? entry.classes : [],
            };
            return [registration.name, registration];
        })
    );
    res.json(normalized);
});

app.post('/register', (req, res) => {
    const { firstName, lastName, classes, originalName } = req.body;
    const fullName = buildFullName(firstName, lastName);
    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'firstName and lastName required' });
    }
    const regs = readRegistrations();
    if (originalName && originalName !== fullName && regs[originalName]) {
        delete regs[originalName];
    }
    regs[fullName] = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        classes: classes || [],
    };
    saveRegistrations(regs);
    res.json({ success: true });
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
    res.json({ success: true });
});

app.get('/download', (req, res) => {
    const regs = readRegistrations();
    let lines = [];
    Object.values(regs).forEach((entry) => {
        const firstName = (entry?.firstName || '').trim();
        const lastName = (entry?.lastName || '').trim();
        const phoneticName = buildFullName(firstName, lastName);
        const classes = Array.isArray(entry?.classes) ? entry.classes : [];
        classes.forEach(c => {
            lines.push(`"${firstName}","${lastName}","${phoneticName}","${c}"`);
        });
    });
    const csv = ['"FirstName","LastName","PhoneticName","ClassName"', ...lines].join('\n');
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-disposition', `attachment; filename="Race ${date}.csv"`);
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


