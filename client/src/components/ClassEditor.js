import React, { useState, useEffect, useRef } from 'react';

function ClassEditor({ classes, onSave }) {
    // items: { name, type }
    const [items, setItems] = useState([]);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('offroad');
    const inputRef = useRef(null);

    useEffect(() => {
        setItems(classes.map(c => (typeof c === 'string' ? { name: c, type: 'offroad' } : c)));
    }, [classes]);

    const add = () => {
        if (newName.trim()) {
            setItems([...items, { name: newName.trim(), type: newType }]);
            setNewName('');
            if (inputRef.current) {
                setTimeout(() => inputRef.current.focus(), 0);
            }
        }
    };

    const remove = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const changeType = (idx, type) => {
        const copy = [...items];
        copy[idx].type = type;
        setItems(copy);
    };

    const save = () => {
        const payload = { classes: items };
        console.log('Saving classes:', payload);
        fetch('/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log('Save response:', data);
                alert('Classes saved successfully!');
                if (onSave) onSave();
            })
            .catch(err => {
                alert('Error saving classes: ' + err.message);
                console.error('Save error:', err);
            });
    };

    const offroad = items.filter(i => i.type === 'offroad');
    const onroad = items.filter(i => i.type === 'onroad');

    return (
        <div>
            <h4>Edit Classes</h4>
            <div className="mb-3">
                <div className="input-group">
                    <input
                        ref={inputRef}
                        type="text"
                        className="form-control"
                        placeholder="New class"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && add()}
                    />
                    <select
                        className="form-select"
                        value={newType}
                        onChange={e => setNewType(e.target.value)}
                    >
                        <option value="offroad">Offroad</option>
                        <option value="onroad">Onroad</option>
                    </select>
                    <button className="btn btn-primary" onClick={add}>Add</button>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col">
                    <h5>Offroad</h5>
                    <ul className="list-group">
                        {offroad.map((c, idx) => {
                            const actualIdx = items.findIndex(item => item.name === c.name && item.type === c.type);
                            return (
                                <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                                    {c.name}
                                    <select
                                        className="form-select form-select-sm w-auto me-2"
                                        value={c.type}
                                        onChange={e => changeType(actualIdx, e.target.value)}
                                    >
                                        <option value="offroad">Offroad</option>
                                        <option value="onroad">Onroad</option>
                                    </select>
                                    <button className="btn btn-sm btn-danger" onClick={() => remove(actualIdx)}>Remove</button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div className="col">
                    <h5>Onroad</h5>
                    <ul className="list-group">
                        {onroad.map((c, idx) => {
                            const actualIdx = items.findIndex(item => item.name === c.name && item.type === c.type);
                            return (
                                <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                                    {c.name}
                                    <select
                                        className="form-select form-select-sm w-auto me-2"
                                        value={c.type}
                                        onChange={e => changeType(actualIdx, e.target.value)}
                                    >
                                        <option value="offroad">Offroad</option>
                                        <option value="onroad">Onroad</option>
                                    </select>
                                    <button className="btn btn-sm btn-danger" onClick={() => remove(actualIdx)}>Remove</button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
            <button className="btn btn-success" onClick={save}>Save Classes</button>
        </div>
    );
}

export default ClassEditor;