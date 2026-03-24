import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import RegistrationForm from './components/RegistrationForm';
import RegistrationList from './components/RegistrationList';
import AdminPage from './components/AdminPage';
import UserManagementPage from './components/UserManagementPage';
import NotFoundPage from './components/NotFoundPage';
import racePlaceLogo from './assets/race-place-rc-logo.svg';

function App() {
    const [classes, setClasses] = useState([]);
    const [trackTypes, setTrackTypes] = useState([]);
    const [registrations, setRegistrations] = useState({});
    const [editing, setEditing] = useState(null); // name being edited
    const enabledTrackTypes = trackTypes.filter(track => track.enabled).map(track => track.name);
    const registrationClasses = classes.filter(item => enabledTrackTypes.includes(item.type));

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

    const fetchTrackTypes = () => {
        fetch('/track')
            .then(res => res.json())
            .then(data => setTrackTypes(data));
    };

    useEffect(() => {
        fetchClasses();
        fetchTrackTypes();
        fetchRegistrations();
    }, []);

    useEffect(() => {
        const socket = io();

        socket.on('registrationsUpdated', () => {
            fetchRegistrations();
        });

        socket.on('classesUpdated', () => {
            fetchClasses();
            fetchTrackTypes();
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <Router>
            <nav className="navbar navbar-expand-lg navbar-light bg-light app-navbar">
                <div className="container-fluid app-navbar-inner">
                    <Link className="navbar-brand app-brand" to="/" aria-label="Race Place RC Signup home">
                        <img src={racePlaceLogo} alt="Race Place RC" className="app-logo" />
                        <span className="app-brand-title">Race Registration</span>
                    </Link>
                </div>
            </nav>
            <div className="container mt-4">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <>
                                <RegistrationForm
                                    classes={registrationClasses}
                                    registrationOpen={enabledTrackTypes.length > 0}
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
                                trackTypes={trackTypes}
                                registrations={registrations}
                                onClassesSaved={fetchClasses}
                                onRegistrationsChanged={fetchRegistrations}
                            />
                        }
                    />
                    <Route path="/admin/users" element={<UserManagementPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
