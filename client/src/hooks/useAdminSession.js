import { useCallback, useEffect, useState } from 'react';

async function readError(response, fallbackMessage) {
    try {
        const data = await response.json();
        return data?.error || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function useAdminSession() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const isAdministrator = userRole === 'administrator';

    const clearSession = useCallback(() => {
        setIsAuthenticated(false);
        setUserRole(null);
    }, []);

    const refreshSession = useCallback(async () => {
        try {
            const response = await fetch('/admin/session');
            if (!response.ok) {
                throw new Error(`Failed to check admin session: ${response.status}`);
            }

            const data = await response.json();
            setIsAuthenticated(Boolean(data?.authenticated));
            setUserRole(data?.role || null);
            return data;
        } catch (error) {
            console.error('Unable to check admin session:', error);
            clearSession();
            return null;
        } finally {
            setIsCheckingAuth(false);
        }
    }, [clearSession]);

    useEffect(() => {
        refreshSession();
    }, [refreshSession]);

    const fetchAdmin = useCallback(async (url, options = {}) => {
        const response = await fetch(url, options);

        if (response.status === 401) {
            clearSession();
            throw new Error('Admin login required');
        }

        if (response.status === 403) {
            await refreshSession();
            throw new Error('Admin access required');
        }

        return response;
    }, [clearSession, refreshSession]);

    const login = useCallback(async (username, password) => {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username.trim(),
                password,
            }),
        });

        if (!response.ok) {
            throw new Error(await readError(response, `Login failed with status ${response.status}`));
        }

        const data = await response.json();
        setIsAuthenticated(true);
        setUserRole(data?.role || null);
        return data;
    }, []);

    const logout = useCallback(async () => {
        const response = await fetchAdmin('/admin/logout', { method: 'POST' });
        clearSession();
        return response;
    }, [clearSession, fetchAdmin]);

    return {
        fetchAdmin,
        isAdministrator,
        isAuthenticated,
        isCheckingAuth,
        login,
        logout,
        readError,
        refreshSession,
        userRole,
    };
}

export default useAdminSession;
