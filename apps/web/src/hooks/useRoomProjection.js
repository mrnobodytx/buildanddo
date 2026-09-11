import { useEffect, useState } from 'react';

export function useRoomProjection(kind) {
    const [state, setState] = useState({ loading: true, projection: null, error: null });
    useEffect(() => {
        let live = true;
        const url = `/room-projections/${kind}.json`;
        fetch(url, { cache: 'no-store' }).then(async (r) => {
            if (!r.ok) throw new Error(`projection ${kind}: ${r.status}`);
            return r.json();
        }).then((projection) => live && setState({ loading:false, projection, error:null }))
          .catch((error) => live && setState({ loading:false, projection:null, error:String(error) }));
        return () => { live = false; };
    }, [kind]);
    return state;
}
