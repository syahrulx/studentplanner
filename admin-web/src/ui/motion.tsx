import type { ReactNode } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from './cn';

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Cross-fade + slide when switching admin routes (reactive to navigation). */
export const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const pageTransition = { duration: 0.32, ease: easeOut };

const sectionVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

type MotionSectionProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  children: ReactNode;
  /** Extra delay after scroll-into-view (stagger sections on long pages). */
  delay?: number;
};

/** Scroll-reactive reveal: animates when the section enters the viewport. */
export function MotionSection({ className, children, delay = 0, ...rest }: MotionSectionProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-48px 0px -12% 0px', amount: 0.12 }}
      variants={sectionVariants}
      transition={{ duration: 0.5, delay, ease: easeOut }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: easeOut },
  },
};

/** Parent: children should use `MotionStaggerItem` for staggered scroll-in. */
export function MotionStagger({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px 0px -10% 0px', amount: 0.08 }}
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerItem({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={cn(className)} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/** Hover / tap feedback on panels and cards (pointer-reactive). */
export function MotionPanel({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn(className)}
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 420, damping: 28 } }}
      whileTap={{ scale: 0.992 }}
    >
      {children}
    </motion.div>
  );
}

/** Sidebar links: mount stagger + hover slide (reactive to pointer). */
export function MotionSidebarItem({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.045, duration: 0.35, ease: easeOut }}
      whileHover={{ x: 4, transition: { type: 'spring', stiffness: 380, damping: 22 } }}
    >
      {children}
    </motion.div>
  );
}
