---
name: Tactical Intelligence Console
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#bbc9cf'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#859399'
  outline-variant: '#3c494e'
  surface-tint: '#4cd6ff'
  primary: '#a4e6ff'
  on-primary: '#003543'
  primary-container: '#00d1ff'
  on-primary-container: '#00566a'
  inverse-primary: '#00677f'
  secondary: '#ffdb9d'
  on-secondary: '#412d00'
  secondary-container: '#feb700'
  on-secondary-container: '#6b4b00'
  tertiary: '#f5cfff'
  on-tertiary: '#500a6c'
  tertiary-container: '#e8a9ff'
  on-tertiary-container: '#71318c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b7eaff'
  primary-fixed-dim: '#4cd6ff'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#004e60'
  secondary-fixed: '#ffdea8'
  secondary-fixed-dim: '#ffba20'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4200'
  tertiary-fixed: '#f8d8ff'
  tertiary-fixed-dim: '#ebb2ff'
  on-tertiary-fixed: '#320047'
  on-tertiary-fixed-variant: '#692984'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  brand-title:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.12em
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  headline-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-default:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-log:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  rail-width: 400px
  header-height: 48px
---

## Brand & Style

The design system is engineered for high-stakes, real-time decision-making in critical hydrocarbon infrastructure. It evokes an **authoritative, resilient, and intelligent** emotional response, positioning the user as a commander within a digital twin environment.

The visual style is a hybrid of **Minimalist Glassmorphism** and **Technical Brutalism**. It utilizes deep obsidian surfaces, semi-transparent overlays, and hairline borders to create a "Command Center" aesthetic. The interface prioritizes information density and data-integrity, using glowing neon indicators and micro-interactions to signal agentic activity and live-streaming risk telemetry.

- **Primary Motif:** Tactical Dark Ops.
- **Visual Weight:** Light-weight containers with high-contrast data points.
- **Atmosphere:** Deep dark mode with cybernetic accents.

## Colors

The palette is rooted in a **Deep Obsidian** foundation to maximize the legibility of geospatial layers and glowing indicators. 

- **Primary (Cyber Blue):** Used for stable flows, active navigation, and primary interactive elements. It represents the "steady state" of the system.
- **Secondary (Neon Amber):** Reserved for elevated risk levels, warnings, and non-critical alert spikes.
- **Semantic Accents:** 
    - **Critical Red:** For immediate disruptions and emergency triggers.
    - **Success Emerald:** For system-validated decisions and healthy infrastructure nodes.
    - **Infra Lavender:** Specific to strategic refinery and asset markers.
- **Neutrals:** Used for structural borders and secondary metadata to ensure hierarchy without visual noise.

## Typography

Typography is split between functional UI navigation and technical data readouts.

1.  **UI Navigation (Inter):** Used for all headings, labels, and descriptive text. It provides a sharp, modern professional feel.
2.  **Data & Metrics (JetBrains Mono):** All numerical values, risk scores, and agentic reasoning logs must use monospaced fonts. This ensures tabular alignment when data is streaming or refreshing in real-time.

**Formatting Rules:**
- **Tabular Numerals:** Always enable `font-variant-numeric: tabular-nums` for data grids.
- **Case:** Use Uppercase for `label-xs` and `brand-title` to reinforce the tactical aesthetic.
- **Contrast:** Headlines use high-contrast Ice (#DBE4EE), while labels use Muted Slate (#8494A7).

## Layout & Spacing

The design uses a **Fixed-Rail Grid** model optimized for high-density information displays. 

- **Layout Model:** A split-pane architecture where the left side is a fluid Geospatial Digital Twin (Map) and the right side is a fixed-width (400px) Control Rail.
- **Spacing Rhythm:** A strict 4px base unit. Information density should be high; use `8px` or `12px` for internal card padding and `4px` for tight metric groupings.
- **Breakpoints:** 
    - **Desktop (>1280px):** Full split-pane with visible Control Rail and Map.
    - **Tablet (768px - 1279px):** Collapsible Control Rail (hidden by default), accessible via a trigger.
    - **Mobile (<767px):** Single column stack; Map minimized to a "Context View" at the top, Rail content becomes the primary scrollable area.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layering** and **Glassmorphism**, rather than traditional high-offset shadows.

- **Layer 0 (Canvas):** Background Obsidian (#0B0F14). Used for the base map and terminal backgrounds.
- **Layer 1 (Surface):** Midnight Navy Gray (#111722). Used for the side rail and top header.
- **Layer 2 (Containers):** Dark Slate (#18202E). Used for individual cards and interactive modules.
- **Glass Effects:** Modals and "Decision Briefs" use a backdrop-blur (12px to 20px) with a semi-transparent Midnight Navy fill (`rgba(17, 23, 34, 0.8)`).
- **Hairline Borders:** All containers must have a `1px` solid border using the Border Hairline color (#232D3F). On hover or active state, this border glows with the Primary Cyber Blue.

## Shapes

The shape language is **Soft/Technical**. Elements are slightly rounded to maintain a modern feel without losing the "industrial" or "government" rigidity.

- **Base Radius:** 4px (Soft) for most buttons, inputs, and small cards.
- **Large Containers:** 12px for primary modals and "Decision Brief" glass cards.
- **Indicators:** Circular for status pills (Success/Warning) to differentiate from rectangular functional buttons.

## Components

### Buttons
- **Primary:** Solid Cyber Blue (#00D1FF) with black text for high-action items.
- **Secondary/Action:** Ghost buttons with Hairline Slate borders and Cyber Blue text.
- **Emergency CTA:** A linear gradient from Critical Red (#FF4B4B) to a darker shade for the "Trigger Simulation" button.

### Cards & Modules
- Cards feature a `1px` border (#232D3F).
- Internal headers use `label-xs` (Uppercase) with a background-tinted header bar (Dark Slate).
- Content is packed tightly with `8px` padding.

### Indicators & Metrics
- **Risk Bars:** 4px tall tracks with segmented fills (Success -> Warning -> Critical).
- **Status Pills:** Small, high-contrast badges with `8.5px` bold text (e.g., "LIVE", "DEMO").
- **Glows:** Active nodes on the map or selected cards should have a subtle outer glow (0px 0px 8px) in the Primary or Secondary color.

### Input Fields
- Dark Obsidian background with a Slate Hairline border. Focus state should switch the border to Cyber Blue with a subtle inner glow. Text inside must be monospaced for numerical values.

### Lists & Tickers
- **Signal Ticker:** A fixed bottom bar (32px) for scrolling live data.
- **Technical Logs:** Use a dark surface with `code-log` typography for agentic reasoning output.