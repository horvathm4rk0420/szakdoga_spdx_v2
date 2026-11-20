// Global State Variables
const APP_VERSION = 'v3.2.7';

// Validation starts only after the relevant source schema is available. The
// schema is used for source-format parsing/normalization and initial document
// checks; semantic validation runs on unified values afterward.
const REQUIRE_SCHEMA_BEFORE_VALIDATION = true;

// Schema variables
let schema14 = null;
let schema15 = null;
let schema16 = null;
let schema17 = null;
let xsdSchema = null;  // For XML validation
let spdxSchema22 = null;  // SPDX 2.2 schema
let spdxSchema23 = null;  // SPDX 2.3 schema
let spdxLicenseIds = [];
let currentSbomData = null;
let currentSbomFile = null;  // Raw File object — always re-read from source, not from cache
let currentFileName = '';
let currentFileType = '';  // 'json', 'xml', or 'spdx'
let currentValidationMode = 'standard';

// License text reference list
let licenseReferenceEntries = [];
let licenseReferenceByLicTypeName = new Map();
let licenseReferenceBySpdxId = new Map();
let licenseReferenceFile = null;

// Session-only manual license pairings (fallback #2)
let manualLicensePairings = new Map();
let pendingManualLicenseName = '';
let pendingComponentKey = '';  // Component key for single-component revalidation
let manualLicenseReferenceOptions = [];
let manualLicenseNavigationContext = null;
let tooldownloadEditNavigationContext = null;
let pendingTooldownloadStatusChange = null;
let pendingImportedStatusEntries = null;
let pendingOverrideReason = '';
let pendingOverrideContext = null;

// Tooldownload edit/enrichment state
let editChangeLog = [];
let nextRowId = 1;
let tooldownloadRowRefs = new Map();
let tooldownloadEdits = new Map();
let activeLicenseTextModalKey = '';
let manualLicenseTextOverrides = new Map();
let noticeFileEntries = [];
let noticeFileNameIndex = new Map();
let noticeExtractionCache = new Map();
let noticeEnrichmentQueue = [];
let noticeEnrichmentCursor = 0;
let noticeEnrichmentStats = null;
let azureAiToken = '';
let azureAiModel = 'gpt-4o-mini';

// Raw schema File objects — re-read from source on every schema reload
let schemaFile14 = null;
let schemaFile15 = null;
let schemaFile16 = null;
let schemaFile17 = null;
let schemaFileXsd = null;
let schemaFileSpdx22 = null;
let schemaFileSpdx23 = null;

// Security: Maximum file size (150MB)
const MAX_FILE_SIZE = 150 * 1024 * 1024;
;

// Utility: Tick function - yields control to browser to allow async operations
function tick() { return new Promise(r => setTimeout(r, 0)); }
;

// Update the progress bar and label
function setProgress(percent, label) {
    const fill = document.getElementById('progressBarFill');
    const lbl  = document.getElementById('progressLabel');
    const pct  = document.getElementById('progressPercent');
    const p = Math.min(100, Math.max(0, percent));
    if (fill) fill.style.width = p + '%';
    if (lbl && label) lbl.textContent = label;
    if (pct) pct.textContent = p + '%';
}
;

// Security: HTML escape function to prevent XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return String(unsafe);
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
;

// Security: URL sanitizer — only allow http/https to block javascript: and data: injection
function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;
    return /^https?:\/\//i.test(url) ? url : null;
}
;

/**
 * Shared validation and utility helpers to reduce code duplication
 * across the codebase. Used by multiple validation and processing files.
 */

/**
 * Creates a standardized error object
 * @param {string} message - Error message
 * @param {string} [path] - Error path (e.g., "licenses[0].id")
 * @param {string} [category] - Error category (e.g., "license" or "copyright")
 * @returns {Object} Error object with message and optional path
 */
function createError(message, path, category) {
    const error = { message };
    if (path) error.path = path;
    if (category) error.category = category;
    return error;
}

/**
 * Checks if input is valid for a given type
 * @param {*} value - Value to check
 * @param {string} type - Expected type ('string', 'array', 'object', 'number')
 * @returns {boolean} True if value matches the expected type
 */
function isValidInput(value, type) {
    if (value === null || value === undefined) return false;
    if (type === 'string') return typeof value === 'string';
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
    if (type === 'number') return typeof value === 'number' && isFinite(value);
    return false;
}

/**
 * Safely normalizes a string: trims, lowercases, removes extra spaces
 * @param {*} value - Value to normalize (coerced to string)
 * @param {Object} [options] - Options object
 * @param {boolean} [options.lowercase] - Convert to lowercase (default: false)
 * @param {boolean} [options.trim] - Trim whitespace (default: true)
 * @param {boolean} [options.collapseSpace] - Collapse multiple spaces to single (default: false)
 * @returns {string} Normalized string
 */
function normalizeString(value, options = {}) {
    const { lowercase = false, trim: shouldTrim = true, collapseSpace = false } = options;
    let str = String(value || '');
    if (shouldTrim) str = str.trim();
    if (collapseSpace) str = str.replace(/\s+/g, ' ');
    if (lowercase) str = str.toLowerCase();
    return str;
}

/**
 * Safely gets a value from a Map with a default fallback
 * @param {Map} map - Map instance
 * @param {*} key - Key to look up
 * @param {*} [defaultValue] - Value to return if key not found
 * @returns {*} Map value or default
 */
function safeMapGet(map, key, defaultValue = null) {
    if (!(map instanceof Map)) return defaultValue;
    return map.has(key) ? map.get(key) : defaultValue;
}

/**
 * Deduplicates an array of component objects by name and version
 * @param {Array} components - Array of component objects with name/version
 * @returns {Array} Deduplicated array
 */
function deduplicateComponents(components) {
    if (!Array.isArray(components)) return [];
    const seen = new Set();
    const unique = [];
    components.forEach(component => {
        if (component && typeof component === 'object') {
            const key = `${component.name || 'N/A'}::${component.version || 'N/A'}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(component);
            }
        }
    });
    return unique;
}

/**
 * Extracts a license name/ID from various license item formats
 * @param {Object} licenseItem - License item (from licenses array)
 * @returns {string} License name/ID or empty string
 */
function extractLicenseName(licenseItem) {
    if (!licenseItem || typeof licenseItem !== 'object') return '';
    return (
        licenseItem.licenseName ||
        (licenseItem.license && licenseItem.license.name) ||
        (licenseItem.license && licenseItem.license.id) ||
        licenseItem.expression ||
        ''
    ).trim();
}

/**
 * Tokenizes a license expression string into '(', ')', 'AND', 'OR', and term tokens.
 * @param {string} expressionString - Raw license expression
 * @returns {Array<string>} Ordered list of tokens
 */
function tokenizeLicenseExpression(expressionString) {
    if (typeof expressionString !== 'string') return [];
    return expressionString
        .replace(/([()])/g, ' $1 ')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

/**
 * Parses a license expression into a tree, honoring parentheses for grouping.
 * Mixing AND/OR at the same nesting level without parentheses is treated as
 * ambiguous and rejected, matching SPDX expression semantics where explicit
 * grouping is required to legally combine AND and OR in one expression.
 * @param {string} expressionString - Raw license expression (may contain parentheses)
 * @returns {{tree: Object|null, error: string|null}} Parsed tree (node shape:
 *   {type:'TERM', term} or {type:'AND'|'OR', children}), or an error code:
 *   'EMPTY', 'AMBIGUOUS_MIXED', 'UNBALANCED_PARENS', or 'UNEXPECTED_OPERATOR'
 */
function parseLicenseExpressionTree(expressionString) {
    const tokens = tokenizeLicenseExpression(expressionString);
    if (tokens.length === 0) return { tree: null, error: 'EMPTY' };

    let pos = 0;
    let error = null;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function parsePrimary() {
        const token = peek();
        if (token === undefined) {
            error = error || 'UNBALANCED_PARENS';
            return null;
        }
        if (token === '(') {
            consume();
            const node = parseLevel();
            if (error) return null;
            if (peek() !== ')') {
                error = error || 'UNBALANCED_PARENS';
                return null;
            }
            consume();
            return node;
        }
        if (token === ')' || token === 'AND' || token === 'OR') {
            error = error || (token === ')' ? 'UNBALANCED_PARENS' : 'UNEXPECTED_OPERATOR');
            return null;
        }
        const termTokens = [consume()];
        while (peek() !== undefined && !['(', ')', 'AND', 'OR'].includes(peek())) {
            termTokens.push(consume());
        }
        return { type: 'TERM', term: termTokens.join(' ') };
    }

    function parseLevel() {
        const children = [parsePrimary()];
        if (error) return null;
        let levelOperator = null;

        while (peek() === 'AND' || peek() === 'OR') {
            const op = consume();
            if (!levelOperator) {
                levelOperator = op;
            } else if (op !== levelOperator) {
                error = error || 'AMBIGUOUS_MIXED';
                return null;
            }
            children.push(parsePrimary());
            if (error) return null;
        }

        return children.length === 1 ? children[0] : { type: levelOperator, children };
    }

    const tree = parseLevel();
    if (!error && pos < tokens.length) {
        error = 'UNBALANCED_PARENS'; // Leftover tokens, likely a stray ')'
    }

    return { tree: error ? null : tree, error };
}

/**
 * Flattens a license expression tree into its leaf terms, left-to-right.
 * @param {Object} tree - Expression tree node
 * @returns {Array<string>} Ordered list of license terms
 */
function flattenLicenseExpressionTree(tree) {
    if (!tree) return [];
    if (tree.type === 'TERM') return [tree.term];
    return (tree.children || []).reduce((terms, child) => terms.concat(flattenLicenseExpressionTree(child)), []);
}

/**
 * Serializes a license expression tree back into a string, wrapping any
 * compound (AND/OR) child in parentheses to preserve its grouping.
 * @param {Object} tree - Expression tree node
 * @returns {string} Serialized expression string
 */
function serializeLicenseExpressionTree(tree) {
    if (!tree) return '';
    if (tree.type === 'TERM') return tree.term;
    return (tree.children || [])
        .map(child => (child.type === 'TERM' ? serializeLicenseExpressionTree(child) : `(${serializeLicenseExpressionTree(child)})`))
        .join(` ${tree.type} `);
}

/**
 * Rebuilds a license expression tree with its leaf terms replaced, in
 * left-to-right order, by the provided replacement terms (e.g. normalized
 * license names). Tree shape/grouping is preserved.
 * @param {Object} tree - Expression tree node
 * @param {Array<string>} replacementTermsInOrder - Replacement terms, left-to-right
 * @returns {Object|null} New tree with replaced terms
 */
function replaceLicenseExpressionTreeTerms(tree, replacementTermsInOrder) {
    if (!tree) return null;
    let cursor = 0;
    const terms = Array.isArray(replacementTermsInOrder) ? replacementTermsInOrder : [];
    function rebuild(node) {
        if (node.type === 'TERM') {
            const replacement = terms[cursor++];
            return { type: 'TERM', term: replacement !== undefined ? replacement : node.term };
        }
        return { type: node.type, children: (node.children || []).map(rebuild) };
    }
    return rebuild(tree);
}

/**
 * Walks a license expression tree left-to-right and returns per-leaf display
 * metadata: parentheses that must appear before/after that leaf and the
 * operator that joins it to the next leaf. This preserves visible grouping
 * when rendering each term as a separate badge.
 * @param {Object} tree - Expression tree node
 * @returns {Array<{term: string, joinAfter: string|null, openBefore: number, closeAfter: number}>}
 */
function getLicenseExpressionLeafJoins(tree) {
    function collect(node) {
        if (!node) return [];
        if (node.type === 'TERM') {
            return [{ term: node.term, joinAfter: null, openBefore: 0, closeAfter: 0 }];
        }

        const leaves = [];
        (node.children || []).forEach((child, index) => {
            const childLeaves = collect(child);
            if (childLeaves.length === 0) return;

            if (child.type !== 'TERM') {
                childLeaves[0].openBefore += 1;
                childLeaves[childLeaves.length - 1].closeAfter += 1;
            }

            leaves.push(...childLeaves);
            if (index < node.children.length - 1) {
                leaves[leaves.length - 1].joinAfter = node.type;
            }
        });

        return leaves;
    }

    return collect(tree);
}

/**
 * Recursively evaluates a license expression tree using pre-computed per-term
 * results (in left-to-right leaf order) to determine overall validity/percent.
 * AND nodes require all children valid (percent = min); OR nodes require at
 * least one child valid (percent = max). This is applied recursively so
 * grouped (parenthesized) mixed AND/OR expressions are evaluated correctly.
 * @param {Object} tree - Expression tree node
 * @param {Array<Object>} termResultsInOrder - Per-term results ({valid, matchPercent}), aligned with tree leaves left-to-right
 * @returns {{valid: boolean, matchPercent: number}} Aggregated result
 */
function evaluateLicenseExpressionTree(tree, termResultsInOrder) {
    const queue = Array.isArray(termResultsInOrder) ? termResultsInOrder.slice() : [];

    function evaluateNode(node) {
        if (!node) return { valid: false, matchPercent: 0 };
        if (node.type === 'TERM') {
            const result = queue.shift();
            return result ? { valid: !!result.valid, matchPercent: result.matchPercent || 0 } : { valid: false, matchPercent: 0 };
        }
        const childEvaluations = (node.children || []).map(evaluateNode);
        const percents = childEvaluations.map(child => child.matchPercent);
        return node.type === 'AND'
            ? { valid: childEvaluations.every(child => child.valid), matchPercent: Math.min(...percents) }
            : { valid: childEvaluations.some(child => child.valid), matchPercent: Math.max(...percents) };
    }

    return evaluateNode(tree);
}

/**
 * Detects license expression operator (AND/OR/GROUPED)
 * Parenthesized expressions are parsed so that unambiguous grouped mixed
 * AND/OR expressions (e.g. "(MIT AND Apache-2.0) OR BSD-3-Clause") are
 * recognized as 'GROUPED' rather than being rejected outright. Only
 * ambiguous (unparenthesized mixed) or malformed (unbalanced parentheses)
 * expressions return 'MIXED', which callers should treat as unsupported.
 * @param {string} licenseName - License name/expression string
 * @returns {string|null} 'AND', 'OR', 'GROUPED', 'MIXED', or null if no operator
 */
function getLicenseOperator(licenseName) {
    if (!licenseName || typeof licenseName !== 'string') return null;
    const hasAnd = /\bAND\b/.test(licenseName);
    const hasOr = /\bOR\b/.test(licenseName);
    const hasGrouping = /[()]/.test(licenseName);

    // Parenthesized expressions must be parsed before we decide whether the
    // expression is a flat AND/OR sequence or a valid grouped expression.
    if (hasGrouping && (hasAnd || hasOr)) {
        const parsed = parseLicenseExpressionTree(licenseName);
        if (!parsed || !parsed.tree) return 'MIXED';
        if (parsed.error === 'AMBIGUOUS_MIXED') return 'MIXED';
        return parsed.tree.type === 'TERM' ? null : 'GROUPED';
    }

    // Flat ungrouped mixed expressions are ambiguous and unsupported.
    if (hasAnd && hasOr) return 'MIXED';
    if (hasAnd) return 'AND';
    if (hasOr) return 'OR';
    return null;
}

/**
 * Splits a license expression into individual terms
 * @param {string} licenseName - License expression string
 * @param {string} [operator] - Operator ('AND', 'OR', or 'GROUPED'). Auto-detected if not provided
 * @returns {Array<string>} Array of license terms
 */
function splitLicenseTerms(licenseName, operator = null) {
    if (!licenseName || typeof licenseName !== 'string') return [];
    const op = operator || getLicenseOperator(licenseName);
    if (op === 'GROUPED') {
        const parsed = parseLicenseExpressionTree(licenseName);
        return parsed.tree ? flattenLicenseExpressionTree(parsed.tree) : [licenseName];
    }
    if (!op || op === 'MIXED') return [licenseName];
    return licenseName.split(` ${op} `).map(t => t.trim()).filter(Boolean);
}

function hasInvalidLicenseSeparator(value) {
    return typeof value === 'string' && /[,;]/.test(value);
}

/**
 * Extracts unique categories from term results
 * @param {Array} termResults - Array of term result objects with category property
 * @returns {Array<string>} Unique category strings
 */
function extractCategories(termResults) {
    if (!Array.isArray(termResults)) return [];
    const categories = new Set();
    termResults.forEach(result => {
        if (result && result.category && typeof result.category === 'string') {
            categories.add(result.category);
        }
    });
    return Array.from(categories);
}

/**
 * Checks if all values in an array are truthy
 * @param {Array} arr - Array to check
 * @param {Function} [predicate] - Optional predicate function to test each item
 * @returns {boolean} True if all are truthy (or pass predicate)
 */
function allValid(arr, predicate = null) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    if (!predicate) return arr.every(Boolean);
    return arr.every(item => predicate(item));
}

/**
 * Checks if at least one value in an array is truthy
 * @param {Array} arr - Array to check
 * @param {Function} [predicate] - Optional predicate function to test each item
 * @returns {boolean} True if at least one is truthy (or passes predicate)
 */
function someValid(arr, predicate = null) {
    if (!Array.isArray(arr)) return false;
    if (!predicate) return arr.some(Boolean);
    return arr.some(item => predicate(item));
}

/**
 * Gets the error path string for a licenses array item
 * @param {Object} licenseItem - License item from licenses array
 * @param {number} idx - Index in licenses array
 * @returns {string} Error path (e.g., "licenses[0].license.id")
 */
function getLicensePath(licenseItem, idx) {
    if (!licenseItem || typeof licenseItem !== 'object') {
        return `licenses[${idx}]`;
    }
    if (licenseItem.license && licenseItem.license.id) {
        return `licenses[${idx}].license.id`;
    }
    if (licenseItem.license && licenseItem.license.name) {
        return `licenses[${idx}].license.name`;
    }
    if (licenseItem.licenseName) {
        return `licenses[${idx}].licenseName`;
    }
    return `licenses[${idx}]`;
}

/**
 * Clamps a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

// Session-scoped manual error overrides store
// Structure: { '<componentObjectPath>': Set([ 'errorMessage1', 'errorMessage2', ... ]) }
window.__manualErrorOverrides = window.__manualErrorOverrides || {};

function getManualOverridesForComponent(objectPath) {
    if (!objectPath) return new Set();
    const s = window.__manualErrorOverrides[objectPath];
    if (!s) return new Set();
    return new Set(Array.from(s));
}

function setManualOverride(objectPath, errorMessage, enabled) {
    if (!objectPath) return;
    window.__manualErrorOverrides[objectPath] = window.__manualErrorOverrides[objectPath] || [];
    const arr = new Set(window.__manualErrorOverrides[objectPath]);
    if (enabled) {
        arr.add(errorMessage);
    } else {
        arr.delete(errorMessage);
    }
    window.__manualErrorOverrides[objectPath] = Array.from(arr);
}

function clearManualOverrides(objectPath) {
    if (!objectPath) return;
    delete window.__manualErrorOverrides[objectPath];
}

// Session-scoped false-positive valid overrides store
// Structure: { '<componentObjectPath>': true }
// When set, a component that passed validation is treated as invalid with a
// synthetic "Manual override, false positive valid" error in the effective result.
window.__manualFalsePositives = window.__manualFalsePositives || {};

function hasFalsePositiveOverride(objectPath) {
    if (!objectPath) return false;
    return Boolean(window.__manualFalsePositives[objectPath]);
}

function setFalsePositiveOverride(objectPath, enabled) {
    if (!objectPath) return;
    if (enabled) {
        window.__manualFalsePositives[objectPath] = true;
    } else {
        delete window.__manualFalsePositives[objectPath];
    }
}

/**
 * Converts percent to display string (0-100%)
 * @param {number} percent - Percentage value
 * @returns {string} Formatted percentage string
 */
function formatPercent(percent) {
    if (typeof percent !== 'number' || !isFinite(percent)) return '0%';
    return clamp(Math.round(percent), 0, 100) + '%';
}

/**
 * Resolve extracted SPDX license text by trying common key variants.
 * Handles IDs stored as either SPDX form (e.g. "MIT") or LicenseRef-prefixed
 * aliases (e.g. "LicenseRef-MIT") in a case-insensitive way.
 * Also supports evidence-indexed keys (e.g. "MIT#0", "MIT#1") for position-aware text lookup.
 * @param {Object} extractedTextById - Map-like object of { licenseId: extractedText }
 * @param {string} licenseId - SPDX ID or LicenseRef-* identifier
 * @param {number} evidenceIndex - Optional evidence index for position-aware lookup
 * @returns {string} Matched extracted text or empty string if not found
 */
function getExtractedLicenseText(extractedTextById, licenseId, evidenceIndex = -1) {
    if (!isValidInput(extractedTextById, 'object') || typeof licenseId !== 'string') {
        return '';
    }

    const raw = licenseId.trim();
    if (!raw) {
        return '';
    }

    // An exact per-license entry is authoritative even when intentionally empty.
    const exactKey = evidenceIndex >= 0 ? `${raw}#${evidenceIndex}` : raw;
    if (Object.prototype.hasOwnProperty.call(extractedTextById, exactKey) &&
        typeof extractedTextById[exactKey] === 'string') {
        return extractedTextById[exactKey];
    }

    const stripped = raw.replace(/^LicenseRef-/i, '');
    // If the stripped form ends with a hyphen followed by only digits of length >= 4,
    // create a variant with that numeric suffix removed. Examples:
    //  - "MIT-12345678" -> "MIT"
    //  - "MPL-2" remains "MPL-2" (too short)
    //  - "Apache-200.00" remains (contains non-digit)
    const strippedNoTrailingNumbers = String(stripped).replace(/-(\d{4,})$/,'');

    // Build candidate list with evidence index first (if provided)
    const candidates = [];
    if (evidenceIndex >= 0) {
        candidates.push(
            `${raw}#${evidenceIndex}`,
            `${stripped}#${evidenceIndex}`,
            `${strippedNoTrailingNumbers}#${evidenceIndex}`,
            `LicenseRef-${stripped}#${evidenceIndex}`,
            `LicenseRef-${strippedNoTrailingNumbers}#${evidenceIndex}`,
            `${raw.toLowerCase()}#${evidenceIndex}`,
            `${stripped.toLowerCase()}#${evidenceIndex}`,
            `${strippedNoTrailingNumbers.toLowerCase()}#${evidenceIndex}`,
            `licenseref-${stripped.toLowerCase()}#${evidenceIndex}`
        );
    }
    candidates.push(
        raw,
        stripped,
        strippedNoTrailingNumbers,
        `LicenseRef-${stripped}`,
        `LicenseRef-${strippedNoTrailingNumbers}`,
        raw.toLowerCase(),
        stripped.toLowerCase(),
        strippedNoTrailingNumbers.toLowerCase(),
        `licenseref-${stripped.toLowerCase()}`
    );

    // Fast direct-key lookup first.
    for (const key of candidates) {
        const text = extractedTextById[key];
        if (typeof text === 'string' && text.trim()) {
            return text;
        }
    }

    // Fallback: case-insensitive scan for key aliases.
    const loweredCandidates = new Set(candidates.map(c => c.toLowerCase()));
    for (const [key, value] of Object.entries(extractedTextById)) {
        if (loweredCandidates.has(String(key).toLowerCase()) && typeof value === 'string' && value.trim()) {
            return value;
        }
    }

    return '';
}

/**
 * Revalidates copyright errors after fallback extraction adds a copyright value.
 * Uses the existing copyright-format validator; it does not recreate validation rules.
 * @param {Array<Object>} errors - Mutable component validation errors
 * @param {string} originalCopyright - Copyright from the SBOM component
 * @param {string} fallbackCopyright - Copyright extracted from license text
 * @param {Array<string>} errorPaths - Copyright error paths to remove when resolved
 * @param {Array<string>} [warnings] - Mutable warnings array for generic entries
 * @returns {boolean} Whether the fallback copyright made the value valid
 */
function revalidateCopyrightErrors(errors, originalCopyright, fallbackCopyright, errorPaths, warnings = []) {
    if (!Array.isArray(errors) || typeof fallbackCopyright !== 'string' || !fallbackCopyright.trim()) {
        return false;
    }

    // A fallback may complete a missing copyright or provide the valid part
    // when the SBOM contains only explicitly blocked generic entries. It must
    // not hide other explicitly supplied invalid copyright values.
    let originalDetails = null;
    if (typeof originalCopyright === 'string' && originalCopyright.trim()) {
        originalDetails = getCopyrightValidationDetails(originalCopyright);
        const containsOnlyGenericEntries = originalDetails.entries.length > 0
            && originalDetails.entries.every(entry => originalDetails.genericEntries.includes(entry));
        if (!originalDetails.valid && !containsOnlyGenericEntries) return false;
    }

    const effectiveCopyright = [originalCopyright, fallbackCopyright]
        .filter(value => typeof value === 'string' && value.trim())
        .join('; ');
    if (!isValidCopyrightFormat(effectiveCopyright)) return false;

    for (let index = errors.length - 1; index >= 0; index--) {
        if (errorPaths.includes(errors[index]?.path)) errors.splice(index, 1);
    }
    if (originalDetails?.genericEntries?.length > 0 && Array.isArray(warnings)) {
        const genericWarning = `Generic Copyright: ${originalDetails.genericEntries.join('; ')}`;
        if (!warnings.includes(genericWarning)) warnings.push(genericWarning);
    }
    return true;
}
;
