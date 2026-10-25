/**
 * Spectrum UI — TaskCheckbox
 *
 * A deeply satisfying todo checkbox row. Checking fills the box with a snappy
 * spring, draws the check in, pops the box and fires a tiny confetti burst
 * while a strikethrough sweeps across the label; unchecking reverses quickly
 * with no fanfare. Works controlled or uncontrolled, honors
 * prefers-reduced-motion, and exposes real checkbox semantics via
 * role="checkbox" and aria-checked.
 *
 * Dependencies: framer-motion, @/lib/utils
 */

import React, { useCallback, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const MICRO_SPRING = { type: "spring", stiffness: 500, damping: 30 };
const REVEAL_EASE = [0.22, 1, 0.36, 1];

const CHECK_DRAW_DELAY = 0.06;
const CHECK_DRAW_DURATION = 0.2;

const STRIKE_DURATION = 0.25;
const UNSTRIKE_DURATION = 0.15;
const STRIKE_HEIGHT = 1.5;

const POP_KEYFRAMES = [1, 0.9, 1.05, 1];
const POP_DURATION = 0.4;
const POP_TIMES = [0, 0.3, 0.7, 1];

const CONFETTI_COUNT = 6;
const CONFETTI_DURATION = 0.5;
const CONFETTI_DISTANCE_FAR = 1.6;
const CONFETTI_DISTANCE_NEAR = 1.25;
const CONFETTI_COLORS = ["#a3a3a3", "#10b981"];

const CHECK_PATH = "M5 12.5L10 17.5L19 7.5";

const SIZES = {
  sm: {
    gap: "gap-2.5",
    hit: "-m-1 -mt-0.5 h-6 w-6",
    box: "h-4 w-4",
    radius: "rounded",
    boxPx: 16,
    label: "text-sm leading-5",
    description: "text-xs leading-4",
  },
  md: {
    gap: "gap-3",
    hit: "-m-1 h-7 w-7",
    box: "h-5 w-5",
    radius: "rounded-md",
    boxPx: 20,
    label: "text-sm leading-5",
    description: "text-xs leading-4",
  },
  lg: {
    gap: "gap-3",
    hit: "-m-1 h-8 w-8",
    box: "h-6 w-6",
    radius: "rounded-md",
    boxPx: 24,
    label: "text-base leading-6",
    description: "text-sm leading-5",
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TaskCheckbox({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  size = "md",
  disabled = false,
  className,
}) {
  const shouldReduceMotion = useReducedMotion();
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const [burstKey, setBurstKey] = useState(0);
  const labelId = useId();
  const descriptionId = useId();

  const checked = checkedProp ?? internalChecked;
  const sizes = SIZES[size] || SIZES.md;
  const confettiDotSize = Math.max(3, Math.round(sizes.boxPx * 0.2));

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !checked;
    if (checkedProp === undefined) setInternalChecked(next);
    onCheckedChange?.(next);
    if (next && !shouldReduceMotion) setBurstKey((key) => key + 1);
  }, [checked, checkedProp, disabled, onCheckedChange, shouldReduceMotion]);

  return (
    <div
      className={cn(
        "group flex select-none touch-manipulation items-start task-checkbox-container",
        sizes.gap,
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={toggle}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
        transition={MICRO_SPRING}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-md task-checkbox-button",
          "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-neutral-300",
          sizes.hit
        )}
      >
        <motion.span
          className={cn(
            "relative flex items-center justify-center border bg-white transition-colors duration-200 dark:bg-neutral-900 task-checkbox-box",
            checked
              ? "border-neutral-900 dark:border-white checked"
              : "border-neutral-200 group-hover:border-neutral-400 dark:border-neutral-800 dark:group-hover:border-neutral-600",
            sizes.box,
            sizes.radius
          )}
          initial={false}
          animate={
            checked && !shouldReduceMotion
              ? { scale: POP_KEYFRAMES }
              : { scale: 1 }
          }
          transition={
            checked && !shouldReduceMotion
              ? { duration: POP_DURATION, times: POP_TIMES, ease: "easeOut" }
              : { duration: 0.15 }
          }
        >
          <motion.span
            aria-hidden="true"
            className={cn(
              "absolute inset-0 bg-neutral-900 dark:bg-white task-checkbox-fill",
              sizes.radius
            )}
            initial={false}
            animate={{ scale: checked ? 1 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? MICRO_SPRING
                  : { duration: 0.15, ease: "easeOut" }
            }
          />

          <svg
            viewBox="0 0 24 24"
            className="relative h-full w-full p-[15%] text-white dark:text-neutral-900 task-checkbox-check"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <motion.path
              d={CHECK_PATH}
              initial={false}
              animate={{
                pathLength: checked ? 1 : 0,
                opacity: checked ? 1 : 0,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : checked
                    ? {
                        pathLength: {
                          delay: CHECK_DRAW_DELAY,
                          duration: CHECK_DRAW_DURATION,
                          ease: "easeOut",
                        },
                        opacity: { delay: CHECK_DRAW_DELAY, duration: 0.01 },
                      }
                    : { duration: 0.1 }
              }
            />
          </svg>

          {burstKey > 0 && !shouldReduceMotion && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center task-checkbox-confetti"
            >
              {Array.from({ length: CONFETTI_COUNT }).map((_, index) => {
                const angle =
                  (index / CONFETTI_COUNT) * Math.PI * 2 - Math.PI / 2;
                const distance =
                  sizes.boxPx *
                  (index % 2 === 0
                    ? CONFETTI_DISTANCE_FAR
                    : CONFETTI_DISTANCE_NEAR);
                return (
                  <motion.span
                    key={`confetti-${burstKey}-${index}`}
                    className="absolute rounded-full"
                    style={{
                      width: confettiDotSize,
                      height: confettiDotSize,
                      backgroundColor:
                        CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                    }}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{
                      x: Math.cos(angle) * distance,
                      y: Math.sin(angle) * distance,
                      scale: [0, 1, 0.3],
                      opacity: [1, 1, 0],
                    }}
                    transition={{
                      duration: CONFETTI_DURATION,
                      ease: "easeOut",
                    }}
                    onAnimationComplete={
                      index === CONFETTI_COUNT - 1
                        ? () => setBurstKey(0)
                        : undefined
                    }
                  />
                );
              })}
            </span>
          )}
        </motion.span>
      </motion.button>

      {(label || description) && (
        <div
          onClick={toggle}
          className={cn("flex min-w-0 flex-col task-checkbox-label-wrap", !disabled && "cursor-pointer")}
        >
          <span
            id={labelId}
            className={cn(
              "relative w-fit transition-colors task-checkbox-label",
              checked
                ? "text-neutral-400 duration-200 dark:text-neutral-600 checked"
                : "text-neutral-900 duration-150 dark:text-neutral-100",
              sizes.label
            )}
          >
            {label}
            <motion.span
              aria-hidden="true"
              className="absolute left-0 right-0 bg-neutral-400 dark:bg-neutral-600 task-checkbox-strike"
              style={{
                height: STRIKE_HEIGHT,
                top: `calc(50% - ${STRIKE_HEIGHT / 2}px)`,
                transformOrigin: checked ? "0% 50%" : "100% 50%",
              }}
              initial={false}
              animate={{ scaleX: checked ? 1 : 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      duration: checked ? STRIKE_DURATION : UNSTRIKE_DURATION,
                      ease: REVEAL_EASE,
                    }
              }
            />
          </span>
          {description && (
            <span
              id={descriptionId}
              className={cn(
                "mt-0.5 transition-colors duration-200",
                checked
                  ? "text-neutral-400 dark:text-neutral-700"
                  : "text-neutral-500 dark:text-neutral-400",
                sizes.description
              )}
            >
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskCheckbox;

