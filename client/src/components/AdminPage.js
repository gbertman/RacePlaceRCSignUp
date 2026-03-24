import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ClassEditor from './ClassEditor';
import useAdminSession from '../hooks/useAdminSession';

function AdminPage({ classes, trackTypes, registrations, onClassesSaved, onRegistrationsChanged }) {
    const [drivers, setDrivers] = useState([]);
    const [isDriverModalOpen, setDriverModalOpen] = useState(false);
    const [newDriverFirst, setNewDriverFirst] = useState('');
    const [newDriverLast, setNewDriverLast] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const driverModalRef = useRef(null);
    const trackNames = trackTypes.map(track => track.name);
    const {
        fetchAdmin,
        isAdministrator,
        isAuthenticated,
        isCheckingAuth,
        login: loginAdmin,
        logout: logoutAdmin,
        readError,
    } = useAdminSession();

    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

    const login = async (e) => {
        e.preventDefault();
        setIsLoggingIn(true);

        try {
            await loginAdmin(username, password);
            setPassword('');
        } catch (error) {
            window.alert(error.message);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const logout = async () => {
        try {
            await logoutAdmin();
        } catch (error) {
            console.error('Unable to log out cleanly:', error);
        } finally {
            setDriverModalOpen(false);
            setDrivers([]);
        }
    };

    const downloadCsv = async (trackName) => {
        try {
            const path = trackName
                ? `/download/${encodeURIComponent(trackName)}`
                : '/download';
            const response = await fetchAdmin(path);
            if (!response.ok) {
                throw new Error(await readError(response, `Download failed with status ${response.status}`));
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

    const loadDrivers = useCallback(async () => {
        try {
            const response = await fetchAdmin('/drivers');
            if (!response.ok) {
                throw new Error(await readError(response, `Failed to load drivers: ${response.status}`));
            }
            const data = await response.json();
            setDrivers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Unable to load drivers:', error);
            setDrivers([]);
        }
    }, [fetchAdmin, readError]);

    const updateTrackEnabled = async (name, enabled) => {
        const updatedTrackTypes = trackTypes.map(track =>
            track.name === name ? { ...track, enabled } : track
        );

        try {
            const response = await fetchAdmin('/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackTypes: updatedTrackTypes }),
            });

            if (!response.ok) {
                throw new Error(await readError(response, `Failed to save tracks: ${response.status}`));
            }

            if (onClassesSaved) onClassesSaved();
        } catch (error) {
            window.alert(`Unable to update track availability: ${error.message}`);
        }
    };

    useEffect(() => {
        if (isDriverModalOpen && isAuthenticated) {
            loadDrivers();
            setTimeout(() => {
                const first = driverModalRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                first?.focus();
            }, 0);
        }
    }, [isDriverModalOpen, isAuthenticated, loadDrivers]);

    const addDriver = async () => {
        if (!newDriverFirst.trim() || !newDriverLast.trim()) {
            window.alert('First and last name are required');
            return;
        }

        try {
            const response = await fetchAdmin('/drivers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName: newDriverFirst.trim(), lastName: newDriverLast.trim() }),
            });
            if (!response.ok) {
                throw new Error(await readError(response, `Failed to add driver: ${response.status}`));
            }
            setNewDriverFirst('');
            setNewDriverLast('');
            loadDrivers();
        } catch (error) {
            window.alert(`Unable to add driver: ${error.message}`);
        }
    };

    const deleteDriver = async (firstName, lastName) => {
        if (!window.confirm(`Delete driver "${firstName} ${lastName}"?`)) return;

        try {
            const response = await fetchAdmin(
                `/drivers?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`,
                { method: 'DELETE' }
            );
            if (!response.ok) {
                throw new Error(await readError(response, `Failed to delete driver: ${response.status}`));
            }
            loadDrivers();
        } catch (error) {
            window.alert(`Unable to delete driver: ${error.message}`);
        }
    };

    const backupData = async () => {
        try {
            const response = await fetchAdmin('/backup');
            if (!response.ok) {
                throw new Error(await readError(response, `Backup failed with status ${response.status}`));
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
            const response = await fetchAdmin('/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(json),
            });
            if (!response.ok) {
                throw new Error(await readError(response, `Restore failed with status ${response.status}`));
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
            fetchAdmin('/reset', { method: 'POST' }).then(async response => {
                if (!response.ok) {
                    throw new Error(await readError(response, `Reset failed with status ${response.status}`));
                }
                if (onRegistrationsChanged) onRegistrationsChanged();
            }).catch(error => {
                window.alert(`Unable to reset registrations: ${error.message}`);
            });
        }
    };

    const deleteRegistrant = async (name) => {
        if (!window.confirm(`Delete registration for ${name}? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetchAdmin(`/registrations/${encodeURIComponent(name)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(await readError(response, `Delete failed with status ${response.status}`));
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

    if (isCheckingAuth) {
        return <p className="text-muted">Checking admin login...</p>;
    }

    if (!isAuthenticated) {
        return (
            <div className="row justify-content-center">
                <div className="col-md-6 col-lg-5">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h4 className="mb-0">Admin Login</h4>
                        <Link className="btn btn-outline-secondary" to="/">Back to Signup</Link>
                    </div>
                    <div className="card shadow-sm">
                        <div className="card-body">
                            <p className="text-muted">
                                Sign in to access admin tools.
                            </p>
                            <form onSubmit={login}>
                                <div className="mb-3">
                                    <label className="form-label" htmlFor="admin-username">Username</label>
                                    <input
                                        id="admin-username"
                                        className="form-control"
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        autoComplete="username"
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label" htmlFor="admin-password">Password</label>
                                    <input
                                        id="admin-password"
                                        type="password"
                                        className="form-control"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={isLoggingIn}>
                                    {isLoggingIn ? 'Signing In...' : 'Sign In'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">Admin</h4>
                <div className="d-flex gap-2">
                    {isAdministrator ? (
                        <Link className="btn btn-outline-primary" to="/admin/users">
                            User Management
                        </Link>
                    ) : null}
                    <button className="btn btn-outline-danger" onClick={logout}>
                        Log Out
                    </button>
                    <Link className="btn btn-outline-secondary" to="/">Back to Signup</Link>
                </div>
            </div>
            <div className="mb-4">
                <div className="mb-2">
                    <button className="btn btn-secondary me-2" onClick={() => setDriverModalOpen(true)}>
                        Driver List
                    </button>
                    <button className="btn btn-success me-2" onClick={printSheet}>
                        Print Spreadsheet
                    </button>
                    <button className="btn btn-danger" onClick={resetAll}>
                        Reset All
                    </button>
                </div>
                <div className="mt-4">
                    <h5 className="mb-3">Download Race Registrations</h5>
                    <button className="btn btn-secondary me-2" onClick={() => downloadCsv()}>
                        Download All CSV
                    </button>
                    {trackNames.map(trackName => (
                        <button
                            key={trackName}
                            className="btn btn-outline-secondary me-2 mt-2 mt-sm-0"
                            onClick={() => downloadCsv(trackName)}
                        >
                            {trackName} CSV
                        </button>
                    ))}
                </div>
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
            <div className="mb-4">
                <h5>Track Availability</h5>
                {trackTypes.length === 0 ? (
                    <p className="text-muted mb-0">No tracks configured.</p>
                ) : (
                    <div className="row g-3">
                        {trackTypes.map(track => (
                            <div key={track.name} className="col-sm-6 col-lg-4">
                                <label className="border rounded p-3 h-100 w-100 d-flex justify-content-between align-items-start gap-3">
                                    <div>
                                        <div>{track.name}</div>
                                        <div className="text-muted small">
                                            {track.enabled ? 'Open for registration' : 'Closed on the signup page'}
                                        </div>
                                    </div>
                                    <div className="form-check form-switch mb-0">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            role="switch"
                                            checked={track.enabled}
                                            onChange={e => updateTrackEnabled(track.name, e.target.checked)}
                                        />
                                    </div>
                                </label>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <ClassEditor classes={classes} trackTypes={trackNames} onSave={onClassesSaved} />
            <div className="mt-4">
                <h4>Maintenance</h4>
                <button className="btn btn-secondary me-2" onClick={backupData}>
                    Backup
                </button>
                <button className="btn btn-secondary me-2" onClick={triggerRestore}>
                    Restore
                </button>
            </div>

            {isDriverModalOpen ? (
                <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <div className="modal-dialog modal-dialog-centered" role="dialog" aria-modal="true" aria-labelledby="driver-list-modal-title" ref={driverModalRef} tabIndex={-1}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title" id="driver-list-modal-title">Driver List</h5>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setDriverModalOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">First Name</label>
                                    <input
                                        className="form-control"
                                        value={newDriverFirst}
                                        onChange={e => setNewDriverFirst(e.target.value)}
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Last Name</label>
                                    <input
                                        className="form-control"
                                        value={newDriverLast}
                                        onChange={e => setNewDriverLast(e.target.value)}
                                    />
                                </div>
                                <button className="btn btn-primary mb-3" onClick={addDriver}>
                                    Add Driver
                                </button>
                                <div>
                                    <h6>Existing Drivers</h6>
                                    {drivers.length === 0 ? (
                                        <p className="text-muted">No drivers yet.</p>
                                    ) : (
                                        <ul className="list-group">
                                            {drivers.map((d, idx) => (
                                                <li key={`${d.lastName}-${idx}`} className="list-group-item d-flex justify-content-between align-items-center">
                                                    <div>
                                                        {d.firstName} {d.lastName}
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => deleteDriver(d.firstName, d.lastName)}
                                                    >
                                                        Delete
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setDriverModalOpen(false)}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default AdminPage;
