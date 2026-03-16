import React, { useState, useEffect } from 'react';

function RegistrationForm({ classes, onSave, editing }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [selected, setSelected] = useState([]);
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
    }, [editing]);

    const toggleClass = (cls) => {
        if (selected.includes(cls)) {
            setSelected(selected.filter(c => c !== cls));
        } else {
            setSelected([...selected, cls]);
        }
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
            <h4>{editing ? 'Edit Signup' : 'Signup'}</h4>
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
            <button type="submit" className="btn btn-primary">
                {editing ? 'Update' : 'Register'}
            </button>
        </form>
    );
}

export default RegistrationForm;
