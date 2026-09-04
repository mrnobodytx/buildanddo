import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';

const WorkspaceContext = createContext(null);
const ACTIVE_KEY = 'bad_active_ws';

export const WorkspaceProvider = ({ children }) => {
    const { isAuthed } = useAuth();
    const [workspaces, setWorkspaces] = useState([]);
    const [activeId, setActiveId] = useState(
        () => localStorage.getItem(ACTIVE_KEY) || null,
    );
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!isAuthed) {
            setWorkspaces([]);
            setLoading(false);
            return;
        }
        try {
            const list = await pb.collection('workspaces').getFullList({
                sort: '-created',
                expand: 'domain',
            });
            setWorkspaces(list);
        } catch (err) {
            console.error('load workspaces failed', err);
            setWorkspaces([]);
        }
        setLoading(false);
    }, [isAuthed]);

    useEffect(() => {
        load();
    }, [load]);

    const active =
        workspaces.find((w) => w.id === activeId) || workspaces[0] || null;

    useEffect(() => {
        if (active) localStorage.setItem(ACTIVE_KEY, active.id);
    }, [active]);

    const setActive = (id) => setActiveId(id);

    return (
        <WorkspaceContext.Provider
            value={{
                workspaces,
                active,
                setActive,
                loading,
                hasWorkspaces: workspaces.length > 0,
                refresh: load,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspace = () => useContext(WorkspaceContext);

export default WorkspaceContext;
