# Design System Specification: The Operational Architect

## 1. Overview & Creative North Star
**The Creative North Star: "Precision Utility"**

This design system is not merely a collection of components; it is an editorialized framework for high-stakes club operations. We are moving away from the "generic SaaS" aesthetic. Our goal is to achieve a **Precision Utility** vibe—where the interface feels like a finely tuned instrument. 

We break the "template" look by rejecting the standard 1px border. Instead, we use **Tonal Architecture**: defining space through sophisticated shifts in grayscale values and intentional white space. The experience should feel calm, confident, and incredibly fast—prioritizing data legibility over decorative flourish.

---

## 2. Colors & Surface Logic

### The Palette
The system relies on a high-contrast neutral base with a singular, authoritative primary accent.
- **Primary (`#2B6954`):** Our "Forest Action" green. Used exclusively for primary calls to action and "Active" success states.
- **Neutral Foundation:** We utilize a range of cool grays (`surface-container` tiers) to create depth without visual noise.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through:
1.  **Background Color Shifts:** A `surface-container-lowest` card sitting on a `surface-container-low` background.
2.  **Ample Negative Space:** Utilizing the `Spacing Scale (Step 6 or 8)` to separate functional groups.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers.
*   **Base Level:** `background` (#F7F9FB)
*   **Section Level:** `surface-container-low` (#F0F4F7)
*   **Interactive/Card Level:** `surface-container-lowest` (#FFFFFF)
*   **Overlays/Popovers:** `surface-bright` with Glassmorphism.

### The "Glass & Gradient" Rule
To add a premium signature to an otherwise utilitarian system, use **Subtle Glassmorphism** for floating headers or navigation rails. 
*   **Formula:** `surface` color at 80% opacity + 20px Backdrop Blur.
*   **CTAs:** Use a subtle linear gradient from `primary` (#2B6954) to `primary-dim` (#1D5D49) to give buttons a "milled" metallic feel rather than a flat plastic look.

---

## 3. Typography: The Editorial Edge

We pair two typefaces to balance operational efficiency with executive authority.

*   **Display & Headlines (Manrope):** A modern, geometric sans-serif used for data summaries and page titles. It feels architectural and sturdy.
*   **Body & Labels (Inter):** The workhorse. Inter provides maximum legibility for dense tables and member lists.

### Typography Scale
| Level | Token | Font | Size | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-md` | Manrope | 2.75rem | High-level KPIs |
| **Headline** | `headline-sm`| Manrope | 1.5rem | Section Headers |
| **Title** | `title-md` | Inter | 1.125rem | Card Titles |
| **Body** | `body-md` | Inter | 0.875rem | Primary Data/Content |
| **Label** | `label-sm` | Inter | 0.6875rem | Metadata & Status Caps |

---

## 4. Elevation & Depth

### The Layering Principle
Hierarchy is achieved through **Tonal Layering**. Instead of a shadow, place a `surface-container-lowest` (#FFFFFF) element on a `surface-container` (#E8EFF3) background. This creates a "soft lift" that feels integrated into the architecture.

### Ambient Shadows
If an element must float (e.g., a Modal or Tooltip):
*   **Color:** Use a tinted shadow using `on-surface` at 5% opacity.
*   **Blur:** High diffusion (24px - 40px). 
*   **Offset:** 8px Y-axis. Avoid "dirty" black shadows.

### The "Ghost Border" Fallback
If contrast ratios fail for accessibility, use a **Ghost Border**: `outline-variant` (#A9B4B9) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Modular Cards
*   **Construction:** No borders. Background: `surface-container-lowest`. Radius: `xl` (0.75rem).
*   **Spacing:** Use `Spacing 4` (1.4rem) for internal padding to allow data to breathe.

### Data Tables (The "Operational" Core)
*   **No Dividers:** Forbid horizontal lines between rows. Use a subtle hover state shift to `surface-container-high`.
*   **Spacing:** Row height minimum `3.5rem` (`Spacing 10`).
*   **Status Indicators:** Use small, high-contrast "Pills." 
    *   *Paid:* `primary-container` background with `on-primary-container` text.
    *   *Unpaid:* `error-container` background with `on-error-container` text.

### Buttons
*   **Primary:** Gradient (`primary` to `primary-dim`), White text, `md` radius.
*   **Secondary:** `surface-container-highest` background, `on-surface` text. No border.
*   **Tertiary:** Ghost style. `primary` text, no background until hover.

### Input Fields
*   **Styling:** Use `surface-container-low` as the fill color. 
*   **Interaction:** On focus, transition the background to `surface-container-lowest` and add a 2px "Ghost Border" of the `primary` color.

### Signature Component: The "Operational Drawer"
For club management, use a side-sliding drawer for member details. Use 40% `surface-dim` backdrop with a 12px blur to keep the user grounded in the main list while performing deep-dive edits.

---

## 6. Do’s and Don’ts

### Do
*   **DO** use whitespace as a structural element. If a section feels messy, increase spacing instead of adding a line.
*   **DO** use `tertiary` colors for non-critical status updates to keep the "Forest Green" primary reserved for high-intent actions.
*   **DO** align all elements to the `Spacing Scale`. Every margin and padding must be a multiple of the defined tokens.

### Don't
*   **DON'T** use 100% black text. Use `on-surface` (#2A3439) for a softer, more professional reading experience.
*   **DON'T** use "Drop Shadows" on cards. Use Tonal Layering.
*   **DON'T** use standard blue for links. Every interactive element should either be `primary` green or a high-contrast neutral.
*   **DON'T** crowd the UI. If you can remove a label because the context is clear, remove it.