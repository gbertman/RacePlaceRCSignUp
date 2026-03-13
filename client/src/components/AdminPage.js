import React from 'react';
import { Link } from 'react-router-dom';
import ClassEditor from './ClassEditor';

function AdminPage({ classes, trackTypes, registrations, onClassesSaved, onRegistrationsChanged }) {
    const entries = Object.values(registrations);

    const downloadCsv = async () => {
        try {
            const response = await fetch('/download');
            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
            const filename = filenameMatch ? filenameMatch[1] : 'Race export.csv';
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            window.alert(`Unable to download CSV: ${error.message}`);
        }
    };

    const resetAll = () => {
        if (window.confirm('Clear all registrations? This cannot be undone.')) {
            fetch('/reset', { method: 'POST' }).then(() => {
                if (onRegistrationsChanged) onRegistrationsChanged();
            });
        }
    };

    const printSheet = () => {
        const names = classes.map(c => c.name);
        const headers = ['Name', ...names];
        let html = '<html><head><title>RacePlaceRC Admin</title>';
        html += '<style>table{border-collapse:collapse;width:100%;}td,th{border:1px solid #000;padding:4px;text-align:left;}</style>';
        html += '</head><body><table><thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';
        entries.forEach(r => {
            html += '<tr>';
            html += `<td>${r.name}</td>`;
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
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">Admin</h4>
                <Link className="btn btn-outline-secondary" to="/">Back to Signup</Link>
            </div>
            <div className="mb-4">
                <button className="btn btn-secondary me-2" onClick={downloadCsv}>
                    Download CSV
                </button>
                <button className="btn btn-success me-2" onClick={printSheet}>
                    Print Spreadsheet
                </button>
                <button className="btn btn-danger" onClick={resetAll}>
                    Reset All
                </button>
            </div>
            <div className="mb-4">
                <h5>Current Registrants</h5>
                {entries.length === 0 ? (
                    <p className="text-muted mb-0">No registrations yet.</p>
                ) : (
                    <ul className="list-group">
                        {entries.map((r) => (
                            <li
                                key={r.name}
                                className="list-group-item d-flex justify-content-between align-items-center"
                            >
                                <span>{r.name}</span>
                                <span>{r.classes.join(', ')}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <ClassEditor classes={classes} trackTypes={trackTypes} onSave={onClassesSaved} />
        </div>
    );
}

export default AdminPage;
