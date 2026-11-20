const APP_VERSION = 'v3.2.7';

const REQUIRE_SCHEMA_BEFORE_VALIDATION = true;

let schema14 = null;
let schema15 = null;
let schema16 = null;
let schema17 = null;
let xsdSchema = null;
let spdxSchema22 = null;
let spdxSchema23 = null;
let spdxLicenseIds = [];
let currentSbomData = null;
let currentSbomFile = null;
let currentFileName = '';
let currentFileType = '';
let currentValidationMode = 'standard';

let licenseReferenceEntries = [];
let licenseReferenceByLicTypeName = new Map();
let licenseReferenceBySpdxId = new Map();
let licenseReferenceFile = null;

let manualLicensePairings = new Map();
let pendingManualLicenseName = '';
let pendingComponentKey = '';
let manualLicenseReferenceOptions = [];
let manualLicenseNavigationContext = null;
let tooldownloadEditNavigationContext = null;
let pendingTooldownloadStatusChange = null;
let pendingImportedStatusEntries = null;
let pendingOverrideReason = '';
let pendingOverrideContext = null;

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

let schemaFile14 = null;
let schemaFile15 = null;
let schemaFile16 = null;
let schemaFile17 = null;
let schemaFileXsd = null;
let schemaFileSpdx22 = null;
let schemaFileSpdx23 = null;

const MAX_FILE_SIZE = 150 * 1024 * 1024;
;

function tick() { return new Promise(r => setTimeout(r, 0)); }
;

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

function sanitizeUrl(url) {
    if (typeof url !== 'string') return null;
    return /^https?:\/\//i.test(url) ? url : null;
}
;

function createError(message, path, category) {
    const error = { message };
    if (path) error.path = path;
    if (category) error.category = category;
    return error;
}

function isValidInput(value, type) {
    if (value === null || value === undefined) return false;
    if (type === 'string') return typeof value === 'string';
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
    if (type === 'number') return typeof value === 'number' && isFinite(value);
    return false;
}

function normalizeString(value, options = {}) {
    const { lowercase = false, trim: shouldTrim = true, collapseSpace = false } = options;
    let str = String(value || '');
    if (shouldTrim) str = str.trim();
    if (collapseSpace) str = str.replace(/\s+/g, ' ');
    if (lowercase) str = str.toLowerCase();
    return str;
}

function safeMapGet(map, key, defaultValue = null) {
    if (!(map instanceof Map)) return defaultValue;
    return map.has(key) ? map.get(key) : defaultValue;
}

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

function tokenizeLicenseExpression(expressionString) {
    if (typeof expressionString !== 'string') return [];
    return expressionString
        .replace(/([()])/g, ' $1 ')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

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
        error = 'UNBALANCED_PARENS';
    }

    return { tree: error ? null : tree, error };
}

function flattenLicenseExpressionTree(tree) {
    if (!tree) return [];
    if (tree.type === 'TERM') return [tree.term];
    return (tree.children || []).reduce((terms, child) => terms.concat(flattenLicenseExpressionTree(child)), []);
}

function serializeLicenseExpressionTree(tree) {
    if (!tree) return '';
    if (tree.type === 'TERM') return tree.term;
    return (tree.children || [])
        .map(child => (child.type === 'TERM' ? serializeLicenseExpressionTree(child) : `(${serializeLicenseExpressionTree(child)})`))
        .join(` ${tree.type} `);
}

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

function getLicenseOperator(licenseName) {
    if (!licenseName || typeof licenseName !== 'string') return null;
    const hasAnd = /\bAND\b/.test(licenseName);
    const hasOr = /\bOR\b/.test(licenseName);
    const hasGrouping = /[()]/.test(licenseName);

    if (hasGrouping && (hasAnd || hasOr)) {
        const parsed = parseLicenseExpressionTree(licenseName);
        if (!parsed || !parsed.tree) return 'MIXED';
        if (parsed.error === 'AMBIGUOUS_MIXED') return 'MIXED';
        return parsed.tree.type === 'TERM' ? null : 'GROUPED';
    }

    if (hasAnd && hasOr) return 'MIXED';
    if (hasAnd) return 'AND';
    if (hasOr) return 'OR';
    return null;
}

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

function allValid(arr, predicate = null) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    if (!predicate) return arr.every(Boolean);
    return arr.every(item => predicate(item));
}

function someValid(arr, predicate = null) {
    if (!Array.isArray(arr)) return false;
    if (!predicate) return arr.some(Boolean);
    return arr.some(item => predicate(item));
}

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

function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

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

function formatPercent(percent) {
    if (typeof percent !== 'number' || !isFinite(percent)) return '0%';
    return clamp(Math.round(percent), 0, 100) + '%';
}

function getExtractedLicenseText(extractedTextById, licenseId, evidenceIndex = -1) {
    if (!isValidInput(extractedTextById, 'object') || typeof licenseId !== 'string') {
        return '';
    }

    const raw = licenseId.trim();
    if (!raw) {
        return '';
    }

    const exactKey = evidenceIndex >= 0 ? `${raw}#${evidenceIndex}` : raw;
    if (Object.prototype.hasOwnProperty.call(extractedTextById, exactKey) &&
        typeof extractedTextById[exactKey] === 'string') {
        return extractedTextById[exactKey];
    }

    const stripped = raw.replace(/^LicenseRef-/i, '');
    const strippedNoTrailingNumbers = String(stripped).replace(/-(\d{4,})$/,'');

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

    for (const key of candidates) {
        const text = extractedTextById[key];
        if (typeof text === 'string' && text.trim()) {
            return text;
        }
    }

    const loweredCandidates = new Set(candidates.map(c => c.toLowerCase()));
    for (const [key, value] of Object.entries(extractedTextById)) {
        if (loweredCandidates.has(String(key).toLowerCase()) && typeof value === 'string' && value.trim()) {
            return value;
        }
    }

    return '';
}

function revalidateCopyrightErrors(errors, originalCopyright, fallbackCopyright, errorPaths, warnings = []) {
    if (!Array.isArray(errors) || typeof fallbackCopyright !== 'string' || !fallbackCopyright.trim()) {
        return false;
    }

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
