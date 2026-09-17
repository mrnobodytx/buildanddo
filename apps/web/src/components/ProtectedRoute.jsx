import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { workspaceDestination } from '@/lib/navigationIntent';

const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
    const { isAuthed } = useAuth();
    const location = useLocation();

    if (!isAuthed) return <Navigate to={redirectTo} state={{ returnTo: workspaceDestination(`${location.pathname}${location.search}${location.hash}`) }} replace />;

    return children;
}

export default ProtectedRoute;

export { ProtectedRoute };
