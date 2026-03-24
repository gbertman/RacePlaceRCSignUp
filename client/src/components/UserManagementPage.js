import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAdminSession from '../hooks/useAdminSession';

function UserManagementPage() {
    const [users, setUsers] = useState([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [passwordDrafts, setPasswordDrafts] = useState({});
    const {
        fetchAdmin,
        isAdministrator,
        isAuthenticated,
        isCheckingAuth,
        readError,
    } = useAdminSession();

    const loadUsers = useCallback(async () => {
        try {
            const response = await fetchAdmin('/admin/users');
            if (!response.ok) {
                throw new Error(await readError(response, `Failed to load users: ${response.status}`));
            }

            const data = await response.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Unable to load users:', error);
            if (error.message !== 'Admin login required' && error.message !== 'Admin access required') {
                window.alert(error.message);
            }
        }
    }, [fetchAdmin, readError]);

    useEffect(() => {
        if (isAuthenticated && isAdministrator) {
            loadUsers();
        }
    }, [isAuthenticated, isAdministrator, loadUsers]);

    const createUser = async (e) => {
        e.preventDefault();
        const username = newUsername.trim();
        const password = newPassword;

        if (!username || !password) {
            window.alert('Username and password are required');
            return;
        }

        try {
            const response = await fetchAdmin('/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    role: newRole,
                }),
            });

            if (!response.ok) {
                throw new Error(await readError(response, `Failed to create user: ${response.status}`));
            }

            setNewUsername('');
            setNewPassword('');
            setNewRole('user');
            await loadUsers();
        } catch (error) {
            window.alert(error.message);
        }
    };

    const saveUser = async (username, role) => {
        try {
            const response = await fetchAdmin(`/admin/users/${encodeURIComponent(username)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role,
                    password: passwordDrafts[username] || '',
                }),
            });

            if (!response.ok) {
                throw new Error(await readError(response, `Failed to update user: ${response.status}`));
            }

            setPasswordDrafts(current => ({
                ...current,
                [username]: '',
            }));
            await loadUsers();
        } catch (error) {
            window.alert(error.message);
        }
    };

    const deleteUser = async (username) => {
        if (!window.confirm(`Delete user "${username}"?`)) {
            return;
        }

        try {
            const response = await fetchAdmin(`/admin/users/${encodeURIComponent(username)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(await readError(response, `Failed to delete user: ${response.status}`));
            }

            await loadUsers();
        } catch (error) {
            window.alert(error.message);
        }
    };

    if (isCheckingAuth) {
        return <p className="text-muted">Checking admin access...</p>;
    }

    if (!isAuthenticated) {
        return (
            <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="mb-0">User Management</h4>
                    <Link className="btn btn-outline-secondary" to="/admin">Back to Admin</Link>
                </div>
                <div className="alert alert-warning mb-0">Sign in on the Admin page to manage users.</div>
            </div>
        );
    }

    if (!isAdministrator) {
        return (
            <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="mb-0">User Management</h4>
                    <Link className="btn btn-outline-secondary" to="/admin">Back to Admin</Link>
                </div>
                <div className="alert alert-danger mb-0">Only users with admin access can manage users.</div>
            </div>
        );
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">User Management</h4>
                <Link className="btn btn-outline-secondary" to="/admin">Back to Admin</Link>
            </div>

            <div className="mb-4">
                <h5>Add User</h5>
                <form onSubmit={createUser}>
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label" htmlFor="new-user-username">Username</label>
                            <input
                                id="new-user-username"
                                className="form-control"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label" htmlFor="new-user-password">Password</label>
                            <input
                                id="new-user-password"
                                type="password"
                                className="form-control"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label" htmlFor="new-user-role">Access</label>
                            <select
                                id="new-user-role"
                                className="form-select"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value)}
                            >
                                <option value="user">User</option>
                                <option value="administrator">Administrator</option>
                            </select>
                        </div>
                        <div className="col-md-2 d-flex align-items-end">
                            <button type="submit" className="btn btn-primary w-100">Add User</button>
                        </div>
                    </div>
                </form>
            </div>

            <div>
                <h5>Existing Users</h5>
                {users.length === 0 ? (
                    <p className="text-muted mb-0">No users found.</p>
                ) : (
                    <div className="list-group">
                        {users.map(user => (
                            <div key={user.username} className="list-group-item">
                                <div className="row g-3 align-items-end">
                                    <div className="col-md-3">
                                        <label className="form-label">Username</label>
                                        <input className="form-control" value={user.username} disabled />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Access</label>
                                        <select
                                            className="form-select"
                                            value={user.role}
                                            onChange={e => {
                                                const nextRole = e.target.value;
                                                setUsers(current =>
                                                    current.map(item => (
                                                        item.username === user.username
                                                            ? { ...item, role: nextRole }
                                                            : item
                                                    ))
                                                );
                                            }}
                                        >
                                            <option value="user">User</option>
                                            <option value="administrator">Administrator</option>
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">New Password</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={passwordDrafts[user.username] || ''}
                                            onChange={e => {
                                                const value = e.target.value;
                                                setPasswordDrafts(current => ({
                                                    ...current,
                                                    [user.username]: value,
                                                }));
                                            }}
                                            placeholder="Leave blank to keep"
                                        />
                                    </div>
                                    <div className="col-md-3 d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-success flex-fill"
                                            onClick={() => saveUser(user.username, user.role)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger flex-fill"
                                            onClick={() => deleteUser(user.username)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default UserManagementPage;
