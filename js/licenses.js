function validateAgainstSchema(data, schema, required = []) {
    const errors = [];
    
    if (schema.required) {
        schema.required.forEach(field => {
            if (!(field in data)) {
                errors.push({ message: `Missing required field: ${field}`, path: field });
            }
        });
    }
    
    if (schema.properties) {
        Object.keys(data).forEach(key => {
            const value = data[key];
            const propSchema = schema.properties[key];
            
            if (propSchema) {
                if (propSchema.type) {
                    const actualType = Array.isArray(value) ? 'array' : typeof value;
                    if (actualType !== propSchema.type && value !== null) {
                        errors.push({ message: `Invalid type for ${key}: expected ${propSchema.type}, got ${actualType}`, path: key });
                    }
                }
                
                if (Array.isArray(value) && propSchema.type === 'array') {
                    if (propSchema.minItems !== undefined && value.length < propSchema.minItems) {
                        errors.push({ message: `Array ${key} has ${value.length} items, minimum is ${propSchema.minItems}`, path: key });
                    }
                    if (propSchema.maxItems !== undefined && value.length > propSchema.maxItems) {
                        errors.push({ message: `Array ${key} has ${value.length} items, maximum is ${propSchema.maxItems}`, path: key });
                    }
                }
                
                if (propSchema.enum && !propSchema.enum.includes(value)) {
                    errors.push({ message: `Invalid value for ${key}: must be one of ${propSchema.enum.join(', ')}`, path: key });
                }
            }
        });
    }
    
    return errors;
}
;

const manualLicenseExceptionList = {
    'academic-free-license-2.1': 'AFL-2.1',
    'agpl-3': 'AGPL-3.0-only',
    'agpl-3+': 'AGPL-3.0-or-later',
    'apache 2.0': 'Apache-2.0',
    'apache-2': 'Apache-2.0',
    'apache software license - version 2.0': 'Apache-2.0',
    'apache2': 'Apache-2.0',
    'apache 2': 'Apache-2.0',
    'boost software license - version 1.0': 'BSL-1.0',
    'bsd-0': 'BSD-0-Clause',
    'bsd-2': 'BSD-2-Clause',
    'bsd-2-clause license': 'BSD-2-Clause',
    'bsd-3': 'BSD-3-Clause',
    'bsd-4': 'BSD-4-Clause',
    'cc0': 'CC0-1.0',
    'cddl 1.0': 'CDDL-1.0',
    'cddl 1.1': 'CDDL-1.1',
    'edl 1.0': 'EDL-1.0',
    'eclipse distribution license v. 1.0': 'EDL-1.0',
    'epl 1.0': 'EPL-1.0',
    'epl 2.0': 'EPL-2.0',
    'expat': 'Expat License',
    'gfdl-1.2': 'GFDL-1.2-only',
    'gfdl-1.2+': 'GFDL-1.2-or-later',
    'gfdl-1.3': 'GFDL-1.3-only',
    'gfdl-1.3+': 'GFDL-1.3-or-later',
    'gpl 2.0': 'GPL-2.0-only',
    'gpl-2': 'GPL-2.0-only',
	'gpl-2-only': 'GPL-2.0-only',
    'gpl 2.0+': 'GPL-2.0-or-later',
    'gpl-2+': 'GPL-2.0-or-later',
    'gpl-2.0+': 'GPL-2.0-or-later',
    'gnu general public license (gpl), version 2, with the classpath exception': 'GPL-2.0-with-classpath-exception',
    'gnu general public license, version 2, with the classpath exception': 'GPL-2.0-with-classpath-exception',
    'gnu general public license, version 2 with the gnu classpath exception': 'GPL-2.0-with-classpath-exception',
    'gpl2 w/ cpe': 'GPL-2.0-with-classpath-exception',
    'gnu general public license (gpl), version 2, with the classpath exception': 'GPL-2.0-with-classpath-exception',
    'gpl 3.0': 'GPL-3.0-only',
    'gpl-3': 'GPL-3.0-only',
    'gpl-3-only': 'GPL-3.0-only',
    'gpl 3.0+': 'GPL-3.0-or-later',
    'gpl-3+': 'GPL-3.0-or-later',
    'gpl-3.0+': 'GPL-3.0-or-later',
    'lgpl-2': 'LGPL-2.0-only',
    'lgpl-2-only': 'LGPL-2.0-only',
    'lgpl-2+': 'LGPL-2.0-or-later',
    'lgpl-2.0+': 'LGPL-2.0-or-later',
    'lgpl 2.1': 'LGPL-2.1-only',
    'lgpl-2.1': 'LGPL-2.1-only',
    'lgpl-2.1-only': 'LGPL-2.1-only',
    'lgpl 2.1+': 'LGPL-2.1-or-later',
    'lgpl-2.1+': 'LGPL-2.1-or-later',
    'lgpl-2.1 license': 'LGPL-2.1-only',
    'gnu general lesser public license (lgpl) version 3.0': 'LGPL-3.0-only',
    'lgpl 3.0': 'LGPL-3.0-only',
    'lgpl-3': 'LGPL-3.0-only',
    'lgpl-3-only': 'LGPL-3.0-only',
    'lgpl 3.0+': 'LGPL-3.0-or-later',
    'lgpl-3+': 'LGPL-3.0-or-later',
    'lgpl-3.0+': 'LGPL-3.0-or-later',
    'mit license': 'MIT',
    'mpl 1.1': 'MPL-1.1',
    'mpl 2.0': 'MPL-2.0',
    'ms-pl license': 'MS-PL',
    'the sax license': 'SAX-PD',
    '.net library license': 'LicenseRef-scancode-ms-net-library',


};
;

function normalizeLicenseText(licenseItem) {
    if (!licenseItem) return '';

    if (licenseItem.license) {
        return licenseItem.license.id || licenseItem.license.name || 'Unknown';
    }

    if (licenseItem.expression) {
        return licenseItem.expression;
    }

    return '';
}
;

function getLicenseCombinationKey(licenses) {
    if (!Array.isArray(licenses) || licenses.length === 0) {
        return 'No licenses';
    }

    const normalized = licenses
        .map(normalizeLicenseText)
        .filter(text => typeof text === 'string' && text.trim() !== '')
        .map(text => text.trim())
        .sort((a, b) => a.localeCompare(b));

    if (normalized.length === 0) {
        return 'No licenses';
    }

    return normalized.join(' + ');
}
;

function buildLicenseSummary(allResults) {
    const licenseMap = new Map();

    allResults.forEach(result => {
        const compKey = result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`;
        const termsForComponent = new Set();

        (result.licenses || []).forEach(licItem => {
            const raw = extractLicenseName(licItem);
            if (!raw) return;
            const terms = splitLicenseTerms(raw);
            terms.forEach(t => {
                const norm = normalizeString(t, { trim: true });
                if (norm) termsForComponent.add(norm);
            });
        });

        termsForComponent.forEach(term => {
            const key = term.toLowerCase();
            if (!licenseMap.has(key)) {
                licenseMap.set(key, { license: term, components: new Set() });
            }
            licenseMap.get(key).components.add(compKey);
        });
    });

    return Array.from(licenseMap.entries())
        .map(([key, item]) => ({ license: item.license, count: item.components.size, components: Array.from(item.components) }))
        .sort((a, b) => b.count - a.count || a.license.localeCompare(b.license));
}
;

function getInvalidIssueContextStore() {
    if (!window.__invalidIssueContextStore) {
        window.__invalidIssueContextStore = { issue: {}, component: {} };
    }
    return window.__invalidIssueContextStore;
}

function getInvalidIssueContextEntries() {
    const store = getInvalidIssueContextStore();
    const hasContent = entry => (entry.note && String(entry.note).trim()) || (entry.overrideMessage && String(entry.overrideMessage).trim());
    const issueEntries = Object.entries(store.issue || {}).map(([issueKey, entry]) => ({
        scope: 'issue',
        issueKey,
        issueText: entry?.issueText || issueKey,
        note: entry?.note || '',
        overrideMessage: entry?.overrideMessage || '',
        componentKey: '',
        componentName: ''
    })).filter(hasContent);
    const componentEntries = Object.entries(store.component || {}).map(([issueKey, issueMap]) => {
        return Object.entries(issueMap || {}).map(([componentKey, entry]) => ({
            scope: 'component',
            issueKey,
            issueText: entry?.issueText || issueKey,
            note: entry?.note || '',
            overrideMessage: entry?.overrideMessage || '',
            componentKey,
            componentName: entry?.componentName || componentKey
        }))
    }).flat().filter(hasContent);
    return [...issueEntries, ...componentEntries];
}

function getInvalidIssueContext(issueText, componentKey = '') {
    const store = getInvalidIssueContextStore();
    const issueKey = String(issueText || '').trim();
    if (!issueKey) return '';
    if (componentKey) {
        const issueMap = store.component?.[issueKey] || {};
        const entry = issueMap[String(componentKey)] || null;
        return entry && entry.note ? entry.note : '';
    }
    const issueEntry = store.issue?.[issueKey] || null;
    return issueEntry && issueEntry.note ? issueEntry.note : '';
}

function getInvalidIssueOverride(issueText, componentKey = '') {
    const store = getInvalidIssueContextStore();
    const issueKey = String(issueText || '').trim();
    if (!issueKey) return '';
    if (componentKey) {
        const issueMap = store.component?.[issueKey] || {};
        const entry = issueMap[String(componentKey)] || null;
        return entry && entry.overrideMessage ? entry.overrideMessage : '';
    }
    const issueEntry = store.issue?.[issueKey] || null;
    return issueEntry && issueEntry.overrideMessage ? issueEntry.overrideMessage : '';
}

function setInvalidIssueContext(issueText, componentKey = '', noteText = '', componentName = '', overrideMessage = '') {
    const store = getInvalidIssueContextStore();
    const issueKey = String(issueText || '').trim();
    if (!issueKey) return;
    const sanitizedNote = String(noteText || '').trim();
    const sanitizedOverride = String(overrideMessage || '').trim();
    const hasContent = Boolean(sanitizedNote) || Boolean(sanitizedOverride);

    if (componentKey) {
        if (!hasContent) {
            if (store.component?.[issueKey]) delete store.component[issueKey][String(componentKey)];
            return;
        }
        if (!store.component[issueKey]) store.component[issueKey] = {};
        store.component[issueKey][String(componentKey)] = {
            issueText: issueKey,
            note: sanitizedNote,
            overrideMessage: sanitizedOverride,
            componentName: componentName || String(componentKey)
        };
        return;
    }

    if (!hasContent) {
        if (store.issue?.[issueKey]) delete store.issue[issueKey];
        return;
    }
    store.issue[issueKey] = { issueText: issueKey, note: sanitizedNote, overrideMessage: sanitizedOverride };
}

function buildInvalidIssueSummary(allResults) {
    const groups = {
        'License related issues': new Map(),
        'Copyright related issues': new Map(),
        'Structural / field issues': new Map()
    };

    const classifyIssueGroup = (error) => {
        if (error && error.category === 'license') {
            return 'License related issues';
        }
        if (error && error.category === 'copyright') {
            return 'Copyright related issues';
        }

        const message = typeof error === 'string' ? error : error?.message;
        const lower = (message || '').toLowerCase();
        if (lower.includes('copyright')) {
            return 'Copyright related issues';
        }
        if (lower.includes('license') || lower.includes('no reference available') || lower.includes('reference text missing')) {
            return 'License related issues';
        }
        return 'Structural / field issues';
    };

    allResults.forEach(result => {
        if (!result || result.valid || !Array.isArray(result.errors)) {
            return;
        }

        const component = {
            name: result.name || 'N/A',
            version: result.version || 'N/A',
            key: result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`
        };

        result.errors.forEach(error => {
            if (!error || typeof error.message !== 'string') {
                return;
            }

            const groupName = classifyIssueGroup(error);
            if (!groupName) {
                return;
            }

            const issueText = error.message.trim() || 'Unknown issue';
            const groupMap = groups[groupName];
            if (!groupMap.has(issueText)) {
                groupMap.set(issueText, []);
            }

            groupMap.get(issueText).push(component);
        });
    });

    const toSortedSubgroups = (groupMap) => {
        return Array.from(groupMap.entries())
            .map(([issue, components]) => {
                const uniqueComponents = deduplicateComponents(components);
                return {
                    issue,
                    components: uniqueComponents,
                    count: uniqueComponents.length
                };
            })
            .sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue));
    };

    const summary = [];
    const groupBuilders = [
        ['License related issues', groups['License related issues']],
        ['Copyright related issues', groups['Copyright related issues']],
        ['Structural / field issues', groups['Structural / field issues']]
    ];

    const componentNoteMap = new Map();
    getInvalidIssueContextEntries()
        .filter(entry => entry.scope === 'component')
        .forEach(entry => {
            const issueText = String(entry.issueText || '').trim() || 'Unknown issue';
            if (!componentNoteMap.has(issueText)) {
                componentNoteMap.set(issueText, new Map());
            }
            const componentKey = String(entry.componentKey || `${entry.componentName || 'N/A'}::${issueText}`);
            componentNoteMap.get(issueText).set(componentKey, {
                name: entry.componentName || componentKey,
                version: 'N/A',
                key: componentKey,
                note: entry.note,
                overrideMessage: entry.overrideMessage || ''
            });
        });

    groupBuilders.forEach(([groupName, groupMap]) => {
        const subgroups = toSortedSubgroups(groupMap);
        if (!subgroups.length) return;

        const renderedSubgroups = [];
        const componentSpecificSubgroupsByMessage = new Map();
        subgroups.forEach(subgroup => {
            const issueText = String(subgroup.issue || '').trim() || 'Unknown issue';
            const componentNotesForIssue = componentNoteMap.get(issueText);
            const annotatedKeys = componentNotesForIssue
                ? new Set(componentNotesForIssue.keys())
                : new Set();

            const remainingComponents = (subgroup.components || []).filter(component => {
                const componentKey = component.key || `${component.name || 'N/A'}::${component.version || 'N/A'}`;
                return !annotatedKeys.has(componentKey);
            });

            const generalSubgroup = {
                ...subgroup,
                components: remainingComponents,
                count: remainingComponents.length,
                note: getInvalidIssueContext(issueText) || ''
            };
            if (remainingComponents.length > 0 || generalSubgroup.note) {
                renderedSubgroups.push(generalSubgroup);
            }

            if (componentNotesForIssue && componentNotesForIssue.size > 0) {
                componentNotesForIssue.forEach(componentEntry => {
                    const displayIssue = componentEntry.overrideMessage
                        ? componentEntry.overrideMessage
                        : `${issueText} (component-specific context)`;
                    let componentSpecificSubgroup = componentSpecificSubgroupsByMessage.get(displayIssue);
                    if (!componentSpecificSubgroup) {
                        componentSpecificSubgroup = {
                            issue: displayIssue,
                            components: [],
                            count: 0,
                            note: '',
                            overrideMessage: componentEntry.overrideMessage || '',
                            componentSpecific: true
                        };
                        componentSpecificSubgroupsByMessage.set(displayIssue, componentSpecificSubgroup);
                        renderedSubgroups.push(componentSpecificSubgroup);
                    }

                    const existingComponent = componentSpecificSubgroup.components.find(component => component.key === componentEntry.key);
                    if (existingComponent) {
                        if (!existingComponent.originalIssues.includes(issueText)) {
                            existingComponent.originalIssues.push(issueText);
                        }
                    } else {
                        componentSpecificSubgroup.components.push({
                            ...componentEntry,
                            originalIssue: issueText,
                            originalIssues: [issueText]
                        });
                    }
                    componentSpecificSubgroup.count = componentSpecificSubgroup.components.length;
                });
            }
        });

        if (renderedSubgroups.length > 0) {
            summary.push({
                group: groupName,
                subgroups: renderedSubgroups,
                count: renderedSubgroups.reduce((sum, subgroup) => sum + subgroup.count, 0)
            });
        }
    });

    return summary;
}
;

const specialLicenseStatementList = {
    'public domain': true,
    'public-domain': true,
};
;

function validateLicenses(component) {
    const errors = [];
    
    const licenses = component && isValidInput(component.unifiedLicenses, 'array')
        ? component.unifiedLicenses
        : null;
    if (!isValidInput(licenses, 'array')) {
        return errors;
    }
    
    licenses.forEach((licenseItem, idx) => {
        const licenseId = extractLicenseName(licenseItem);
        if (licenseId) {
            const terms = splitLicenseTerms(licenseId, getLicenseOperator(licenseId));
            
            terms.forEach(term => {
                const hasManualReference = typeof findLicenseReference === 'function'
                    && Boolean(findLicenseReference(term));
                if (spdxLicenseIds.length > 0 && !spdxLicenseIds.includes(term) && !hasManualReference) {
                    errors.push(createError(
                        `Unknown SPDX license ID: ${term}`,
                        getLicensePath(licenseItem, idx),
                        'license'
                    ));
                }
            });
        }
    });
    
    return errors;
}
;

function validateLicensesAgainstSchema(licenses, licenseChoiceSchema) {
    const errors = [];
    
    if (!isValidInput(licenses, 'array')) {
        return errors;
    }

    if (licenseChoiceSchema.maxItems !== undefined && licenses.length > licenseChoiceSchema.maxItems) {
        errors.push(createError(
            `Licenses array has ${licenses.length} items, but maximum allowed is ${licenseChoiceSchema.maxItems}. Use an SPDX expression instead for multiple licenses.`,
            'licenses',
            'license'
        ));
    }
    
    if (licenseChoiceSchema.minItems !== undefined && licenses.length < licenseChoiceSchema.minItems) {
        errors.push(createError(
            `Licenses array has ${licenses.length} items, but minimum required is ${licenseChoiceSchema.minItems}.`,
            'licenses',
            'license'
        ));
    }
    
    return errors;
}
;

function findLicenseReference(licenseName, componentKey = '') {
    if (typeof licenseName !== 'string') {
        return null;
    }

    const normalized = normalizeLicenseName(licenseName).toLowerCase();
    if (!normalized) {
        return null;
    }

    const isLikeIdentifier = (value) => typeof value === 'string' && /-like-\d+$/i.test(value.trim());

    const isEntryLike = (entry) => {
        if (!entry || typeof entry !== 'object') return false;
        return isLikeIdentifier(entry.spdxId) || isLikeIdentifier(entry.licTypeName);
    };

    const findExactMatch = (key, labelSuffix = '') => {
        const inputIsLike = isLikeIdentifier(key);
        const entries = Array.isArray(licenseReferenceEntries) ? licenseReferenceEntries : [];

        const matchesByLicType = entries.filter(entry =>
            entry && typeof entry.licTypeName === 'string' && entry.licTypeName.trim().toLowerCase() === key
        );
        const matchesBySpdx = entries.filter(entry =>
            entry && typeof entry.spdxId === 'string' && entry.spdxId.trim().toLowerCase() === key
        );

        const pickPreferred = (entriesList) => {
            if (entriesList.length === 0) return null;

            if (!inputIsLike) {
                const nonLike = entriesList.find(entry => !isEntryLike(entry));
                if (nonLike) return nonLike;
                return null;
            }

            return entriesList[0];
        };

        const licTypeMatch = pickPreferred(matchesByLicType);
        if (licTypeMatch) {
            return {
                reference: licTypeMatch,
                matchedBy: `licTypeName${labelSuffix}`
            };
        }

        const spdxMatch = pickPreferred(matchesBySpdx);
        if (spdxMatch) {
            return {
                reference: spdxMatch,
                matchedBy: `spdxId${labelSuffix}`
            };
        }

        return null;
    };

    const pairingAlias = normalized.replace(/^licenseref-/i, '');
    const selectedTarget = manualLicensePairings instanceof Map
        ? (componentKey ? manualLicensePairings.get(`${componentKey}:${normalized}`)
            || manualLicensePairings.get(`${componentKey}:${pairingAlias}`) : '')
            || manualLicensePairings.get(normalized) || manualLicensePairings.get(pairingAlias)
        : '';
    if (selectedTarget) {
        const selectedId = String(selectedTarget).trim().toLowerCase();
        const selectedEntry = Array.isArray(licenseReferenceEntries)
            ? licenseReferenceEntries.find(entry => typeof entry?.spdxId === 'string' && entry.spdxId.trim().toLowerCase() === selectedId)
            : null;
        const selectedMatch = selectedEntry
            ? { reference: selectedEntry, matchedBy: 'spdxId (manual session pair)' }
            : findExactMatch(selectedId, ' (manual session pair)');
        if (selectedMatch) return selectedMatch;
    }

    const directMatch = findExactMatch(normalized);
    if (directMatch) {
        return directMatch;
    }

    const stripped = normalized.replace(/^licenseref-/i, '');
    if (stripped && stripped !== normalized) {
        const strippedMatch = findExactMatch(stripped, ' (LicenseRef- stripped)');
        if (strippedMatch) {
            return strippedMatch;
        }
        const strippedNoTrailingNumbers = String(stripped).replace(/-(\d{4,})$/i, '');
        if (strippedNoTrailingNumbers && strippedNoTrailingNumbers !== stripped) {
            const strippedNumbersMatch = findExactMatch(strippedNoTrailingNumbers, ' (LicenseRef- stripped, trailing numbers removed)');
            if (strippedNumbersMatch) {
                return strippedNumbersMatch;
            }
        }
    }

    const manualAliasTarget = (manualLicenseExceptionList && typeof manualLicenseExceptionList === 'object')
        ? (manualLicenseExceptionList[normalized] || manualLicenseExceptionList[stripped] || '')
        : '';
    if (manualAliasTarget) {
        const manualAliasMatch = findExactMatch(String(manualAliasTarget).trim().toLowerCase(), ' (manual alias)');
        if (manualAliasMatch) {
            return manualAliasMatch;
        }

        const aliasReferenceMatch = findExactMatch(normalized, ' (manual alias reference)');
        if (aliasReferenceMatch) {
            return aliasReferenceMatch;
        }
    }

    return null;
}
;

function extractLicenseDocumentText(licenseItem) {
    if (!licenseItem || typeof licenseItem !== 'object') {
        return '';
    }

    const textCandidates = [
        licenseItem.licenseText,
        licenseItem.text,
        licenseItem.extractedText,
        licenseItem.license && licenseItem.license.text,
        licenseItem.license && licenseItem.license.licenseText,
        licenseItem.license && licenseItem.license.LicenseText
    ];

    for (let i = 0; i < textCandidates.length; i++) {
        const candidate = textCandidates[i];

        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }

        if (candidate && typeof candidate === 'object') {
            const content = typeof candidate.content === 'string' ? candidate.content : '';
            const value = typeof candidate.value === 'string' ? candidate.value : '';
            const text = typeof candidate.text === 'string' ? candidate.text : '';
            const raw = content || value || text;

            if (!raw.trim()) {
                continue;
            }

            if (typeof candidate.encoding === 'string' && candidate.encoding.toLowerCase().includes('base64')) {
                try {
                    return atob(raw).trim();
                } catch (e) {
                    return raw.trim();
                }
            }

            return raw.trim();
        }
    }

    return '';
}
;

function calculateLicenseTextMatchPercent(sourceText, referenceText) {
    if (typeof sourceText !== 'string' || typeof referenceText !== 'string') {
        return 0;
    }

    const normalize = (text) => text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedSource = normalize(sourceText);
    const normalizedReference = normalize(referenceText);

    if (normalizedSource === normalizedReference) {
        return 100;
    }

    const sourceTokens = new Set(normalizedSource.split(' ').filter(Boolean));
    const referenceTokens = new Set(normalizedReference.split(' ').filter(Boolean));

    if (sourceTokens.size === 0 || referenceTokens.size === 0) {
        return 0;
    }

    let intersectionCount = 0;
    sourceTokens.forEach(token => {
        if (referenceTokens.has(token)) {
            intersectionCount += 1;
        }
    });

    const unionCount = sourceTokens.size + referenceTokens.size - intersectionCount;
    if (unionCount === 0) {
        return 0;
    }

    const percent = (intersectionCount / unionCount) * 100;
    return Math.round(percent * 100) / 100;
}
;

function validateLicenseTextMatches(component) {
    const errors = [];
    const noReferenceMessage = 'No reference available, manual checking required!';
    const missingReferenceTextMessage = "License Reference list doesn't have license text, SBOM text must be validated manually";
    const missingBothLicenseTextsMessage = "SBOM and License Reference list doesn't have license text, must check manually";

    if (!isValidInput(component, 'object')) return errors;

    let componentKey = '';
    if (typeof component.objectPath === 'string' && component.objectPath.trim()) {
        componentKey = component.objectPath.trim();
    } else if (typeof component.key === 'string' && component.key.trim()) {
        componentKey = component.key.trim();
    } else {
        const name = typeof component.name === 'string' ? component.name.trim() : '';
        const version = typeof component.version === 'string' ? component.version.trim() : '';
        if (name || version) {
            componentKey = `${name || 'unknown'}::${version || 'unknown'}`;
        }
    }

    const unifiedLicenses = isValidInput(component.unifiedLicenses, 'array')
        ? component.unifiedLicenses
        : null;
    const licenses = unifiedLicenses
        ? Array.from(unifiedLicenses.reduce((groups, item) => {
            const key = item.expressionId || item.id;
            if (!groups.has(key)) {
                groups.set(key, {
                    licenseName: item.expression || item.licenseName || '',
                    extractedLicenseTextById: {},
                    sourceItems: []
                });
            }
            const group = groups.get(key);
            group.sourceItems.push(item);

            const componentName =
                component.name ||
                component.componentName ||
                '';

            const componentVersion =
                component.version ||
                component.componentVersion ||
                component.versionInfo ||
                '';

            const licenseTextOverrideKey = [
                componentName,
                componentVersion,
                Number.isInteger(item.evidenceIndex) && item.evidenceIndex >= 0
                    ? `${item.licenseName}#${item.evidenceIndex}`
                    : item.licenseName || ''
            ]
                .map(value =>
                    String(value).trim().toLowerCase()
                )
                .join('::');

            const hasManualTextOverride =
                manualLicenseTextOverrides instanceof Map &&
                manualLicenseTextOverrides.has(
                    licenseTextOverrideKey
                );

            const effectiveLicenseText =
                hasManualTextOverride
                    ? String(
                        manualLicenseTextOverrides.get(
                            licenseTextOverrideKey
                        ) ?? ''
                    )
                    : String(item.licenseText || '');

            if (item.licenseName) {
                const evidenceIndex =
                    typeof item.evidenceIndex === 'number'
                        ? item.evidenceIndex
                        : -1;

                if (evidenceIndex >= 0) {
                    const indexedKey =
                        `${item.licenseName}#${evidenceIndex}`;

                    group.extractedLicenseTextById[indexedKey] =
                        effectiveLicenseText;
                }

                group.extractedLicenseTextById[item.licenseName] =
                    effectiveLicenseText;

                item.licenseText = effectiveLicenseText;
                item.manuallyEditedLicenseText =
                    hasManualTextOverride;

                if (effectiveLicenseText) {
                    group.licenseText = effectiveLicenseText;
                }
            }
            return groups;
        }, new Map()).values())
        : null;

    if (!isValidInput(licenses, 'array')) return errors;

    licenses.forEach((licenseItem, idx) => {
        const licenseName = extractLicenseName(licenseItem);
        const path = getLicensePath(licenseItem, idx);
        const operator = getLicenseOperator(licenseName);

        if (operator === 'MIXED') {
            licenseItem.licenseMatchPercent = 0;
            licenseItem.licenseMatchValid = false;
            licenseItem.licenseMatchInfo = 'Ambiguous mixed expression (AND + OR)';
            errors.push(createError(
                `License "${licenseName || 'Unknown'}" mixes AND/OR without parentheses to disambiguate grouping (e.g. "(A AND B) OR C").`,
                path,
                'license'
            ));
            return;
        }

        const terms = splitLicenseTerms(licenseName, operator);
        const sourceText = Array.isArray(licenseItem.sourceItems)
            ? ''
            : extractLicenseDocumentText(licenseItem)
                || (typeof licenseItem.licenseText === 'string' ? licenseItem.licenseText.trim() : '');
        const extractedTextById = (licenseItem && typeof licenseItem.extractedLicenseTextById === 'object')
            ? licenseItem.extractedLicenseTextById
            : null;

        const termEvidenceIndexMap = {};
        if (Array.isArray(licenseItem.sourceItems)) {
            licenseItem.sourceItems.forEach((sourceItem, termIndex) => {
                const termName = sourceItem.licenseName;
                const evidenceIndex = typeof sourceItem.evidenceIndex === 'number' ? sourceItem.evidenceIndex : -1;
                if (termName && evidenceIndex >= 0) {
                    termEvidenceIndexMap[termIndex] = evidenceIndex;
                }
            });
        }


        if (terms.length === 0) {
            licenseItem.licenseMatchPercent = 0;
            licenseItem.licenseMatchValid = false;
            licenseItem.licenseMatchInfo = noReferenceMessage;
            errors.push(createError(noReferenceMessage, path, 'license'));
            return;
        }

        const termResults = evaluateLicenseTerms(terms, sourceText, extractedTextById, noReferenceMessage, componentKey, termEvidenceIndexMap);
        const fallbackCopyrights = [];
        termResults.forEach((termResult, termIndex) => {
            const evidenceIndex = termEvidenceIndexMap[termIndex] ?? -1;
            const termSourceText = getExtractedLicenseText(extractedTextById, termResult.term, evidenceIndex) || sourceText;
            const referenceMatch = findBestLicenseReference(termResult.term, termSourceText, componentKey);
            const referenceText = referenceMatch?.reference?.LicenseText || '';
            const fallback = tryLicenseTextFallback(termResult.term, termSourceText, referenceText);
            if (fallback?.copyrightText) fallbackCopyrights.push(fallback.copyrightText);
        });
        termResults.forEach((termResult, termIndex) => {
            if (!(termResult.matchPercent > 0 && termResult.matchPercent < 100)) return;
            const evidenceIndex = termEvidenceIndexMap[termIndex] ?? -1;
            const termSourceText = getExtractedLicenseText(extractedTextById, termResult.term, evidenceIndex) || sourceText;
            const referenceMatch = findBestLicenseReference(termResult.term, termSourceText, componentKey);
            const referenceText = referenceMatch?.reference?.LicenseText || '';
            const fallback = tryLicenseTextFallback(termResult.term, termSourceText, referenceText);
            if (!fallback) return;

            const secondPercent = calculateLicenseTextMatchPercent(fallback.licenseText, referenceText);
            if (secondPercent >= termResult.matchPercent) {
                termResult.matchPercent = secondPercent;
                termResult.valid = secondPercent >= 80;
                fallbackCopyrights.push(fallback.copyrightText);
            } else {
                errors.push(createError(
                    'Fallback revalidation error: Second validation lower % then the first.',
                    path,
                    'license'
                ));
            }
        });
        if (fallbackCopyrights.length > 0) {
            component.copyrightFromLicenseText = Array.from(new Set(fallbackCopyrights)).join('; ');
        }
        const validTerms = termResults.filter(r => r.valid);
        const hasManualCheckIssue = someValid(termResults, r => r.reason === noReferenceMessage);
        licenseItem.unmatchedReferenceTerms = Array.from(new Set(
            termResults
                .filter(r => r && (r.reason === noReferenceMessage || r.needsManualPairing))
                .map(r => (typeof r.term === 'string' ? r.term.trim() : ''))
                .filter(Boolean)
        ));

        let isExpressionValid;
        let displayPercent;
        if (operator === 'GROUPED') {
            const parsedExpression = parseLicenseExpressionTree(licenseName);
            const treeEvaluation = parsedExpression.tree
                ? evaluateLicenseExpressionTree(parsedExpression.tree, termResults)
                : null;
            isExpressionValid = treeEvaluation ? treeEvaluation.valid : allValid(termResults, r => r.valid);
            displayPercent = treeEvaluation ? treeEvaluation.matchPercent : Math.min(...termResults.map(r => r.matchPercent));
        } else {
            const termPercents = termResults.map(r => r.matchPercent);
            isExpressionValid = operator === 'AND'
                ? allValid(termResults, r => r.valid)
                : operator === 'OR'
                    ? validTerms.length > 0
                    : termResults[0].valid;
            displayPercent = operator === 'AND'
                ? Math.min(...termPercents)
                : operator === 'OR'
                    ? Math.max(...termPercents)
                    : termPercents[0];
        }
        const isFinalValid = isExpressionValid && !hasManualCheckIssue;

        licenseItem.licenseMatchPercent = Number.isFinite(displayPercent) ? displayPercent : 0;
        licenseItem.licenseMatchValid = isFinalValid;
        licenseItem.licenseMatchCategory = extractCategories(termResults).join(', ');
        licenseItem.licenseMatchInfo = operator
            ? `${operator}: ${termResults.map(r => `${r.term}=${r.matchPercent}%`).join(', ')}`
            : (termResults[0].reason === 'Valid' ? 'Matched by reference' : termResults[0].reason);

        if (Array.isArray(licenseItem.sourceItems)) {
            licenseItem.sourceItems.forEach((sourceItem, termIndex) => {
                const sourceTerm = termResults[termIndex];
                sourceItem.licenseTermMatchPercent = sourceTerm?.matchPercent ?? 0;
                sourceItem.licenseMatchPercent = licenseItem.licenseMatchPercent;
                sourceItem.licenseMatchValid = licenseItem.licenseMatchValid;
                sourceItem.licenseMatchCategory = licenseItem.licenseMatchCategory;
                sourceItem.licenseMatchInfo = licenseItem.licenseMatchInfo;
                sourceItem.licenseReferenceSpdxId = sourceTerm?.referenceSpdxId || '';
                sourceItem.unmatchedReferenceTerms = licenseItem.unmatchedReferenceTerms;
            });
        }

        if (!isFinalValid) {
            const failedTerms = termResults.filter(r => !r.valid);

            if (failedTerms.length === 0) {
                errors.push(createError(
                    `License "${licenseName || 'Unknown'}" is invalid.`,
                    path,
                    'license'
                ));
                return;
            }

            failedTerms.forEach(termResult => {
                const reason = termResult.reason || noReferenceMessage;
                const termName = termResult.term || 'Unknown';
                const errorMessage = reason === missingBothLicenseTextsMessage || reason === missingReferenceTextMessage
                    ? reason
                    : reason === 'No license text found in SBOM'
                        ? `No license text found for component: "${termName}"`
                    : reason !== noReferenceMessage && reason !== 'Valid'
                        ? `License text % match failed: "${termName}"`
                        : reason === noReferenceMessage
                            ? `No reference available, manual checking required: "${termName}"!`
                            : `License term "${termName}" in "${licenseName || 'Unknown'}" failed: Unexpected validation state.`;
                errors.push(createError(errorMessage, path, 'license'));
            });
        }
    });

    return errors;
}

function evaluateLicenseTerms(terms, sourceText, extractedTextById, noRefMsg, componentKey = '', termEvidenceIndexMap = {}) {
    return terms.map((term, termIndex) => {
        const result = {
            term,
            valid: false,
            matchPercent: 0,
            category: '',
            reason: '',
            referenceSpdxId: ''
        };

        const normalizedTerm = normalizeString(term, { lowercase: true, trim: true, collapseSpace: true });
        if (specialLicenseStatementList && specialLicenseStatementList[normalizedTerm]) {
            result.valid = true;
            result.matchPercent = 100;
            result.category = 'public-domain';
            result.reason = 'Valid (special statement)';
            return result;
        }

        const evidenceIndex = termEvidenceIndexMap[termIndex] ?? termEvidenceIndexMap[term] ?? -1;
        const resolvedTermText = getExtractedLicenseText(extractedTextById, term, evidenceIndex);
        const termSourceText = (typeof resolvedTermText === 'string' && resolvedTermText.trim())
            ? resolvedTermText.trim()
            : sourceText;

        const referenceMatch = findBestLicenseReference(term, termSourceText, componentKey);
        if (!referenceMatch) {
            result.reason = noRefMsg;
            return result;
        }

        result.category = referenceMatch.reference.category || '';
        result.referenceSpdxId = referenceMatch.reference.spdxId || '';
        result.needsManualPairing = !result.referenceSpdxId.trim();

        const referenceText = typeof referenceMatch.reference.LicenseText === 'string'
            ? referenceMatch.reference.LicenseText
            : '';

        if (!referenceText.trim()) {
            result.reason = termSourceText.trim()
                ? "License Reference list doesn't have license text, SBOM text must be validated manually"
                : "SBOM and License Reference list doesn't have license text, must check manually";
            return result;
        }

        if (!termSourceText.trim()) {
            result.reason = 'No license text found in SBOM';
            return result;
        }

        const matchPercent = calculateLicenseTextMatchPercent(termSourceText, referenceText);
        result.matchPercent = matchPercent;
        result.valid = matchPercent >= 80;
        result.reason = result.valid ? 'Valid' : `Match ${matchPercent}%`;
        return result;
    });
}

function findBestLicenseReference(licenseName, sourceText, componentKey = '') {
    const fallback = findLicenseReference(licenseName, componentKey);
    if (fallback?.matchedBy?.includes('manual session pair')) return fallback;
    if (typeof sourceText !== 'string' || !sourceText.trim()) return fallback;

    const normalizedName = normalizeLicenseName(licenseName).toLowerCase();
    const strippedName = normalizedName.replace(/^licenseref-/i, '');
    const entries = Array.isArray(licenseReferenceEntries) ? licenseReferenceEntries : [];
    const matchingEntries = entries.filter(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const licTypeName = typeof entry.licTypeName === 'string' ? entry.licTypeName.trim().toLowerCase() : '';
        const spdxId = typeof entry.spdxId === 'string' ? entry.spdxId.trim().toLowerCase() : '';
        return licTypeName === normalizedName || licTypeName === strippedName
            || spdxId === normalizedName || spdxId === strippedName;
    }).filter(entry => typeof entry.LicenseText === 'string' && entry.LicenseText.trim());

    const exactSpdxCandidates = matchingEntries.filter(entry => {
        const spdxId = typeof entry.spdxId === 'string' ? entry.spdxId.trim().toLowerCase() : '';
        return spdxId === normalizedName || spdxId === strippedName;
    });
    const exactLicenseNameCandidates = matchingEntries.filter(entry => {
        const licTypeName = typeof entry.licTypeName === 'string' ? entry.licTypeName.trim().toLowerCase() : '';
        return (licTypeName === normalizedName || licTypeName === strippedName)
            && !exactSpdxCandidates.includes(entry);
    });
    const variantCandidates = matchingEntries.filter(entry =>
        !exactSpdxCandidates.includes(entry) && !exactLicenseNameCandidates.includes(entry)
    );

    const candidates = exactSpdxCandidates.length > 0
        ? exactSpdxCandidates
        : exactLicenseNameCandidates.length > 0
            ? exactLicenseNameCandidates
            : variantCandidates;

    if (candidates.length === 0) return fallback;

    let best = candidates[0];
    let bestPercent = -1;
    candidates.forEach(candidate => {
        const percent = calculateLicenseTextMatchPercent(sourceText, candidate.LicenseText);
        if (percent > bestPercent) {
            best = candidate;
            bestPercent = percent;
        }
    });

    return { reference: best, matchedBy: 'best license-text match' };
}
;

function tryLicenseTextFallback(term, sourceText, referenceText) {
    const eligibleTerms = new Set(['MIT', 'BSD-3-Clause', 'ISC']);
    if (!eligibleTerms.has(term) || typeof sourceText !== 'string' || typeof referenceText !== 'string') {
        return null;
    }

    const sourceLines = sourceText.split(/\r?\n/);
    const tokenize = text => text.match(/[\p{L}\p{N}]+/gu) || [];
    const referenceWords = tokenize(referenceText).slice(0, 15);
    if (referenceWords.length < 15 || sourceLines.length === 0) return null;

    const sourceWords = [];
    sourceLines.forEach((line, lineIndex) => {
        tokenize(line).forEach(word => sourceWords.push({ word, lineIndex }));
    });
    let startIndex = -1;
    for (let index = 0; index <= sourceWords.length - referenceWords.length; index++) {
        const matches = referenceWords.every((word, wordIndex) => sourceWords[index + wordIndex].word === word);
        if (matches) {
            startIndex = sourceWords[index].lineIndex;
            break;
        }
    }
    if (startIndex <= 0) return null;

    const copyrightLines = sourceLines.slice(0, startIndex);
    const copyrightText = copyrightLines.join('\n');
    if (copyrightLines.length > 10 || copyrightText.length > 200) return null;

    const indicators = [
        'Copyright', '(c)', '(C)', '©', 'Author', 'Author(s)', 'author', 'author(s)',
        'Maintainer', 'maintainer', 'Owner', 'owner'
    ];
    const blacklist = [
        'Copyright (c) <year> <copyright holders>',
        '<copyright notice>',
        'Copyright (c) <year> <owner>'
    ];
    const detectedCopyright = copyrightLines
        .filter(line => indicators.some(indicator => line.includes(indicator)))
        .filter(line => !blacklist.includes(line.trim()))
        .join('\n');
    return {
        licenseText: sourceLines.slice(startIndex).join('\n'),
        copyrightText: detectedCopyright
    };
}
;

function normalizeLicenseName(value) {
    let normalized = String(value || '').trim();
    while (normalized.startsWith('(')) normalized = normalized.slice(1).trim();
    while (normalized.endsWith(')')) normalized = normalized.slice(0, -1).trim();
    return normalized;
}
;
