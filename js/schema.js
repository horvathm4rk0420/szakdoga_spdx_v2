// Copyright format validator — check if copyright string contains recognized indicators
// Indicators can be extended by adding to the array
function getCopyrightIndicators() {
    return ['Copyright', '(c)', '(C)', '©'];
}
;

// Detect copyright values that are explicitly blocked as generic copyrights.
function isGenericCopyright(copyrightText) {
    if (typeof copyrightText !== 'string') return false;

    const canonicalize = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^['"\u201C\u201D\u2018\u2019]+|['"\u201C\u201D\u2018\u2019]+$/g, '')
        .replace(/[\s,.;:]+$/g, '');

    const normalizedCopyright = canonicalize(copyrightText);
    const genericCopyrightBlocklist = new Set([
        'Copyright (C) 1989 Free Software Foundation, Inc.',
        'Copyright (C) 1989, 1991 Free Software Foundation, Inc',
        'Copyright (C) 1989, 1991 Free Software Foundation, Inc.',
        'Copyright (C) 1991 Free Software Foundation, Inc.',
        'Copyright (C) 1991, 1999 Free Software Foundation, Inc.',
        'Copyright © 2007 Free Software Foundation, Inc. <https://fsf.org/>',
        'Copyright © 2007 Free Software Foundation, Inc. <http://fsf.org/>',
        'Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>',
        'Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>'
    ].map(canonicalize));

    return genericCopyrightBlocklist.has(normalizedCopyright);
}
;

// Copyright format validation
function isValidCopyrightFormat(copyrightText) {
    if (typeof copyrightText !== 'string' || copyrightText.trim() === '') {
        return false; // Empty or non-string is invalid
    }
    if (copyrightText === 'NOASSERTION') {
        return false; // NOASSERTION is not valid
    }

    return getCopyrightValidationDetails(copyrightText).valid;
}

// Add new phrases here when a copyright entry may validly begin with them.
// Matching is case-insensitive and is restricted to the beginning of an entry.
function getCopyrightValidStartingPhrases() {
    return ['Author:', 'Author(s):', 'author:', 'author(s):', 'Developer:', 'Developer(s):'];
}

function getCopyrightValidationDetails(copyrightText) {
    const indicators = getCopyrightIndicators();
    const entries = typeof copyrightText === 'string'
        ? copyrightText.split(/[;\r\n]/).map(entry => entry.trim()).filter(Boolean)
        : [];
    const genericEntries = entries.filter(entry => isGenericCopyright(entry));
    const validStartingPhrases = getCopyrightValidStartingPhrases();
    const startsWithValidPhrase = entry => validStartingPhrases.some(phrase =>
        entry.toLocaleLowerCase().startsWith(phrase.toLocaleLowerCase())
    );
    const validEntries = entries.filter(entry =>
        !isGenericCopyright(entry)
        && (indicators.some(indicator => entry.includes(indicator)) || startsWithValidPhrase(entry))
    );

    return {
        valid: validEntries.length > 0,
        entries,
        genericEntries,
        validEntries
    };
}
;

// Schema validation
function isValidSchema(data) {
    // Check basic JSON Schema properties
    if (typeof data !== 'object' || data === null) {
        return false;
    }

    // Accept SPDX schemas (have spdxVersion and packages properties)
    if (data.properties && data.properties.spdxVersion && data.properties.packages) {
        return true;
    }
    
    // For CycloneDX schemas, check for required schema properties
    if (!data.$schema && !data.definitions && !data.properties && !data.type) {
        return false;
    }
    
    // Check for CycloneDX-specific structure
    // Should have definitions for component, metadata, etc.
    if (!data.definitions || !data.definitions.component) {
        return false;
    }
    
    return true;
}
;

// Update schema status indicator in UI
function updateSchemaStatus(elementId, loaded, filename = '', schemaType = '') {
    const element = document.getElementById(elementId);
    if (loaded) {
        element.className = 'schema-status schema-loaded';
        // Security: Escape filename to prevent XSS
        const safeFilename = escapeHtml(filename);
        const typeInfo = schemaType ? ` (${schemaType})` : '';
        element.textContent = `✓ Loaded${typeInfo}${filename ? ': ' + safeFilename : ''}`;
    } else {
        element.className = 'schema-status schema-missing';
        element.textContent = '✗ Not Loaded';
    }
}
;

// Check if any schemas are loaded (CycloneDX, SPDX, or XSD)
function getSchemasIfLoaded() {
    // Check for CycloneDX schemas
    const hasCycloneDX = schema14 || schema15 || schema16 || schema17;
    // Check for SPDX schemas
    const hasSpdx = spdxSchema22 || spdxSchema23;
    // Check for XSD schema
    const hasXsd = xsdSchema;
    
    if (!hasCycloneDX && !hasSpdx && !hasXsd) {
        return null;
    }
    
    return {
        schema14,
        schema15,
        schema16,
        schema17,
        spdxSchema22,
        spdxSchema23,
        xsdSchema,
        hasCycloneDX,
        hasSpdx,
        hasXsd
    };
}
;

// Pick best matching schema: exact version first, then nearest higher, then lower
function pickSchema(schemas, specVersion) {
    const order = ['1.4', '1.5', '1.6', '1.7'];
    const map = { '1.4': schemas.schema14, '1.5': schemas.schema15, '1.6': schemas.schema16, '1.7': schemas.schema17 };
    if (map[specVersion]) return map[specVersion];
    const idx = order.indexOf(specVersion);
    // Try higher versions first (compatible superset)
    for (let i = idx + 1; i < order.length; i++) { if (map[order[i]]) return map[order[i]]; }
    // Fallback to lower versions
    for (let i = idx - 1; i >= 0; i--) { if (map[order[i]]) return map[order[i]]; }
    return null;
}
;

// Show an info panel telling the user which schema file to upload
function showSchemaNeededInfo(specVersion) {
    const resultsDiv = document.getElementById('results');
    const sv = escapeHtml(specVersion || 'unknown');
    const filename = specVersion ? `bom-${escapeHtml(specVersion)}.schema.json` : 'the matching schema';
    resultsDiv.innerHTML = `<div class="validation-result" style="display:block;
        background:var(--color-info-100);border-left:4px solid var(--color-info-700);
        color:var(--color-deep-space-900);">
        <h2 style="color:var(--color-info-700);">&#x24D8; Schema Required</h2>
        <p>The loaded SBOM uses <strong>CycloneDX specVersion ${sv}</strong>.</p>
        <p style="margin-top:8px;">Please upload the matching schema file: <code>${filename}</code></p>
        <p style="margin-top:8px;">You can obtain CycloneDX schemas from 
            <a href="https://github.com/CycloneDX/specification/tree/master/schema" target="_blank" rel="noopener noreferrer">github.com/CycloneDX/specification</a>.
        </p>
    </div>`;
}
;

// Detect whether an XML SBOM is CycloneDX or SPDX.
function detectXmlSbomFormat(xmlDoc) {
    const root = xmlDoc && xmlDoc.documentElement ? xmlDoc.documentElement : null;
    if (!root) {
        return 'unknown-xml';
    }

    const rootName = (root.localName || root.nodeName || '').toLowerCase();
    const namespaceUri = (root.namespaceURI || '').toLowerCase();
    const hasChildSpdxVersion = typeof root.querySelector === 'function'
        ? Boolean(root.querySelector(':scope > spdxVersion'))
        : false;
    const hasChildPackages = typeof root.querySelector === 'function'
        ? Boolean(root.querySelector(':scope > packages'))
        : false;

    if (namespaceUri.includes('cyclonedx.org') || rootName === 'bom') {
        return 'cyclonedx-xml';
    }

    if (namespaceUri.includes('spdx.org') || rootName === 'rdf:rdf' || rootName === 'rdf' || rootName === 'document' || hasChildSpdxVersion || hasChildPackages) {
        return 'spdx-xml';
    }

    const spdxDocumentNodes = typeof xmlDoc.getElementsByTagNameNS === 'function'
        ? xmlDoc.getElementsByTagNameNS('*', 'SpdxDocument')
        : [];
    if (spdxDocumentNodes && spdxDocumentNodes.length > 0) {
        return 'spdx-xml';
    }

    return 'unknown-xml';
}
;

// Convert SPDX XML into the SPDX JSON-like shape used by the existing SPDX validator.
function parseSpdxXmlDocument(xmlDoc) {
    const root = xmlDoc && xmlDoc.documentElement ? xmlDoc.documentElement : null;
    if (!root) return null;

    const allElements = (tagName) => {
        if (typeof root.getElementsByTagName !== 'function') return [];
        return Array.from(root.getElementsByTagName(tagName));
    };

    const childText = (parent, selector) => {
        const node = parent && typeof parent.querySelector === 'function' ? parent.querySelector(`:scope > ${selector}`) : null;
        return node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
    };

    const childTexts = (parent, selector) => {
        if (!parent || typeof parent.querySelectorAll !== 'function') return [];
        return Array.from(parent.querySelectorAll(`:scope > ${selector}`))
            .map(node => (typeof node.textContent === 'string' ? node.textContent.trim() : ''))
            .filter(Boolean);
    };

    const parseExternalRefs = (pkgElem) => {
        if (!pkgElem || typeof pkgElem.querySelectorAll !== 'function') return [];
        return Array.from(pkgElem.querySelectorAll(':scope > externalRefs'))
            .map(refElem => ({
                referenceCategory: childText(refElem, 'referenceCategory'),
                referenceType: childText(refElem, 'referenceType'),
                referenceLocator: childText(refElem, 'referenceLocator')
            }))
            .filter(ref => ref.referenceCategory || ref.referenceType || ref.referenceLocator);
    };

    const parsePackage = (pkgElem) => {
        const packageData = {
            SPDXID: childText(pkgElem, 'SPDXID'),
            name: childText(pkgElem, 'name'),
            versionInfo: childText(pkgElem, 'versionInfo'),
            downloadLocation: childText(pkgElem, 'downloadLocation'),
            filesAnalyzed: childText(pkgElem, 'filesAnalyzed'),
            licenseConcluded: childText(pkgElem, 'licenseConcluded'),
            licenseDeclared: childText(pkgElem, 'licenseDeclared'),
            copyrightText: childText(pkgElem, 'copyrightText'),
            licenseInfoInFiles: childTexts(pkgElem, 'licenseInfoInFiles'),
            externalRefs: parseExternalRefs(pkgElem)
        };

        return packageData;
    };

    const parseExtractedLicensingInfo = (infoElem) => ({
        licenseId: childText(infoElem, 'licenseId'),
        extractedText: childText(infoElem, 'extractedText'),
        name: childText(infoElem, 'name'),
        comment: childText(infoElem, 'comment'),
        seeAlsos: childTexts(infoElem, 'seeAlso'),
        crossRefs: Array.from(infoElem.querySelectorAll(':scope > crossRefs')).map(refElem => ({
            isWayBackLink: childText(refElem, 'isWayBackLink'),
            match: childText(refElem, 'match'),
            timestamp: childText(refElem, 'timestamp'),
            order: childText(refElem, 'order'),
            url: childText(refElem, 'url'),
            isLive: childText(refElem, 'isLive')
        }))
    });

    return {
        spdxVersion: childText(root, 'spdxVersion'),
        dataLicense: childText(root, 'dataLicense'),
        SPDXID: childText(root, 'SPDXID'),
        name: childText(root, 'name'),
        documentNamespace: childText(root, 'documentNamespace'),
        creationInfo: (() => {
            const creationInfoElem = root.querySelector(':scope > creationInfo');
            if (!creationInfoElem) return null;
            return {
                created: childText(creationInfoElem, 'created'),
                creators: childTexts(creationInfoElem, 'creators'),
                comment: childText(creationInfoElem, 'comment')
            };
        })(),
        packages: allElements('packages').map(parsePackage),
        hasExtractedLicensingInfos: allElements('extractedLicensingInfos').map(parseExtractedLicensingInfo)
    };
}
;

// Schema upload handler
function loadSchemaFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const schemaFileName = document.getElementById('schemaFileName');
    if (schemaFileName) {
        schemaFileName.textContent = '';
    }
    
    // Security: Check file size
    if (file.size > MAX_FILE_SIZE) {
        alert(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    
    // Check if it's an XSD file
    if (file.name.endsWith('.xsd')) {
        schemaFileXsd = file;  // Store raw File for future re-reads
        reader.onload = (e) => {
            try {
                xsdSchema = e.target.result;  // Store as text
                updateSchemaStatus('schemaStatus', true, file.name, 'XSD (XML)');
                if (schemaFileName) {
                    schemaFileName.textContent = `Uploaded: ${file.name}`;
                }
                revalidateIfLoaded();
            } catch (error) {
                alert(`Error loading XSD file: ${error.message}`);
                if (schemaFileName) {
                    schemaFileName.textContent = '';
                }
            }
        };
        reader.readAsText(file);
        return;
    }
    
    // JSON schema handling
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate that it's a JSON schema
            if (!isValidSchema(data)) {
                alert(`Invalid schema file: The uploaded file does not appear to be a valid CycloneDX or SPDX JSON schema.`);
                if (schemaFileName) {
                    schemaFileName.textContent = '';
                }
                return;
            }

            const schemaId = data.$id || '';
            let detectedVersion = '';

            // --- SPDX schema detection ---
            const isSpdx = data.properties && data.properties.spdxVersion && data.properties.packages;
            if (isSpdx) {
                // Detect 2.3 vs 2.2 from $id, title, or spdxVersion enum
                const title = (data.title || '').toLowerCase();
                if (schemaId.includes('2.3') || title.includes('2.3')) {
                    spdxSchema23 = data;
                    schemaFileSpdx23 = file;  // Store raw File
                    detectedVersion = 'SPDX 2.3';
                } else {
                    // Default to 2.2 for spdx.org/rdf/terms without sub-path
                    spdxSchema22 = data;
                    schemaFileSpdx22 = file;  // Store raw File
                    detectedVersion = 'SPDX 2.2';
                }
                updateSchemaStatus('schemaStatus', true, file.name, detectedVersion);
                revalidateIfLoaded();
                return;
            }
            
            // --- CycloneDX schema detection ---
            const cdxVersions = ['1.4', '1.5', '1.6', '1.7'];
            let matchedVersion = cdxVersions.find(v => schemaId.includes(v));
            if (!matchedVersion && data.properties?.specVersion?.enum) {
                matchedVersion = cdxVersions.find(v => data.properties.specVersion.enum.includes(v));
            }
            if (matchedVersion === '1.4') {
                schema14 = data; schemaFile14 = file; detectedVersion = '1.4';
            } else if (matchedVersion === '1.5') {
                schema15 = data; schemaFile15 = file; detectedVersion = '1.5';
            } else if (matchedVersion === '1.6') {
                schema16 = data; schemaFile16 = file; detectedVersion = '1.6';
            } else if (matchedVersion === '1.7') {
                schema17 = data; schemaFile17 = file; detectedVersion = '1.7';
            }

            if (detectedVersion) {
                updateSchemaStatus('schemaStatus', true, file.name, detectedVersion);
                if (schemaFileName) {
                    schemaFileName.textContent = `Uploaded: ${file.name}`;
                }
            } else {
                alert('Could not detect schema version. Please ensure the schema has a valid $id field with version 1.4, 1.5, 1.6, 1.7, SPDX 2.2 or SPDX 2.3.');
                if (schemaFileName) {
                    schemaFileName.textContent = '';
                }
                return;
            }
            
            // Re-validate if an SBOM file has already been loaded
            revalidateIfLoaded();
        } catch (error) {
            alert(`Error parsing schema file: ${error.message}`);
            if (schemaFileName) {
                schemaFileName.textContent = '';
            }
        }
    };
    reader.readAsText(file);
}
;

// Load reference JSON file used for license-text matching
function loadLicenseReferenceFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const refFileName = document.getElementById('licenseRefFileName');
    if (refFileName) {
        refFileName.textContent = '';
    }

    if (file.size > MAX_FILE_SIZE) {
        alert(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const candidateList = Array.isArray(data)
                ? data
                : (Array.isArray(data.licenses)
                    ? data.licenses
                    : (Array.isArray(data.items)
                        ? data.items
                        : (Array.isArray(data.records) ? data.records : null)));

            if (!candidateList) {
                alert('Invalid reference list format. Expected a JSON array or an object with a licenses/items/records array.');
                if (refFileName) {
                    refFileName.textContent = '';
                }
                return;
            }

            const byLicTypeName = new Map();
            const bySpdxId = new Map();
            const preparedEntries = [];

            candidateList.forEach(item => {
                if (!item || typeof item !== 'object') {
                    return;
                }

                const licTypeName = typeof item.licTypeName === 'string' ? item.licTypeName.trim() : '';
                const spdxId = typeof item.spdxId === 'string' ? item.spdxId.trim() : '';
                const category = typeof item.category === 'string' ? item.category.trim() : '';
                const licenseText = typeof item.LicenseText === 'string' ? item.LicenseText : '';

                if (!licTypeName && !spdxId) {
                    return;
                }

                const prepared = {
                    licTypeName,
                    spdxId,
                    category,
                    LicenseText: licenseText
                };

                preparedEntries.push(prepared);

                if (licTypeName) {
                    const key = licTypeName.toLowerCase();
                    if (!byLicTypeName.has(key)) {
                        byLicTypeName.set(key, prepared);
                    }
                }

                if (spdxId) {
                    const key = spdxId.toLowerCase();
                    if (!bySpdxId.has(key)) {
                        bySpdxId.set(key, prepared);
                    }
                }
            });

            if (preparedEntries.length === 0) {
                alert('No valid reference entries found. Each entry must have licTypeName or spdxId.');
                if (refFileName) {
                    refFileName.textContent = '';
                }
                return;
            }

            licenseReferenceEntries = preparedEntries;
            licenseReferenceByLicTypeName = byLicTypeName;
            licenseReferenceBySpdxId = bySpdxId;
            licenseReferenceFile = file;

            updateSchemaStatus('licenseRefStatus', true, file.name, 'License Reference');
            if (refFileName) {
                refFileName.textContent = `Uploaded: ${file.name}`;
            }
            revalidateIfLoaded();
        } catch (error) {
            alert(`Error parsing reference list: ${error.message}`);
            if (refFileName) {
                refFileName.textContent = '';
            }
        }
    };

    reader.readAsText(file);
}
;
