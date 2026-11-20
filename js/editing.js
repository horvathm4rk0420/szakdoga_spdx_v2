let activeLicenseTokenEditor = null;

function parseLicenseEditorTokens(value) {
    const expression =
        String(value || '').trim();

    if (!expression) {
        return [];
    }

    const rawTokens = expression.split(
        /(\(|\)|\bAND\b|\bOR\b)/gi
    );

    return rawTokens
        .map(token => token.trim())
        .filter(Boolean)
        .map(token => {
            const upperValue =
                token.toUpperCase();

            if (
                upperValue === 'AND' ||
                upperValue === 'OR'
            ) {
                return {
                    type: 'operator',
                    value: upperValue
                };
            }

            if (
                token === '(' ||
                token === ')'
            ) {
                return {
                    type: 'parenthesis',
                    value: token
                };
            }

            return {
                type: 'license',
                value: token
            };
        });
}

function renderLicenseTokenEditor(cell, value) {
    if (!cell) {
        return;
    }

    const tokens = parseLicenseEditorTokens(value);

    cell.innerHTML = `
        <div class="license-token-editor">
            <div class="license-token-list"></div>

            <button
                type="button"
                class="license-token-add"
                onclick="openLicenseTokenAddModal(this)">
                + Add
            </button>

            <button
                type="button"
                class="license-token-delete"
                onclick="toggleLicenseTokenDeleteMode(this)">
                Delete
            </button>

            <button
                type="button"
                class="license-token-group"
                onclick="toggleLicenseTokenGroupMode(this)">
                Group ( )
            </button>
        </div>
    `;


    const list = cell.querySelector('.license-token-list');

    tokens.forEach(token => {
        appendLicenseEditorToken(
            list,
            token.type,
            token.value
        );
    });
}

function appendLicenseEditorToken(list, type, value) {
    if (!list || !value) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.licenseTokenType = type;
    button.dataset.licenseTokenValue = value;

    if (type === 'parenthesis') {
        button.className =
            'license-token-button license-token-parenthesis';

        button.textContent = value;

        button.title =
            'Click to remove this parenthesis group';

        button.addEventListener('click', () => {
            removeLicenseParenthesisGroup(button);
        });

        list.appendChild(button);
        return;
    }

    if (type === 'operator') {
        button.className = 'license-token-button license-token-operator';
        button.textContent = value;

        button.title = 'Click to switch between AND and OR';

        button.addEventListener('click', () => {
            const nextValue =
                button.dataset.licenseTokenValue === 'AND'
                    ? 'OR'
                    : 'AND';

            button.dataset.licenseTokenValue = nextValue;
            button.textContent = nextValue;
        });
    } else {
        button.className = 'license-token-button license-token-license';
        button.textContent = value;

        button.title = 'Click to replace this license';

        button.addEventListener('click', () => {
            const editor = button.closest(
                '.license-token-editor'
            );

            if (!editor) {
                return;
            }

            if (editor.dataset.deleteMode === 'true') {
                deleteLicenseEditorToken(button);
                return;
            }

            if (editor.dataset.groupMode === 'true') {
                handleLicenseGroupSelection(button);
                return;
            }

            openLicenseTokenAddModal(button, true);
        });
    }

    list.appendChild(button);
}

function getLicenseTokenEditorValue(cell) {
    if (!cell) {
        return '';
    }

    return Array.from(
        cell.querySelectorAll('[data-license-token-value]')
    )
        .map(element => element.dataset.licenseTokenValue || '')
        .filter(Boolean)
        .join(' ');
}

function ensureLicenseTokenAddModal() {
    if (document.getElementById('licenseTokenAddModal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'licenseTokenAddModal';
    modal.className = 'license-text-modal-overlay';

    modal.innerHTML = `
        <div
            class="license-text-modal license-token-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="licenseTokenAddModalTitle">

            <button
                type="button"
                class="license-text-modal-close"
                onclick="closeLicenseTokenAddModal()"
                aria-label="Close">
                &times;
            </button>

            <h3
                id="licenseTokenAddModalTitle"
                class="license-text-modal-title">
                Select License
            </h3>

            <input
                type="text"
                id="licenseTokenSearch"
                class="manual-license-search"
                placeholder="Search license name or SPDX ID...">

            <select
                id="licenseTokenReferenceSelect"
                class="manual-license-select"
                size="12">
            </select>

            <label for="licenseTokenCustomName">Or enter a custom license name</label>
            <input
                type="text"
                id="licenseTokenCustomName"
                class="manual-license-search"
                placeholder="Custom name (overrides the selected reference)"
                aria-describedby="licenseTokenCustomNameHelp">
            <p id="licenseTokenCustomNameHelp">Unknown names can be matched manually after saving the component.</p>

            <div class="manual-license-actions">
                <button
                    type="button"
                    class="schema-btn"
                    onclick="closeLicenseTokenAddModal()">
                    Cancel
                </button>

                <button
                    type="button"
                    id="licenseTokenApplyButton"
                    class="schema-btn"
                    onclick="applySelectedLicenseToken()">
                    Add License
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', event => {
        if (event.target === modal) {
            closeLicenseTokenAddModal();
        }
    });

    document.body.appendChild(modal);

    const searchInput =
        document.getElementById('licenseTokenSearch');

    searchInput.addEventListener('input', () => {
        populateLicenseTokenReferenceOptions(
            searchInput.value
        );
    });
}

function getAvailableLicenseReferences() {
    const references = Array.isArray(licenseReferenceEntries)
        ? licenseReferenceEntries
        : [];

    const result = [];
    const seen = new Set();

    references.forEach(reference => {
        if (!reference || typeof reference !== 'object') {
            return;
        }

        const spdxId = String(
            reference.spdxId || ''
        ).trim();

        const licenseName = String(
            reference.licTypeName ||
            reference.name ||
            ''
        ).trim();

        const value = spdxId || licenseName;

        if (!value) {
            return;
        }

        const key = value.toLowerCase();

        if (seen.has(key)) {
            return;
        }

        seen.add(key);

        result.push({
            value,
            spdxId,
            licenseName
        });
    });

    return result.sort((a, b) =>
        a.value.localeCompare(b.value)
    );
}

function populateLicenseTokenReferenceOptions(searchText = '') {
    const select = document.getElementById(
        'licenseTokenReferenceSelect'
    );

    if (!select) {
        return;
    }

    const search = String(searchText || '')
        .trim()
        .toLowerCase();

    const references = getAvailableLicenseReferences()
        .filter(reference => {
            if (!search) {
                return true;
            }

            return reference.value
                .toLowerCase()
                .includes(search) ||
                reference.licenseName
                    .toLowerCase()
                    .includes(search) ||
                reference.spdxId
                    .toLowerCase()
                    .includes(search);
        });

    select.innerHTML = '';

    references.forEach(reference => {
        const option = document.createElement('option');
        option.value = reference.value;

        option.textContent =
            reference.licenseName &&
            reference.spdxId &&
            reference.licenseName !== reference.spdxId
                ? `${reference.spdxId} — ${reference.licenseName}`
                : reference.value;

        select.appendChild(option);
    });

    if (select.options.length > 0) {
        select.selectedIndex = 0;
    }
}

function openLicenseTokenAddModal(
    sourceElement,
    replaceExisting = false
) {
    ensureLicenseTokenAddModal();

    const editor = sourceElement.closest(
        '.license-token-editor'
    );

    if (!editor) {
        return;
    }

    activeLicenseTokenEditor = {
        editor,
        replaceExisting,
        targetButton: replaceExisting
            ? sourceElement
            : null
    };

    const searchInput =
        document.getElementById('licenseTokenSearch');

    if (searchInput) {
        searchInput.value = '';
    }

    const customNameInput = document.getElementById('licenseTokenCustomName');
    if (customNameInput) customNameInput.value = '';
    const applyButton = document.getElementById('licenseTokenApplyButton');
    if (applyButton) applyButton.textContent = replaceExisting ? 'Apply License' : 'Add License';

    populateLicenseTokenReferenceOptions('');

    const modal = document.getElementById(
        'licenseTokenAddModal'
    );

    modal.classList.add('open');
    document.body.classList.add('license-modal-open');

    if (searchInput) {
        searchInput.focus();
    }
}

function applySelectedLicenseToken() {
    if (!activeLicenseTokenEditor) {
        return;
    }

    const select = document.getElementById(
        'licenseTokenReferenceSelect'
    );

    const customName = String(document.getElementById('licenseTokenCustomName')?.value || '').trim();
    const selectedLicense = customName || (select ? String(select.value || '').trim() : '');

    if (!selectedLicense) {
        showError('Please select a license or enter a custom license name.');
        return;
    }

    if (customName && /[(),;]|\b(?:AND|OR|WITH)\b/i.test(customName)) {
        showError('Enter one license name without parentheses, separators, or AND/OR/WITH operators. Use the license editor to combine licenses.');
        return;
    }

    const {
        editor,
        replaceExisting,
        targetButton
    } = activeLicenseTokenEditor;

    const list = editor.querySelector(
        '.license-token-list'
    );

    if (!list) {
        return;
    }

    if (replaceExisting && targetButton) {
        targetButton.dataset.licenseTokenValue =
            selectedLicense;

        targetButton.textContent = selectedLicense;
    } else {
        const existingTokens = list.querySelectorAll(
            '[data-license-token-value]'
        );

        const lastToken =
            existingTokens.length > 0
                ? existingTokens[
                    existingTokens.length - 1
                ]
                : null;

        if (
            lastToken &&
            lastToken.dataset.licenseTokenType ===
                'license'
        ) {
            appendLicenseEditorToken(
                list,
                'operator',
                'AND'
            );
        }

        appendLicenseEditorToken(
            list,
            'license',
            selectedLicense
        );
    }

    closeLicenseTokenAddModal();
}

function closeLicenseTokenAddModal() {
    const modal = document.getElementById(
        'licenseTokenAddModal'
    );

    if (modal) {
        modal.classList.remove('open');
    }

    document.body.classList.remove(
        'license-modal-open'
    );

    activeLicenseTokenEditor = null;
}

function toggleLicenseTokenDeleteMode(deleteButton) {
    const editor = deleteButton.closest('.license-token-editor');

    if (!editor) {
        return;
    }

    const deleteModeActive =
        editor.dataset.deleteMode === 'true';

    document.querySelectorAll('.license-token-editor').forEach(item => {
        item.dataset.deleteMode = 'false';
        item.classList.remove('license-token-delete-mode');

        const button = item.querySelector('.license-token-delete');

        if (button) {
            button.textContent = 'Delete';
        }
    });

    if (!deleteModeActive) {
        editor.dataset.deleteMode = 'true';
        editor.classList.add('license-token-delete-mode');
        deleteButton.textContent = 'Select license';
    }
}

function deleteLicenseEditorToken(licenseButton) {
    if (!licenseButton) {
        return;
    }

    const editor = licenseButton.closest('.license-token-editor');
    const list = licenseButton.closest('.license-token-list');

    if (!editor || !list) {
        return;
    }

    const tokens = Array.from(
        list.querySelectorAll('[data-license-token-value]')
    );

    const currentIndex = tokens.indexOf(licenseButton);

    if (currentIndex === -1) {
        return;
    }

    const previousToken = tokens[currentIndex - 1] || null;
    const nextToken = tokens[currentIndex + 1] || null;

    licenseButton.remove();

    if (
        previousToken &&
        previousToken.dataset.licenseTokenType === 'operator'
    ) {
        previousToken.remove();
    } else if (
        nextToken &&
        nextToken.dataset.licenseTokenType === 'operator'
    ) {
        nextToken.remove();
    }

    editor.dataset.deleteMode = 'false';
    editor.classList.remove('license-token-delete-mode');

    const deleteButton = editor.querySelector(
        '.license-token-delete'
    );

    if (deleteButton) {
        deleteButton.textContent = 'Delete';
    }
}

function toggleLicenseTokenGroupMode(groupButton) {
    const editor = groupButton.closest('.license-token-editor');

    if (!editor) {
        return;
    }

    const isActive = editor.dataset.groupMode === 'true';

    resetLicenseTokenEditorModes(editor);

    if (isActive) {
        return;
    }

    editor.dataset.groupMode = 'true';
    editor.dataset.groupStartIndex = '';
    editor.classList.add('license-token-group-mode');

    groupButton.textContent = 'Select first license';
}

function resetLicenseTokenEditorModes(editor) {
    if (!editor) {
        return;
    }

    editor.dataset.deleteMode = 'false';
    editor.dataset.groupMode = 'false';
    editor.dataset.groupStartIndex = '';

    editor.classList.remove(
        'license-token-delete-mode',
        'license-token-group-mode'
    );

    editor.querySelectorAll(
        '.license-token-group-selected'
    ).forEach(button => {
        button.classList.remove(
            'license-token-group-selected'
        );
    });

    const deleteButton = editor.querySelector(
        '.license-token-delete'
    );

    if (deleteButton) {
        deleteButton.textContent = 'Delete';
    }

    const groupButton = editor.querySelector(
        '.license-token-group'
    );

    if (groupButton) {
        groupButton.textContent = 'Group ( )';
    }
}

function handleLicenseGroupSelection(licenseButton) {
    const editor = licenseButton.closest(
        '.license-token-editor'
    );

    const list = licenseButton.closest(
        '.license-token-list'
    );

    if (!editor || !list) {
        return;
    }

    const licenseButtons = Array.from(
        list.querySelectorAll(
            '[data-license-token-type="license"]'
        )
    );

    const selectedIndex =
        licenseButtons.indexOf(licenseButton);

    if (selectedIndex === -1) {
        return;
    }

    const startValue =
        editor.dataset.groupStartIndex;

    if (startValue === '') {
        editor.dataset.groupStartIndex =
            String(selectedIndex);

        licenseButton.classList.add(
            'license-token-group-selected'
        );

        const groupButton = editor.querySelector(
            '.license-token-group'
        );

        if (groupButton) {
            groupButton.textContent =
                'Select last license';
        }

        return;
    }

    const startIndex = Number(startValue);
    const endIndex = selectedIndex;

    if (
        !Number.isInteger(startIndex) ||
        startIndex === endIndex
    ) {
        resetLicenseTokenEditorModes(editor);
        return;
    }

    const firstIndex = Math.min(
        startIndex,
        endIndex
    );

    const lastIndex = Math.max(
        startIndex,
        endIndex
    );

    addLicenseGroup(
        list,
        licenseButtons[firstIndex],
        licenseButtons[lastIndex]
    );

    resetLicenseTokenEditorModes(editor);
}

function addLicenseGroup(
    list,
    firstLicenseButton,
    lastLicenseButton
) {
    if (
        !list ||
        !firstLicenseButton ||
        !lastLicenseButton
    ) {
        return;
    }

    const openParenthesis =
        createLicenseParenthesisToken('(');

    const closeParenthesis =
        createLicenseParenthesisToken(')');

    list.insertBefore(
        openParenthesis,
        firstLicenseButton
    );

    lastLicenseButton.insertAdjacentElement(
        'afterend',
        closeParenthesis
    );
}

function createLicenseParenthesisToken(value) {
    const button =
        document.createElement('button');

    button.type = 'button';
    button.className =
        'license-token-button license-token-parenthesis';

    button.dataset.licenseTokenType =
        'parenthesis';

    button.dataset.licenseTokenValue =
        value;

    button.textContent = value;
    button.title =
        'Click to remove this parenthesis group';

    button.addEventListener('click', () => {
        removeLicenseParenthesisGroup(button);
    });

    return button;
}

function removeLicenseParenthesisGroup(
    parenthesisButton
) {
    const list = parenthesisButton.closest(
        '.license-token-list'
    );

    if (!list) {
        return;
    }

    const tokens = Array.from(
        list.querySelectorAll(
            '[data-license-token-value]'
        )
    );

    const clickedIndex =
        tokens.indexOf(parenthesisButton);

    const clickedValue =
        parenthesisButton.dataset
            .licenseTokenValue;

    if (clickedIndex === -1) {
        return;
    }

    let depth = 0;
    let matchingButton = null;

    if (clickedValue === '(') {
        for (
            let index = clickedIndex + 1;
            index < tokens.length;
            index += 1
        ) {
            const value =
                tokens[index].dataset
                    .licenseTokenValue;

            if (value === '(') {
                depth += 1;
            } else if (
                value === ')' &&
                depth === 0
            ) {
                matchingButton = tokens[index];
                break;
            } else if (value === ')') {
                depth -= 1;
            }
        }
    } else {
        for (
            let index = clickedIndex - 1;
            index >= 0;
            index -= 1
        ) {
            const value =
                tokens[index].dataset
                    .licenseTokenValue;

            if (value === ')') {
                depth += 1;
            } else if (
                value === '(' &&
                depth === 0
            ) {
                matchingButton = tokens[index];
                break;
            } else if (value === '(') {
                depth -= 1;
            }
        }
    }

    if (matchingButton) {
        matchingButton.remove();
    }

    parenthesisButton.remove();
}
;

// Keep CycloneDX JSON evidence text blocks aligned with the declared licenses.
function syncComponentLicenseTexts(component, previousLicenses = [], licenseTexts = {}) {
    if (!component || !Array.isArray(component.licenses)) return;

    const getTerms = items => items.flatMap(item => {
        const value = String(item?.expression || item?.license?.id || item?.license?.name || '').trim();
        const parsed = parseLicenseExpressionTree(value);
        return parsed.tree ? flattenLicenseExpressionTree(parsed.tree) : splitLicenseTerms(value);
    }).filter(Boolean);
    const terms = getTerms(component.licenses);
    const oldTerms = getTerms(previousLicenses);
    const removedTerms = oldTerms.filter((term, index) =>
        oldTerms.slice(0, index + 1).filter(value => value === term).length > terms.filter(value => value === term).length);
    const addedTerms = terms.filter((term, index) =>
        terms.slice(0, index + 1).filter(value => value === term).length > oldTerms.filter(value => value === term).length);
    const evidence = Array.isArray(component.evidence?.licenses) ? component.evidence.licenses : [];
    const available = [...evidence, ...previousLicenses.filter(item => item?.license && !evidence.some(entry =>
        (entry?.license?.id || entry?.license?.name) === (item.license.id || item.license.name)))];
    const byName = new Map();
    available.forEach(item => {
        const name = String(item?.license?.id || item?.license?.name || '').trim();
        if (name) {
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name).push(item);
        }
    });

    if (!component.evidence || typeof component.evidence !== 'object') component.evidence = {};
    component.evidence.licenses = terms.map((term, evidenceIndex) => {
        let source = byName.get(term)?.shift();
        // Preserve text on a replacement, but never rename a retained license on insertion/removal.
        if (!source && removedTerms.length === addedTerms.length) {
            source = byName.get(removedTerms[addedTerms.indexOf(term)])?.shift();
        }
        const entry = source ? JSON.parse(JSON.stringify(source)) : { license: { id: term } };
        const license = entry.license;
        if (license.id !== undefined || license.name === undefined) license.id = term;
        else license.name = term;
        if (license.name && source && license.name === source.license.id) license.name = term;
        if (!license.text || typeof license.text !== 'object' || Array.isArray(license.text)) {
            license.text = { contentType: 'text/plain', content: typeof license.text === 'string' ? license.text : '' };
        }
        if (typeof license.text.content !== 'string') license.text.content = '';
        const sourceName = source?.license?.id || source?.license?.name || '';
        const indexedKey = `${term}#${evidenceIndex}`;
        const textKey = Object.prototype.hasOwnProperty.call(licenseTexts, indexedKey)
            ? indexedKey
            : terms.indexOf(term) === evidenceIndex
                ? Object.prototype.hasOwnProperty.call(licenseTexts, term) ? term : sourceName
                : indexedKey;
        if (Object.prototype.hasOwnProperty.call(licenseTexts, textKey)) {
            license.text.content = String(licenseTexts[textKey] ?? '');
            // The editor saves plain text, even when the original attachment was encoded.
            delete license.text.encoding;
        }
        return entry;
    });
}
;

// Move saved text edits with their license occurrences when expression positions change.
function remapLicenseTextEdits(licenseTexts = {}, previousValue = '', nextValue = '') {
    const getTerms = value => String(value || '').split(',').flatMap(expression => {
        const parsed = parseLicenseExpressionTree(expression.trim());
        return parsed.tree ? flattenLicenseExpressionTree(parsed.tree) : splitLicenseTerms(expression.trim());
    }).filter(Boolean);
    const previousTerms = getTerms(previousValue);
    const nextTerms = getTerms(nextValue);
    const unused = new Set(previousTerms.map((term, index) => index));
    const sourceIndices = nextTerms.map(term => {
        const index = Array.from(unused).find(candidate => previousTerms[candidate] === term);
        if (index !== undefined) unused.delete(index);
        return index;
    });
    const missing = sourceIndices.filter(index => index === undefined).length;
    if (missing === unused.size) {
        sourceIndices.forEach((index, nextIndex) => {
            if (index !== undefined) return;
            const replacementIndex = unused.values().next().value;
            sourceIndices[nextIndex] = replacementIndex;
            unused.delete(replacementIndex);
        });
    }
    const remapped = {};
    sourceIndices.forEach((sourceIndex, nextIndex) => {
        if (sourceIndex === undefined) return;
        const sourceName = previousTerms[sourceIndex];
        const indexedKey = `${sourceName}#${sourceIndex}`;
        const key = Object.prototype.hasOwnProperty.call(licenseTexts, indexedKey)
            ? indexedKey
            : previousTerms.indexOf(sourceName) === sourceIndex ? sourceName : indexedKey;
        if (Object.prototype.hasOwnProperty.call(licenseTexts, key)) {
            remapped[`${nextTerms[nextIndex]}#${nextIndex}`] = licenseTexts[key];
        }
    });
    return remapped;
}
;

function toggleRowEdit(editKey, rowDomId) {
    if (currentValidationMode !== 'tooldownload') {
        return;
    }

    const row = document.querySelector(`tr[data-row-id="${CSS.escape(rowDomId)}"]`);
    const rowRef = tooldownloadRowRefs.get(editKey);
    if (!row || !rowRef || !rowRef.rawData) {
        showError('No editable SBOM row was found for this entry.');
        return;
    }

    const raw = rowRef.rawData;
    const isEditing = row.dataset.tooldownloadEditing === 'true';

    if (!isEditing) {
        const fields = [
            ['name', rowRef.name || raw.name || raw.SPDXID || ''],
            ['version', rowRef.version || raw.version || raw.versionInfo || ''],
            ['licenses', rowRef.licenses && rowRef.licenses.length
                ? Array.from(new Set(rowRef.licenses
                    .map(lic => lic.expression || lic.license?.id || lic.license?.name || '')
                    .filter(Boolean))).join(', ')
                : (raw.licenseConcluded || raw.licenseDeclared || '')],
            ['copyright', rowRef.copyright || raw.copyright || raw.copyrightText || ''],
            ['sourceFile', rowRef.sourceFile || raw.sourceFile || '']
        ];

        fields.forEach(([field, value]) => {
            const cell = row.querySelector(`[data-edit-cell="${field}"]`);
            if (!cell) return;
            const safeValue = String(value || '');
            if (field === 'licenses') {
                cell.dataset.editField = 'licenses';

                renderLicenseTokenEditor(
                    cell,
                    safeValue
                );
            } else {
                cell.innerHTML = `<div class="tooldownload-editable" data-edit-field="${field}" contenteditable="true" spellcheck="false">${escapeHtml(safeValue)}</div>`;
            }
        });

        const button = row.querySelector(`[data-edit-action="${rowDomId}"]`);
        if (button) {
            button.textContent = 'Save';
        }
        row.dataset.tooldownloadEditing = 'true';
        row.classList.add('tooldownload-editing');

        // Store old values on the row element so the save path can diff them
        row.dataset.tdOldName      = fields.find(f => f[0] === 'name')?.[1]      || '';
        row.dataset.tdOldVersion   = fields.find(f => f[0] === 'version')?.[1]   || '';
        row.dataset.tdOldLicenses  = fields.find(f => f[0] === 'licenses')?.[1]  || '';
        row.dataset.tdOldCopyright = fields.find(f => f[0] === 'copyright')?.[1] || '';
        row.dataset.tdOldSourceFile = fields.find(f => f[0] === 'sourceFile')?.[1] || '';
        return;
    }

    const readField = field => {
        if (field === 'licenses') {
            const cell = row.querySelector(
                '[data-edit-cell="licenses"]'
            );

            return getLicenseTokenEditorValue(cell);
        }

        const el = row.querySelector(
            `[data-edit-field="${field}"]`
        );

        if (!el) {
            return '';
        }

        return String(
            el.value !== undefined
                ? el.value
                : el.textContent || ''
        ).trim();
    };

    const nextSection = rowRef.section || '';
    const nextName = readField('name');
    const nextVersion = readField('version');
    const nextLicenses = readField('licenses');
    const nextCopyright = readField('copyright');
    const nextSourceFile = readField('sourceFile');

    const isXmlNode = typeof raw.nodeType === 'number' && typeof raw.querySelector === 'function';

    if (isXmlNode) {
        const upsertXmlChildText = (parent, tagName, value) => {
            if (!parent) return;
            let child = parent.querySelector(`:scope > ${tagName}`);
            if (!value) {
                if (child) child.remove();
                return;
            }
            if (!child) {
                child = parent.ownerDocument.createElement(tagName);
                parent.appendChild(child);
            }
            child.textContent = value;
        };

        if (raw.getAttribute) {
        }
        upsertXmlChildText(raw, 'name', nextName);
        upsertXmlChildText(raw, 'version', nextVersion);
        upsertXmlChildText(raw, 'copyright', nextCopyright);

        const licensesNode = raw.querySelector(':scope > licenses');
        if (licensesNode) {
            const existingLicenseNodes = Array.from(licensesNode.children);
            const tokens = nextLicenses.split(',').map(part => part.trim()).filter(Boolean);
            licensesNode.innerHTML = '';
            tokens.forEach((token, index) => {
                const licenseNode = existingLicenseNodes[index] || raw.ownerDocument.createElement('license');
                if (/\bAND\b|\bOR\b|\bWITH\b/i.test(token)) {
                    const exprNode = licenseNode.querySelector(':scope > expression') || raw.ownerDocument.createElement('expression');
                    const idNode = licenseNode.querySelector(':scope > id');
                    if (idNode) idNode.remove();
                    exprNode.textContent = token;
                    licenseNode.appendChild(exprNode);
                } else {
                    const idNode = licenseNode.querySelector(':scope > id') || raw.ownerDocument.createElement('id');
                    const exprNode = licenseNode.querySelector(':scope > expression');
                    if (exprNode) exprNode.remove();
                    idNode.textContent = token;
                    licenseNode.appendChild(idNode);
                }
                licensesNode.appendChild(licenseNode);
            });
        }

        const propertiesNode = raw.querySelector(':scope > properties');
        if (nextSourceFile) {
            const props = propertiesNode || raw.ownerDocument.createElement('properties');
            if (!propertiesNode) {
                raw.appendChild(props);
            }
            const existing = props.querySelector(':scope > property[name="localSourceFile"]');
            if (existing) {
                existing.textContent = nextSourceFile;
            } else {
                const prop = raw.ownerDocument.createElement('property');
                prop.setAttribute('name', 'localSourceFile');
                prop.textContent = nextSourceFile;
                props.appendChild(prop);
            }
        }
    } else {
        raw.name = nextName;
        if (typeof raw.version !== 'undefined') raw.version = nextVersion;
        if (typeof raw.versionInfo !== 'undefined') raw.versionInfo = nextVersion;
        if (typeof raw.copyright !== 'undefined') raw.copyright = nextCopyright;
        if (typeof raw.copyrightText !== 'undefined') raw.copyrightText = nextCopyright;

        if (nextSourceFile) {
            raw.sourceFile = nextSourceFile;
        }

        const tokens = nextLicenses.split(',').map(part => part.trim()).filter(Boolean);
        const isExpressionToken = token => /\bAND\b|\bOR\b|\bWITH\b|[()]/i.test(token || '');
        const previousLicenses = Array.isArray(raw.licenses) ? raw.licenses : [];

        if (Array.isArray(raw.licenses)) {
            const existingLicenses = raw.licenses;
            raw.licenses = tokens.map((token, index) => {
                const existing = existingLicenses[index] || {};
                if (isExpressionToken(token)) {
                    const updated = { ...existing, expression: token };
                    delete updated.license;
                    return updated;
                }
                const updated = {
                    ...existing,
                    license: { ...(existing.license || {}), id: token }
                };
                // Switching from expression -> plain ID must clear stale expression.
                delete updated.expression;
                return updated;
            });
        }

        const previousValue = previousLicenses.map(item => item.expression || item.license?.id || item.license?.name || '').join(', ');
        const licenseTexts = remapLicenseTextEdits(tooldownloadEdits.get(editKey)?.licenseTexts, previousValue, nextLicenses);
        syncComponentLicenseTexts(raw, previousLicenses, licenseTexts);
        if (Array.isArray(raw.licenses)) {
            // Replay starts from the original file, so retain every current text,
            // including text on licenses added earlier in this editing session.
            raw.evidence.licenses.forEach((entry, index) => {
                const name = entry.license.id || entry.license.name;
                licenseTexts[`${name}#${index}`] = extractLicenseDocumentText(entry);
            });
            const existingEdit = tooldownloadEdits.get(editKey) || {};
            tooldownloadEdits.set(editKey, { ...existingEdit, licenseTexts });
        }
        if (previousValue !== nextLicenses) {
            const prefix = [rowRef.name || '', rowRef.version || ''].map(value => String(value).trim().toLowerCase()).join('::') + '::';
            for (const key of manualLicenseTextOverrides.keys()) {
                if (key.startsWith(prefix)) manualLicenseTextOverrides.delete(key);
            }
        }

        if (typeof raw.licenseConcluded !== 'undefined') {
            raw.licenseConcluded = tokens[0] || '';
        }
        if (typeof raw.licenseDeclared !== 'undefined') {
            raw.licenseDeclared = tokens[1] || tokens[0] || '';
        }
    }

    tooldownloadEdits.set(editKey, {
        ...tooldownloadEdits.get(editKey),
        section: nextSection,
        name: nextName,
        version: nextVersion,
        licenses: nextLicenses,
        copyright: nextCopyright,
        sourceFile: nextSourceFile
    });

    const fieldDefs = [
        ['name',       row.dataset.tdOldName || '',       nextName],
        ['version',    row.dataset.tdOldVersion || '',    nextVersion],
        ['licenses',   row.dataset.tdOldLicenses || '',   nextLicenses],
        ['copyright',  row.dataset.tdOldCopyright || '',  nextCopyright],
        ['sourceFile', row.dataset.tdOldSourceFile || '', nextSourceFile]
    ];
    const changes = fieldDefs
        .filter(([, oldVal, newVal]) => oldVal !== newVal)
        .map(([field, oldValue, newValue]) => ({ field, oldValue, newValue }));

    if (changes.length > 0) {
        editChangeLog.push({
            timestamp: new Date().toISOString(),
            rowId: editKey,
            section: nextSection,
            name: nextName,
            changes
        });
    }

    row.dataset.tooldownloadEditing = 'false';
    row.classList.remove('tooldownload-editing');
    const button = row.querySelector(`[data-edit-action="${rowDomId}"]`);
    if (button) {
        button.textContent = 'Edit';
    }
    if (typeof updateChangeTrackingUi === 'function') {
        updateChangeTrackingUi();
    }

    // Capture position context so restoreTooldownloadEditPosition() can scroll
    // back to this row (or the nearest visible row in the same filter) after revalidation.
    const allComponentRows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleComponentRows = allComponentRows.filter(r => r.style.display !== 'none');
    const thisComponentKey = row.dataset.componentKey || editKey;
    tooldownloadEditNavigationContext = {
        filterMode: window.__activeFilterMode || 'all',
        componentKey: thisComponentKey,
        componentIndex: visibleComponentRows.indexOf(row)
    };
    pendingTooldownloadStatusChange = {
        componentKey: thisComponentKey,
        previousStatus: row.dataset.valid === 'valid' ? 'valid' : 'invalid',
        name: nextName || rowRef.name || '',
        section: nextSection || rowRef.section || ''
    };

    revalidateIfLoaded();
}
;

function downloadEditedSbom() {
    if (!currentSbomData) {
        showError('Load an SBOM before downloading an edited copy.');
        return;
    }

    let content = '';
    let mime = 'application/json';
    const originalName = currentSbomFile && currentSbomFile.name ? currentSbomFile.name : 'sbom';

    if (currentFileType === 'xml' && typeof XMLSerializer !== 'undefined' && currentSbomData instanceof Document) {
        content = new XMLSerializer().serializeToString(currentSbomData);
        mime = 'application/xml';
    } else {
        content = JSON.stringify(currentSbomData, null, 2);
    }

    const dot = originalName.lastIndexOf('.');
    const exportName = dot > 0 ? `${originalName.slice(0, dot)}-edited${originalName.slice(dot)}` : `${originalName}-edited`;
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
;

// Resolve a dot/bracket path like 'components[0].name' into the JSON object at that path.
function _tdResolveJsonPath(root, path) {
    if (!path || typeof root !== 'object' || root === null) return null;
    let current = root;
    const tokens = path.replace(/\[/g, '.').replace(/\]/g, '').split('.');
    for (const token of tokens) {
        if (token === '') continue;
        if (current === null || typeof current !== 'object') return null;
        const idx = Number(token);
        current = Number.isNaN(idx) ? current[token] : current[idx];
    }
    return (current !== undefined && current !== null && typeof current === 'object') ? current : null;
}

// Resolve a path like 'components[2]' into an XML element inside the Document.
function _tdResolveXmlPath(doc, path) {
    if (!path || !(doc instanceof Document)) return null;
    if (path === 'metadata.component') return doc.querySelector('metadata > component') || null;
    const compMatch = path.match(/^components\[(\d+)\]$/);
    if (compMatch) {
        const nodes = doc.querySelectorAll('components > component');
        return nodes[parseInt(compMatch[1], 10)] || null;
    }
    const toolMatch = path.match(/^metadata\.tools\.components\[(\d+)\]$/);
    if (toolMatch) {
        const nodes = doc.querySelectorAll('metadata > tools > component');
        return nodes[parseInt(toolMatch[1], 10)] || null;
    }
    return null;
}

function applyTooldownloadEditsToLoadedData(loadedData) {
    if (!loadedData || !(tooldownloadEdits instanceof Map) || tooldownloadEdits.size === 0) {
        return loadedData;
    }

    if (currentFileType === 'xml' && loadedData instanceof Document) {
        tooldownloadEdits.forEach((edit, objectPath) => {
            const node = _tdResolveXmlPath(loadedData, objectPath);
            if (!node || !edit) return;

            const upsertXmlChildText = (parent, tagName, value) => {
                if (!parent) return;
                let child = parent.querySelector(`:scope > ${tagName}`);
                if (!value) {
                    if (child) child.remove();
                    return;
                }
                if (!child) {
                    child = parent.ownerDocument.createElement(tagName);
                    parent.appendChild(child);
                }
                child.textContent = value;
            };

            if (typeof edit.name === 'string') upsertXmlChildText(node, 'name', edit.name);
            if (typeof edit.version === 'string') upsertXmlChildText(node, 'version', edit.version);
            if (typeof edit.copyright === 'string') upsertXmlChildText(node, 'copyright', edit.copyright);

            if (typeof edit.licenses === 'string') {
                const licensesNode = node.querySelector(':scope > licenses');
                if (licensesNode) {
                    licensesNode.innerHTML = '';
                    edit.licenses.split(',').map(part => part.trim()).filter(Boolean).forEach(token => {
                        const licenseNode = node.ownerDocument.createElement('license');
                        if (/\bAND\b|\bOR\b|\bWITH\b/i.test(token)) {
                            const exprNode = node.ownerDocument.createElement('expression');
                            exprNode.textContent = token;
                            licenseNode.appendChild(exprNode);
                        } else {
                            const idNode = node.ownerDocument.createElement('id');
                            idNode.textContent = token;
                            licenseNode.appendChild(idNode);
                        }
                        licensesNode.appendChild(licenseNode);
                    });
                }
            }

            if (typeof edit.sourceFile === 'string' && edit.sourceFile) {
                let propertiesNode = node.querySelector(':scope > properties');
                if (!propertiesNode) {
                    propertiesNode = node.ownerDocument.createElement('properties');
                    node.appendChild(propertiesNode);
                }
                let propertyNode = propertiesNode.querySelector(':scope > property[name="localSourceFile"]');
                if (!propertyNode) {
                    propertyNode = node.ownerDocument.createElement('property');
                    propertyNode.setAttribute('name', 'localSourceFile');
                    propertiesNode.appendChild(propertyNode);
                }
                propertyNode.textContent = edit.sourceFile;
            }
        });
        return loadedData;
    }

    if (typeof loadedData === 'object') {
        tooldownloadEdits.forEach((edit, objectPath) => {
            const target = _tdResolveJsonPath(loadedData, objectPath);
            if (!target || typeof target !== 'object') return;

            if (typeof edit.name === 'string') target.name = edit.name;
            if (typeof edit.version === 'string') {
                if ('version' in target) target.version = edit.version;
                if ('versionInfo' in target) target.versionInfo = edit.version;
            }
            if (typeof edit.copyright === 'string') {
                if ('copyright' in target) target.copyright = edit.copyright;
                if ('copyrightText' in target) target.copyrightText = edit.copyright;
            }
            if (typeof edit.licenses === 'string') {
                const tokens = edit.licenses.split(',').map(part => part.trim()).filter(Boolean);
                const isExpressionToken = token => /\bAND\b|\bOR\b|\bWITH\b|[()]/i.test(token || '');
                const previousLicenses = Array.isArray(target.licenses) ? target.licenses : [];

                if (Array.isArray(target.licenses)) {
                    const existingLicenses = target.licenses;
                    target.licenses = tokens.map((token, index) => {
                        const existing = existingLicenses[index] || {};
                        if (isExpressionToken(token)) {
                            const updated = { ...existing, expression: token };
                            delete updated.license;
                            return updated;
                        }
                        const updated = {
                            ...existing,
                            license: { ...(existing.license || {}), id: token }
                        };
                        // Ensure old expression does not override edited ID.
                        delete updated.expression;
                        return updated;
                    });
                }

                syncComponentLicenseTexts(target, previousLicenses, edit.licenseTexts);

                if ('licenseConcluded' in target) target.licenseConcluded = tokens[0] || '';
                if ('licenseDeclared' in target) target.licenseDeclared = tokens[1] || tokens[0] || '';
            }
            if (typeof edit.licenses !== 'string' && edit.licenseTexts) {
                syncComponentLicenseTexts(target, target.licenses, edit.licenseTexts);
            }
            if (typeof edit.sourceFile === 'string' && 'sourceFile' in target) {
                target.sourceFile = edit.sourceFile;
            }
        });
    }

    return loadedData;
}
;

function buildChangeLogMetadata() {
    const fileInfo = {};
    if (currentSbomFile) {
        fileInfo.name = currentSbomFile.name;
        fileInfo.size = currentSbomFile.size;
        fileInfo.lastModified = new Date(currentSbomFile.lastModified).toISOString();
    }
    fileInfo.format = currentFileType || 'unknown';

    const sbomInfo = {};
    if (currentSbomData) {
        if (currentFileType === 'spdx') {
            if (currentSbomData.spdxVersion) sbomInfo.spdxVersion = currentSbomData.spdxVersion;
            if (currentSbomData.dataLicense) sbomInfo.dataLicense = currentSbomData.dataLicense;
            if (currentSbomData.name) sbomInfo.name = currentSbomData.name;
            if (currentSbomData.SPDXID) sbomInfo.SPDXID = currentSbomData.SPDXID;
            if (currentSbomData.documentNamespace) sbomInfo.documentNamespace = currentSbomData.documentNamespace;
        } else if (currentFileType === 'xml') {
            const root = currentSbomData.documentElement;
            if (root) {
                const ver = root.getAttribute('version');
                if (ver) sbomInfo.specVersion = ver;
                const serial = root.getAttribute('serialNumber');
                if (serial) sbomInfo.serialNumber = serial;
                sbomInfo.bomFormat = 'CycloneDX';
                const metaComp = currentSbomData.querySelector('metadata > component > name');
                if (metaComp && metaComp.textContent) sbomInfo.metadataComponentName = metaComp.textContent;
            }
        } else if (currentSbomData && typeof currentSbomData === 'object') {
            if (currentSbomData.bomFormat) sbomInfo.bomFormat = currentSbomData.bomFormat;
            if (currentSbomData.specVersion) sbomInfo.specVersion = currentSbomData.specVersion;
            if (currentSbomData.version !== undefined) sbomInfo.version = currentSbomData.version;
            if (currentSbomData.serialNumber) sbomInfo.serialNumber = currentSbomData.serialNumber;
            const metaName = currentSbomData.metadata && currentSbomData.metadata.component && currentSbomData.metadata.component.name;
            if (metaName) sbomInfo.metadataComponentName = metaName;
        }
    }

    const validationMode = document.querySelector('input[name="validationMode"]:checked')?.value || 'tooldownload';
    return {
        generatedAt: new Date().toISOString(),
        tool: 'SBOM Validator',
        validationMode,
        sourceFile: Object.assign({}, fileInfo, Object.keys(sbomInfo).length ? { sbom: sbomInfo } : {})
    };
}
;
