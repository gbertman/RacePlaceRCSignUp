import React, { useState, useEffect } from 'react';

function RegistrationForm({ classes, onSave, editing }) {
    const [name, setName] = useState('');
    const [transponder, setTransponder] = useState('');
    const [selected, setSelected] = useState([]);

    useEffect(() => {
        if (editing) {
            setName(editing.name);
            setTransponder(editing.transponder || '');
            setSelected(editing.classes || []);
        } else {
            setName('');
            setTransponder('');
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
        if (!name.trim()) return;
        const payload = {
            name: name.trim(),
            transponder: transponder.trim(),
            classes: selected,
        };
        if (editing && editing.name) {
            payload.originalName = editing.name;
        }
        fetch('http://localhost:4000/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => res.json()).then(() => {
            onSave();
        });
    };

    return (
        <form onSubmit={submit} className="mb-4">
            <h4>{editing ? 'Edit Signup' : 'New Signup'}</h4>
            <div className="mb-3">
                <label className="form-label">Name *</label>
                <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                />
            </div>
            <div className="mb-3">
                <label className="form-label">Transponder</label>
                <input
                    type="text"
                    className="form-control"
                    value={transponder}
                    onChange={e => setTransponder(e.target.value)}
                />
            </div>
            <div className="mb-3">
                <label className="form-label">Classes</label>
                {classes.map((c, idx) => (
                    <div key={idx} className="form-check">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            checked={selected.includes(c)}
                            id={`class-${idx}`}
                            onChange={() => toggleClass(c)}
                        />
                        <label className="form-check-label" htmlFor={`class-${idx}`}>{c}</label>
                    </div>
                ))}
            </div>
            <button type="submit" className="btn btn-primary">
                {editing ? 'Update' : 'Register'}
            </button>
        </form>
    );
}

export default RegistrationForm;