function openManualLicenseMappingModal(rawLicenseName, triggerElement = null) {
    ensureManualLicenseMappingModal();

    const normalized = typeof rawLicenseName === 'string' ? rawLicenseName.trim() : '';
    if (!normalized) {
        return;
    }

    pendingManualLicenseName = normalized;

    const componentRows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleComponentRows = componentRows.filter(row => row.style.display !== 'none');
    const componentRow = triggerElement && typeof triggerElement.closest === 'function'
        ? triggerElement.closest('#componentsTable tbody tr[data-component-key]')
        : null;

    pendingComponentKey = componentRow ? componentRow.dataset.componentKey : '';
    
    manualLicenseNavigationContext = {
        filterMode: window.__activeFilterMode || 'all',
        componentKey: componentRow ? componentRow.dataset.componentKey : '',
        componentIndex: componentRow ? visibleComponentRows.indexOf(componentRow) : -1
    };

    const subtitleEl = document.getElementById('manualLicenseMappingModalSubtitle');
    const searchEl = document.getElementById('manualLicenseMappingSearch');
    const modal = document.getElementById('manualLicenseMappingModal');

    if (subtitleEl) {
        subtitleEl.textContent = `Pair unresolved license: ${normalized}`;
    }

    const seen = new Set();
    manualLicenseReferenceOptions = (Array.isArray(licenseReferenceEntries) ? licenseReferenceEntries : [])
        .map(entry => {
            const spdxId = typeof entry.spdxId === 'string' ? entry.spdxId.trim() : '';
            const licTypeName = typeof entry.licTypeName === 'string' ? entry.licTypeName.trim() : '';
            if (!spdxId) {
                return null;
            }
            const key = spdxId.toLowerCase();
            if (seen.has(key)) {
                return null;
            }
            seen.add(key);
            return {
                spdxId,
                licTypeName
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.spdxId.localeCompare(b.spdxId));

    if (searchEl) {
        searchEl.value = '';
    }

    filterManualLicenseReferenceOptions();
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
}
;

function filterManualLicenseReferenceOptions() {
    const searchEl = document.getElementById('manualLicenseMappingSearch');
    const selectEl = document.getElementById('manualLicenseMappingSelect');
    if (!selectEl) {
        return;
    }

    const query = (searchEl && typeof searchEl.value === 'string')
        ? searchEl.value.trim().toLowerCase()
        : '';

    const options = Array.isArray(manualLicenseReferenceOptions)
        ? manualLicenseReferenceOptions
        : [];

    const filtered = query
        ? options.filter(item => {
            const spdxId = item.spdxId.toLowerCase();
            const licTypeName = item.licTypeName.toLowerCase();
            return spdxId.includes(query) || licTypeName.includes(query);
        })
        : options;

    selectEl.innerHTML = filtered
        .map(item => `<option value="${escapeHtml(item.spdxId)}">${escapeHtml(item.spdxId)}${item.licTypeName ? ` | ${escapeHtml(item.licTypeName)}` : ''}</option>`)
        .join('');

    if (selectEl.options.length > 0) {
        selectEl.selectedIndex = 0;
    }
}
;

function applyManualLicensePairing() {
    const selectEl = document.getElementById('manualLicenseMappingSelect');
    const rawAlias = typeof pendingManualLicenseName === 'string' ? pendingManualLicenseName.trim() : '';
    const selectedSpdxId = selectEl && typeof selectEl.value === 'string' ? selectEl.value.trim() : '';

    if (!rawAlias || !selectedSpdxId) {
        return;
    }
    const alias = normalizeLicenseName(rawAlias).toLowerCase();

    const componentKey = typeof pendingComponentKey === 'string' && pendingComponentKey 
        ? pendingComponentKey 
        : '';

    const pairingKey = componentKey ? `${componentKey}:${alias}` : alias;
    const previousSpdxId = manualLicensePairings instanceof Map
        ? manualLicensePairings.get(pairingKey) || ''
        : '';
    
    if (componentKey) {
        manualLicensePairings.set(`${componentKey}:${alias}`, selectedSpdxId);
    } else {
        manualLicensePairings.set(alias, selectedSpdxId);
    }

    const currentState = window.__lastDisplayState || null;
    const componentResult = componentKey && Array.isArray(currentState?.allResults)
        ? currentState.allResults.find((result, index) => (result.objectPath || `components[${index}]`) === componentKey)
        : null;
    editChangeLog.push({
        timestamp: new Date().toISOString(),
        rowId: componentKey,
        section: componentResult?.section || '',
        name: componentResult?.name || '',
        changes: [{
            field: `Manual license match: ${rawAlias}`,
            oldValue: previousSpdxId || '(unpaired)',
            newValue: selectedSpdxId
        }],
        licenseMatch: {
            scope: componentKey ? 'component' : 'global',
            componentKey,
            licenseName: rawAlias,
            spdxId: selectedSpdxId
        }
    });
    
    closeManualLicenseMappingModal();
    revalidateIfLoaded();
}
;

function closeManualLicenseMappingModal() {
    const modal = document.getElementById('manualLicenseMappingModal');
    if (!modal) {
        return;
    }

    modal.classList.remove('open');
    document.body.classList.remove('license-modal-open');

    pendingManualLicenseName = '';
    pendingComponentKey = '';
}
;

const NON_COMMERCIAL_LICENSE_TEXT_PATTERNS = Object.freeze([
    {
        id: "non-commercial",
        pattern: /\bnon-commercial\b/giu
    },
    {
        id: "non commercial",
        pattern: /\bnon\s+commercial\b/giu
    },
    {
        id: "noncommercial",
        pattern: /\bnoncommercial\b/giu
    },
    {
        id: "unknown",
        pattern: /\bunknown\b/giu
    },
    {
        id: "cc-by-nc",
        pattern: /\bcc-by-nc\b/giu
    }
]);

function findNonCommercialSentenceBounds(
    text,
    matchStart,
    matchEnd
) {
    if (typeof text !== "string" || text.length === 0) {
        return null;
    }

    let sentenceStart = 0;

    for (let index = matchStart - 1; index >= 0; index -= 1) {
        const character = text[index];

        if (
            character === "." ||
            character === "!" ||
            character === "?"
        ) {
            sentenceStart = index + 1;
            break;
        }
    }

    while (
        sentenceStart < text.length &&
        /\s/u.test(text[sentenceStart])
    ) {
        sentenceStart += 1;
    }

    let sentenceEnd = text.length;

    for (
        let index = matchEnd;
        index < text.length;
        index += 1
    ) {
        const character = text[index];

        if (
            character === "." ||
            character === "!" ||
            character === "?"
        ) {
            sentenceEnd = index + 1;
            break;
        }
    }

    return {
        start: sentenceStart,
        end: sentenceEnd
    };
}

function findNonCommercialLicenseTextMatches(text) {
    if (typeof text !== "string" || !text.trim()) {
        return [];
    }

    const matches = [];

    NON_COMMERCIAL_LICENSE_TEXT_PATTERNS.forEach(rule => {
        rule.pattern.lastIndex = 0;

        let match;

        while ((match = rule.pattern.exec(text)) !== null) {
            const sentenceBounds =
                findNonCommercialSentenceBounds(
                    text,
                    match.index,
                    match.index + match[0].length
                );

            if (!sentenceBounds) {
                continue;
            }

            matches.push({
                ruleId: rule.id,
                keyword: match[0],
                keywordStart: match.index,
                keywordEnd:
                    match.index + match[0].length,
                sentenceStart: sentenceBounds.start,
                sentenceEnd: sentenceBounds.end,
                sentence: text.slice(
                    sentenceBounds.start,
                    sentenceBounds.end
                )
            });

            if (match.index === rule.pattern.lastIndex) {
                rule.pattern.lastIndex += 1;
            }
        }
    });

    return matches.sort((left, right) => {
        if (
            left.sentenceStart !==
            right.sentenceStart
        ) {
            return (
                left.sentenceStart -
                right.sentenceStart
            );
        }

        return (
            left.keywordStart -
            right.keywordStart
        );
    });
}

function normalizeNonCommercialReferenceText(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(
            /[\u2010\u2011\u2012\u2013\u2014\u2212]/gu,
            '-'
        )
        .replace(
            /[\u2018\u2019\u201A\u201B]/gu,
            "'"
        )
        .replace(
            /[\u201C\u201D\u201E\u201F]/gu,
            '"'
        )
        .replace(/\s+/gu, ' ')
        .trim()
        .toLowerCase();
}

const KNOWN_REFERENCE_NON_COMMERCIAL_FRAGMENTS =
    Object.freeze([
        'this alternative is allowed only for noncommercial distribution and only if you received the program in object code or executable form alone'
    ]);

function normalizeKnownReferenceFragment(value) {
    return normalizeNonCommercialReferenceText(
        value
    )
        .replace(
            /[^a-z0-9-]+/giu,
            ' '
        )
        .replace(/\s+/gu, ' ')
        .trim();
}

function isKnownReferenceNonCommercialSentence(
    sentence
) {
    const normalizedSentence =
        normalizeKnownReferenceFragment(
            sentence
        );

    if (!normalizedSentence) {
        return false;
    }

    return KNOWN_REFERENCE_NON_COMMERCIAL_FRAGMENTS.some(
        knownFragment => {
            const normalizedKnownFragment =
                normalizeKnownReferenceFragment(
                    knownFragment
                );

            return (
                normalizedKnownFragment &&
                normalizedSentence.includes(
                    normalizedKnownFragment
                )
            );
        }
    );
}


function getLicenseIdentifierForNonCommercialCheck(
    licenseItem
) {
    if (
        !licenseItem ||
        typeof licenseItem !== 'object'
    ) {
        return '';
    }

    const candidates = [
        licenseItem.licenseName,
        licenseItem.licenseReferenceSpdxId,
        licenseItem.spdxId,
        licenseItem.expression,
        licenseItem.id,
        licenseItem.name,
        licenseItem.license?.id,
        licenseItem.license?.name
    ];

    for (const candidate of candidates) {
        if (
            typeof candidate === 'string' &&
            candidate.trim()
        ) {
            return candidate.trim();
        }
    }

    return '';
}

function getLicenseReferenceText(
    licenseIdentifier,
    componentKey = ''
) {
    if (
        typeof licenseIdentifier !== 'string' ||
        !licenseIdentifier.trim() ||
        typeof findLicenseReference !== 'function'
    ) {
        return '';
    }

    const match = findLicenseReference(
        licenseIdentifier.trim(),
        componentKey
    );

    const reference =
        match?.reference;

    if (
        !reference ||
        typeof reference !== 'object'
    ) {
        return '';
    }

    const candidates = [
        reference.LicenseText,
        reference.licenseText,
        reference.licenseTextContent,
        reference.text,
        reference.content
    ];

    for (const candidate of candidates) {
        if (
            typeof candidate === 'string' &&
            candidate.trim()
        ) {
            return candidate;
        }
    }

    return '';
}

function isNonCommercialSentenceInReferenceText(
    sentence,
    referenceText,
    keyword = ''
) {
    const normalizedSentence =
        normalizeNonCommercialReferenceText(
            sentence
        );

    const normalizedReferenceText =
        normalizeNonCommercialReferenceText(
            referenceText
        );

    if (
        !normalizedSentence ||
        !normalizedReferenceText
    ) {
        return false;
    }

    if (
        normalizedReferenceText.includes(
            normalizedSentence
        )
    ) {
        return true;
    }

    const tokenize = value =>
        String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(
                /[\u2010\u2011\u2012\u2013\u2014\u2212]/gu,
                '-'
            )
            .replace(
                /[^a-z0-9-]+/giu,
                ' '
            )
            .replace(/\s+/gu, ' ')
            .trim()
            .split(' ')
            .filter(Boolean);

    const sentenceTokens =
        tokenize(normalizedSentence);

    const referenceTokens =
        tokenize(normalizedReferenceText);

    const keywordTokens =
        tokenize(keyword);

    if (
        sentenceTokens.length === 0 ||
        referenceTokens.length === 0 ||
        keywordTokens.length === 0
    ) {
        return false;
    }

    const keywordStart =
        sentenceTokens.findIndex(
            (_, index) => {
                if (
                    index +
                        keywordTokens.length >
                    sentenceTokens.length
                ) {
                    return false;
                }

                return keywordTokens.every(
                    (token, offset) =>
                        sentenceTokens[
                            index + offset
                        ] === token
                );
            }
        );

    if (keywordStart < 0) {
        return false;
    }

    const contextRadii = [
        8,
        6,
        4
    ];

    for (
        const radius of contextRadii
    ) {
        const contextStart =
            Math.max(
                0,
                keywordStart - radius
            );

        const contextEnd =
            Math.min(
                sentenceTokens.length,
                keywordStart +
                    keywordTokens.length +
                    radius
            );

        const contextTokens =
            sentenceTokens.slice(
                contextStart,
                contextEnd
            );

        if (contextTokens.length < 7) {
            continue;
        }

        for (
            let referenceIndex = 0;
            referenceIndex <=
                referenceTokens.length -
                    contextTokens.length;
            referenceIndex += 1
        ) {
            let matches = true;

            for (
                let offset = 0;
                offset <
                    contextTokens.length;
                offset += 1
            ) {
                if (
                    referenceTokens[
                        referenceIndex + offset
                    ] !==
                    contextTokens[offset]
                ) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                return true;
            }
        }
    }

    return false;
}

function filterReferenceLicenseTextMatches(
    matches,
    referenceText
) {
    if (!Array.isArray(matches)) {
        return [];
    }

    const hasReferenceText =
        typeof referenceText === 'string' &&
        referenceText.trim().length > 0;

    return matches.filter(match => {
        if (
            !match ||
            typeof match.sentence !== 'string'
        ) {
            return true;
        }

        if (
            isKnownReferenceNonCommercialSentence(
                match.sentence
            )
        ) {
            return false;
        }

        if (!hasReferenceText) {
            return true;
        }

        return !isNonCommercialSentenceInReferenceText(
            match.sentence,
            referenceText,
            match.keyword
        );
    });
}

function findRelevantNonCommercialLicenseTextMatches(
    text,
    licenseIdentifier = '',
    componentKey = ''
) {
    const rawMatches =
        findNonCommercialLicenseTextMatches(
            text
        );

    if (rawMatches.length === 0) {
        return [];
    }

    const referenceText =
        getLicenseReferenceText(
            licenseIdentifier,
            componentKey
        );

    return filterReferenceLicenseTextMatches(
        rawMatches,
        referenceText
    );
}

function hasNonCommercialLicenseTextMatch(text) {
    return (
        findNonCommercialLicenseTextMatches(text)
            .length > 0
    );
}

function mergeNonCommercialSentenceRanges(matches) {
    if (
        !Array.isArray(matches) ||
        matches.length === 0
    ) {
        return [];
    }

    const ranges = matches
        .map(match => ({
            start: match.sentenceStart,
            end: match.sentenceEnd
        }))
        .filter(range =>
            Number.isInteger(range.start) &&
            Number.isInteger(range.end) &&
            range.start >= 0 &&
            range.end > range.start
        )
        .sort((left, right) => {
            if (left.start !== right.start) {
                return left.start - right.start;
            }

            return left.end - right.end;
        });

    const mergedRanges = [];

    ranges.forEach(range => {
        const previous =
            mergedRanges[mergedRanges.length - 1];

        if (
            previous &&
            range.start <= previous.end
        ) {
            previous.end = Math.max(
                previous.end,
                range.end
            );
            return;
        }

        mergedRanges.push({
            start: range.start,
            end: range.end
        });
    });

    return mergedRanges;
}

function escapeNonCommercialLicenseTextHtml(value) {
    if (typeof escapeHtml === "function") {
        return escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderNonCommercialLicenseText(
    text,
    licenseIdentifier = '',
    componentKey = ''
) {
    const sourceText =
        typeof text === 'string'
            ? text
            : '';

    const matches =
        findRelevantNonCommercialLicenseTextMatches(
            sourceText,
            licenseIdentifier,
            componentKey
        );

    if (matches.length === 0) {
        return escapeNonCommercialLicenseTextHtml(
            sourceText
        );
    }

    const ranges =
        mergeNonCommercialSentenceRanges(
            matches
        );

    let renderedHtml = '';
    let currentPosition = 0;

    ranges.forEach(range => {
        renderedHtml +=
            escapeNonCommercialLicenseTextHtml(
                sourceText.slice(
                    currentPosition,
                    range.start
                )
            );

        renderedHtml +=
            "<span class='non-commercial-license-sentence'>" +
            escapeNonCommercialLicenseTextHtml(
                sourceText.slice(
                    range.start,
                    range.end
                )
            ) +
            '</span>';

        currentPosition = range.end;
    });

    renderedHtml +=
        escapeNonCommercialLicenseTextHtml(
            sourceText.slice(
                currentPosition
            )
        );

    return renderedHtml;
}

function collectLicenseTextsFromResult(result) {
    if (
        !result ||
        !Array.isArray(result.licenses)
    ) {
        return [];
    }

    const licenseTexts = [];

    result.licenses.forEach(licenseItem => {
        if (!licenseItem) {
            return;
        }

        if (
            typeof licenseItem.licenseText ===
                "string" &&
            licenseItem.licenseText.trim()
        ) {
            licenseTexts.push(
                licenseItem.licenseText
            );
        }

        if (
            typeof extractLicenseDocumentText ===
            "function"
        ) {
            const extractedText =
                extractLicenseDocumentText(
                    licenseItem
                );

            if (
                typeof extractedText ===
                    "string" &&
                extractedText.trim()
            ) {
                licenseTexts.push(extractedText);
            }
        }

        const extractedById =
            licenseItem.extractedLicenseTextById;

        if (
            extractedById &&
            typeof extractedById === "object"
        ) {
            Object.values(extractedById).forEach(
                value => {
                    if (
                        typeof value === "string" &&
                        value.trim()
                    ) {
                        licenseTexts.push(value);
                        return;
                    }

                    if (
                        Array.isArray(value)
                    ) {
                        value.forEach(nestedValue => {
                            if (
                                typeof nestedValue ===
                                    "string" &&
                                nestedValue.trim()
                            ) {
                                licenseTexts.push(
                                    nestedValue
                                );
                            }
                        });

                        return;
                    }

                    if (
                        value &&
                        typeof value === "object"
                    ) {
                        Object.values(value).forEach(
                            nestedValue => {
                                if (
                                    typeof nestedValue ===
                                        "string" &&
                                    nestedValue.trim()
                                ) {
                                    licenseTexts.push(
                                        nestedValue
                                    );
                                }
                            }
                        );
                    }
                }
            );
        }
    });

    return Array.from(
        new Set(licenseTexts)
    );
}

function getNonCommercialResultMatches(
    result
) {
    if (
        !result ||
        !Array.isArray(result.licenses)
    ) {
        return [];
    }

    const allMatches = [];

    result.licenses.forEach(
        (licenseItem, licenseIndex) => {
            if (!licenseItem) {
                return;
            }

            const licenseIdentifier =
                getLicenseIdentifierForNonCommercialCheck(
                    licenseItem
                );

            const componentKey =
                typeof result.componentKey ===
                    'string'
                    ? result.componentKey
                    : '';

            const licenseTexts = [];

            if (
                typeof licenseItem.licenseText ===
                    'string' &&
                licenseItem.licenseText.trim()
            ) {
                licenseTexts.push(
                    licenseItem.licenseText
                );
            }

            if (
                typeof extractLicenseDocumentText ===
                'function'
            ) {
                const extractedText =
                    extractLicenseDocumentText(
                        licenseItem
                    );

                if (
                    typeof extractedText ===
                        'string' &&
                    extractedText.trim()
                ) {
                    licenseTexts.push(
                        extractedText
                    );
                }
            }

            const extractedById =
                licenseItem
                    .extractedLicenseTextById;

            if (
                extractedById &&
                typeof extractedById ===
                    'object'
            ) {
                Object.values(
                    extractedById
                ).forEach(value => {
                    if (
                        typeof value ===
                            'string' &&
                        value.trim()
                    ) {
                        licenseTexts.push(value);
                        return;
                    }

                    if (Array.isArray(value)) {
                        value.forEach(
                            nestedValue => {
                                if (
                                    typeof nestedValue ===
                                        'string' &&
                                    nestedValue.trim()
                                ) {
                                    licenseTexts.push(
                                        nestedValue
                                    );
                                }
                            }
                        );

                        return;
                    }

                    if (
                        value &&
                        typeof value ===
                            'object'
                    ) {
                        Object.values(
                            value
                        ).forEach(
                            nestedValue => {
                                if (
                                    typeof nestedValue ===
                                        'string' &&
                                    nestedValue.trim()
                                ) {
                                    licenseTexts.push(
                                        nestedValue
                                    );
                                }
                            }
                        );
                    }
                });
            }

            const uniqueLicenseTexts =
                Array.from(
                    new Set(licenseTexts)
                );

            uniqueLicenseTexts.forEach(
                (licenseText, textIndex) => {
                    const relevantMatches =
                        findRelevantNonCommercialLicenseTextMatches(
                            licenseText,
                            licenseIdentifier,
                            componentKey
                        );

                    relevantMatches.forEach(
                        match => {
                            allMatches.push({
                                ...match,
                                licenseIndex,
                                textIndex,
                                licenseText,
                                licenseIdentifier
                            });
                        }
                    );
                }
            );
        }
    );

    return allMatches;
}

function hasNonCommercialResultMatch(result) {
    return (
        getNonCommercialResultMatches(result)
            .length > 0
    );
}

function filterNonCommercialComponents() {
    window.__activeFilterMode =
        "non-commercial";

    document
        .querySelectorAll(".filter-btn")
        .forEach(button => {
            button.classList.remove(
                "active",
                "active-invalid",
                "active-warning",
                "active-valid",
                "active-non-commercial"
            );
        });

    const filterButton =
        document.getElementById(
            "filterNonCommercial"
        );

    if (filterButton) {
        filterButton.classList.add(
            "active"
        );
    }

    const table =
        document.getElementById(
            "componentsTable"
        );

    if (!table) {
        return;
    }

    const rows = Array.from(
        table.querySelectorAll(
            "tbody > tr"
        )
    );

    let currentSectionHeader = null;
    let currentSectionHasVisibleComponent =
        false;

    const sectionRecords = [];

    rows.forEach(row => {
        if (
            row.querySelector(
                ".section-header"
            )
        ) {
            if (currentSectionHeader) {
                sectionRecords.push({
                    header:
                        currentSectionHeader,
                    hasVisibleComponent:
                        currentSectionHasVisibleComponent
                });
            }

            currentSectionHeader = row;

            currentSectionHasVisibleComponent =
                false;

            row.style.display = "none";

            return;
        }

        if (
            row.classList.contains(
                "component-row"
            )
        ) {
            const shouldShow =
                row.dataset.nonCommercial ===
                "true";

            row.style.display =
                shouldShow
                    ? ""
                    : "none";

            if (shouldShow) {
                currentSectionHasVisibleComponent =
                    true;
            }

            const nextRow =
                row.nextElementSibling;

            if (
                nextRow &&
                nextRow.classList.contains(
                    "detail-row"
                )
            ) {
                nextRow.style.display =
                    shouldShow
                        ? ""
                        : "none";
            }
        }
    });

    if (currentSectionHeader) {
        sectionRecords.push({
            header:
                currentSectionHeader,
            hasVisibleComponent:
                currentSectionHasVisibleComponent
        });
    }

    sectionRecords.forEach(record => {
        record.header.style.display =
            record.hasVisibleComponent
                ? ""
                : "none";
    });

    [
        "licenseSummaryContainer",
        "categorySummaryContainer",
        "noCategorySummaryContainer",
        "invalidIssuesSummaryContainer"
    ].forEach(id => {
        const element =
            document.getElementById(id);

        if (element) {
            element.style.display = "none";
        }
    });

    table.style.display = "";
}

window.findNonCommercialLicenseTextMatches =
    findNonCommercialLicenseTextMatches;

window.hasNonCommercialLicenseTextMatch =
    hasNonCommercialLicenseTextMatch;

window.renderNonCommercialLicenseText =
    renderNonCommercialLicenseText;

window.collectLicenseTextsFromResult =
    collectLicenseTextsFromResult;

window.getNonCommercialResultMatches =
    getNonCommercialResultMatches;

window.hasNonCommercialResultMatch =
    hasNonCommercialResultMatch;

window.filterNonCommercialComponents =
    filterNonCommercialComponents;

window.normalizeNonCommercialReferenceText =
    normalizeNonCommercialReferenceText;

window.getLicenseIdentifierForNonCommercialCheck =
    getLicenseIdentifierForNonCommercialCheck;

window.getLicenseReferenceText =
    getLicenseReferenceText;

window.isNonCommercialSentenceInReferenceText =
    isNonCommercialSentenceInReferenceText;

window.filterReferenceLicenseTextMatches =
    filterReferenceLicenseTextMatches;

window.findRelevantNonCommercialLicenseTextMatches =
    findRelevantNonCommercialLicenseTextMatches;
;

function displayResults(sbomData, allResults, overallValid, filename, verbose, validationMode = 'standard', isManualMapping = false) {
    const resultsDiv = document.getElementById('results');
    currentValidationMode = validationMode;
    if (typeof resetTooldownloadState === 'function') {
        resetTooldownloadState();
    } else {
        tooldownloadRowRefs = new Map();
        nextRowId = 1;
    }

    if (Array.isArray(pendingImportedStatusEntries) && pendingImportedStatusEntries.length > 0) {
        pendingImportedStatusEntries.forEach(entry => {
            if (!entry || !Array.isArray(entry.changes)) return;
            const componentKey = typeof entry.rowId === 'string' && entry.rowId.trim()
                ? entry.rowId.trim()
                : '';
            if (!componentKey) return;
            const matchedResult = allResults.find((result, idx) =>
                (result.objectPath || `components[${idx}]`) === componentKey
            );
            if (!matchedResult) return;

            entry.changes.forEach(change => {
                if (!change || typeof change.field !== 'string' || typeof change.newValue !== 'string') return;
                const desiredStatus = change.newValue.trim().toLowerCase();
                if (change.field.startsWith('errorOverride:')) {
                    setManualOverride(componentKey, change.field.slice('errorOverride:'.length), desiredStatus === 'valid');
                } else if (change.field === 'falsePositiveOverride') {
                    setFalsePositiveOverride(componentKey, desiredStatus === 'invalid');
                } else if (change.field === 'status') {
                    const originalErrors = Array.isArray(matchedResult.errors) ? matchedResult.errors : [];
                    const errorMessages = originalErrors
                        .map(error => (typeof error === 'object' && error.message) ? error.message : String(error || ''))
                        .filter(Boolean);
                    clearManualOverrides(componentKey);
                    setFalsePositiveOverride(componentKey, false);
                    if (desiredStatus === 'valid') {
                        errorMessages.forEach(message => setManualOverride(componentKey, message, true));
                    } else if (desiredStatus === 'invalid' && errorMessages.length === 0) {
                        setFalsePositiveOverride(componentKey, true);
                    }
                }
            });
        });

        pendingImportedStatusEntries = null;
    }
    
    const effectiveResults = allResults.map((r, idx) => {
        const compKey = r.objectPath || `components[${idx}]`;
        const originalErrors = Array.isArray(r.errors) ? r.errors : [];
        const manualOverrides = getManualOverridesForComponent(compKey);
        const remainingErrors = originalErrors.filter(e => {
            const msg = (typeof e === 'object' && e.message) ? e.message : String(e || '');
            return !manualOverrides.has(msg);
        });
        const isFalsePositiveOverridden = typeof hasFalsePositiveOverride === 'function' && hasFalsePositiveOverride(compKey);
        const effectiveErrors = remainingErrors.length === 0 && isFalsePositiveOverridden
            ? [{ message: 'Manual override, false positive valid', category: 'structural' }]
            : remainingErrors;

        return {
            ...r,
            errors: effectiveErrors,
            valid: effectiveErrors.length === 0 && !isFalsePositiveOverridden,
            isFalsePositiveOverridden
        };
    });

        const NON_COMMERCIAL_ERROR_MESSAGE =
    'License text contains non-commercial sentence(s)';

        effectiveResults.forEach(result => {
            const nonCommercialMatches =
                typeof getNonCommercialResultMatches ===
                'function'
                    ? getNonCommercialResultMatches(
                        result
                    )
                    : [];

            result.nonCommercialMatches =
                nonCommercialMatches;

            result.hasNonCommercialMatch =
                nonCommercialMatches.length > 0;

            if (!result.hasNonCommercialMatch) {
                return;
            }

            if (!Array.isArray(result.errors)) {
                result.errors = [];
            }

            const alreadyHasNonCommercialError =
                result.errors.some(error => {
                    const message =
                        typeof error === 'object' &&
                        error !== null
                            ? error.message
                            : String(error || '');

                    return (
                        message ===
                        NON_COMMERCIAL_ERROR_MESSAGE
                    );
                });

            if (!alreadyHasNonCommercialError) {
                result.errors.push({
                    field: 'License',
                    category: 'non-commercial',
                    message:
                        NON_COMMERCIAL_ERROR_MESSAGE
                });
            }

            result.valid = false;
        });

    const nonCommercialCount =
    effectiveResults.filter(
        result =>
            result.hasNonCommercialMatch
    ).length;

    const validCount =
        effectiveResults.filter(
            result => result.valid
        ).length;

    const invalidCount =
        effectiveResults.length - validCount;

    const warningCount =
        effectiveResults.filter(
            result =>
                result.warnings &&
                result.warnings.length > 0
        ).length;

    const hasWarnings =
        effectiveResults.some(
            result =>
                result.warnings &&
                result.warnings.length > 0
        );

    const licenseSummary =
        buildLicenseSummary(
            effectiveResults
        );

    let invalidIssueSummary =
        buildInvalidIssueSummary(
            effectiveResults
        );

    const normalizeInvalidIssueMessage =
        value =>
            String(value || '')
                .replace(
                    / \(component-specific context\)$/,
                    ''
                )
                .trim();

    const getInvalidIssueGroupComponentCount =
        group => {
            const componentKeys = new Set();

            (group?.subgroups || []).forEach(
                subgroup => {
                    (
                        subgroup.components || []
                    ).forEach(component => {
                        const componentKey =
                            component.key ||
                            `${component.name || 'N/A'}::${component.version || 'N/A'}`;

                        componentKeys.add(
                            componentKey
                        );
                    });
                }
            );

            return componentKeys.size;
        };

    const movedNonCommercialSubgroups = [];

    invalidIssueSummary.forEach(group => {
        if (!Array.isArray(group.subgroups)) {
            return;
        }

        const remainingSubgroups = [];

        group.subgroups.forEach(subgroup => {
            const subgroupMessage =
                normalizeInvalidIssueMessage(
                    subgroup.originalIssue ||
                    subgroup.issue
                );

            if (
                subgroupMessage ===
                NON_COMMERCIAL_ERROR_MESSAGE
            ) {
                movedNonCommercialSubgroups.push(
                    subgroup
                );

                return;
            }

            remainingSubgroups.push(
                subgroup
            );
        });

        group.subgroups =
            remainingSubgroups;

        group.count =
            getInvalidIssueGroupComponentCount(
                group
            );
    });

    invalidIssueSummary =
        invalidIssueSummary.filter(group =>
            Array.isArray(group.subgroups) &&
            group.subgroups.length > 0
        );

    if (
        movedNonCommercialSubgroups.length > 0
    ) {
        const nonCommercialGroup = {
            group: 'Non-Commercial Issues',
            subgroups:
                movedNonCommercialSubgroups,
            count: 0
        };

        nonCommercialGroup.count =
            getInvalidIssueGroupComponentCount(
                nonCommercialGroup
            );

        const licenseGroupIndex =
            invalidIssueSummary.findIndex(group =>
                String(group.group || '')
                    .trim()
                    .toLowerCase() ===
                'license related issues'
            );

        if (licenseGroupIndex >= 0) {
            invalidIssueSummary.splice(
                licenseGroupIndex + 1,
                0,
                nonCommercialGroup
            );
        } else {
            invalidIssueSummary.unshift(
                nonCommercialGroup
            );
        }
    }
    const categorySummaryMap = new Map();
    const noCategoryLicenseMap = new Map();
    const showChangeLog = validationMode === 'standard' || validationMode === 'standard-internal' || validationMode === 'tooldownload';

    if (pendingTooldownloadStatusChange && typeof pendingTooldownloadStatusChange === 'object') {
        const context = pendingTooldownloadStatusChange;
        const matchedResult = effectiveResults.find((result, idx) =>
            (result.objectPath || `components[${idx}]`) === context.componentKey
        );
        const nextStatus = matchedResult && matchedResult.valid ? 'valid' : 'invalid';
        if (context.previousStatus && context.previousStatus !== nextStatus) {
            editChangeLog.push({
                timestamp: new Date().toISOString(),
                rowId: context.componentKey,
                section: matchedResult?.section || context.section || '',
                name: matchedResult?.name || context.name || '',
                changes: [{
                    field: 'status',
                    oldValue: context.previousStatus,
                    newValue: nextStatus
                }]
            });
        }
        pendingTooldownloadStatusChange = null;
    }

    window.__licenseTextModalCache = {};
    let licenseTextModalCounter = 0;

    const registerLicenseText = (
    text,
    title,
    subtitle,
    editContext = null
    ) => {
        const key = `lt_${licenseTextModalCounter++}`;

        window.__licenseTextModalCache[key] = {
            text: typeof text === 'string' ? text : '',
            originalText: typeof text === 'string' ? text : '',
            title: typeof title === 'string' ? title : 'License Text',
            subtitle: typeof subtitle === 'string' ? subtitle : '',
            editable: Boolean(editContext?.editable),
            componentKey: editContext?.componentKey || '',
            licenseName: editContext?.licenseName || '',
            licenseItem: editContext?.licenseItem || null,
            evidenceIndex: Number.isInteger(editContext?.evidenceIndex)
                ? editContext.evidenceIndex
                : -1
        };

        return key;
    };

    const extractStandaloneCategories = (licenses) => {
        if (!Array.isArray(licenses)) {
            return [];
        }

        const values = [];
        licenses.forEach(lic => {
            const raw = (lic && typeof lic.licenseMatchCategory === 'string')
                ? lic.licenseMatchCategory.trim()
                : '';
            if (!raw) {
                return;
            }

            raw.split(',')
                .map(part => part.trim())
                .filter(Boolean)
                .forEach(part => values.push(part));
        });

        return Array.from(new Set(values));
    };

    const collectNoCategoryLicenseNames = (licenseItem) => {
        const unresolvedTerms = Array.isArray(licenseItem && licenseItem.unmatchedReferenceTerms)
            ? licenseItem.unmatchedReferenceTerms.map(term => (typeof term === 'string' ? term.trim() : '')).filter(Boolean)
            : [];

        if (unresolvedTerms.length > 0) {
            return Array.from(new Set(unresolvedTerms));
        }

        const fallbackName = extractLicenseName(licenseItem);
        return fallbackName ? [fallbackName] : [];
    };

    const renderLicenseTermBadges = (licenseItem, componentResult, unmatchedTerms) => {
        const licenseName = extractLicenseName(licenseItem);
        const operator = getLicenseOperator(licenseName);
        const terms = splitLicenseTerms(licenseName, operator);
        if (!operator || terms.length < 2) return '';

        const termEvidenceIndexMap = {};
        if (Array.isArray(licenseItem.sourceItems)) {
            licenseItem.sourceItems.forEach(sourceItem => {
                const termName = sourceItem.licenseName;
                const evidenceIndex = typeof sourceItem.evidenceIndex === 'number' ? sourceItem.evidenceIndex : -1;
                if (termName && evidenceIndex >= 0) {
                    if (!termEvidenceIndexMap[termName] || evidenceIndex < termEvidenceIndexMap[termName]) {
                        termEvidenceIndexMap[termName] = evidenceIndex;
                    }
                }
            });
        }

        const percentByTerm = new Map();
        const match = typeof licenseItem.licenseMatchInfo === 'string'
            ? licenseItem.licenseMatchInfo.match(/^(AND|OR|GROUPED):\s*(.+)$/)
            : null;
        if (match) {
            match[2].split(',').forEach(part => {
                const equalsIndex = part.lastIndexOf('=');
                if (equalsIndex <= 0) return;
                const term = part.slice(0, equalsIndex).trim();
                const percent = Number(part.slice(equalsIndex + 1).trim().replace(/%$/, ''));
                if (Number.isFinite(percent)) percentByTerm.set(term.toLowerCase(), percent);
            });
        }

        const expressionLeaves = operator === 'GROUPED'
            ? (() => {
                const parsed = parseLicenseExpressionTree(licenseName);
                return parsed.tree ? getLicenseExpressionLeafJoins(parsed.tree) : [];
            })()
            : [];

        return terms.map((term, termIndex) => {
            const expressionLeaf = expressionLeaves[termIndex] || null;
            const percent = percentByTerm.get(term.toLowerCase());
            const hasPercent = Number.isFinite(percent);
            const percentDisplay = hasPercent
                ? (Number.isInteger(percent) ? String(percent) : String(percent.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'))
                : '';
            const termClass = hasPercent && percent >= 80
                ? 'license-expression-valid'
                : 'license-expression-invalid';
            const evidenceIndex = termEvidenceIndexMap[term] ?? -1;
            const termText = getExtractedLicenseText(licenseItem.extractedLicenseTextById || {}, term, evidenceIndex)
                || extractLicenseDocumentText(licenseItem)
                || '';
            const modalKey = registerLicenseText(termText, term, componentResult.name || '');
            const manualPairingIcon = unmatchedTerms.includes(term)
                ? `<button type="button" class="manual-license-map-trigger" onclick="openManualLicenseMappingModal('${escapeHtml(term)}', this)" title="Manually pair this unresolved license to a reference SPDX ID">🔗 Match</button>`
                : '';
            const percentHtml = hasPercent
                ? `<span class="license-expression-percent">${escapeHtml(percentDisplay)}%</span>`
                : '';
            const openGroup = expressionLeaf && expressionLeaf.openBefore > 0
                ? `<span class="license-expression-group">${'('.repeat(expressionLeaf.openBefore)}</span>`
                : '';
            const closeGroup = expressionLeaf && expressionLeaf.closeAfter > 0
                ? `<span class="license-expression-group">${')'.repeat(expressionLeaf.closeAfter)}</span>`
                : '';
            return `${openGroup}<span class="license-expression-term"><button type="button" class="license-expression-badge license-text-trigger ${termClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="View SBOM license text"><span class="license-expression-name">${escapeHtml(term)}</span>${percentHtml}</button>${manualPairingIcon}</span>${closeGroup}`;
            }).join(` <span class="license-expression-operator" style="margin:0 6px;font-weight:700;color:#52606d;">${escapeHtml(operator)}</span> `);
    };

    effectiveResults.forEach(result => {
        const categoryValues = extractStandaloneCategories(result.licenses || []);

        const component = {
            name: result.name || 'N/A',
            version: result.version || 'N/A',
            key: result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`
        };

        if (categoryValues.length === 0) {
            if (!categorySummaryMap.has('No Category')) {
                categorySummaryMap.set('No Category', []);
            }
            categorySummaryMap.get('No Category').push(component);
        } else {
            categoryValues.forEach(category => {
                if (!categorySummaryMap.has(category)) {
                    categorySummaryMap.set(category, []);
                }
                categorySummaryMap.get(category).push(component);
            });
        }

        (result.licenses || []).forEach(licenseItem => {
            const hasUnmatchedTerms = Array.isArray(licenseItem && licenseItem.unmatchedReferenceTerms)
                && licenseItem.unmatchedReferenceTerms.length > 0;
            const categoryRaw = (licenseItem && typeof licenseItem.licenseMatchCategory === 'string')
                ? licenseItem.licenseMatchCategory.trim()
                : '';

            if (categoryRaw && !hasUnmatchedTerms) {
                return;
            }

            const names = collectNoCategoryLicenseNames(licenseItem);
            names.forEach(name => {
                const key = name.toLowerCase();
                if (!noCategoryLicenseMap.has(key)) {
                    noCategoryLicenseMap.set(key, {
                        licenseName: name,
                        count: 0
                    });
                }

                noCategoryLicenseMap.get(key).count += 1;
            });
        });
    });

    const categorySummary = Array.from(categorySummaryMap.entries())
        .map(([category, components]) => {
            const seen = new Set();
            const uniqueComponents = components.filter(component => {
                const key = `${component.name}::${component.version}`;
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            });

            return {
                category,
                components: uniqueComponents,
                count: uniqueComponents.length
            };
        })
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

    const noCategoryLicenseSummary = Array.from(noCategoryLicenseMap.values())
        .sort((a, b) => b.count - a.count || a.licenseName.localeCompare(b.licenseName));
    
    const validationModeLabel = validationMode === 'internal'
        ? 'Internal Development (PURL required)'
        : validationMode === 'standard-internal'
            ? 'Standard Software Internal (Name, Version, Licenses required)'
            : validationMode === 'tooldownload'
                ? 'Tooldownload (Name, Version, Licenses, Copyright required + editing + AI enrichment)'
                : 'Standard Software (Name, Version, Licenses, Copyright required)';

    const copyleftComponents = effectiveResults
        .filter(result => (result.licenses || []).some(licenseItem =>
            typeof licenseItem?.licenseMatchCategory === 'string'
            && licenseItem.licenseMatchCategory.toLowerCase().includes('copyleft')
        ))
        .map(result => ({
            name: result.name || 'N/A',
            version: result.version || 'N/A',
            key: result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`
        }));

    window.__invalidIssueExportData = {
        filename,
        validationMode: validationModeLabel,
        validationModeKey: validationMode,
        totalComponents: effectiveResults.length,
        invalidCount,
        copyleftComponents,
        summary: invalidIssueSummary
    };

    let html = '';

    const safeFilename = escapeHtml(filename);
    if (overallValid && invalidCount === 0) {
        html += `<div class="validation-result success">
            <h2>✓ Validation Successful!</h2>
            <p>${isManualMapping ? 'Mapped SBOM fields passed validation.' : `SBOM file "${safeFilename}" is valid against the schema.`}</p>
        </div>`;
    } else if (hasWarnings && invalidCount === 0) {
        html += `<div class="validation-result warning">
            <h2>⚠ Validation Completed with Warnings</h2>
            <p>The SBOM is valid but has some recommendations.</p>
        </div>`;
    } else {
        html += `<div class="validation-result error">
            <h2>X Validation Failed</h2>
            <p>${isManualMapping ? 'Mapped SBOM fields contain validation errors.' : `SBOM file "${safeFilename}" has validation errors.`}</p>
        </div>`;
    }

    const specVersion = (sbomData instanceof Document)
        ? (sbomData.documentElement.getAttribute('version') || 'N/A')
        : escapeHtml(sbomData.spdxVersion || sbomData.specVersion || 'N/A');
        
    html += `<div class="summary">
        <div class="summary-card">
            <h3>${specVersion}</h3>
            <p>Spec Version</p>
        </div>
        <div class="summary-card">
            <h3>${allResults.length}</h3>
            <p>Total Components</p>
        </div>
        <div class="summary-card">
            <h3>${validCount}</h3>
            <p>Valid Components</p>
        </div>
        <div class="summary-card">
            <h3>${invalidCount}</h3>
            <p>Invalid Components</p>
        </div>
    </div>`;
    
    const toJsStringLiteral = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');

    html += `<div style="margin: 20px 0; padding: 15px; background: var(--color-grey-100); border-left: 4px solid var(--color-vivid-green-600); border-radius: 4px;">
        <strong>Validation Mode:</strong> ${escapeHtml(validationModeLabel)}
    </div>`;

    if (showChangeLog) {
        html += `<div id="changeStatusBanner" class="change-status">Changes made: NO</div>`;
        html += `<div id="changeLogWrap" class="change-log-wrap">
            <div class="change-log-header">
                <span class="change-log-status-text" id="changeLogCount">0 entries</span>
                <button id="changeLogToggleBtn" class="change-log-toggle-btn" onclick="toggleChangeLog()">&#9660;</button>
                <button id="importChangeLogBtn" class="change-log-btn" onclick="importChangeLog()">Import Change Log</button>
                <button id="downloadChangeLogBtn" class="change-log-btn" onclick="downloadChangeLog()" disabled>Download Change Log</button>
                ${validationMode === 'tooldownload' ? '<button id="downloadEditedSbomBtn" class="change-log-btn" onclick="downloadEditedSbom()">Download Edited SBOM</button>' : ''}
            </div>
            <hr class="change-log-divider">
            <div class="change-log-body">
                <div id="changeLogEntries" class="change-log-entries" style="display:none;"></div>
            </div>
            <input id="changeLogImportInput" type="file" accept="application/json,.json" style="display:none;" onchange="handleChangeLogImport(event)">
        </div>`;
    }

    html += `<div class="filter-bar">
        <span class="filter-bar-label">Filter:</span>
        <button class="filter-btn active" id="filterAll" onclick="filterTable('all')">All (${allResults.length})</button>
        <button class="filter-btn" id="filterInvalid" onclick="filterTable('invalid')">&#x2717; Invalid (${invalidCount})</button>
        <button class="filter-btn" id="filterWarning" onclick="filterTable('warning')">&#x26A0; Warning (${warningCount})</button>
        <button class="filter-btn" id="filterValid" onclick="filterTable('valid')">&#x2713; Valid (${validCount})</button>
        <button class="filter-btn" id="filterNonCommercial" onclick="filterNonCommercialComponents()">Non-commercial (${nonCommercialCount})</button>
        <button class="filter-btn" id="filterLicenses" onclick="filterTable('licenses')">Licenses (${licenseSummary.length})</button>
        <button class="filter-btn" id="filterCategory" onclick="filterTable('category')">Category (${categorySummary.length})</button>
        <button class="filter-btn" id="filterNoCategory" onclick="filterTable('no-category')">No Category (${noCategoryLicenseSummary.length})</button>
        <button class="filter-btn" id="filterInvalidIssues" onclick="filterTable('invalid-issues')">Invalid Issues (${invalidIssueSummary.length})</button>
        <button class="filter-btn invalid-issues-export-btn" id="exportInvalidIssues" onclick="downloadInvalidIssuesReport()" title="Export Plausibility Check Results">&#x2B07; Export Plausibility Check Results</button>
    </div>`;

    html += `<div id="licenseSummaryContainer" style="display:none;">
        <table class="components-table" id="licenseSummaryTable">
            <thead>
                    <tr>
                        <th>License</th>
                        <th>Components</th>
                    </tr>
            </thead>
            <tbody>`;

    licenseSummary.forEach((item, idx) => {
        const rowId = `licenseGroup_${idx}`;
        const componentsHtml = (item.components || []).map(compKey => {
            const matchingResult = effectiveResults.find(result =>
                (result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`) === compKey
            );
            const parts = String(compKey).split('::');
            const name = matchingResult?.name || parts[0] || 'N/A';
            const version = matchingResult?.version || parts[1] || 'N/A';
            return `<div><button type="button" class="summary-component-link" data-component-key="${escapeHtml(compKey)}" onclick="showComponentInAllView(this.dataset.componentKey)">${escapeHtml(name)} ${escapeHtml(version)}</button></div>`;
        }).join('');

        html += `<tr>
            <td>
                <button class="filter-btn" style="padding:0 8px;min-width:28px;line-height:22px;" onclick="toggleCategoryGroup('${rowId}', this)">+</button>
                ${escapeHtml(item.license)}
            </td>
            <td>${item.count}</td>
        </tr>
        <tr id="${rowId}" style="display:none;">
            <td colspan="2" style="padding-left:42px;">
                ${componentsHtml}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;

    html += `<div id="categorySummaryContainer" style="display:none;">
        <table class="components-table" id="categorySummaryTable">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Components</th>
                </tr>
            </thead>
            <tbody>`;

    categorySummary.forEach((item, idx) => {
        const rowId = `categoryGroup_${idx}`;
        const componentsHtml = item.components.map(component =>
            `<div><button type="button" class="summary-component-link" data-component-key="${escapeHtml(component.key || `${component.name}::${component.version}`)}" onclick="showComponentInAllView(this.dataset.componentKey)">${escapeHtml(component.name)} ${escapeHtml(component.version)}</button></div>`
        ).join('');

        html += `<tr>
            <td>
                <button class="filter-btn" style="padding:0 8px;min-width:28px;line-height:22px;" onclick="toggleCategoryGroup('${rowId}', this)">+</button>
                ${escapeHtml(item.category)}
            </td>
            <td>${item.count}</td>
        </tr>
        <tr id="${rowId}" style="display:none;">
            <td colspan="2" style="padding-left:42px;">
                ${componentsHtml}
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;

    html += `<div id="invalidIssuesSummaryContainer" style="display:none;">
        <table class="components-table" id="invalidIssuesSummaryTable">
            <thead>
                <tr>
                    <th>Invalid Issue Group</th>
                    <th>Components</th>
                    <th style="width:140px; text-align:right;">Action</th>
                </tr>
            </thead>
            <tbody>`;

    invalidIssueSummary.forEach((group, groupIdx) => {
        const mainRowId = `invalidIssueMainGroup_${groupIdx}`;

        html += `<tr>
            <td>
                <button class="filter-btn" style="padding:0 8px;min-width:28px;line-height:22px;" onclick="toggleInvalidIssueGroup('${mainRowId}', this)">+</button>
                ${escapeHtml(group.group)}
            </td>
            <td>${group.count}</td>
        </tr>
        <tr id="${mainRowId}" style="display:none;" data-invalid-issue-group="${escapeHtml(group.group)}">
            <td colspan="2" style="padding-left:30px;">
                <table class="components-table" style="margin:8px 0;">
                    <thead>
                        <tr>
                            <th>Issue</th>
                            <th>Components</th>
                        </tr>
                    </thead>
                    <tbody>`;

        group.subgroups.forEach((subgroup, subIdx) => {
            const subRowId = `invalidIssueSubGroup_${groupIdx}_${subIdx}`;
            const noteIssueText = subgroup.originalIssue || subgroup.issue.replace(/ \(component-specific context\)$/, '') || subgroup.issue;
            const issueNote = subgroup.note || '';
            const soloComponent = subgroup.componentSpecific ? (subgroup.components && subgroup.components[0]) : null;
            const soloComponentKey = soloComponent ? (soloComponent.key || `${soloComponent.name || 'N/A'}::${soloComponent.version || 'N/A'}`) : '';
            const soloComponentName = soloComponent ? (soloComponent.name || 'N/A') : '';
            const issueNoteIcon = issueNote
                ? `<span class="invalid-issue-note-badge" title="${escapeHtml(issueNote)}">📝</span>`
                : '';
            const issueTriggerAttrs = subgroup.componentSpecific
                ? soloComponent
                    ? `data-invalid-issue-scope="component" data-invalid-issue-text="${escapeHtml(soloComponent.originalIssue || noteIssueText)}" data-invalid-issue-component-key="${escapeHtml(soloComponentKey)}" data-invalid-issue-component-name="${escapeHtml(soloComponentName)}" data-invalid-issue-main-row-id="${escapeHtml(mainRowId)}" data-invalid-issue-sub-row-id="${escapeHtml(subRowId)}" data-invalid-issue-group="${escapeHtml(group.group)}"`
                    : ''
                : `data-invalid-issue-scope="issue" data-invalid-issue-text="${escapeHtml(noteIssueText)}" data-invalid-issue-main-row-id="${escapeHtml(mainRowId)}" data-invalid-issue-sub-row-id="${escapeHtml(subRowId)}" data-invalid-issue-group="${escapeHtml(group.group)}"`;
            const issueLabel = subgroup.componentSpecific && !soloComponent
                ? `<span>${escapeHtml(subgroup.issue)}</span>`
                : `<span class="invalid-issue-message-trigger" ${issueTriggerAttrs} title="Click to edit this error message / context">${escapeHtml(subgroup.issue)}</span>`;
            const componentsHtml = subgroup.components.map(component => {
                const componentKey = component.key || `${component.name || 'N/A'}::${component.version || 'N/A'}`;
                const componentIssueText = component.originalIssue || noteIssueText;
                const componentNote = component.note || getInvalidIssueContext(componentIssueText, componentKey) || '';
                const componentNoteIcon = componentNote
                    ? `<span class="invalid-issue-note-badge" title="${escapeHtml(componentNote)}">📝</span>`
                    : '';
                return `<div class="invalid-issue-component-entry invalid-issue-message-trigger" data-invalid-issue-scope="component" data-invalid-issue-component-key="${escapeHtml(componentKey)}" data-invalid-issue-component-name="${escapeHtml(component.name || 'N/A')}" data-invalid-issue-text="${escapeHtml(componentIssueText)}" data-invalid-issue-main-row-id="${escapeHtml(mainRowId)}" data-invalid-issue-sub-row-id="${escapeHtml(subRowId)}" data-invalid-issue-group="${escapeHtml(group.group)}" title="Click to edit this component's error message / context"><button type="button" class="summary-component-link" data-component-key="${escapeHtml(componentKey)}" onclick="event.stopPropagation(); showComponentInAllView(this.dataset.componentKey)">${escapeHtml(component.name)} ${escapeHtml(component.version)}</button>${componentNoteIcon}</div>`;
            }).join('');
            html += `<tr data-invalid-issue-text="${escapeHtml(noteIssueText)}" data-invalid-issue-group="${escapeHtml(group.group)}">
                <td>
                    <button class="filter-btn" style="padding:0 8px;min-width:28px;line-height:22px;" onclick="event.stopPropagation(); toggleInvalidIssueGroup('${subRowId}', this)">+</button>
                    ${issueLabel}${issueNoteIcon}
                </td>
                <td>${subgroup.count}</td>
            </tr>
            <tr id="${subRowId}" style="display:none;" data-invalid-issue-text="${escapeHtml(noteIssueText)}" data-invalid-issue-group="${escapeHtml(group.group)}">
                <td colspan="2" style="padding-left:42px;">
                    ${componentsHtml}
                </td>
            </tr>`;
        });

        html += `</tbody></table>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;

    html += `<div id="noCategorySummaryContainer" style="display:none;">
        <table class="components-table" id="noCategorySummaryTable">
            <thead>
                <tr>
                    <th>License (No Category)</th>
                    <th>Occurrences</th>
                    <th>Manual Match</th>
                </tr>
            </thead>
            <tbody>`;

    noCategoryLicenseSummary.forEach(item => {
        html += `<tr>
            <td>${escapeHtml(item.licenseName)}</td>
            <td>${item.count}</td>
            <td><button type="button" class="manual-license-map-trigger" onclick="openManualLicenseMappingModal('${escapeHtml(item.licenseName)}', this)" title="Manually pair this unresolved license to a reference SPDX ID">🔗 Match</button></td>
        </tr>`;
    });

    if (noCategoryLicenseSummary.length === 0) {
        html += `<tr><td colspan="3"><em>No unresolved licenses without category.</em></td></tr>`;
    }

    html += `</tbody></table></div>`;

    const showTypeAndPurl = validationMode === 'internal';
    const resultColumnCount = validationMode === 'tooldownload'
        ? (showTypeAndPurl ? '11' : '9')
        : (showTypeAndPurl ? '10' : '8');
    html += `<table class="components-table" id="componentsTable">
        <thead>
            <tr>
                <th>Section</th>
                <th>Name</th>
                <th>Version</th>
                ${showTypeAndPurl ? '<th>Type</th><th>PURL</th>' : ''}
                <th>Licenses</th>
                <th>Copyright</th>
                <th>Category</th>
                <th>Source</th>
                <th>Status</th>
                ${validationMode === 'tooldownload' ? '<th>Action</th>' : ''}
            </tr>
        </thead>
        <tbody>`;

    window.__lastDisplayState = { sbomData, allResults, overallValid, filename, verbose, validationMode, isManualMapping };

    let currentSection = '';
    effectiveResults.forEach((result, resultIdx) => {
        if (result.section !== currentSection) {
            html += `<tr><td colspan="${resultColumnCount}" class="section-header">${escapeHtml(result.section)}</td></tr>`;
            currentSection = result.section;
        }

        const indentClass = result.indent > 0 ? 'nested' : '';

        const compKey = result.objectPath || `components[${resultIdx}]`;

        const originalErrors = Array.isArray(result.errors) ? result.errors : [];
        const manualOverrides = getManualOverridesForComponent(compKey);
        const filteredErrors = originalErrors.filter(e => {
            const msg = (typeof e === 'object' && e.message) ? e.message : String(e || '');
            return !manualOverrides.has(msg);
        });

        const isNowValid = filteredErrors.length === 0;
        const isFalsePositiveOverridden = result.isFalsePositiveOverridden || false;
        const isEffectivelyValid = isNowValid && !isFalsePositiveOverridden;
        const statusClass = isEffectivelyValid ? 'status-valid' : 'status-invalid';
        const statusText = isEffectivelyValid ? '✓ Valid' : 'X Invalid';

        let licensesHtml = '';
        const renderedCanonicalExpressions = new Set();
        if (result.licenses.length > 0) {
            result.licenses.forEach(lic => {
                const unmatchedTerms = Array.isArray(lic.unmatchedReferenceTerms)
                    ? lic.unmatchedReferenceTerms
                    : [];
                const hasMatchPercent = typeof lic.licenseMatchPercent === 'number' && Number.isFinite(lic.licenseMatchPercent);
                const formattedPercent = hasMatchPercent
                    ? (Number.isInteger(lic.licenseMatchPercent)
                        ? String(lic.licenseMatchPercent)
                        : String(lic.licenseMatchPercent.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'))
                    : '';
                const matchPercentLabel = hasMatchPercent ? ` (${formattedPercent}%)` : '';
                const matchInfoLabel = lic.licenseMatchInfo ? ` - ${escapeHtml(lic.licenseMatchInfo)}` : '';
                const percentClass = hasMatchPercent && lic.licenseMatchPercent >= 80
                    ? 'license-expression-valid'
                    : 'license-expression-invalid';

                if (lic.licenseName) {
                    const canonicalGroupKey = '__all_component_license_badges__';
                    if (renderedCanonicalExpressions.has(canonicalGroupKey)) return;
                    renderedCanonicalExpressions.add(canonicalGroupKey);

                    const canonicalItems = result.licenses.filter(item => item.licenseName);
                    const badgeGroupId = `license-badge-group-${resultIdx}`;
                    const expressionJoinCache = new Map();
                    const getJoinOperatorsForExpression = (expression) => {
                        if (!expression) return [];
                        if (expressionJoinCache.has(expression)) return expressionJoinCache.get(expression);
                        const parsed = parseLicenseExpressionTree(expression);
                        let joins = [];
                        if (parsed.tree) {
                            joins = getLicenseExpressionLeafJoins(parsed.tree);
                        } else {
                            const flatOperator = getLicenseOperator(expression);
                            const flatTerms = splitLicenseTerms(expression, flatOperator);
                            if ((flatOperator === 'AND' || flatOperator === 'OR') && flatTerms.length > 1) {
                                joins = flatTerms.map((term, index) => ({
                                    term,
                                    joinAfter: index < flatTerms.length - 1 ? flatOperator : null,
                                    openBefore: 0,
                                    closeAfter: 0
                                }));
                            }
                        }
                        expressionJoinCache.set(expression, joins);
                        return joins;
                    };
                    let expressionRunStartIndex = 0;
                    const canonicalBadges = canonicalItems.map((item, itemIndex) => {
                        const canonicalLicenseName = String(item.licenseName || 'Unknown');
                        const canonicalNameEscaped = escapeHtml(canonicalLicenseName);
                        const canonicalPercentMatch = typeof item.licenseMatchInfo === 'string'
                            ? item.licenseMatchInfo.match(new RegExp(`${canonicalLicenseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=(\\d+(?:\\.\\d+)?)%`))
                            : null;
                        const canonicalPercent = Number.isFinite(item.licenseTermMatchPercent)
                            ? item.licenseTermMatchPercent
                            : canonicalPercentMatch
                            ? Number(canonicalPercentMatch[1])
                            : item.licenseMatchPercent;
                        const canonicalHasMatchPercent = typeof canonicalPercent === 'number' && Number.isFinite(canonicalPercent);
                        const canonicalFormattedPercent = canonicalHasMatchPercent
                            ? (Number.isInteger(canonicalPercent)
                                ? String(canonicalPercent)
                                : String(canonicalPercent.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'))
                            : '';
                        const canonicalPercentClass = canonicalHasMatchPercent && canonicalPercent >= 80
                            ? 'license-expression-valid'
                            : 'license-expression-invalid';
                        const referenceTitle = item.licenseReferenceSpdxId
                            ? `Compared to (${item.licenseReferenceSpdxId})`
                            : 'Compared to (reference license text)';
                        const licenseTextOverrideKey = [
                            result.name || '',
                            result.version || '',
                            Number.isInteger(item.evidenceIndex) && item.evidenceIndex >= 0
                                ? `${canonicalLicenseName}#${item.evidenceIndex}`
                                : canonicalLicenseName
                        ]
                            .map(value => String(value).trim().toLowerCase())
                            .join('::');

                        const hasManualLicenseText =
                            manualLicenseTextOverrides.has(
                                licenseTextOverrideKey
                            );

                        const displayedLicenseText =
                            hasManualLicenseText
                                ? manualLicenseTextOverrides.get(
                                    licenseTextOverrideKey
                                )
                                : extractLicenseDocumentText(item) || '';

                        const modalKey = registerLicenseText(
                            displayedLicenseText,
                            canonicalLicenseName,
                            result.name || '',
                            {
                                editable: validationMode === 'tooldownload',
                                componentKey: compKey,
                                licenseName: canonicalLicenseName,
                                licenseItem: item,
                                evidenceIndex: Number.isInteger(item.evidenceIndex)
                                    ? item.evidenceIndex
                                    : -1
                            }
                        );
                        const manualPairingIcon = Array.isArray(item.unmatchedReferenceTerms) && item.unmatchedReferenceTerms.includes(canonicalLicenseName)
                            ? `<button type="button" class="manual-license-map-trigger" onclick="openManualLicenseMappingModal('${escapeHtml(canonicalLicenseName)}', this)" title="Manually pair this unresolved license to a reference SPDX ID">🔗 Match</button>`
                            : '';
                        const badge = canonicalHasMatchPercent
                            ? `<button type="button" class="license-expression-badge license-text-trigger ${canonicalPercentClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="${escapeHtml(referenceTitle)}"><span class="license-expression-name">${canonicalNameEscaped}</span><span class="license-expression-percent">${escapeHtml(canonicalFormattedPercent)}%</span></button>`
                            : `<span class="license-expression-name">${canonicalNameEscaped}</span>`;
                        const previousItem = canonicalItems[itemIndex - 1];
                        const sameExpressionAsPrevious = Boolean(previousItem) && previousItem.expression === item.expression;
                        if (!sameExpressionAsPrevious) {
                            expressionRunStartIndex = itemIndex;
                        }
                        const positionInRun = itemIndex - expressionRunStartIndex;
                        const expressionLeaves = getJoinOperatorsForExpression(item.expression);
                        const currentLeaf = expressionLeaves[positionInRun] || null;
                        const previousLeaf = positionInRun > 0 ? expressionLeaves[positionInRun - 1] : null;
                        const operator = sameExpressionAsPrevious && previousLeaf
                            ? (previousLeaf.joinAfter || '')
                            : '';
                        const openGroup = currentLeaf && currentLeaf.openBefore > 0
                            ? `<span class="license-expression-group">${'('.repeat(currentLeaf.openBefore)}</span>`
                            : '';
                        const closeGroup = currentLeaf && currentLeaf.closeAfter > 0
                            ? `<span class="license-expression-group">${')'.repeat(currentLeaf.closeAfter)}</span>`
                            : '';
                        const initialDisplay = itemIndex < 3 ? 'inline-flex' : 'none';
                        return `<span class="license-expression-piece" data-badge-index="${itemIndex}" style="display:${initialDisplay}">${operator}${openGroup}<span class="license-expression-term">${badge}${manualPairingIcon}</span>${closeGroup}</span>`;
                    }).join('');
                    const hasMoreBadges = canonicalItems.length > 3;
                    const moreButton = hasMoreBadges
                        ? `<button type="button" class="license-badge-toggle" onclick="toggleLicenseBadges('${badgeGroupId}', this)" aria-expanded="false" title="Show all licenses">Show</button>`
                        : '';
                    licensesHtml += `<div class="license-item"><span id="${badgeGroupId}" class="license-expression-list license-expression-inline license-badge-group">${canonicalBadges}${moreButton}</span></div>`;
                } else if (lic.license) {
                    const originalLicenseName = (lic.license.id || lic.license.name || 'Unknown');
                    const licenseText = escapeHtml(originalLicenseName);
                    const showManualPairing = unmatchedTerms.length > 0;
                    const manualPairingIcon = showManualPairing
                        ? `<button type="button" class="manual-license-map-trigger" onclick="openManualLicenseMappingModal('${escapeHtml(originalLicenseName)}', this)" title="Manually pair this unresolved license to a reference SPDX ID">🔗 Match</button>`
                        : '';
                    const termBadges = renderLicenseTermBadges(lic, result, unmatchedTerms);
                    if (termBadges) {
                        licensesHtml += `<div class="license-item">${licenseText}<span class="license-expression-list">${termBadges}</span></div>`;
                    } else if (hasMatchPercent) {
                        const extractedById = lic.extractedLicenseTextById || {};
                        const licenseIdKey = lic.license.id || lic.license.name || '';
                        let evidenceIndex = -1;
                        if (Array.isArray(lic.sourceItems)) {
                            const sourceItem = lic.sourceItems.find(s => s.licenseName === licenseIdKey);
                            if (sourceItem && typeof sourceItem.evidenceIndex === 'number') {
                                evidenceIndex = sourceItem.evidenceIndex;
                            }
                        }
                        const extractedText = getExtractedLicenseText(extractedById, licenseIdKey, evidenceIndex) || '';
                        const inlineLicenseText = extractLicenseDocumentText(lic) || '';
                        const modalKey = registerLicenseText(
                            extractedText || inlineLicenseText,
                            licenseIdKey || 'Unknown',
                            result.name || ''
                        );
                        licensesHtml += `<div class="license-item"><span class="license-expression-list"><span class="license-expression-term"><button type="button" class="license-expression-badge license-text-trigger ${percentClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="View SBOM license text"><span class="license-expression-name">${licenseText}</span><span class="license-expression-percent">${escapeHtml(formattedPercent)}%</span></button>${manualPairingIcon}</span></span></div>`;
                    } else {
                        licensesHtml += `<div class="license-item">${licenseText}${matchInfoLabel}${manualPairingIcon}</div>`;
                    }
                } else if (lic.expression) {
                    const sourceLabel = lic.source === 'concluded'
                        ? `<span class="license-source-badge license-source-concluded" title="licenseConcluded">⚖ Concluded</span>`
                        : lic.source === 'declared'
                            ? `<span class="license-source-badge license-source-declared" title="licenseDeclared">📣 Declared</span>`
                            : '';
                    const expressionInfoMatch = typeof lic.licenseMatchInfo === 'string'
                        ? lic.licenseMatchInfo.match(/^(AND|OR|GROUPED):\s*(.+)$/)
                        : null;
                    if (expressionInfoMatch) {
                        const expressionDetails = expressionInfoMatch[2]
                            .split(',')
                            .map(part => part.trim())
                            .filter(Boolean)
                            .map(part => {
                                const equalsIndex = part.lastIndexOf('=');
                                if (equalsIndex <= 0) {
                                    return null;
                                }

                                const termName = part.slice(0, equalsIndex).trim();
                                const percentRaw = part.slice(equalsIndex + 1).trim().replace(/%$/, '');
                                const percentValue = Number(percentRaw);
                                const percentDisplay = Number.isFinite(percentValue)
                                    ? (Number.isInteger(percentValue)
                                        ? String(percentValue)
                                        : String(percentValue.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'))
                                    : percentRaw;
                                const percentClass = Number.isFinite(percentValue) && percentValue >= 80
                                    ? 'license-expression-valid'
                                    : 'license-expression-invalid';

                                let evidenceIndex = -1;
                                if (Array.isArray(lic.sourceItems)) {
                                    const sourceItem = lic.sourceItems.find(s => s.licenseName === termName);
                                    if (sourceItem && typeof sourceItem.evidenceIndex === 'number') {
                                        evidenceIndex = sourceItem.evidenceIndex;
                                    }
                                }
                                const termText = getExtractedLicenseText(lic.extractedLicenseTextById || {}, termName, evidenceIndex)
                                    || extractLicenseDocumentText(lic)
                                    || '';
                                const modalKey = registerLicenseText(
                                    termText,
                                    termName || lic.expression || 'License',
                                    result.name || ''
                                );
                                const showManualPairing = unmatchedTerms.includes(termName);
                                const manualPairingIcon = showManualPairing
                                    ? `<button type="button" class="manual-license-map-trigger" onclick="openManualLicenseMappingModal('${escapeHtml(termName)}', this)" title="Manually pair this unresolved license to a reference SPDX ID">🔗 Match</button>`
                                    : '';

                                const referenceTitle = item.licenseReferenceSpdxId
                                    ? `Compared to (${item.licenseReferenceSpdxId})`
                                    : 'Compared to (reference license text)';
                                return `<span class="license-expression-term"><button type="button" class="license-expression-badge license-text-trigger ${percentClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="${escapeHtml(referenceTitle)}"><span class="license-expression-name">${escapeHtml(termName || 'Unknown')}</span><span class="license-expression-percent">${escapeHtml(percentDisplay)}%</span></button>${manualPairingIcon}</span>`;
                            })
                            .filter(Boolean)
                            .join('');

                        if (expressionDetails) {
                            licensesHtml += `<div class="license-item">📋 ${escapeHtml(lic.expression)}${sourceLabel}<span class="license-expression-list">${expressionDetails}</span></div>`;
                        } else {
                            if (hasMatchPercent) {
                                const modalKey = registerLicenseText(
                                    extractLicenseDocumentText(lic) || '',
                                    lic.expression || 'License Expression',
                                    result.name || ''
                                );
                                licensesHtml += `<div class="license-item">📋 ${escapeHtml(lic.expression)}${sourceLabel}<span class="license-expression-list"><button type="button" class="license-expression-badge license-text-trigger ${percentClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="View SBOM license text"><span class="license-expression-name">${escapeHtml(lic.expression)}</span><span class="license-expression-percent">${escapeHtml(formattedPercent)}%</span></button></span></div>`;
                            } else {
                                licensesHtml += `<div class="license-item">📋 ${escapeHtml(lic.expression)}${sourceLabel}${matchInfoLabel}</div>`;
                            }
                        }
                    } else {
                        if (hasMatchPercent) {
                            const modalKey = registerLicenseText(
                                extractLicenseDocumentText(lic) || '',
                                lic.expression || 'License Expression',
                                result.name || ''
                            );
                            licensesHtml += `<div class="license-item">📋 ${escapeHtml(lic.expression)}${sourceLabel}<span class="license-expression-list"><button type="button" class="license-expression-badge license-text-trigger ${percentClass}" onclick="openLicenseTextModalByKey('${escapeHtml(modalKey)}')" title="View SBOM license text"><span class="license-expression-name">${escapeHtml(lic.expression)}</span><span class="license-expression-percent">${escapeHtml(formattedPercent)}%</span></button></span></div>`;
                        } else {
                            licensesHtml += `<div class="license-item">📋 ${escapeHtml(lic.expression)}${sourceLabel}${matchInfoLabel}</div>`;
                        }
                    }
                }
            });
        } else {
            licensesHtml = '<em>No licenses</em>';
        }

        const rowValid = isEffectivelyValid ? 'valid' : 'invalid';
        const rowHasWarning = (result.warnings && result.warnings.length > 0) ? 'true' : 'false';
        const rowHasNonCommercial = result.hasNonCommercialMatch ? "true" : "false";
        const safeSourceUrl = sanitizeUrl(result.sourceFile);
        const categoryValues = extractStandaloneCategories(result.licenses || []);
        const categoryText = categoryValues.length > 0 ? categoryValues.join(', ') : '';
        const sourceFileCell = safeSourceUrl
            ? `<a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(safeSourceUrl)}" style="font-size:1.4em;text-decoration:none;" aria-label="Open source file">&#128196;</a>`
            : '';
        const copyrightEntries = [result.copyright, result.copyrightFromLicenseText]
            .filter(value => typeof value === 'string' && value.trim())
            .join('\n')
            .split(/[;\r\n]/)
            .map(value => value.trim())
            .filter(Boolean);
        const copyrightIndicators = typeof getCopyrightIndicators === 'function'
            ? getCopyrightIndicators()
            : [];
        const isValidCopyrightEntry = (entry) => {
            if (typeof entry !== 'string' || !entry.trim()) return false;
            if (entry.trim() === 'NOASSERTION') return false;
            if (typeof isGenericCopyright === 'function' && isGenericCopyright(entry)) return false;
            return typeof getCopyrightValidationDetails === 'function'
                ? getCopyrightValidationDetails(entry).valid
                : copyrightIndicators.some(indicator => entry.includes(indicator));
        };
        const copyrightGroupId = `copyright-entry-group-${resultIdx}`;
        const copyrightHtml = copyrightEntries.length === 0
            ? '<em>No copyright</em>'
            : `<span id="${copyrightGroupId}" class="copyright-entry-group">${copyrightEntries.map((entry, entryIndex) => {
                const entryClass = isValidCopyrightEntry(entry)
                    ? 'copyright-entry-badge copyright-entry-valid'
                    : 'copyright-entry-badge copyright-entry-other';
                return `<span class="copyright-entry ${entryClass}" style="display:${entryIndex < 3 ? 'inline-flex' : 'none'}">${escapeHtml(entry)}</span>`;
            }).join('')}${copyrightEntries.length > 3 ? `<button type="button" class="license-badge-toggle copyright-entry-toggle" onclick="toggleCopyrightEntries('${copyrightGroupId}', this)" aria-expanded="false" title="Show all copyright">Show</button>` : ''}</span>`;
        const rowId = validationMode === 'tooldownload' ? `td_${nextRowId++}` : '';
        const editKey = validationMode === 'tooldownload' ? (result.objectPath || rowId) : '';

        if (validationMode === 'tooldownload') {
            tooldownloadRowRefs.set(editKey, result);
        }

        const componentKey = result.objectPath || `${result.name || 'N/A'}::${result.version || 'N/A'}`;
        html += `<tr data-valid="${rowValid}" data-has-warning="${rowHasWarning}" data-non-commercial="${rowHasNonCommercial}" data-component-key="${escapeHtml(componentKey)}" class="component-row"${rowId ? ` data-row-id="${escapeHtml(rowId)}"` : ''}${editKey ? ` data-edit-key="${escapeHtml(editKey)}"` : ''}>
            <td data-edit-cell="section">${escapeHtml(result.section)}</td>
            <td class="${indentClass}" data-edit-cell="name">${'└─ '.repeat(result.indent)}${escapeHtml(result.name)}</td>
            <td data-edit-cell="version">${escapeHtml(result.version)}</td>
            ${showTypeAndPurl ? `<td data-edit-cell="type">${escapeHtml(result.type)}</td><td class="copyright-cell" data-edit-cell="purl">${escapeHtml(result.purl) || '<em>No PURL</em>'}</td>` : ''}
            <td class="licenses-cell" data-edit-cell="licenses">${licensesHtml}</td>
            <td class="copyright-cell" data-edit-cell="copyright">${copyrightHtml}</td>
            <td data-edit-cell="category">${escapeHtml(categoryText) || '<em>No category</em>'}</td>
            <td data-edit-cell="sourceFile" style="text-align:center;">${sourceFileCell}</td>
            <td class="status-cell"><button type="button" class="status-badge ${statusClass}" data-comp-key="${escapeHtml(compKey)}" data-comp-name="${escapeHtml(result.name || '')}">${statusText}</button></td>
            ${validationMode === 'tooldownload' ? `<td><button type="button" class="tooldownload-edit-btn" data-edit-action="${escapeHtml(rowId)}" onclick="toggleRowEdit('${escapeHtml(editKey)}','${escapeHtml(rowId)}')">Edit</button><span id="tooldownloadEdited_${escapeHtml(rowId)}" style="display:inline-block;margin-left:6px;font-size:11px;color:var(--color-grey-600);"></span></td>` : ''}
        </tr>`;

        if (!isEffectivelyValid && filteredErrors.length > 0) {
            const errorList = filteredErrors.map(e => {
                const originalMessage = e.message;
                const overrideMessage = typeof getInvalidIssueOverride === 'function'
                    ? (getInvalidIssueOverride(originalMessage, componentKey) || getInvalidIssueOverride(originalMessage, ''))
                    : '';
                const noteText = typeof getInvalidIssueContext === 'function'
                    ? (getInvalidIssueContext(originalMessage, componentKey) || getInvalidIssueContext(originalMessage, ''))
                    : '';
                const displayMessage = overrideMessage || originalMessage;
                const pathPrefix = verbose && e.path ? `${escapeHtml(e.path)}: ` : '';
                const noteBadge = noteText ? `<span class="invalid-issue-note-badge" title="${escapeHtml(noteText)}">📝</span>` : '';
                return `<li class="invalid-issue-message-trigger error-message-entry" data-invalid-issue-scope="component" data-invalid-issue-text="${escapeHtml(originalMessage)}" data-invalid-issue-component-key="${escapeHtml(componentKey)}" data-invalid-issue-component-name="${escapeHtml(result.name || '')}" title="Click to edit this error message / context">${pathPrefix}${escapeHtml(displayMessage)}${noteBadge}</li>`;
            }).join('');
            html += `<tr data-valid="${rowValid}" data-has-warning="${rowHasWarning}" class="detail-row">
                <td colspan="${resultColumnCount}">
                    <div class="error-details">
                        <strong>Error${result.errors.length > 1 ? 's' : ''}:</strong>
                        <ul style="margin: 8px 0 0 0; padding-left: 20px;">${errorList}</ul>
                    </div>
                </td>
            </tr>`;
        }

        if (result.warnings.length > 0) {
            const safeWarnings = result.warnings.map(w => escapeHtml(w)).join('<br>');
            html += `<tr data-valid="${rowValid}" data-has-warning="true" class="detail-row">
                <td colspan="${resultColumnCount}">
                    <div class="warning-details">
                        <strong class="warning-icon">⚠</strong> ${safeWarnings}
                    </div>
                </td>
            </tr>`;
        }
    });

    html += `</tbody></table>`;

    resultsDiv.innerHTML = html;
    if (typeof restoreManualLicenseMatchPosition === 'function') {
        restoreManualLicenseMatchPosition();
    }
    if (typeof restoreTooldownloadEditPosition === 'function') {
        restoreTooldownloadEditPosition();
    }
    ensureLicenseTextModal();
    ensureManualLicenseMappingModal();
    ensureErrorOverrideModal();
    ensureInvalidIssueContextModal();
    if (showChangeLog && typeof updateChangeTrackingUi === 'function') {
        updateChangeTrackingUi();
    }

    document.querySelectorAll('.status-badge[data-comp-key]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = btn.getAttribute('data-comp-key');
            const name = btn.getAttribute('data-comp-name') || '';
            openErrorOverrideModal(key, name);
        });
    });

    document.querySelectorAll('.invalid-issue-message-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.getAttribute('data-invalid-issue-scope') || 'issue';
            const issueText = btn.getAttribute('data-invalid-issue-text') || '';
            const componentKey = btn.getAttribute('data-invalid-issue-component-key') || '';
            const componentName = btn.getAttribute('data-invalid-issue-component-name') || '';
            const issueGroup = btn.getAttribute('data-invalid-issue-group') || '';
            const mainRowId = btn.getAttribute('data-invalid-issue-main-row-id') || '';
            const subRowId = btn.getAttribute('data-invalid-issue-sub-row-id') || '';
            openInvalidIssueContextEditor(scope, issueText, componentKey, componentName, mainRowId, subRowId, issueGroup);
        });
    });
}

function ensureErrorOverrideModal() {
    if (document.getElementById('errorOverrideModal')) return;

    const modal = document.createElement('div');
    modal.id = 'errorOverrideModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <div class="license-text-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="errorOverrideModalTitle">

            <button
                type="button"
                class="license-text-modal-close"
                onclick="closeErrorOverrideModal()"
                aria-label="Close component errors popup">
                &times;
            </button>

            <h3
                id="errorOverrideModalTitle"
                class="license-text-modal-title">
                Component Errors
            </h3>

            <div
                id="errorOverrideModalSubtitle"
                class="license-text-modal-subtitle">
            </div>

            <div
                id="errorOverrideModalBody"
                class="license-text-modal-body">
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeErrorOverrideModal();
    });

    document.body.appendChild(modal);
}

function openErrorOverrideModal(componentKey, componentName) {
    ensureErrorOverrideModal();
    const modal = document.getElementById('errorOverrideModal');
    const subtitleEl = document.getElementById('errorOverrideModalSubtitle');
    const bodyEl = document.getElementById('errorOverrideModalBody');

    subtitleEl.textContent = componentName ? `Component: ${componentName}` : `Component: ${componentKey}`;

    const state = window.__lastDisplayState || {};
    const results = state.allResults || [];
    const result = results.find(r => (r.objectPath || `components[${results.indexOf(r)}]`) === componentKey) || null;

    let errors = [];
    if (result && Array.isArray(result.errors)) {
        errors = result.errors.map(e => (typeof e === 'object' ? (e.message || '') : String(e || ''))).filter(Boolean);
    }

    if (errors.length === 0) {
        const isFP = typeof hasFalsePositiveOverride === 'function' && hasFalsePositiveOverride(componentKey);
        const titleEl = document.getElementById('errorOverrideModalTitle');
        if (titleEl) titleEl.textContent = 'Override Valid Status';

        bodyEl.innerHTML = '';
        const listContainer = document.createElement('div');
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '12px';
        listContainer.style.padding = '12px';

        const errorRow = document.createElement('div');
        errorRow.style.display = 'flex';
        errorRow.style.gap = '12px';
        errorRow.style.alignItems = 'center';

        const leftBox = document.createElement('div');
        leftBox.className = isFP ? 'error-message-box status-valid' : 'error-message-box';
        leftBox.style.flex = '1';

        const bullet = document.createElement('span');
        bullet.className = 'error-bullet';
        bullet.textContent = '•';

        const textSpan = document.createElement('span');
        textSpan.className = 'error-override-text';
        textSpan.textContent = 'Manual override, false positive valid';

        leftBox.appendChild(bullet);
        leftBox.appendChild(textSpan);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = isFP ? 'override-box status-valid' : 'override-box';
        btn.textContent = isFP ? '✓ Override' : 'Override';
        btn.addEventListener('click', () => {
            toggleFalsePositiveOverride(componentKey, componentName);
        });

        errorRow.appendChild(leftBox);
        errorRow.appendChild(btn);
        listContainer.appendChild(errorRow);
        bodyEl.appendChild(listContainer);
        modal.classList.add('open');
        document.body.classList.add('license-modal-open');
        return;
    }

    const titleEl = document.getElementById('errorOverrideModalTitle');
    if (titleEl) titleEl.textContent = 'Component Errors';

    const manualOverrides = getManualOverridesForComponent(componentKey);

    bodyEl.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '12px';
    listContainer.style.padding = '12px';

    errors.forEach(msg => {
        const errorRow = document.createElement('div');

        const isOverridden = manualOverrides.has(msg);

        errorRow.style.display = 'flex';
        errorRow.style.gap = '12px';
        errorRow.style.alignItems = 'center';

        const leftBox = document.createElement('div');
        leftBox.className = isOverridden ? 'error-message-box status-valid' : 'error-message-box';
        leftBox.style.flex = '1';

        const bullet = document.createElement('span');
        bullet.className = 'error-bullet';
        bullet.textContent = '•';

        const textSpan = document.createElement('span');
        textSpan.className = 'error-override-text';
        textSpan.textContent = msg;

        leftBox.appendChild(bullet);
        leftBox.appendChild(textSpan);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = isOverridden ? 'override-box status-valid' : 'override-box';
        btn.textContent = isOverridden ? '✓ Override' : 'Override';
        btn.addEventListener('click', () => {
            toggleManualOverride(componentKey, msg, componentName);
        });

        errorRow.appendChild(leftBox);
        errorRow.appendChild(btn);
        listContainer.appendChild(errorRow);
    });

    bodyEl.appendChild(listContainer);
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
}

function closeErrorOverrideModal() {
    const modal = document.getElementById('errorOverrideModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('license-modal-open');
}

const OVERRIDE_REASON_SUGGESTIONS = [
    'Valid Copyright',
    'Valid Licensetext',
    'Reference, text available at another component',
    'Multiple texts present, valid entry',
    'Public Domain',
];

function ensureOverrideReasonModal() {
    if (document.getElementById('overrideReasonModal')) return;
    const modal = document.createElement('div');
    modal.id = 'overrideReasonModal';
    modal.className = 'license-text-modal-overlay';
    const suggestionButtonsHtml = OVERRIDE_REASON_SUGGESTIONS
        .map(text => `<button type="button" class="override-reason-suggestion-btn" onclick="insertOverrideReasonSuggestion(this)">${escapeHtml(text)}</button>`)
        .join('');
    modal.innerHTML = `
        <div class="license-text-modal" role="dialog" aria-modal="true" aria-labelledby="overrideReasonModalTitle">
            <button type="button" class="license-text-modal-close" onclick="closeOverrideReasonModal()" aria-label="Close">&times;</button>
            <h3 id="overrideReasonModalTitle" class="license-text-modal-title">Override Reason</h3>
            <div id="overrideReasonModalBody" class="license-text-modal-body" style="padding: 16px;">
                <label for="overrideReasonText" style="display: block; margin-bottom: 12px; font-weight: 600;">Explain this valid/invalid override (required)</label>
                <textarea id="overrideReasonText" required aria-required="true" placeholder="Enter a brief explanation (required)..." style="width: 100%; height: 120px; padding: 8px; border: 1px solid var(--color-grey-400); border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; resize: vertical;"></textarea>
                <div id="overrideReasonSuggestions" class="override-reason-suggestions">${suggestionButtonsHtml}</div>
                <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;">
                    <button type="button" onclick="closeOverrideReasonModal()" style="padding: 8px 16px; border: 1px solid var(--color-grey-400); background: var(--color-grey-100); border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button type="button" onclick="submitOverrideReason()" style="padding: 8px 16px; background: var(--color-vivid-green-600); color: white; border: none; border-radius: 4px; cursor: pointer;">Apply Override</button>
                </div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeOverrideReasonModal();
    });
    document.body.appendChild(modal);
}

function insertOverrideReasonSuggestion(buttonEl) {
    const textarea = document.getElementById('overrideReasonText');
    if (!textarea || !buttonEl) return;
    const suggestionText = buttonEl.textContent || '';
    const currentText = textarea.value.trim();
    const separator = currentText ? '\n\n' : '';
    textarea.value = currentText + separator + suggestionText;
    textarea.focus();
}

function openOverrideReasonModal(context) {
    ensureOverrideReasonModal();
    pendingOverrideContext = context;
    pendingOverrideReason = '';
    const modal = document.getElementById('overrideReasonModal');
    const textarea = document.getElementById('overrideReasonText');
    if (textarea) textarea.value = '';
    if (modal) {
        modal.classList.add('open');
        document.body.classList.add('license-modal-open');
        if (textarea) textarea.focus();
    }
}

function closeOverrideReasonModal() {
    const modal = document.getElementById('overrideReasonModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.classList.remove('license-modal-open');
    }
    pendingOverrideContext = null;
}

function submitOverrideReason() {
    const textarea = document.getElementById('overrideReasonText');
    const reason = textarea ? (textarea.value || '').trim() : '';
    if (!pendingOverrideContext) {
        closeOverrideReasonModal();
        return;
    }
    if (!reason) {
        alert('A reason is required for every valid/invalid override.');
        if (textarea) textarea.focus();
        return;
    }
    const context = pendingOverrideContext;
    pendingOverrideReason = reason;
    closeOverrideReasonModal();

    if (context.action === 'toggleManualOverride') {
        proceedToggleManualOverride(context.componentKey, context.errorMessage, context.componentName);
    } else if (context.action === 'toggleFalsePositiveOverride') {
        proceedToggleFalsePositiveOverride(context.componentKey, context.componentName);
    }
}

function getTooldownloadStatusSnapshot(componentKey, state) {
    const currentState = state || window.__lastDisplayState || null;
    if (!currentState || !['standard', 'standard-internal', 'tooldownload'].includes(currentState.validationMode)) {
        return null;
    }

    const results = Array.isArray(currentState.allResults) ? currentState.allResults : [];
    const result = results.find((r, idx) => (r.objectPath || `components[${idx}]`) === componentKey) || null;
    if (!result) {
        return null;
    }

    const manualOverrides = typeof getManualOverridesForComponent === 'function'
        ? getManualOverridesForComponent(componentKey)
        : new Set();
    const originalErrors = Array.isArray(result.errors) ? result.errors : [];
    const filteredErrors = originalErrors.filter(e => {
        const msg = (typeof e === 'object' && e.message) ? e.message : String(e || '');
        return !manualOverrides.has(msg);
    });
    const isFalsePositiveOverridden = typeof hasFalsePositiveOverride === 'function' && hasFalsePositiveOverride(componentKey);
    const isEffectivelyValid = filteredErrors.length === 0 && !isFalsePositiveOverridden;

    return {
        componentKey,
        status: isEffectivelyValid ? 'valid' : 'invalid',
        name: result.name || '',
        section: result.section || ''
    };
}

function appendTooldownloadStatusChange(beforeSnapshot, afterSnapshot, reason = '', overrideChange = null) {
    if (!beforeSnapshot || !afterSnapshot) return;
    if (!overrideChange && beforeSnapshot.status === afterSnapshot.status) return;

    const changeEntry = {
        timestamp: new Date().toISOString(),
        rowId: afterSnapshot.componentKey || beforeSnapshot.componentKey || '',
        section: afterSnapshot.section || beforeSnapshot.section || '',
        name: afterSnapshot.name || beforeSnapshot.name || '',
        changes: [overrideChange || {
            field: 'status',
            oldValue: beforeSnapshot.status,
            newValue: afterSnapshot.status
        }]
    };
    if (reason && typeof reason === 'string' && reason.trim()) {
        changeEntry.overrideReason = reason.trim();
    }
    editChangeLog.push(changeEntry);
}

function toggleManualOverride(componentKey, errorMessage, componentName = '') {
    openOverrideReasonModal({
        action: 'toggleManualOverride',
        componentKey,
        errorMessage,
        componentName
    });
}

function proceedToggleManualOverride(componentKey, errorMessage, componentName = '') {
    if (typeof pendingOverrideReason !== 'string' || !pendingOverrideReason.trim()) {
        toggleManualOverride(componentKey, errorMessage, componentName);
        return;
    }
    const s = window.__lastDisplayState || null;
    const beforeSnapshot = getTooldownloadStatusSnapshot(componentKey, s);

    const manual = getManualOverridesForComponent(componentKey);
    const currently = manual.has(errorMessage);
    setManualOverride(componentKey, errorMessage, !currently);

    const componentRows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleComponentRows = componentRows.filter(row => row.style.display !== 'none');
    const componentRow = componentRows.find(row => row.dataset.componentKey === componentKey);
    manualLicenseNavigationContext = {
        filterMode: window.__activeFilterMode || 'all',
        componentKey: componentKey,
        componentIndex: componentRow ? visibleComponentRows.indexOf(componentRow) : -1
    };

    if (s) {
        displayResults(s.sbomData, s.allResults, s.overallValid, s.filename, s.verbose, s.validationMode, s.isManualMapping);
        const afterSnapshot = getTooldownloadStatusSnapshot(componentKey, window.__lastDisplayState || s);
        appendTooldownloadStatusChange(beforeSnapshot, afterSnapshot, pendingOverrideReason, {
            field: `errorOverride:${errorMessage}`,
            oldValue: currently ? 'valid' : 'invalid',
            newValue: currently ? 'invalid' : 'valid'
        });
        if (['standard', 'standard-internal', 'tooldownload'].includes(s.validationMode) && typeof updateChangeTrackingUi === 'function') {
            updateChangeTrackingUi();
        }
        pendingOverrideReason = '';
        closeErrorOverrideModal();
    }
}

function toggleFalsePositiveOverride(componentKey, componentName = '') {
    if (typeof setFalsePositiveOverride !== 'function') return;
    openOverrideReasonModal({
        action: 'toggleFalsePositiveOverride',
        componentKey,
        componentName
    });
}

function proceedToggleFalsePositiveOverride(componentKey, componentName = '') {
    if (typeof setFalsePositiveOverride !== 'function') return;
    if (typeof pendingOverrideReason !== 'string' || !pendingOverrideReason.trim()) {
        toggleFalsePositiveOverride(componentKey, componentName);
        return;
    }
    const s = window.__lastDisplayState || null;
    const beforeSnapshot = getTooldownloadStatusSnapshot(componentKey, s);
    const current = typeof hasFalsePositiveOverride === 'function' && hasFalsePositiveOverride(componentKey);
    setFalsePositiveOverride(componentKey, !current);
    
    const componentRows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleComponentRows = componentRows.filter(row => row.style.display !== 'none');
    const componentRow = componentRows.find(row => row.dataset.componentKey === componentKey);
    manualLicenseNavigationContext = {
        filterMode: window.__activeFilterMode || 'all',
        componentKey: componentKey,
        componentIndex: componentRow ? visibleComponentRows.indexOf(componentRow) : -1
    };
    
    if (s) {
        displayResults(s.sbomData, s.allResults, s.overallValid, s.filename, s.verbose, s.validationMode, s.isManualMapping);
        const afterSnapshot = getTooldownloadStatusSnapshot(componentKey, window.__lastDisplayState || s);
        appendTooldownloadStatusChange(beforeSnapshot, afterSnapshot, pendingOverrideReason, {
            field: 'falsePositiveOverride',
            oldValue: current ? 'invalid' : 'valid',
            newValue: current ? 'valid' : 'invalid'
        });
        if (['standard', 'standard-internal', 'tooldownload'].includes(s.validationMode) && typeof updateChangeTrackingUi === 'function') {
            updateChangeTrackingUi();
        }
        pendingOverrideReason = '';
        closeErrorOverrideModal();
    }
}

function ensureInvalidIssueContextModal() {
    if (document.getElementById('invalidIssueContextModal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'invalidIssueContextModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <div class="license-text-modal invalid-issue-context-modal" role="dialog" aria-modal="true" aria-labelledby="invalidIssueContextModalTitle">
            <button type="button" class="license-text-modal-close" onclick="closeInvalidIssueContextModal()" aria-label="Close issue context popup">&times;</button>
            <h3 id="invalidIssueContextModalTitle" class="license-text-modal-title">Issue Context</h3>
            <div id="invalidIssueContextModalSubtitle" class="license-text-modal-subtitle"></div>
            <div id="invalidIssueContextModalBody" class="license-text-modal-body invalid-issue-context-modal-body">
                <div class="invalid-issue-editor-pane">
                    <label for="invalidIssueErrorMessageText" class="invalid-issue-editor-label">Error message</label>
                    <input type="text" id="invalidIssueErrorMessageText" class="invalid-issue-editor-input" required aria-required="true" placeholder="Enter the error message...">
                    <label for="invalidIssueContextText" class="invalid-issue-editor-label">Extra context for this invalid issue</label>
                    <textarea id="invalidIssueContextText" class="invalid-issue-editor-textarea" placeholder="Add the reason or extra information for this issue..."></textarea>
                    <div class="invalid-issue-editor-actions">
                        <button type="button" class="invalid-issue-editor-cancel" onclick="closeInvalidIssueContextModal()">Cancel</button>
                        <button type="button" class="invalid-issue-editor-save" onclick="submitInvalidIssueContext()">Save</button>
                    </div>
                </div>
                <aside id="cannedResponsesSidebarContainer" class="canned-responses-sidebar">
                    <div class="canned-responses-header">
                        <h4>Canned Responses</h4>
                        <span id="cannedResponsesCount" class="canned-responses-count">0</span>
                    </div>
                    <input type="text" id="cannedResponsesSearch" class="canned-responses-search" placeholder="Search responses...">
                    <div id="cannedResponsesList" class="canned-responses-list"></div>
                    <button type="button" id="cannedResponsesAddBtn" class="canned-responses-add-btn">+ Save as Template</button>
                </aside>
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeInvalidIssueContextModal();
    });

    document.body.appendChild(modal);
    if (!window.__invalidIssueContextModalKeydownBound) {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.getElementById('invalidIssueContextModal') && document.getElementById('invalidIssueContextModal').classList.contains('open')) {
                closeInvalidIssueContextModal();
            }
        });
        window.__invalidIssueContextModalKeydownBound = true;
    }
}

function openInvalidIssueContextEditor(scope, issueText, componentKey = '', componentName = '', mainRowId = '', subRowId = '', issueGroup = '') {
    ensureInvalidIssueContextModal();
    const modal = document.getElementById('invalidIssueContextModal');
    const titleEl = document.getElementById('invalidIssueContextModalTitle');
    const subtitleEl = document.getElementById('invalidIssueContextModalSubtitle');
    const textarea = document.getElementById('invalidIssueContextText');
    const errorMessageInput = document.getElementById('invalidIssueErrorMessageText');
    if (!modal || !titleEl || !subtitleEl || !textarea || !errorMessageInput) return;

    const activeFilterMode = window.__activeFilterMode
        || (document.getElementById('filterInvalid')?.classList.contains('active-invalid') ? 'invalid' : '')
        || (document.getElementById('filterInvalidIssues')?.classList.contains('active-invalid') ? 'invalid-issues' : '')
        || (document.getElementById('filterAll')?.classList.contains('active') ? 'all' : '')
        || 'all';
    const isSharedIssueContextEdit = scope === 'component'
        && (activeFilterMode === 'all' || activeFilterMode === 'invalid');
    const currentText = scope === 'component'
        ? isSharedIssueContextEdit
            ? (getInvalidIssueContext(issueText) || getInvalidIssueContext(issueText, componentKey))
            : getInvalidIssueContext(issueText, componentKey)
        : getInvalidIssueContext(issueText);
    const currentErrorMessage = scope === 'component'
        ? (getInvalidIssueOverride(issueText, componentKey)
            || (isSharedIssueContextEdit ? getInvalidIssueOverride(issueText) : ''))
        : getInvalidIssueOverride(issueText);
    textarea.value = currentText || '';
    errorMessageInput.value = (currentErrorMessage || issueText || '').trim();
    errorMessageInput.setCustomValidity('');
    if (!window.__invalidIssueErrorMessageInputBound) {
        errorMessageInput.addEventListener('input', () => {
            errorMessageInput.setCustomValidity('');
        });
        window.__invalidIssueErrorMessageInputBound = true;
    }
    titleEl.textContent = scope === 'component' && !isSharedIssueContextEdit ? 'Component Issue Context' : 'Issue Context';
    const contextTarget = scope === 'component' && !isSharedIssueContextEdit
        ? `${issueText}${componentName ? ` / ${componentName}` : ''}`
        : issueText;
    subtitleEl.textContent = contextTarget;
    window.__pendingInvalidIssueContext = { scope, issueText, componentKey, componentName, mainRowId, subRowId, issueGroup, filterMode: activeFilterMode };
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
    errorMessageInput.focus();

    if (typeof initCannedResponsesSidebar === 'function') {
        initCannedResponsesSidebar();
    }
}

function closeInvalidIssueContextModal() {
    const modal = document.getElementById('invalidIssueContextModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('license-modal-open');
    window.__pendingInvalidIssueContext = null;
}

function submitInvalidIssueContext() {
    const context = window.__pendingInvalidIssueContext || null;
    const textarea = document.getElementById('invalidIssueContextText');
    const errorMessageInput = document.getElementById('invalidIssueErrorMessageText');
    if (!context || !textarea || !errorMessageInput) {
        closeInvalidIssueContextModal();
        return;
    }
    const note = (textarea.value || '').trim();
    const errorMessage = (errorMessageInput.value || '').trim();
    if (!errorMessage) {
        errorMessageInput.setCustomValidity('Error message cannot be empty.');
        errorMessageInput.reportValidity();
        errorMessageInput.focus();
        return;
    }
    errorMessageInput.setCustomValidity('');
    if (context.scope === 'component' && (context.filterMode === 'all' || context.filterMode === 'invalid')) {
        const currentComponentOverride = getInvalidIssueOverride(context.issueText, context.componentKey);
        const currentIssueOverride = getInvalidIssueOverride(context.issueText);
        const currentlyDisplayedMessage = currentComponentOverride || currentIssueOverride || context.issueText;
        const nextComponentOverride = errorMessage === currentlyDisplayedMessage
            ? currentComponentOverride
            : (errorMessage === context.issueText ? '' : errorMessage);

        setInvalidIssueContext(context.issueText, '', note, '', currentIssueOverride);
        setInvalidIssueContext(context.issueText, context.componentKey, '', context.componentName || '', nextComponentOverride || '');
    } else if (context.scope === 'component') {
        setInvalidIssueContext(context.issueText, context.componentKey, note, context.componentName || '', errorMessage);
    } else {
        setInvalidIssueContext(context.issueText, '', note, '', errorMessage);
    }
    window.__invalidIssueContextNavigationContext = {
        filterMode: context.filterMode || window.__activeFilterMode || 'all',
        issueText: context.issueText,
        componentKey: context.scope === 'component' ? context.componentKey : '',
        componentName: context.componentName || '',
        mainRowId: context.mainRowId || '',
        subRowId: context.subRowId || '',
        issueGroup: context.issueGroup || ''
    };
    const s = window.__lastDisplayState || null;
    if (s) {
        displayResults(s.sbomData, s.allResults, s.overallValid, s.filename, s.verbose, s.validationMode, s.isManualMapping);
        const nav = window.__invalidIssueContextNavigationContext || {};
        const filterMode = nav.filterMode || window.__activeFilterMode || 'invalid-issues';
        window.__activeFilterMode = filterMode;
        if (typeof filterTable === 'function') {
            filterTable(filterMode);
        }

        if ((filterMode === 'all' || filterMode === 'invalid') && nav.componentKey) {
            const escapedComponentKey = typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(String(nav.componentKey))
                : String(nav.componentKey).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const escapedIssueText = typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(String(nav.issueText || ''))
                : String(nav.issueText || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const errorMessageEntry = document.querySelector(
                `.error-message-entry[data-invalid-issue-component-key="${escapedComponentKey}"][data-invalid-issue-text="${escapedIssueText}"]`
            );
            if (errorMessageEntry) {
                errorMessageEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
                errorMessageEntry.classList.add('error-message-edit-highlight');
                window.setTimeout(() => errorMessageEntry.classList.remove('error-message-edit-highlight'), 1000);
            }
            closeInvalidIssueContextModal();
            return;
        }

        const escapedIssueText = typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(String(nav.issueText || ''))
            : String(nav.issueText || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedComponentKey = typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(String(nav.componentKey || ''))
            : String(nav.componentKey || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escapedIssueGroup = typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(String(nav.issueGroup || ''))
            : String(nav.issueGroup || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        const componentEntry = nav.componentKey
            ? document.querySelector(`.invalid-issue-component-entry[data-invalid-issue-component-key="${escapedComponentKey}"][data-invalid-issue-text="${escapedIssueText}"]${nav.issueGroup ? `[data-invalid-issue-group="${escapedIssueGroup}"]` : ''}`)
            : null;
        const subRow = componentEntry
            ? componentEntry.closest('tr[id^="invalidIssueSubGroup_"]')
            : nav.subRowId
                ? document.getElementById(nav.subRowId)
                : document.querySelector(`#invalidIssuesSummaryTable tr[id^="invalidIssueSubGroup_"][data-invalid-issue-text="${escapedIssueText}"]${nav.issueGroup ? `[data-invalid-issue-group="${escapedIssueGroup}"]` : ''}`);
        const mainRow = subRow
            ? subRow.closest('table')?.closest('tr[id^="invalidIssueMainGroup_"]')
            : nav.mainRowId
                ? document.getElementById(nav.mainRowId)
                : document.querySelector(`#invalidIssuesSummaryTable tr[id^="invalidIssueMainGroup_"]${nav.issueGroup ? `[data-invalid-issue-group="${escapedIssueGroup}"]` : ''}`);

        if (mainRow && mainRow.style.display === 'none') {
            const mainSummaryRow = mainRow.previousElementSibling;
            const groupToggleButton = mainSummaryRow ? mainSummaryRow.querySelector('.filter-btn') : null;
            if (groupToggleButton) {
                toggleInvalidIssueGroup(mainRow.id, groupToggleButton);
            }
        }

        if (subRow && subRow.style.display === 'none') {
            const subSummaryRow = subRow.previousElementSibling;
            const subgroupToggleButton = subSummaryRow ? subSummaryRow.querySelector('.filter-btn') : null;
            if (subgroupToggleButton) {
                toggleInvalidIssueGroup(subRow.id, subgroupToggleButton);
            }
        }

        const rowToScroll = componentEntry || subRow || mainRow || null;
        if (rowToScroll) {
            rowToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (componentEntry) {
                componentEntry.classList.add('invalid-issue-entry-highlight');
                window.setTimeout(() => componentEntry.classList.remove('invalid-issue-entry-highlight'), 1000);
            } else {
                rowToScroll.classList.add('component-row-highlight');
                window.setTimeout(() => rowToScroll.classList.remove('component-row-highlight'), 1000);
            }
        }
    }
    closeInvalidIssueContextModal();
}

function ensureLicenseTextModal() {
    if (document.getElementById('licenseTextModal')) {
        return;
    }

    const modal = document.createElement('div');

    modal.id = 'licenseTextModal';
    modal.className = 'license-text-modal-overlay';

    modal.innerHTML = `
        <div
            class="license-text-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="licenseTextModalTitle"
        >
            <button
                type="button"
                class="license-text-modal-close"
                onclick="closeLicenseTextModal()"
                aria-label="Close license text popup"
            >
                &times;
            </button>

            <h3
                id="licenseTextModalTitle"
                class="license-text-modal-title"
            >
                License Text
            </h3>

            <div
                id="licenseTextModalSubtitle"
                class="license-text-modal-subtitle"
            ></div>

            <div
                id="licenseTextModalHighlightedBody"
                class="license-text-modal-body license-text-highlighted-body"
            ></div>

            <textarea
                id="licenseTextModalBody"
                class="license-text-modal-body"
                style="display:none;"
            ></textarea>

            <div class="license-text-modal-actions">
                <button
                    type="button"
                    class="schema-btn license-text-edit-button"
                    onclick="editLicenseText()"
                    style="display:none;"
                >
                    Edit
                </button>

                <button
                    type="button"
                    class="schema-btn license-text-save-button"
                    onclick="saveLicenseText()"
                    style="display:none;"
                >
                    Save
                </button>

                <button
                    type="button"
                    class="schema-btn license-text-cancel-button"
                    onclick="cancelLicenseTextEdit()"
                    style="display:none;"
                >
                    Cancel
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeLicenseTextModal();
        }
    });

    document.body.appendChild(modal);

    if (!window.__licenseTextModalEscBound) {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeLicenseTextModal();
            }
        });

        window.__licenseTextModalEscBound = true;
    }
}

function openLicenseTextModalByKey(key) {
    ensureLicenseTextModal();

    activeLicenseTextModalKey = key;

    const cache =
        window.__licenseTextModalCache || {};

    const item =
        cache[key] || {
            text: '',
            title: 'License Text',
            subtitle: ''
        };

    const modal =
        document.getElementById(
            'licenseTextModal'
        );

    const titleEl =
        document.getElementById(
            'licenseTextModalTitle'
        );

    const subtitleEl =
        document.getElementById(
            'licenseTextModalSubtitle'
        );

    const highlightedBodyEl =
        document.getElementById(
            'licenseTextModalHighlightedBody'
        );

    const editorEl =
        document.getElementById(
            'licenseTextModalBody'
        );

    const editButton =
        document.querySelector(
            '#licenseTextModal .license-text-edit-button'
        );

    const saveButton =
        document.querySelector(
            '#licenseTextModal .license-text-save-button'
        );

    const cancelButton =
        document.querySelector(
            '#licenseTextModal .license-text-cancel-button'
        );

    const licenseText =
        typeof item.text === 'string'
            ? item.text
            : '';

    const isEditable =
        currentValidationMode === 'tooldownload' &&
        item.editable === true;

    titleEl.textContent =
        item.title || 'License Text';

    subtitleEl.textContent =
        item.subtitle
            ? `Component: ${item.subtitle}`
            : '';

    editorEl.style.display = 'none';
    editorEl.readOnly = true;
    editorEl.value = licenseText;

    highlightedBodyEl.style.display =
        'block';

    if (licenseText.trim()) {
        highlightedBodyEl.innerHTML =
            typeof renderNonCommercialLicenseText ===
                'function'
                ? renderNonCommercialLicenseText(
                licenseText,
                item.editContext?.licenseName ||
                    item.licenseName ||
                    item.title ||
                    '',
                item.editContext?.componentKey ||
                    ''
            )
                : escapeHtml(licenseText);
    } else {
        highlightedBodyEl.textContent =
            'No license text found in SBOM for this license entry.';
    }

    if (editButton) {
        editButton.style.display =
            isEditable
                ? 'inline-block'
                : 'none';
    }

    if (saveButton) {
        saveButton.style.display =
            'none';
    }

    if (cancelButton) {
        cancelButton.style.display =
            'none';
    }

    modal.classList.add('open');

    document.body.classList.add(
        'license-modal-open'
    );
}

function editLicenseText() {
    if (
        currentValidationMode !==
        'tooldownload'
    ) {
        return;
    }

    const cache =
        window.__licenseTextModalCache || {};

    const item =
        cache[activeLicenseTextModalKey];

    if (!item || !item.editable) {
        return;
    }

    const highlightedBodyEl =
        document.getElementById(
            'licenseTextModalHighlightedBody'
        );

    const editorEl =
        document.getElementById(
            'licenseTextModalBody'
        );

    const editButton =
        document.querySelector(
            '#licenseTextModal .license-text-edit-button'
        );

    const saveButton =
        document.querySelector(
            '#licenseTextModal .license-text-save-button'
        );

    const cancelButton =
        document.querySelector(
            '#licenseTextModal .license-text-cancel-button'
        );

    if (
        !highlightedBodyEl ||
        !editorEl
    ) {
        return;
    }

    highlightedBodyEl.style.display =
        'none';

    editorEl.style.display =
        'block';

    editorEl.readOnly = false;

    editorEl.value =
        typeof item.text === 'string'
            ? item.text
            : '';

    editorEl.placeholder =
        'No license text found in SBOM for this license entry.';

    if (editButton) {
        editButton.style.display = 'none';
    }

    if (saveButton) {
        saveButton.style.display =
            'inline-block';
    }

    if (cancelButton) {
        cancelButton.style.display =
            'inline-block';
    }

    editorEl.focus();
}

function cancelLicenseTextEdit() {
    const cache =
        window.__licenseTextModalCache || {};

    const item =
        cache[activeLicenseTextModalKey];

    if (!item) {
        return;
    }

    const highlightedBodyEl =
        document.getElementById(
            'licenseTextModalHighlightedBody'
        );

    const editorEl =
        document.getElementById(
            'licenseTextModalBody'
        );

    const editButton =
        document.querySelector(
            '#licenseTextModal .license-text-edit-button'
        );

    const saveButton =
        document.querySelector(
            '#licenseTextModal .license-text-save-button'
        );

    const cancelButton =
        document.querySelector(
            '#licenseTextModal .license-text-cancel-button'
        );

    if (
        !highlightedBodyEl ||
        !editorEl
    ) {
        return;
    }

    editorEl.value =
        typeof item.text === 'string'
            ? item.text
            : '';

    editorEl.readOnly = true;
    editorEl.style.display = 'none';

    highlightedBodyEl.style.display =
        'block';

    const licenseText =
        typeof item.text === 'string'
            ? item.text
            : '';

    if (licenseText.trim()) {
        highlightedBodyEl.innerHTML =
            typeof renderNonCommercialLicenseText ===
                'function'
                ? renderNonCommercialLicenseText(
                licenseText,
                item.editContext?.licenseName ||
                    item.licenseName ||
                    item.title ||
                    '',
                item.editContext?.componentKey ||
                    ''
            )
                : escapeHtml(licenseText);
    } else {
        highlightedBodyEl.textContent =
            'No license text found in SBOM for this license entry.';
    }

    if (editButton) {
        editButton.style.display =
            'inline-block';
    }

    if (saveButton) {
        saveButton.style.display =
            'none';
    }

    if (cancelButton) {
        cancelButton.style.display =
            'none';
    }
}

function closeLicenseTextModal() {
    const modal = document.getElementById('licenseTextModal');

    if (!modal) {
        return;
    }

    modal.classList.remove('open');
    document.body.classList.remove('license-modal-open');
    activeLicenseTextModalKey = '';
}

function saveLicenseText() {
    if (currentValidationMode !== 'tooldownload') {
        showError('License text editing is only available in Tooldownload mode.');
        return;
    }

    const cache = window.__licenseTextModalCache || {};
    const item = cache[activeLicenseTextModalKey];
    const editor = document.getElementById('licenseTextModalBody');

    if (!item || !editor || !item.editable) {
        showError('No editable license text was found.');
        return;
    }

    const newText = String(editor.value || '');
    const oldText = String(item.text || '');
    const componentKey = item.componentKey || '';

    if (!componentKey) {
        showError('The component belonging to this license could not be identified.');
        return;
    }

    const rowRef = tooldownloadRowRefs.get(componentKey);

    if (!rowRef) {
        showError('No editable SBOM component was found for this license.');
        return;
    }

    const licenseTextOverrideKey = [
        rowRef.name || item.subtitle || '',
        rowRef.version || '',
        Number.isInteger(item.evidenceIndex) && item.evidenceIndex >= 0
            ? `${item.licenseName || item.title}#${item.evidenceIndex}`
            : item.licenseName || item.title || ''
    ]
        .map(value => String(value).trim().toLowerCase())
        .join('::');

    manualLicenseTextOverrides.set(
        licenseTextOverrideKey,
        newText
    );

const raw = rowRef.rawData || rowRef;

    let savedToRawData = false;

    if (
        raw.evidence &&
        Array.isArray(raw.evidence.licenses) &&
        Number.isInteger(item.evidenceIndex) &&
        item.evidenceIndex >= 0 &&
        raw.evidence.licenses[item.evidenceIndex]
    ) {
        const evidenceItem = raw.evidence.licenses[item.evidenceIndex];

        if (!evidenceItem.license) {
            evidenceItem.license = {};
        }

        if (
            evidenceItem.license.text &&
            typeof evidenceItem.license.text === 'object' &&
            !Array.isArray(evidenceItem.license.text)
        ) {
            evidenceItem.license.text.content = newText;
        } else {
            evidenceItem.license.text = {
                content: newText
            };
        }

        savedToRawData = true;
    }

    if (!savedToRawData && Array.isArray(raw.licenses)) {
        const matchingRawLicense = raw.licenses.find(rawLicense => {
            const rawName = String(
                rawLicense?.license?.id ||
                rawLicense?.license?.name ||
                rawLicense?.expression ||
                ''
            ).trim();

            return rawName === String(item.licenseName || '').trim();
        });

        if (matchingRawLicense) {
            if (!matchingRawLicense.license) {
                matchingRawLicense.license = {};
            }

            if (
                matchingRawLicense.license.text &&
                typeof matchingRawLicense.license.text === 'object' &&
                !Array.isArray(matchingRawLicense.license.text)
            ) {
                matchingRawLicense.license.text.content = newText;
            } else {
                matchingRawLicense.license.text = {
                    content: newText
                };
            }

            savedToRawData = true;
        }
    }

    if (!savedToRawData) {
    if (!raw.evidence || typeof raw.evidence !== 'object') {
        raw.evidence = {};
    }

    if (!Array.isArray(raw.evidence.licenses)) {
        raw.evidence.licenses = [];
    }

    const newEvidenceItem = {
        license: {
            id: item.licenseName,
            text: {
                content: newText
            }
        },
        manuallyAdded: true
    };

    raw.evidence.licenses.push(newEvidenceItem);

    item.evidenceIndex = raw.evidence.licenses.length - 1;
    savedToRawData = true;
}

    if (item.licenseItem && typeof item.licenseItem === 'object') {
        item.licenseItem.licenseText = newText;
        item.licenseItem.manuallyEditedLicenseText = true;

        if (
            item.licenseItem.license &&
            typeof item.licenseItem.license === 'object'
        ) {
            if (
                item.licenseItem.license.text &&
                typeof item.licenseItem.license.text === 'object' &&
                !Array.isArray(item.licenseItem.license.text)
            ) {
                item.licenseItem.license.text.content = newText;
            } else {
                item.licenseItem.license.text = {
                    content: newText
                };
            }
        }
    }

    const existingEdit = tooldownloadEdits.get(componentKey) || {};

    const licenseTexts = {
        ...(existingEdit.licenseTexts || {})
    };

    const licenseTextKey = Number.isInteger(item.evidenceIndex) && item.evidenceIndex >= 0
        ? `${item.licenseName}#${item.evidenceIndex}`
        : item.licenseName;
    licenseTexts[licenseTextKey] = newText;

    tooldownloadEdits.set(componentKey, {
        ...existingEdit,
        licenseTexts
    });

    if (oldText !== newText) {
        editChangeLog.push({
            timestamp: new Date().toISOString(),
            rowId: componentKey,
            section: rowRef.section || '',
            name: rowRef.name || item.subtitle || '',
            changes: [
                {
                    field: `licenseText:${licenseTextKey}`,
                    oldValue: oldText,
                    newValue: newText,
                    collapsible: true
                }
            ]
        });
    }

    item.text = newText;
    item.originalText = newText;

    if (typeof updateChangeTrackingUi === 'function') {
        updateChangeTrackingUi();
    }

    const componentRows = Array.from(
        document.querySelectorAll(
            '#componentsTable tbody tr[data-component-key]'
        )
    );

    const visibleComponentRows = componentRows.filter(
        row => row.style.display !== 'none'
    );

    const componentRow = componentRows.find(
        row => row.dataset.componentKey === componentKey
    );

    tooldownloadEditNavigationContext = {
        filterMode: window.__activeFilterMode || 'all',
        componentKey,
        componentIndex: componentRow
            ? visibleComponentRows.indexOf(componentRow)
            : -1
    };

    closeLicenseTextModal();

    if (typeof revalidateIfLoaded === 'function') {
        revalidateIfLoaded();
    }

}
;
