---
name: Responsive touch breakpoints
description: How to choose and verify compact-layout breakpoints when touch targets expand controls.
---

Do not choose a desktop-header breakpoint from mouse-only measurements. Validate the full header with coarse-pointer styles active, including minimum 44px targets, and keep the compact shell active until every action fits.

**Why:** A header can fit at a given width with mouse-sized controls but silently push its final actions beyond the viewport on a touch device at the same width.

**How to apply:** Include at least one wide touch viewport in responsive regression tests and assert every desktop header action stays within the viewport before classifying that width as desktop.