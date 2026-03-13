import React, { useState, useEffect, useRef } from 'react';

function ClassEditor({ classes, trackTypes, onSave }) {
    // items: { name, type }
    const [items, setItems] = useState([]);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        setItems(classes);
    }, [classes]);

    useEffect(() => {
        if (trackTypes.length > 0 && !trackTypes.includes(newType)) {
            setNewType(trackTypes[0]);
        }
    }, [trackTypes, newType]);

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
        fetch('/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(() => {
                alert('Classes saved successfully!');
                if (onSave) onSave();
            })
            .catch(err => {
                alert('Error saving classes: ' + err.message);
                console.error('Save error:', err);
            });
    };
    const groupedItems = items.reduce((groups, item) => {
        const type = item.type || 'Other';
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push(item);
        return groups;
    }, {});

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
                        {trackTypes.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                    <button className="btn btn-primary" onClick={add}>Add</button>
                </div>
            </div>
            <div className="row mb-3">
                {Object.entries(groupedItems).map(([type, group]) => (
                    <div key={type} className="col">
                        <h5>{type}</h5>
                        <ul className="list-group">
                            {group.map((c, idx) => {
                                const actualIdx = items.findIndex(item => item.name === c.name && item.type === c.type);
                                return (
                                    <li key={`${c.name}-${idx}`} className="list-group-item d-flex justify-content-between align-items-center">
                                        {c.name}
                                        <select
                                            className="form-select form-select-sm w-auto me-2"
                                            value={c.type}
                                            onChange={e => changeType(actualIdx, e.target.value)}
                                        >
                                            {trackTypes.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                        <button className="btn btn-sm btn-danger" onClick={() => remove(actualIdx)}>Remove</button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
            <button className="btn btn-success" onClick={save}>Save Classes</button>
        </div>
    );
}

export default ClassEditor;
