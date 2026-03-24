import React, { useState, useEffect, useRef } from 'react';

function RegistrationForm({ classes, onSave, editing, registrationOpen }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [driverMatch, setDriverMatch] = useState(null);
    const [driverMatches, setDriverMatches] = useState([]);
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [existingRegistration, setExistingRegistration] = useState(null);
    const [selected, setSelected] = useState([]);
    const lastNameRef = useRef(null);
    const firstNameRef = useRef(null);
    const driverListRef = useRef(null);
    const driverModalRef = useRef(null);
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
            setFirstName(first || '');
            setLastName(rest.join(' ') || '');
            setSelected(editing.classes || []);
        } else {
            setFirstName('');
            setLastName('');
            setSelected([]);
        }
        setDriverMatch(null);
    }, [editing]);

    useEffect(() => {
        if (showDriverModal) {
            setTimeout(() => {
                const first = driverListRef.current?.querySelector('li');
                const fallback = driverModalRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                first?.focus();
                if (!first) {
                    fallback?.focus();
                }
            }, 0);
        }
    }, [showDriverModal]);

    useEffect(() => {
        if (showUpdateModal) {
            setTimeout(() => {
                updateButtonRef.current?.focus();
            }, 0);
        }
    }, [showUpdateModal]);

    const applyDriverSelection = (driver) => {
        setShowDriverModal(false);
        if (driver) {
            setLastName(driver.lastName);
            setFirstName(driver.firstName);
            setDriverMatch(driver);
        } else {
            setDriverMatch(null);
            setFirstName('');
        }
        setTimeout(() => {
            firstNameRef.current?.focus();
        }, 0);
    };

    const handleDriverListKeyDown = (e) => {
        const list = driverListRef.current;
        if (!list) return;
        const items = Array.from(list.querySelectorAll('li'));
        if (!items.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = items.indexOf(document.activeElement);
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (currentIndex + delta + items.length) % items.length;
            items[nextIndex]?.focus();
        } else if (e.key === 'Enter') {
            const active = document.activeElement;
            const idx = items.indexOf(active);
            if (idx !== -1) {
                const selected = driverMatches[idx];
                applyDriverSelection(selected || null);
            }
        }
    };

    const checkDriverMatch = async (lastNameValue) => {
        const value = (lastNameValue || '').trim();
        setDriverMatch(null);
        if (!value) return;

        try {
            const res = await fetch(`/drivers?lastName=${encodeURIComponent(value)}`);
            if (!res.ok) return;
            const matches = await res.json();
            if (Array.isArray(matches) && matches.length > 0) {
                setDriverMatches(matches);
                setShowDriverModal(true);
            }
        } catch {
            // ignore errors
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
            setFirstName('');
            setLastName('');
            setSelected([]);
            setDriverMatch(null);
            if (lastNameRef.current) {
                lastNameRef.current.focus();
            }
            setShowUpdateModal(false);
            setExistingRegistration(null);
            onSave();
        }).catch(err => {
            window.alert(err.message);
        });
    };

    const resetForm = () => {
        setFirstName('');
        setLastName('');
        setSelected([]);
        setDriverMatch(null);
        setDriverMatches([]);
        setShowDriverModal(false);
        setShowUpdateModal(false);
        setExistingRegistration(null);
        setTimeout(() => {
            lastNameRef.current?.focus();
        }, 0);
    };

    const submit = (e) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) return;
        const payload = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
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

    const handleRegisterButtonKeyDown = (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            lastNameRef.current?.focus();
        }
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
            <div className="mb-3">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input
                    id="lastName"
                    type="text"
                    className="form-control"
                    value={lastName}
                    ref={lastNameRef}
                    onChange={e => {
                        setLastName(e.target.value);
                        setDriverMatch(null);
                    }}
                    onBlur={e => checkDriverMatch(e.target.value)}
                    required
                />
                {driverMatch ? (
                    <div className="form-text text-success">
                        Found driver: {driverMatch.firstName} {driverMatch.lastName}
                    </div>
                ) : null}
            </div>
            <div className="mb-3">
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input
                    id="firstName"
                    type="text"
                    className="form-control"
                    value={firstName}
                    ref={firstNameRef}
                    onChange={e => setFirstName(e.target.value)}
                    required
                />
            </div>

            {showDriverModal ? (
                <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <div className="modal-dialog modal-dialog-centered" role="dialog" aria-modal="true" aria-labelledby="select-driver-modal-title" ref={driverModalRef} tabIndex={-1}>
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title" id="select-driver-modal-title">Select Driver</h5>
                                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowDriverModal(false)} />
                            </div>
                            <div className="modal-body">
                                <p>Please select the driver that matches <strong>{lastName}</strong>:</p>
                                <ul className="list-group" ref={driverListRef} onKeyDown={handleDriverListKeyDown}>
                                    {driverMatches.map((d, idx) => (
                                        <li
                                            key={`${d.lastName}-${idx}`}
                                            className="list-group-item d-flex justify-content-between align-items-center"
                                            onClick={() => applyDriverSelection(d)}
                                            style={{ cursor: 'pointer' }}
                                            tabIndex={0}
                                        >
                                            {d.firstName} {d.lastName}
                                        </li>
                                    ))}
                                    <li
                                        className="list-group-item d-flex justify-content-between align-items-center"
                                        onClick={() => applyDriverSelection(null)}
                                        style={{ cursor: 'pointer' }}
                                        tabIndex={0}
                                    >
                                        + Add new driver (not listed)
                                    </li>
                                </ul>
                                <div className="form-text text-muted mt-2">Tap or press Enter to select a driver.</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

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
                <button type="submit" className="btn btn-primary" onKeyDown={handleRegisterButtonKeyDown}>
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
