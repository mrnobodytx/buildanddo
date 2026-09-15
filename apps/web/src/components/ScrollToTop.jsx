import { useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMotionCategory } from '@/contexts/MotionContext';
import { animateElement } from '@/lib/motion/runtime';

export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    const previousPath = useRef(pathname);
    const policy = useMotionCategory('navigation');
    const latestPolicy = useRef(policy);
    latestPolicy.current = policy;
    const cancel = useRef(() => {});
    useEffect(() => { if (!policy.enabled) cancel.current(); }, [policy.enabled]);

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
            if (changedPage) {
                main.focus({ preventScroll: true });
                const { enabled, motion } = latestPolicy.current;
                cancel.current = animateElement(main, [{ opacity: 0.65 }, { opacity: 1 }], {
                    duration: motion.duration.route, easing: motion.ease,
                }, enabled);
            }
            return true;
        };
        if (settle()) return () => cancel.current();
        // A lazy page may mount after this router effect. Wait for real content
        // so deep links and keyboard focus do not land on the loading fallback.
        const observer = new MutationObserver(() => {
            if (settle()) observer.disconnect();
        });
        observer.observe(document.getElementById('root') || document.body, {
            childList: true,
            subtree: true,
        });
        return () => { observer.disconnect(); cancel.current(); };
    }, [pathname, hash]);
    return null;
}

export { ScrollToTop };
