import { useState, useEffect, useRef } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Group,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
    UnstyledButton,
} from '@mantine/core';

function RegistrationForm({ classes, onSave, editing, registrationOpen }) {
    const [nameInput, setNameInput] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [driverMatch, setDriverMatch] = useState(null);
    const [driverMatches, setDriverMatches] = useState([]);
    const [showDriverMatches, setShowDriverMatches] = useState(false);
    const [activeDriverIndex, setActiveDriverIndex] = useState(-1);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [existingRegistration, setExistingRegistration] = useState(null);
    const [selected, setSelected] = useState([]);
    const nameInputRef = useRef(null);
    const driverListRef = useRef(null);
    const groupedClasses = classes.reduce((groups, currentClass) => {
        const type = currentClass.type || 'Other';
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push(currentClass);
        return groups;
    }, {});

    useEffect(() => {
        if (editing) {
            const [first, ...rest] = editing.name.split(' ');
            setNameInput(editing.name || '');
            setFirstName(first || '');
            setLastName(rest.join(' ') || '');
            setSelected(editing.classes || []);
        } else {
            setNameInput('');
            setFirstName('');
            setLastName('');
            setSelected([]);
        }
        setDriverMatch(null);
    }, [editing]);

    useEffect(() => {
        const query = nameInput.trim();
        const selectedName = driverMatch
            ? `${driverMatch.firstName} ${driverMatch.lastName}`
            : '';

        if (!query || query.toLowerCase() === selectedName.toLowerCase()) {
            setDriverMatches([]);
            setShowDriverMatches(false);
            setActiveDriverIndex(-1);
            return undefined;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch(`/drivers?name=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Unable to search drivers: ${response.status}`);
                }
                const matches = await response.json();
                const nextMatches = Array.isArray(matches) ? matches : [];
                setDriverMatches(nextMatches);
                setShowDriverMatches(nextMatches.length > 0);
                setActiveDriverIndex(-1);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setDriverMatches([]);
                    setShowDriverMatches(false);
                }
            }
        }, 150);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [nameInput, driverMatch]);

    const applyDriverSelection = (driver) => {
        setNameInput(`${driver.firstName} ${driver.lastName}`);
        setLastName(driver.lastName);
        setFirstName(driver.firstName);
        setDriverMatch(driver);
        setDriverMatches([]);
        setShowDriverMatches(false);
        setActiveDriverIndex(-1);
        nameInputRef.current?.focus();
    };

    const handleNameKeyDown = (e) => {
        if (!showDriverMatches || !driverMatches.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            setActiveDriverIndex(current =>
                (current + delta + driverMatches.length) % driverMatches.length
            );
        } else if (e.key === 'Enter') {
            if (activeDriverIndex >= 0) {
                e.preventDefault();
                applyDriverSelection(driverMatches[activeDriverIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowDriverMatches(false);
            setActiveDriverIndex(-1);
        }
    };

    const toggleClass = (cls) => {
        if (selected.includes(cls)) {
            setSelected(selected.filter(c => c !== cls));
        } else {
            setSelected([...selected, cls]);
        }
    };

    const doRegister = (payload) => {
        fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(async res => {
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || `Registration failed with status ${res.status}`);
            }
            return data;
        }).then(() => {
            setNameInput('');
            setFirstName('');
            setLastName('');
            setSelected([]);
            setDriverMatch(null);
            nameInputRef.current?.focus();
            setShowUpdateModal(false);
            setExistingRegistration(null);
            onSave();
        }).catch(err => {
            window.alert(err.message);
        });
    };

    const resetForm = () => {
        setNameInput('');
        setFirstName('');
        setLastName('');
        setSelected([]);
        setDriverMatch(null);
        setDriverMatches([]);
        setShowDriverMatches(false);
        setShowUpdateModal(false);
        setExistingRegistration(null);
        setTimeout(() => {
            nameInputRef.current?.focus();
        }, 0);
    };

    const submit = (e) => {
        e.preventDefault();
        const enteredName = nameInput.trim().replace(/\s+/g, ' ');
        const exactDriver = driverMatch || driverMatches.find(driver => {
            const forward = `${driver.firstName} ${driver.lastName}`.toLowerCase();
            const reverse = `${driver.lastName} ${driver.firstName}`.toLowerCase();
            return enteredName.toLowerCase() === forward || enteredName.toLowerCase() === reverse;
        });
        const [enteredFirstName, ...enteredLastNameParts] = enteredName.split(' ');
        const resolvedFirstName = exactDriver?.firstName || enteredFirstName;
        const resolvedLastName = exactDriver?.lastName || enteredLastNameParts.join(' ');

        if (!resolvedFirstName || !resolvedLastName) {
            window.alert('Enter both a first and last name');
            return;
        }
        setFirstName(resolvedFirstName);
        setLastName(resolvedLastName);
        const payload = {
            firstName: resolvedFirstName.trim(),
            lastName: resolvedLastName.trim(),
            classes: selected,
        };

        if (editing && editing.name) {
            payload.originalName = editing.name;
            doRegister(payload);
            return;
        }

        fetch('/registrations')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Unable to load registrations: ${res.status}`);
                }
                return res.json();
            })
            .then(regs => {
                if (!regs || typeof regs !== 'object' || Array.isArray(regs)) {
                    throw new Error('Registrations response is invalid');
                }

                const name = `${payload.firstName} ${payload.lastName}`;
                const existing = Object.values(regs).find(
                    r => r?.name?.toLowerCase() === name.toLowerCase()
                );
                if (existing) {
                    setExistingRegistration(existing);
                    setShowUpdateModal(true);
                } else {
                    doRegister(payload);
                }
            })
            .catch(err => {
                console.error('Error fetching registrations:', err);
                window.alert(err.message);
            });
    };

    if (!registrationOpen) {
        return (
            <Alert color="gray" mb="lg" role="status">
                Registrations are closed at this time
            </Alert>
        );
    }

    return (
        <Box component="form" onSubmit={submit} mb="xl">
          <Stack gap="lg">
            <Title order={2} size="h4">{editing ? 'Edit Signup' : 'Signup'}</Title>
            <Box
                pos="relative"
                onBlur={e => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setShowDriverMatches(false);
                        setActiveDriverIndex(-1);
                    }
                }}
            >
                <TextInput
                    id="name"
                    label="Name"
                    description="Type a first or last name, then select a matching driver."
                    value={nameInput}
                    ref={nameInputRef}
                    onChange={e => {
                        setNameInput(e.target.value);
                        setFirstName('');
                        setLastName('');
                        setDriverMatch(null);
                    }}
                    onFocus={() => setShowDriverMatches(driverMatches.length > 0)}
                    onKeyDown={handleNameKeyDown}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showDriverMatches}
                    aria-controls="driver-matches"
                    aria-activedescendant={activeDriverIndex >= 0 ? `driver-match-${activeDriverIndex}` : undefined}
                    placeholder="First Last or Last First"
                    required
                />
                {showDriverMatches ? (
                    <Paper id="driver-matches" className="driver-match-list" withBorder shadow="md" role="listbox" ref={driverListRef}>
                        {driverMatches.map((driver, index) => (
                            <UnstyledButton
                                id={`driver-match-${index}`}
                                key={`${driver.firstName}-${driver.lastName}-${index}`}
                                type="button"
                                className="driver-match-option"
                                data-active={activeDriverIndex === index || undefined}
                                role="option"
                                aria-selected={activeDriverIndex === index}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => applyDriverSelection(driver)}
                                onMouseEnter={() => setActiveDriverIndex(index)}
                            >
                                {driver.firstName} {driver.lastName}
                            </UnstyledButton>
                        ))}
                    </Paper>
                ) : null}
                {driverMatch ? (
                    <Text size="sm" c="green" mt={4}>
                        Selected driver: {driverMatch.firstName} {driverMatch.lastName}
                    </Text>
                ) : null}
            </Box>

            <Modal
                opened={showUpdateModal && Boolean(existingRegistration)}
                onClose={() => setShowUpdateModal(false)}
                title="Update Registration?"
                centered
            >
                {existingRegistration ? (
                    <Stack>
                                <Text>
                                    <Text component="span" fw={700}>{existingRegistration.name}</Text> is already registered for:
                                </Text>
                                <ul>
                                    {existingRegistration.classes.map(c => (
                                        <li key={c}>{c}</li>
                                    ))}
                                </ul>
                                <Text>Your new selections:</Text>
                                <ul>
                                    {selected.map(c => (
                                        <li key={c}>{c}</li>
                                    ))}
                                </ul>
                                <Text>Update this registration with your current selections?</Text>
                                <Group justify="flex-end">
                                <Button
                                    data-autofocus
                                    onClick={() => {
                                        const payload = {
                                            firstName: firstName.trim(),
                                            lastName: lastName.trim(),
                                            classes: selected,
                                            originalName: existingRegistration.name,
                                        };
                                        doRegister(payload);
                                    }}
                                >
                                    Update
                                </Button>
                                <Button variant="default" onClick={resetForm}>
                                    Cancel
                                </Button>
                                </Group>
                    </Stack>
                ) : null}
            </Modal>

            <Stack gap="xs">
                <Text fw={500}>Classes</Text>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                    {Object.entries(groupedClasses).map(([type, group]) => (
                        <Stack key={type} gap="xs">
                            <Text fw={700}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                            {group.map((c, idx) => {
                                const inputId = `class-${type}-${idx}`;
                                return (
                                        <Checkbox
                                            key={c.name}
                                            checked={selected.includes(c.name)}
                                            id={inputId}
                                            label={c.name}
                                            onChange={() => toggleClass(c.name)}
                                        />
                                );
                            })}
                        </Stack>
                    ))}
                </SimpleGrid>
            </Stack>
            <Group>
                <Button type="submit">
                    {editing ? 'Update' : 'Register'}
                </Button>
                <Button type="button" variant="default" onClick={resetForm}>
                    Cancel
                </Button>
            </Group>
          </Stack>
        </Box>
    );
}

export default RegistrationForm;
