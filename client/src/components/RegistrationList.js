import React from 'react';

function RegistrationList({ registrations, onEdit }) {
    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

    return (
        <div className="pb-3">
            <h4>Registered Racers</h4>
            <p>
                <em>
                    Click your name below to edit your entry. If you no longer plan to race, please let the
                    office know so your registration can be removed.
                </em>
            </p>
            <ul className="list-group">
                {entries.map(r => (
                    <li key={r.key} className="list-group-item d-flex justify-content-between align-items-center">
                        <span onClick={() => onEdit(r.key)} style={{ cursor: 'pointer' }}>{r.name}</span>
                        <span>{r.classes.join(', ')}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default RegistrationList;
