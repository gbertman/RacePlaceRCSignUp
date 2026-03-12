import React, { useState, useEffect } from 'react';

function ClassEditor({ classes, onSave }) {
    const [items, setItems] = useState([]);
    const [newClass, setNewClass] = useState('');

    useEffect(() => {
        setItems(classes);
    }, [classes]);

    const add = () => {
        if (newClass.trim()) {
            setItems([...items, newClass.trim()]);
            setNewClass('');
        }
    };

    const remove = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const save = () => {
        fetch('http://localhost:4000/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classes: items }),
        }).then(() => onSave());
    };

    return (
        <div>
            <h4>Edit Classes</h4>
            <div className="mb-3">
                <input
                    type="text"
                    className="form-control"
                    placeholder="New class"
                    value={newClass}
                    onChange={e => setNewClass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && add()}
                />
                <button className="btn btn-primary mt-2" onClick={add}>Add</button>
            </div>
            <ul className="list-group mb-3">
                {items.map((c, idx) => (
                    <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                        {c}
                        <button className="btn btn-sm btn-danger" onClick={() => remove(idx)}>Remove</button>
                    </li>
                ))}
            </ul>
            <button className="btn btn-success" onClick={save}>Save Classes</button>
        </div>
    );
}

export default ClassEditor;