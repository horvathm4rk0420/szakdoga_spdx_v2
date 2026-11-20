function downloadChangeLog() {
    if (!editChangeLog || editChangeLog.length === 0) return;
    const payload = JSON.stringify({
        meta: buildChangeLogMetadata(),
        changes: editChangeLog
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `sbom-change-log-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
;

function importChangeLog() {
    if (!currentSbomFile) {
        showError('Load an SBOM before importing a change log.');
        return;
    }

    const input = document.getElementById('changeLogImportInput');
    if (!input) {
        showError('Change log import input is not available.');
        return;
    }

    input.value = '';
    input.click();
}
;

function applyImportedChangeLog(payload) {
    if (!currentSbomFile) {
        showError('Load an SBOM before importing a change log.');
        return;
    }

    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.changes)) {
        showError('Invalid change log file. Expected a JSON object with a changes array.');
        return;
    }

    const invalidOverride = payload.changes.some(entry => Array.isArray(entry?.changes) &&
        entry.changes.some(change => change && typeof change.field === 'string' &&
            (change.field === 'falsePositiveOverride' || change.field.startsWith('errorOverride:')) &&
            (typeof change.newValue !== 'string' || !['valid', 'invalid'].includes(change.newValue.trim().toLowerCase()) ||
                (change.field.startsWith('errorOverride:') && !change.field.slice('errorOverride:'.length).trim())))
    );
    if (invalidOverride) {
        showError('Invalid override change. Error overrides require an error message and overrides must use valid/invalid values.');
        return;
    }

    const rawLicenseMatches = payload.changes
        .filter(entry => entry && typeof entry === 'object' && entry.licenseMatch !== undefined && entry.licenseMatch !== null)
        .map(entry => ({ entry, match: entry.licenseMatch }));
    const invalidLicenseMatch = rawLicenseMatches.find(({ entry, match }) => {
        if (!match || typeof match !== 'object') return true;
        const scope = match.scope;
        const componentKey = typeof match.componentKey === 'string' ? match.componentKey.trim() : '';
        const licenseName = typeof match.licenseName === 'string' ? match.licenseName.trim() : '';
        const spdxId = typeof match.spdxId === 'string' ? match.spdxId.trim() : '';
        if (!licenseName || !spdxId || !['component', 'global'].includes(scope)) return true;
        if (scope === 'component' && !(componentKey || (typeof entry.rowId === 'string' && entry.rowId.trim()))) return true;
        return !Array.isArray(licenseReferenceEntries) || !licenseReferenceEntries.some(reference =>
            typeof reference?.spdxId === 'string' && reference.spdxId.trim().toLowerCase() === spdxId.toLowerCase()
        );
    });
    if (invalidLicenseMatch) {
        showError('This change log contains manual license matches. Load the corresponding License Reference file, including each selected SPDX ID, before importing it.');
        return;
    }

    const importedChanges = payload.changes
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
            timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
            rowId: typeof entry.rowId === 'string' ? entry.rowId : '',
            section: typeof entry.section === 'string' ? entry.section : '',
            name: typeof entry.name === 'string' ? entry.name : '',
            changes: Array.isArray(entry.changes)
                ? entry.changes
                    .filter(change => change && typeof change === 'object' && typeof change.field === 'string')
                    .map(change => ({
                        field: change.field,
                        oldValue: change.oldValue,
                        newValue: change.newValue,
                        collapsible: change.collapsible === true || change.field.startsWith('licenseText:')
                    }))
                : [],
            overrideReason: typeof entry.overrideReason === 'string' ? entry.overrideReason : '',
            licenseMatch: entry.licenseMatch && typeof entry.licenseMatch === 'object'
                ? {
                    scope: entry.licenseMatch.scope,
                    componentKey: typeof entry.licenseMatch.componentKey === 'string'
                        ? entry.licenseMatch.componentKey
                        : (typeof entry.rowId === 'string' ? entry.rowId : ''),
                    licenseName: typeof entry.licenseMatch.licenseName === 'string' ? entry.licenseMatch.licenseName : '',
                    spdxId: typeof entry.licenseMatch.spdxId === 'string' ? entry.licenseMatch.spdxId : ''
                }
                : null
        }));

    const editMap = new Map();
    const importedStatusEntries = [];
    const importedLicensePairings = new Map();

    importedChanges.forEach(entry => {
        if (entry.licenseMatch) {
            const pairing = entry.licenseMatch;
            const alias = normalizeLicenseName(pairing.licenseName).toLowerCase();
            const pairingKey = pairing.scope === 'component'
                ? `${pairing.componentKey}:${alias}`
                : alias;
            importedLicensePairings.set(pairingKey, pairing.spdxId.trim());
        }

        const editKey = entry.rowId || '';
        if (!editKey || !Array.isArray(entry.changes)) return;

        entry.changes.forEach(change => {
            if (!change || typeof change.field !== 'string') return;
            if (change.field === 'status' || change.field === 'falsePositiveOverride' || change.field.startsWith('errorOverride:')) {
                if (!importedStatusEntries.includes(entry)) importedStatusEntries.push(entry);
                return;
            }
            if (change.field.startsWith('licenseText:')) {
                const target = editMap.get(editKey) || { section: entry.section || '' };
                target.licenseTexts = target.licenseTexts || {};
                target.licenseTexts[change.field.slice('licenseText:'.length)] = String(change.newValue ?? '');
                editMap.set(editKey, target);
                return;
            }
            if (!['name', 'version', 'licenses', 'copyright', 'sourceFile'].includes(change.field)) {
                return;
            }
            const target = editMap.get(editKey) || {
                section: entry.section || ''
            };
            if (change.field === 'licenses' && target.licenseTexts) {
                target.licenseTexts = remapLicenseTextEdits(target.licenseTexts, change.oldValue, change.newValue);
            }
            target[change.field] = typeof change.newValue === 'string'
                ? change.newValue
                : String(change.newValue ?? '');
            if (change.field === 'name' && typeof change.newValue === 'string' && change.newValue.trim()) {
                target.name = change.newValue;
            }
            editMap.set(editKey, target);
        });
    });

    editChangeLog = importedChanges;
    pendingImportedStatusEntries = importedStatusEntries;
    if (tooldownloadEdits instanceof Map) {
        tooldownloadEdits.clear();
    } else {
        tooldownloadEdits = new Map();
    }
    editMap.forEach((value, key) => {
        tooldownloadEdits.set(key, value);
    });

    window.__manualErrorOverrides = {};
    window.__manualFalsePositives = {};
    if (rawLicenseMatches.length > 0) {
        manualLicensePairings = importedLicensePairings;
    }

    revalidateIfLoaded();
}
;

async function handleChangeLogImport(event) {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;

    try {
        const rawText = await file.text();
        const payload = JSON.parse(rawText);
        applyImportedChangeLog(payload);
    } catch (error) {
        showError(`Unable to import change log: ${error.message}`);
    } finally {
        if (input) {
            input.value = '';
        }
    }
}
;

function toggleChangeLog() {
    const entries = document.getElementById('changeLogEntries');
    const btn = document.getElementById('changeLogToggleBtn');
    if (!entries) return;
    const isVisible = entries.style.display !== 'none';
    entries.style.display = isVisible ? 'none' : '';
    if (btn) btn.innerHTML = isVisible ? '&#9660;' : '&#9650;';
}
;

function renderChangeLogValue(value, cssClass, collapsible) {
    const safeValue = escapeHtml(String(value ?? ''));

    if (!collapsible) {
        return `<span class="${cssClass}">${safeValue}</span>`;
    }

    return `
        <details class="change-log-collapsible">
            <summary class="${cssClass} change-log-text-toggle">[...]</summary>
            <pre class="change-log-expanded-text">${safeValue}</pre>
        </details>
    `;
}

function updateChangeTrackingUi() {
    const wrap = document.getElementById('changeLogWrap');
    const status = document.getElementById('changeStatusBanner');
    const count = document.getElementById('changeLogCount');
    const entries = document.getElementById('changeLogEntries');
    const downloadBtn = document.getElementById('downloadChangeLogBtn');
    const exportSbomBtn = document.getElementById('downloadEditedSbomBtn');

    const hasChanges = Array.isArray(editChangeLog) && editChangeLog.length > 0;

    if (wrap) wrap.classList.toggle('changed', hasChanges);

    if (status) {
        const entryWord = editChangeLog.length === 1 ? 'entry' : 'entries';
        status.textContent = hasChanges
            ? `Changes made: YES (${editChangeLog.length} ${entryWord})`
            : 'Changes made: NO';
    }

    if (count) {
        const entryWord = editChangeLog.length === 1 ? 'entry' : 'entries';
        count.textContent = `${editChangeLog.length} ${entryWord}`;
    }

    if (entries) {
        if (!hasChanges) {
            entries.innerHTML = '';
            entries.style.display = 'none';
            const toggleBtn = document.getElementById('changeLogToggleBtn');
            if (toggleBtn) toggleBtn.innerHTML = '&#9660;';
        } else {
            entries.style.display = '';
            entries.innerHTML = editChangeLog.map((entry, i) => {
                const changesHtml = Array.isArray(entry.changes) && entry.changes.length > 0
                    ? entry.changes.map(c =>
                        `<div class="change-log-field-change">
                            <span class="change-field">${escapeHtml(c.field)}</span>:

                            ${renderChangeLogValue(
                                c.oldValue,
                                'change-old',
                                c.collapsible === true
                            )}

                            <span class="change-arrow">→</span>

                            ${renderChangeLogValue(
                                c.newValue,
                                'change-new',
                                c.collapsible === true
                            )}
                        </div>`
                    ).join('')
                    : '<div class="change-log-field-change" style="color:var(--color-grey-600);">(no field-level diff recorded)</div>';

                const reasonHtml = entry.overrideReason
                    ? `<div class="change-log-override-reason" style="margin-top: 8px; padding: 8px 12px; background: var(--color-grey-100); border-left: 3px solid var(--color-vivid-green-600); border-radius: 2px; font-style: italic; color: var(--color-grey-700);">Reason: ${escapeHtml(entry.overrideReason)}</div>`
                    : '';
                return `<div class="change-log-entry">
                    <div class="change-log-entry-header">
                        <span class="change-entry-num">#${i + 1}</span>
                        <span class="change-entry-name">${escapeHtml(entry.name || '')} <span style="font-weight:normal;color:var(--color-grey-600);">(${escapeHtml(entry.section || '')})</span></span>
                        <span class="change-entry-time">${escapeHtml(entry.timestamp || '')}</span>
                    </div>
                    ${changesHtml}
                    ${reasonHtml}
                </div>`;
            }).join('');
        }
    }

    if (downloadBtn) downloadBtn.disabled = !hasChanges;
    if (exportSbomBtn) exportSbomBtn.disabled = !currentSbomData;
}
;

async function loadNoticeFiles(event) {
    const files = Array.from(event?.target?.files || []);
    noticeFileEntries = [];
    noticeFileNameIndex = new Map();
    noticeExtractionCache = new Map();

    if (files.length === 0) {
        const status = document.getElementById('noticeFileStatus');
        if (status) {
            status.textContent = '✗ Not Loaded';
            status.className = 'schema-status schema-missing';
        }
        return;
    }

    const reads = files.map(file => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve({ file, content: String(reader.result || '') });
        reader.onerror = () => resolve({ file, content: '' });
        reader.readAsText(file);
    }));

    const loaded = await Promise.all(reads);
    loaded.forEach(item => {
        const entry = {
            path: item.file.webkitRelativePath || item.file.name,
            name: item.file.name,
            content: item.content
        };
        noticeFileEntries.push(entry);
        noticeFileNameIndex.set(entry.name.toLowerCase(), entry);
    });

    const status = document.getElementById('noticeFileStatus');
    if (status) {
        status.textContent = `✓ Loaded (${noticeFileEntries.length})`;
        status.className = 'schema-status schema-loaded';
    }
}
;

async function callNoticeExtractionAi(prompt, modelOverride) {
    const token = (document.getElementById('azureAiToken')?.value || azureAiToken || '').trim();
    const model = modelOverride || document.getElementById('azureAiModel')?.value || azureAiModel || 'gpt-4o-mini';

    if (!token) {
        throw new Error('AI token missing');
    }

    azureAiToken = token;
    azureAiModel = model;

    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    try {
        return JSON.parse(rawText);
    } catch (_) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('AI returned invalid JSON');
        }
        return JSON.parse(jsonMatch[0]);
    }
}
;

async function extractNoticeDataWithCopilot(content) {
    const prompt = [
        'Extract SBOM enrichment data from this notice file.',
        'Return JSON with keys: licenses, copyrights, authors, spdxIdentifiers.',
        'licenses must be an array of SPDX license identifiers or expressions.',
        'copyrights and authors must be arrays of strings.',
        'If nothing is found, return empty arrays.',
        '',
        content
    ].join('\n');

    const data = await callNoticeExtractionAi(prompt);
    return {
        licenses: Array.isArray(data?.licenses) ? data.licenses.map(v => String(v).trim()).filter(Boolean) : [],
        copyrights: Array.isArray(data?.copyrights) ? data.copyrights.map(v => String(v).trim()).filter(Boolean) : [],
        authors: Array.isArray(data?.authors) ? data.authors.map(v => String(v).trim()).filter(Boolean) : [],
        spdxIdentifiers: Array.isArray(data?.spdxIdentifiers) ? data.spdxIdentifiers.map(v => String(v).trim()).filter(Boolean) : []
    };
}
;
