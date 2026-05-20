import React from 'react';

function RegistrationList({ registrations, classes = [], onEdit }) {
    const entries = Object.entries(registrations).map(([key, registration]) => ({
        key,
        ...registration,
    }));

    const classCounts = entries.reduce((counts, r) => {
        (r.classes || []).forEach(name => {
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, {});

    const classesByType = classes.reduce((groups, c) => {
        const type = c.type || 'Other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(c);
        return groups;
    }, {});

    return (
        <div className="pb-3">
            {classes.length > 0 ? (
                <div className="mb-4">
                    <h4>Class Counts</h4>
                    <div className="row g-3">
                        {Object.entries(classesByType).map(([type, group]) => (
                            <div key={type} className="col-sm-6 col-lg-4">
                                <div className="border rounded p-3 h-100">
                                    <div className="fw-bold mb-2">{type}</div>
                                    <ul className="list-unstyled mb-0">
                                        {group.map(c => (
                                            <li key={c.name} className="d-flex justify-content-between align-items-center py-1">
                                                <span>{c.name}</span>
                                                <span className="badge bg-secondary rounded-pill">{classCounts[c.name] || 0}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
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
