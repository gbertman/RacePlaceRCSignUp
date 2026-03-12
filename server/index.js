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

app.get('/classes', (req, res) => {
    res.json(readClasses());
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
    const { name, transponder, classes, originalName } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    const regs = readRegistrations();
    if (originalName && originalName !== name && regs[originalName]) {
        delete regs[originalName];
    }
    regs[name] = { name, transponder: transponder || '', classes: classes || [] };
    saveRegistrations(regs);
    res.json({ success: true });
});

app.get('/download', (req, res) => {
    const regs = readRegistrations();
    let lines = [];
    Object.values(regs).forEach(r => {
        r.classes.forEach(c => {
            lines.push(`"${r.name}","${r.transponder || ''}","${c}"`);
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

app.listen(4000, () => {
    console.log('Server started on port 4000');
});


