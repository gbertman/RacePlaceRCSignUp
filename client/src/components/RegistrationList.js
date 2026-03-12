import React from 'react';

function RegistrationList({ registrations, onEdit }) {
    const entries = Object.values(registrations);

    const downloadCsv = () => {
        window.location.href = 'http://localhost:4000/download';
    };

    return (
        <div>
            <h4>Registered Racers</h4>
            <button className="btn btn-secondary mb-2" onClick={downloadCsv}>
                Download CSV
            </button>
            <ul className="list-group">
                {entries.map(r => (
                    <li key={r.name} className="list-group-item d-flex justify-content-between align-items-center">
                        <span onClick={() => onEdit(r.name)} style={{ cursor: 'pointer' }}>{r.name}</span>
                        <span>{r.classes.join(', ')}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default RegistrationList;