import { useRef, useState, useEffect, useCallback } from 'react';
import {
    Badge,
    Box,
    Button,
    Card,
    Group,
    Modal,
    NativeSelect,
    Paper,
    PasswordInput,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    VisuallyHidden,
} from '@mantine/core';
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
    const [selectedScanTrack, setSelectedScanTrack] = useState('');
    const trackNames = trackTypes.map(track => track.name);
    const printableTrackNames = trackTypes
        .filter(track => track.enabled && classes.some(item => item.type === track.name))
        .map(track => track.name);
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

    const classCounts = entries.reduce((counts, r) => {
        (r.classes || []).forEach(name => {
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, {});

    const classesByType = classes.reduce((groups, c) => {
        const type = c.type || 'Other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(c);
        return groups;
    }, {});

    const formatRegistrationDate = (value) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString();
    };

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
        }
    }, [isDriverModalOpen, isAuthenticated, loadDrivers]);

    useEffect(() => {
        if (!printableTrackNames.includes(selectedScanTrack)) {
            setSelectedScanTrack(printableTrackNames[0] || '');
        }
    }, [printableTrackNames, selectedScanTrack]);

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

    const printScanSheet = (requestedTrackName) => {
        const trackPages = trackTypes
            .filter(track => track.enabled && (!requestedTrackName || track.name === requestedTrackName))
            .map(track => ({
                trackName: track.name,
                raceClasses: classes.filter(item => item.type === track.name),
            }))
            .filter(track => track.raceClasses.length > 0);

        if (trackPages.length === 0) {
            window.alert('Open at least one track with a race class before printing a scan sheet.');
            return;
        }

        const win = window.open('', '_blank');
        if (!win) {
            window.alert('Allow pop-ups to print the scan-friendly registration sheet.');
            return;
        }

        const document = win.document;
        document.title = 'RacePlaceRC Scan Registration Sheet';

        const style = document.createElement('style');
        style.textContent = `
            @page { size: letter landscape; margin: 0.35in; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #000; font-family: Arial, sans-serif; }
            .sheet { position: relative; width: 100%; min-height: 7.65in; break-after: page; page-break-after: always; }
            .sheet:last-child { break-after: auto; page-break-after: auto; }
            .marker { position: absolute; width: 0.18in; height: 0.18in; background: #000; }
            .marker-tl { top: 0; left: 0; }
            .marker-tr { top: 0; right: 0; }
            .marker-bl { bottom: 0; left: 0; }
            .marker-br { right: 0; bottom: 0; }
            h1 { margin: 0; text-align: center; font-size: 20pt; }
            .metadata { display: flex; justify-content: space-between; margin: 0.08in 0 0.1in; font-size: 9pt; }
            .instructions { margin: 0 0 0.1in; padding: 0.07in; border: 2px solid #000; font-size: 9pt; font-weight: 700; text-align: center; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 2px solid #000; padding: 0.03in; }
            .signup { font-size: 8pt; }
            .many-classes .signup { font-size: 7pt; }
            .signup thead { display: table-header-group; }
            .signup th { height: 0.58in; overflow-wrap: anywhere; text-align: center; vertical-align: middle; }
            .signup td { height: 0.27in; }
            .row-number { width: 0.32in; text-align: center; font-weight: 700; }
            .driver-name { width: 2.55in; text-align: left !important; font-size: 9pt; }
            .many-classes .driver-name { width: 2.15in; }
            .race-column { text-align: center; }
            .mark-box { display: inline-block; width: 0.16in; height: 0.16in; border: 1.5px solid #000; vertical-align: middle; }
            .footer { margin-top: 0.06in; font-size: 7pt; text-align: center; }
        `;
        document.head.appendChild(style);

        trackPages.forEach(({ trackName, raceClasses }) => {
            const sheet = document.createElement('main');
            sheet.className = `sheet${raceClasses.length > 10 ? ' many-classes' : ''}`;

            ['tl', 'tr', 'bl', 'br'].forEach(position => {
                const marker = document.createElement('span');
                marker.className = `marker marker-${position}`;
                marker.setAttribute('aria-hidden', 'true');
                sheet.appendChild(marker);
            });

            const heading = document.createElement('h1');
            heading.textContent = `RacePlaceRC ${trackName} Registration Sheet`;
            sheet.appendChild(heading);

            const metadata = document.createElement('div');
            metadata.className = 'metadata';
            const date = document.createElement('span');
            date.textContent = `Race date: ${new Date().toLocaleDateString()}`;
            const template = document.createElement('span');
            template.textContent = `Scan template: RP-RC-1 | Track: ${trackName}`;
            metadata.append(date, template);
            sheet.appendChild(metadata);

            const instructions = document.createElement('p');
            instructions.className = 'instructions';
            instructions.textContent = 'PRINT ONE RACER NAME PER ROW. Write clearly inside the name box and make a large X inside every selected race box.';
            sheet.appendChild(instructions);

            const signupTable = document.createElement('table');
            signupTable.className = 'signup';
            const signupHead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const numberHeader = document.createElement('th');
            numberHeader.className = 'row-number';
            numberHeader.textContent = '#';
            const nameHeader = document.createElement('th');
            nameHeader.className = 'driver-name';
            nameHeader.textContent = 'Racer Name (First Last or Last First)';
            headerRow.append(numberHeader, nameHeader);
            raceClasses.forEach((raceClass) => {
                const classHeader = document.createElement('th');
                classHeader.className = 'race-column';
                classHeader.textContent = raceClass.name;
                headerRow.appendChild(classHeader);
            });
            signupHead.appendChild(headerRow);
            signupTable.appendChild(signupHead);

            const signupBody = document.createElement('tbody');
            for (let rowNumber = 1; rowNumber <= 20; rowNumber += 1) {
                const row = document.createElement('tr');
                const numberCell = document.createElement('td');
                numberCell.className = 'row-number';
                numberCell.textContent = rowNumber;
                const nameCell = document.createElement('td');
                nameCell.className = 'driver-name';
                row.append(numberCell, nameCell);

                raceClasses.forEach(() => {
                    const raceCell = document.createElement('td');
                    raceCell.className = 'race-column';
                    const markBox = document.createElement('span');
                    markBox.className = 'mark-box';
                    markBox.setAttribute('aria-hidden', 'true');
                    raceCell.appendChild(markBox);
                    row.appendChild(raceCell);
                });
                signupBody.appendChild(row);
            }
            signupTable.appendChild(signupBody);
            sheet.appendChild(signupTable);

            const footer = document.createElement('div');
            footer.className = 'footer';
            footer.textContent = `RP-RC-1 | Track=${trackName} | Classes: ${raceClasses.map(raceClass => raceClass.name).join(' | ')}`;
            sheet.appendChild(footer);

            document.body.appendChild(sheet);
        });
        document.close();
        win.focus();
        win.setTimeout(() => win.print(), 100);
    };

    if (isCheckingAuth) {
        return <Text c="dimmed">Checking admin login...</Text>;
    }

    if (!isAuthenticated) {
        return (
            <Box maw={520} mx="auto">
                <Stack>
                    <Group justify="space-between">
                        <Title order={1} size="h4">Admin Login</Title>
                        <Button component={Link} to="/" variant="default">Back to Signup</Button>
                    </Group>
                    <Paper withBorder shadow="sm" p="lg">
                        <Stack>
                            <Text c="dimmed">
                                Sign in to access admin tools.
                            </Text>
                            <Box component="form" onSubmit={login}>
                              <Stack>
                                    <TextInput
                                        id="admin-username"
                                        label="Username"
                                        value={username}
                                        onChange={e => setUsername(e.currentTarget.value)}
                                        autoComplete="username"
                                    />
                                    <PasswordInput
                                        id="admin-password"
                                        label="Password"
                                        value={password}
                                        onChange={e => setPassword(e.currentTarget.value)}
                                        autoComplete="current-password"
                                    />
                                <Button type="submit" loading={isLoggingIn} style={{ alignSelf: 'flex-start' }}>
                                    {isLoggingIn ? 'Signing In...' : 'Sign In'}
                                </Button>
                              </Stack>
                            </Box>
                        </Stack>
                    </Paper>
                </Stack>
            </Box>
        );
    }

    return (
        <Stack gap="xl">
            <Group justify="space-between" align="center">
                <Title order={1} size="h4">Admin</Title>
                <Group>
                    {isAdministrator ? (
                        <Button component={Link} to="/admin/users" variant="light">
                            User Management
                        </Button>
                    ) : null}
                    <Button color="red" variant="light" onClick={logout}>
                        Log Out
                    </Button>
                    <Button component={Link} to="/" variant="default">Back to Signup</Button>
                </Group>
            </Group>
            <Stack gap="md">
                <Group>
                    <Button color="gray" onClick={() => setDriverModalOpen(true)}>
                        Driver List
                    </Button>
                    <Button color="green" onClick={printSheet}>
                        Print Spreadsheet
                    </Button>
                    <Button component={Link} to="/admin/sheet-import">
                        Scan Registration Sheet
                    </Button>
                    <Button color="red" onClick={resetAll}>
                        Reset Registrations
                    </Button>
                </Group>
                <Group align="end">
                        <NativeSelect
                            id="scan-sheet-track"
                            label="Scan-friendly sheet track"
                            value={selectedScanTrack}
                            onChange={event => setSelectedScanTrack(event.currentTarget.value)}
                            disabled={printableTrackNames.length === 0}
                            data={printableTrackNames.length === 0
                                ? [{ value: '', label: 'No printable tracks' }]
                                : printableTrackNames}
                        />
                        <Button
                            color="green"
                            variant="light"
                            onClick={() => printScanSheet(selectedScanTrack)}
                            disabled={!selectedScanTrack}
                        >
                            Print Selected Track
                        </Button>
                    {printableTrackNames.length > 1 ? (
                            <Button variant="default" onClick={() => printScanSheet()}>
                                Print All Tracks
                            </Button>
                    ) : null}
                </Group>
                <Stack gap="sm">
                    <Title order={2} size="h5">Download Race Registrations</Title>
                    <Group>
                    <Button color="gray" onClick={() => downloadCsv()}>
                        Download All CSV
                    </Button>
                    {trackNames.map(trackName => (
                        <Button
                            key={trackName}
                            variant="default"
                            onClick={() => downloadCsv(trackName)}
                        >
                            {trackName} CSV
                        </Button>
                    ))}
                    </Group>
                </Stack>
                <VisuallyHidden>
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
                </VisuallyHidden>
            </Stack>
            <Stack gap="sm">
                <Title order={2} size="h5">Class Counts</Title>
                {classes.length === 0 ? (
                    <Text c="dimmed">No classes configured.</Text>
                ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                        {Object.entries(classesByType).map(([type, group]) => (
                            <Card key={type} withBorder>
                                    <Text fw={700} mb="xs">{type}</Text>
                                    <Stack gap={6}>
                                        {group.map(c => (
                                            <Group key={c.name} justify="space-between">
                                                <Text>{c.name}</Text>
                                                <Badge color="gray">{classCounts[c.name] || 0}</Badge>
                                            </Group>
                                        ))}
                                    </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>
                )}
            </Stack>
            <Stack gap="sm">
                <Title order={2} size="h5">Current Registrants</Title>
                {entries.length === 0 ? (
                    <Text c="dimmed">No registrations yet.</Text>
                ) : (
                    <Stack gap="xs">
                        {entries.map((r) => (
                            <Card key={r.key} withBorder padding="sm">
                              <Group justify="space-between" align="center">
                                <div>
                                    <Text fw={600}>{r.name}</Text>
                                    <Text c="dimmed" size="sm">{r.classes.join(', ')}</Text>
                                    <Text c="dimmed" size="sm">
                                        Registered: {formatRegistrationDate(r.registeredAt)}
                                    </Text>
                                </div>
                                <Button
                                    color="red"
                                    variant="light"
                                    size="xs"
                                    onClick={() => deleteRegistrant(r.key)}
                                >
                                    Delete
                                </Button>
                              </Group>
                            </Card>
                        ))}
                    </Stack>
                )}
            </Stack>
            <Stack gap="sm">
                <Title order={2} size="h5">Track Availability</Title>
                {trackTypes.length === 0 ? (
                    <Text c="dimmed">No tracks configured.</Text>
                ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                        {trackTypes.map(track => (
                            <Card key={track.name} withBorder>
                              <Group justify="space-between" align="flex-start">
                                    <div>
                                        <Text fw={600}>{track.name}</Text>
                                        <Text c="dimmed" size="sm">
                                            {track.enabled ? 'Open for registration' : 'Closed on the signup page'}
                                        </Text>
                                    </div>
                                        <Switch
                                            aria-label={`Toggle ${track.name} registration`}
                                            checked={track.enabled}
                                            onChange={e => updateTrackEnabled(track.name, e.currentTarget.checked)}
                                        />
                              </Group>
                            </Card>
                        ))}
                    </SimpleGrid>
                )}
            </Stack>
            <ClassEditor classes={classes} trackTypes={trackNames} onSave={onClassesSaved} />
            <Stack gap="sm">
                <Title order={2} size="h4">Maintenance</Title>
                <Group>
                <Button color="gray" onClick={backupData}>
                    Backup
                </Button>
                <Button color="gray" onClick={triggerRestore}>
                    Restore
                </Button>
                </Group>
            </Stack>

            <Modal opened={isDriverModalOpen} onClose={() => setDriverModalOpen(false)} title="Driver List" centered>
                            <Stack>
                                    <TextInput
                                        data-autofocus
                                        label="First Name"
                                        value={newDriverFirst}
                                        onChange={e => setNewDriverFirst(e.currentTarget.value)}
                                    />
                                    <TextInput
                                        label="Last Name"
                                        value={newDriverLast}
                                        onChange={e => setNewDriverLast(e.currentTarget.value)}
                                    />
                                <Button onClick={addDriver} style={{ alignSelf: 'flex-start' }}>
                                    Add Driver
                                </Button>
                                <Stack gap="xs">
                                    <Title order={3} size="h6">Existing Drivers</Title>
                                    {drivers.length === 0 ? (
                                        <Text c="dimmed">No drivers yet.</Text>
                                    ) : (
                                        <Stack gap="xs">
                                            {drivers.map((d, idx) => (
                                                <Card key={`${d.lastName}-${idx}`} withBorder padding="xs">
                                                  <Group justify="space-between">
                                                    <Text>
                                                        {d.firstName} {d.lastName}
                                                    </Text>
                                                    <Button
                                                        size="xs"
                                                        color="red"
                                                        variant="light"
                                                        onClick={() => deleteDriver(d.firstName, d.lastName)}
                                                    >
                                                        Delete
                                                    </Button>
                                                  </Group>
                                                </Card>
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                                <Button variant="default" onClick={() => setDriverModalOpen(false)} style={{ alignSelf: 'flex-end' }}>
                                    Close
                                </Button>
                            </Stack>
            </Modal>
        </Stack>
    );
}

export default AdminPage;
