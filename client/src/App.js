import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import RegistrationForm from './components/RegistrationForm';
import RegistrationList from './components/RegistrationList';
import ClassEditor from './components/ClassEditor';

function App() {
    const [classes, setClasses] = useState([]);
    const [registrations, setRegistrations] = useState({});
    const [editing, setEditing] = useState(null); // name being edited

    const fetchClasses = () => {
        fetch('/classes')
            .then(res => res.json())
            .then(data => setClasses(data));
    };

    const fetchRegistrations = () => {
        fetch('/registrations')
            .then(res => res.json())
            .then(data => setRegistrations(data));
    };

    useEffect(() => {
        fetchClasses();
        fetchRegistrations();
    }, []);

    return (
        <Router>
            <nav className="navbar navbar-expand-lg navbar-light bg-light">
                <div className="container-fluid">
                    <Link className="navbar-brand" to="/">RacePlaceRC</Link>
                    <div className="collapse navbar-collapse">
                        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                            <li className="nav-item">
                                <Link className="nav-link" to="/">Signup</Link>
                            </li>
                            <li className="nav-item">
                                <Link className="nav-link" to="/classes">Edit Classes</Link>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
            <div className="container mt-4">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <RegistrationForm
                                    classes={classes}
                                    onSave={() => {
                                        fetchRegistrations();
                                        setEditing(null);
                                    }}
                                    editing={editing ? registrations[editing] : null}
                                />
                                <RegistrationList
                                    registrations={registrations}
                                    classes={classes}
                                    onEdit={name => setEditing(name)}
                                    onReset={fetchRegistrations}
                                />
                            </>
                        }
                    />
                    <Route
                        path="/classes"
                        element={<ClassEditor classes={classes} onSave={fetchClasses} />}
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
