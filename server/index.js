const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Create tables if not exist
async function initDB() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        name TEXT PRIMARY KEY,
        classes JSONB NOT NULL
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS track_types (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL UNIQUE
      );
    `);
        // Insert default track types if not exist
        await pool.query(`
      INSERT INTO track_types (type) VALUES ('On-Road'), ('Off-Road')
      ON CONFLICT (type) DO NOTHING;
    `);
    } catch (err) {
        console.error('Error initializing DB:', err);
    }
}

initDB();

// read classes from DB
async function readClasses() {
    try {
        const res = await pool.query('SELECT name, type FROM classes ORDER BY id');
        return res.rows;
    } catch (err) {
        console.error('Error reading classes:', err);
        return [];
    }
}

// save classes to DB
async function saveClasses(list) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM classes');
        for (const item of list) {
            await client.query('INSERT INTO classes (name, type) VALUES ($1, $2)', [item.name, item.type]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error saving classes:', err);
        throw err;
    } finally {
        client.release();
    }
}

// read registrations from DB
async function readRegistrations() {
    try {
        const res = await pool.query('SELECT name, classes FROM registrations');
        const regs = {};
        res.rows.forEach(row => {
            regs[row.name] = { name: row.name, classes: row.classes };
        });
        return regs;
    } catch (err) {
        console.error('Error reading registrations:', err);
        return {};
    }
}

// read track types from DB
async function readTrackTypes() {
    try {
        const res = await pool.query('SELECT type FROM track_types ORDER BY id');
        return res.rows.map(row => row.type);
    } catch (err) {
        console.error('Error reading track types:', err);
        return [];
    }
}

app.get('/classes', async (req, res) => {
    const classes = await readClasses();
    res.json(classes);
});

app.post('/classes', async (req, res) => {
    const { classes } = req.body;
    if (!Array.isArray(classes)) {
        return res.status(400).json({ error: 'classes must be array' });
    }
    console.log('Received POST /classes with:', classes);
    try {
        await saveClasses(classes);
        console.log('Classes saved to DB');
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving classes:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/registrations', async (req, res) => {
    const regs = await readRegistrations();
    res.json(regs);
});

app.post('/register', async (req, res) => {
    const { firstName, lastName, classes, originalName } = req.body;
    const name = `${firstName} ${lastName}`.trim();
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    const regs = await readRegistrations();
    if (originalName && originalName !== name && regs[originalName]) {
        delete regs[originalName];
    }
    regs[name] = { name, classes: classes || [] };
    await saveRegistrations(regs);
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


