# DESIGN.md: WebNote Reference Analysis

## Source

- URL: https://webnote.cc/
- Capture date: 2026-06-07
- Evidence:
  - `../.firecrawl/webnote-home.json`
  - `../.firecrawl/webnote-note-page.json`
  - `../.firecrawl/webnote-faqs.json`
  - `../.firecrawl/webnote-branding.json`
  - `../.firecrawl/webnote-screenshot.png`

## Functional Analysis

The reference site is a no-login cloud clipboard. Users open a named URL, enter text, optionally upload temporary files, and use the same URL on another device to retrieve the data.

Core functions identified:

- Home page with a note-name input and random creation flow.
- Named note route such as `/demo`.
- `/new/` redirects to a generated random note name.
- Plain-text editor with character and line statistics.
- Save and auto-save behavior.
- Expiration options from 1 hour to 3 years, refreshed on access.
- Password protection, including `/name@password` auto-unlock pattern.
- Read-only sharing link and editable link.
- Copy text, download text, QR code sharing.
- Temporary file attachment support.
- Report/freeze rules for abusive notes.
- FAQ, API, privacy, terms and about pages.

## Design Summary

The visual style is utility-first and quiet: white surfaces, light gray backgrounds, blue primary action, small border-radius, restrained shadows and dense editor controls. The editor screen prioritizes productivity over marketing copy, with a sticky top bar, large text area and right-side control panel.

## Design Tokens

### Colors

- Page background: `#f6f8fb` inferred from the light gray site background.
- Surface: `#ffffff`.
- Primary action: `#2563eb`, close to the captured blue button family.
- Primary hover: `#1d4ed8`.
- Text primary: `#101827`.
- Text muted: `#667085`.
- Border: `#d9e2ee`.
- Warning/error: `#d92d20`.
- Success: `#16803c`.

### Typography

- Font stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Editor font stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- Homepage H1: 2.3 rem to 3.7 rem responsive clamp.
- Body text: 1 rem to 1.1 rem, line-height 1.7 to 1.9.

### Layout

- Header height: 64 px.
- Page max width: 1220 to 1280 px.
- Cards and inputs: 8 px radius.
- Main editor: two-column layout, flexible editor plus 340 px side panel.
- Mobile: side panel becomes a slide-out fixed panel.

## Build Instructions Applied

This implementation does not copy third-party logos, images or proprietary copy. It recreates the product structure and interaction model with original text, self-hosted CSS, and a Node.js filesystem backend suitable for VPS deployment.
