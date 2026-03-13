import React, { useState, useEffect } from 'react';

function RegistrationForm({ classes, onSave, editing }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [selected, setSelected] = useState([]);

    const splitLegacyName = (value = '') => {
        const parts = value.trim().split(/\s+/).filter(Boolean);
        if (parts.length <= 1) {
            return { firstName: parts[0] || '', lastName: '' };
        }
        return {
            firstName: parts[0],
            lastName: parts.slice(1).join(' '),
        };
    };

    useEffect(() => {
        if (editing) {
            const legacyName = splitLegacyName(editing.name);
            setFirstName(editing.firstName || legacyName.firstName);
            setLastName(editing.lastName || legacyName.lastName);
            setSelected(editing.classes || []);
        } else {
            setFirstName('');
            setLastName('');
            setSelected([]);
        }
    }, [editing]);

    const toggleClass = (cls) => {
        if (selected.includes(cls)) {
            setSelected(selected.filter(c => c !== cls));
        } else {
            setSelected([...selected, cls]);
        }
    };

    // ensure each class is object {name,type}
    const norm = c => (typeof c === 'string' ? { name: c, type: 'offroad' } : c);


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
        }
        fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => res.json()).then(() => {
            setFirstName('');
            setLastName('');
            setSelected([]);
            onSave();
        });
    };

    return (
        <form onSubmit={submit} className="mb-4">
            <h4>{editing ? 'Edit Signup' : 'New Signup'}</h4>
            <div className="mb-3">
                <label className="form-label" htmlFor="firstName">First Name *</label>
                <input
                    id="firstName"
                    type="text"
                    className="form-control"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                />
            </div>
            <div className="mb-3">
                <label className="form-label" htmlFor="lastName">Last Name *</label>
                <input
                    id="lastName"
                    type="text"
                    className="form-control"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                />
            </div>
            <div className="mb-3">
                <label className="form-label">Classes</label>
                <div className="row">
                    <div className="col">
                        <strong>Offroad</strong>
                        {classes.map(norm).filter(c => c.type === 'offroad').map((c, idx) => (
                            <div key={idx} className="form-check">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={selected.includes(c.name)}
                                    id={`class-off-${idx}`}
                                    onChange={() => toggleClass(c.name)}
                                />
                                <label className="form-check-label" htmlFor={`class-off-${idx}`}>{c.name}</label>
                            </div>
                        ))}
                    </div>
                    <div className="col">
                        <strong>Onroad</strong>
                        {classes.map(norm).filter(c => c.type === 'onroad').map((c, idx) => (
                            <div key={idx} className="form-check">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={selected.includes(c.name)}
                                    id={`class-on-${idx}`}
                                    onChange={() => toggleClass(c.name)}
                                />
                                <label className="form-check-label" htmlFor={`class-on-${idx}`}>{c.name}</label>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <button type="submit" className="btn btn-primary">
                {editing ? 'Update' : 'Register'}
            </button>
        </form>
    );
}

export default RegistrationForm;
