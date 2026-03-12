import React from 'react';

function RegistrationList({ registrations, onEdit, onReset, classes }) {
    const entries = Object.values(registrations);

    const downloadCsv = () => {
        window.location.href = 'http://localhost:4000/download';
    };

    const resetAll = () => {
        if (window.confirm('Clear all registrations? This cannot be undone.')) {
            fetch('http://localhost:4000/reset', { method: 'POST' })
                .then(() => {
                    if (onReset) onReset();
                });
        }
    };

    const printSheet = () => {
        const norm = c => (typeof c === 'string' ? { name: c, type: 'offroad' } : c);
        const names = classes.map(norm).map(c => c.name);
        const headers = ['Name', 'Transponder', ...names];
        let html = '<html><head><title>Spreadsheet</title>';
        html += '<style>table{border-collapse:collapse;width:100%;}td,th{border:1px solid #000;padding:4px;text-align:left;}</style>';
        html += '</head><body><table><thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';
        entries.forEach(r => {
            html += '<tr>';
            html += `<td>${r.name}</td>`;
            html += `<td>${r.transponder || ''}</td>`;
            names.forEach(n => {
                html += `<td>${r.classes.includes(n) ? 'X' : ''}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table></body></html>';
        const win = window.open();
        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            win.print();
        }
    };

    return (
        <div>
            <h4>Registered Racers</h4>
            <p><em>Click on your name below if you need to edit your entry.</em></p>
            <button className="btn btn-secondary mb-2 me-2" onClick={downloadCsv}>
                Download CSV
            </button>
            <button className="btn btn-success mb-2 me-2" onClick={printSheet}>
                Print Spreadsheet
            </button>
            <button className="btn btn-danger mb-2" onClick={resetAll}>
                Reset All
            </button>
            <ul className="list-group">
                {entries.map(r => (
                    <li key={r.name} className="list-group-item d-flex justify-content-between align-items-center">
                        <span onClick={() => onEdit(r.name)} style={{ cursor: 'pointer' }}>{r.name}</span>
                        <span>{r.classes.join(', ')}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default RegistrationList;