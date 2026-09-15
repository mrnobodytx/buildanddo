import React from 'react';
import { MotionReveal } from '@/components/motion/MotionPrimitives';

// Preserve the public helper API; one-shot observation keeps repeated reading calm.
const Reveal = ({ children, delay = 0, y: _y, className = '', as = 'div', once: _once, ...rest }) => (
    <MotionReveal as={as} delay={delay > 10 ? delay : delay * 1000} className={className} {...rest}>
        {children}
    </MotionReveal>
);
export default Reveal;
export { Reveal };
