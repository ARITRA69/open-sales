import { MotionGlobalConfig } from 'motion/react'

// Test DOMs don't run real animations, so finish them at once. Exit
// animations would otherwise never end and leave elements behind.
MotionGlobalConfig.skipAnimations = true
