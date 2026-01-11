# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed - BREAKING

- **Status command output format**: The `status` command now displays stories in a uniform table format with columns for Story ID, Title, Status, Labels, and Flags. The previous column-based kanban view has been replaced.
  - ⚠️ **Breaking Change**: Scripts or tools that parse the status command output will need to be updated.
  - Titles are now truncated with '...' suffix for better readability (responsive 30-60 chars based on terminal width)
  - Automatic responsive design: wide terminals (≥100 cols) show table view, narrow terminals show compact view
  - Story IDs are now displayed in the first column for easy identification

### Added

- **Story ID column** in status output (first column) for quick story identification
- **Unicode table borders** for better visual hierarchy and professional appearance
- **Responsive column widths** based on terminal width for optimal display
- **Compact view** for narrow terminals (<100 cols) with multi-line story format
- **Smart text truncation** at word boundaries for better readability
- **Label list truncation** with "+N more" indicator when many labels exist
- **Optional hint message** when compact view is used (disable with `AI_SDLC_NO_HINTS=1`)
- **Comprehensive input sanitization** and security hardening:
  - ReDoS protection with bounded regex patterns
  - Terminal escape sequence filtering (CSI, OSC, C0/C1 control codes)
  - Prototype pollution prevention for story labels
  - Unicode homograph attack mitigation with NFC normalization
  - Input length limits (DoS protection, max 10,000 chars)
  - Sanitized error messages that don't expose system information

### Fixed

- **Unicode width calculation** for emoji and multi-byte characters (CJK, combining chars)
- **Table alignment** with special characters in story titles
- **Terminal width detection** with proper fallback to 80 columns
- **Multi-byte character truncation** with iterative width adjustment

### Security

- Fixed ReDoS vulnerability in ANSI code stripping with bounded quantifiers
- Added protection against terminal escape sequence injection
- Implemented prototype pollution prevention in label processing
- Added Unicode normalization to prevent homograph attacks
- Enforced input length limits to prevent DoS attacks
- Added comprehensive input sanitization for all user-controlled fields
