import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    Group,
    NativeSelect,
    PasswordInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
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
        return <Text c="dimmed">Checking admin access...</Text>;
    }

    const pageHeader = (
        <Group justify="space-between" align="center">
            <Title order={1} size="h4">User Management</Title>
            <Button component={Link} to="/admin" variant="default">Back to Admin</Button>
        </Group>
    );

    if (!isAuthenticated) {
        return (
            <Stack>
                {pageHeader}
                <Alert color="yellow">Sign in on the Admin page to manage users.</Alert>
            </Stack>
        );
    }

    if (!isAdministrator) {
        return (
            <Stack>
                {pageHeader}
                <Alert color="red">Only users with admin access can manage users.</Alert>
            </Stack>
        );
    }

    return (
        <Stack gap="xl">
            {pageHeader}

            <Stack gap="sm">
                <Title order={2} size="h5">Add User</Title>
                <Box component="form" onSubmit={createUser}>
                    <SimpleGrid cols={{ base: 1, md: 4 }} style={{ alignItems: 'end' }}>
                            <TextInput
                                id="new-user-username"
                                label="Username"
                                value={newUsername}
                                onChange={e => setNewUsername(e.currentTarget.value)}
                            />
                            <PasswordInput
                                id="new-user-password"
                                label="Password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.currentTarget.value)}
                            />
                            <NativeSelect
                                id="new-user-role"
                                label="Access"
                                value={newRole}
                                onChange={e => setNewRole(e.currentTarget.value)}
                                data={[
                                    { value: 'user', label: 'User' },
                                    { value: 'administrator', label: 'Administrator' },
                                ]}
                            />
                            <Button type="submit" fullWidth>Add User</Button>
                    </SimpleGrid>
                </Box>
            </Stack>

            <Stack gap="sm">
                <Title order={2} size="h5">Existing Users</Title>
                {users.length === 0 ? (
                    <Text c="dimmed">No users found.</Text>
                ) : (
                    <Stack gap="sm">
                        {users.map(user => (
                            <Card key={user.username} withBorder>
                                <SimpleGrid cols={{ base: 1, md: 4 }} style={{ alignItems: 'end' }}>
                                        <TextInput label="Username" value={user.username} disabled />
                                        <NativeSelect
                                            label="Access"
                                            value={user.role}
                                            onChange={e => {
                                                const nextRole = e.currentTarget.value;
                                                setUsers(current =>
                                                    current.map(item => (
                                                        item.username === user.username
                                                            ? { ...item, role: nextRole }
                                                            : item
                                                    ))
                                                );
                                            }}
                                            data={[
                                                { value: 'user', label: 'User' },
                                                { value: 'administrator', label: 'Administrator' },
                                            ]}
                                        />
                                        <PasswordInput
                                            label="New Password"
                                            value={passwordDrafts[user.username] || ''}
                                            onChange={e => {
                                                const value = e.currentTarget.value;
                                                setPasswordDrafts(current => ({
                                                    ...current,
                                                    [user.username]: value,
                                                }));
                                            }}
                                            placeholder="Leave blank to keep"
                                        />
                                    <Group grow>
                                        <Button
                                            color="green"
                                            onClick={() => saveUser(user.username, user.role)}
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            color="red"
                                            variant="light"
                                            onClick={() => deleteUser(user.username)}
                                        >
                                            Delete
                                        </Button>
                                    </Group>
                                </SimpleGrid>
                            </Card>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Stack>
    );
}

export default UserManagementPage;
