import React, { useState, useEffect, useRef } from 'react';

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
    const updateModalRef = useRef(null);
    const updateButtonRef = useRef(null);
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

    useEffect(() => {
        if (showUpdateModal) {
            setTimeout(() => {
                updateButtonRef.current?.focus();
            }, 0);
        }
    }, [showUpdateModal]);

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
            <div className="alert alert-secondary mb-4" role="status">
                Registrations are closed at this time
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="mb-4">
            <h4>{editing ? 'Edit Signup' : 'Signup'}</h4>
            <div
                className="mb-3"
                onBlur={e => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setShowDriverMatches(false);
                        setActiveDriverIndex(-1);
                    }
                }}
            >
                <label className="form-label" htmlFor="name">Name *</label>
                <input
                    id="name"
                    type="text"
                    className="form-control"
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
                    <div id="driver-matches" className="list-group mt-1" role="listbox" ref={driverListRef}>
                        {driverMatches.map((driver, index) => (
                            <button
                                id={`driver-match-${index}`}
                                key={`${driver.firstName}-${driver.lastName}-${index}`}
                                type="button"
                                className={`list-group-item list-group-item-action${activeDriverIndex === index ? ' active' : ''}`}
                                role="option"
                                aria-selected={activeDriverIndex === index}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => applyDriverSelection(driver)}
                                onMouseEnter={() => setActiveDriverIndex(index)}
                            >
                                {driver.firstName} {driver.lastName}
                            </button>
                        ))}
                    </div>
                ) : null}
                {driverMatch ? (
                    <div className="form-text text-success">
                        Selected driver: {driverMatch.firstName} {driverMatch.lastName}
                    </div>
                ) : null}
                <div className="form-text">Type a first or last name, then select a matching driver.</div>
            </div>

            {showUpdateModal && existingRegistration ? (
                <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <div className="modal-dialog modal-dialog-centered" role="dialog" aria-modal="true" aria-labelledby="update-registration-modal-title" ref={updateModalRef} tabIndex={-1}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title" id="update-registration-modal-title">Update Registration?</h5>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowUpdateModal(false)} />
                            </div>
                            <div className="modal-body">
                                <p>
                                    <strong>{existingRegistration.name}</strong> is already registered for:
                                </p>
                                <ul>
                                    {existingRegistration.classes.map(c => (
                                        <li key={c}>{c}</li>
                                    ))}
                                </ul>
                                <p>Your new selections:</p>
                                <ul>
                                    {selected.map(c => (
                                        <li key={c}>{c}</li>
                                    ))}
                                </ul>
                                <p>Update this registration with your current selections?</p>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    ref={updateButtonRef}
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
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="mb-3">
                <label className="form-label">Classes</label>
                <div className="row">
                    {Object.entries(groupedClasses).map(([type, group]) => (
                        <div key={type} className="col">
                            <strong>{type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                            {group.map((c, idx) => {
                                const inputId = `class-${type}-${idx}`;
                                return (
                                    <div key={c.name} className="form-check">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={selected.includes(c.name)}
                                            id={inputId}
                                            onChange={() => toggleClass(c.name)}
                                        />
                                        <label className="form-check-label" htmlFor={inputId}>{c.name}</label>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary">
                    {editing ? 'Update' : 'Register'}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

export default RegistrationForm;
