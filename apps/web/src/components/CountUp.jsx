import React, { useEffect, useRef, useState } from 'react';
import { useMotionActivity } from '@/contexts/MotionContext';
import { createFrameLoop } from '@/lib/motion/runtime';

const CountUp = ({ value, duration = 600, decimals = 0, prefix = '', suffix = '', locale, className = '' }) => {
    const target = Number(value) || 0;
    const [display, setDisplay] = useState(target);
    const previous = useRef(target);
    const { ref, active, motion } = useMotionActivity('data');
    useEffect(() => {
        const from = previous.current;
        previous.current = target;
        if (!active || from === target) { setDisplay(target); return undefined; }
        let start;
        const length = Math.max(1, Math.min(1200, duration * motion.duration.layout / 260));
        const loop = createFrameLoop((now) => {
            if (start === undefined) start = now;
            const progress = Math.min(1, (now - start) / length);
            const next = from + (target - from) * (1 - Math.pow(1 - progress, 3));
            setDisplay(next);
            previous.current = next;
            if (progress >= 1) loop.setActive(false);
        }, window);
        loop.setActive(true);
        return () => loop.dispose();
    }, [target, duration, active, motion.duration.layout]);
    const format = (number) => `${prefix}${number.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    return <span ref={ref} className={className}>
        <span aria-hidden="true">{format(display)}</span><span className="sr-only">{format(target)}</span>
    </span>;
};
export default CountUp;
export { CountUp };
