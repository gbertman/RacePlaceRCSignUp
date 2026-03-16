import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import ClassEditor from './ClassEditor';

function AdminPage({ classes, trackTypes, registrations, onClassesSaved, onRegistrationsChanged }) {
    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

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

    const backupData = async () => {
        try {
            const response = await fetch('/backup');
            if (!response.ok) {
                throw new Error(`Backup failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
            const filename = filenameMatch ? filenameMatch[1] : 'raceplace-backup.json';
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            window.alert(`Unable to backup data: ${error.message}`);
        }
    };

    const restoreInputRef = useRef(null);

    const restoreData = async (file) => {
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const response = await fetch('/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(json),
            });
            if (!response.ok) {
                throw new Error(`Restore failed with status ${response.status}`);
            }
            if (onClassesSaved) onClassesSaved();
            if (onRegistrationsChanged) onRegistrationsChanged();
            window.alert('Restore completed successfully.');
        } catch (error) {
            window.alert(`Unable to restore data: ${error.message}`);
        }
    };

    const triggerRestore = () => {
        if (restoreInputRef.current) {
            restoreInputRef.current.value = null;
            restoreInputRef.current.click();
        }
    };

    const resetAll = () => {
        if (window.confirm('Clear all registrations? This cannot be undone.')) {
            fetch('/reset', { method: 'POST' }).then(() => {
                if (onRegistrationsChanged) onRegistrationsChanged();
            });
        }
    };

    const deleteRegistrant = async (name) => {
        if (!window.confirm(`Delete registration for ${name}? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/registrations/${encodeURIComponent(name)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }

            if (onRegistrationsChanged) onRegistrationsChanged();
        } catch (error) {
            window.alert(`Unable to delete registrant: ${error.message}`);
        }
    };

    const printSheet = () => {
        const names = classes.map(c => c.name);
        const headers = ['Name', ...names];
        const win = window.open('', '_blank');
        if (!win) return;

        win.document.title = 'RacePlaceRC Admin';

        const style = win.document.createElement('style');
        style.textContent = 'table{border-collapse:collapse;width:100%;}td,th{border:1px solid #000;padding:4px;text-align:left;}';
        win.document.head.appendChild(style);

        const table = win.document.createElement('table');

        const thead = win.document.createElement('thead');
        const headerRow = win.document.createElement('tr');
        headers.forEach((h) => {
            const th = win.document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = win.document.createElement('tbody');
        entries.forEach((r) => {
            const row = win.document.createElement('tr');
            const nameCell = win.document.createElement('td');
            nameCell.textContent = r.name;
            row.appendChild(nameCell);

            names.forEach((n) => {
                const cell = win.document.createElement('td');
                cell.textContent = r.classes.includes(n) ? 'X' : '';
                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        win.document.body.appendChild(table);
        win.focus();
        win.print();
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
                <button className="btn btn-secondary me-2" onClick={backupData}>
                    Backup
                </button>
                <button className="btn btn-secondary me-2" onClick={triggerRestore}>
                    Restore
                </button>
                <button className="btn btn-success me-2" onClick={printSheet}>
                    Print Spreadsheet
                </button>
                <button className="btn btn-danger" onClick={resetAll}>
                    Reset All
                </button>
                <input
                    ref={restoreInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files && e.target.files[0];
                        if (file) restoreData(file);
                    }}
                />
            </div>
            <div className="mb-4">
                <h5>Current Registrants</h5>
                {entries.length === 0 ? (
                    <p className="text-muted mb-0">No registrations yet.</p>
                ) : (
                    <ul className="list-group">
                        {entries.map((r) => (
                            <li
                                key={r.key}
                                className="list-group-item d-flex justify-content-between align-items-center"
                            >
                                <div>
                                    <div>{r.name}</div>
                                    <div className="text-muted small">{r.classes.join(', ')}</div>
                                </div>
                                <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => deleteRegistrant(r.key)}
                                >
                                    Delete
                                </button>
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
