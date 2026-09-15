import { useLocation } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';

export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    const previousPath = useRef(pathname);

    useLayoutEffect(() => {
        const changedPage = previousPath.current !== pathname;
        previousPath.current = pathname;
        let anchor = '';
        try {
            anchor = decodeURIComponent(hash.slice(1));
        } catch {
            anchor = hash.slice(1);
        }
        const settle = () => {
            if (document.querySelector('[data-route-loading]')) return false;
            const main = document.getElementById('main-content');
            if (!main) return false;
            const target = anchor ? document.getElementById(anchor) : null;
            if (target) {
                target.scrollIntoView({ behavior: 'auto', block: 'start' });
            } else if (changedPage || !anchor) {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }
            if (changedPage) main.focus({ preventScroll: true });
            return true;
        };
        if (settle()) return undefined;
        // A lazy page may mount after this router effect. Wait for real content
        // so deep links and keyboard focus do not land on the loading fallback.
        const observer = new MutationObserver(() => {
            if (settle()) observer.disconnect();
        });
        observer.observe(document.getElementById('root') || document.body, {
            childList: true,
            subtree: true,
        });
        return () => observer.disconnect();
    }, [pathname, hash]);
    return null;
}

export { ScrollToTop };
