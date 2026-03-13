import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import RegistrationForm from './components/RegistrationForm';
import RegistrationList from './components/RegistrationList';
import AdminPage from './components/AdminPage';

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
                                    onEdit={name => setEditing(name)}
                                />
                            </>
                        }
                    />
                    <Route
                        path="/admin"
                        element={
                            <AdminPage
                                classes={classes}
                                registrations={registrations}
                                onClassesSaved={fetchClasses}
                                onRegistrationsChanged={fetchRegistrations}
                            />
                        }
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
