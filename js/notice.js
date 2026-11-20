async function runTooldownloadEnrichment() {
    if (currentValidationMode !== 'tooldownload') {
        showError('Switch to Tooldownload mode to run AI enrichment.');
        return;
    }

    if (!Array.isArray(noticeFileEntries) || noticeFileEntries.length === 0) {
        showError('Load notice files before running AI enrichment.');
        return;
    }

    const rows = Array.from(tooldownloadRowRefs.entries());
    if (rows.length === 0) {
        showError('Load an SBOM before running AI enrichment.');
        return;
    }

    const status = document.getElementById('noticeFileStatus');
    if (status) {
        status.textContent = 'Enriching...';
    }

    for (const [, rowRef] of rows) {
        const raw = rowRef.rawData;
        if (!raw) continue;
        const name = String(rowRef.name || raw.name || raw.versionInfo || raw.SPDXID || '').trim();
        if (!name) continue;

        const notice = noticeFileEntries.find(entry => entry.name.toLowerCase().includes(name.toLowerCase()) || entry.content.toLowerCase().includes(name.toLowerCase()));
        if (!notice) continue;

        if (noticeExtractionCache.has(notice.path)) {
            continue;
        }

        try {
            const extracted = await extractNoticeDataWithCopilot(notice.content);
            noticeExtractionCache.set(notice.path, extracted);

            if (Array.isArray(extracted.licenses) && extracted.licenses.length > 0) {
                if (typeof raw.licenses !== 'undefined') {
                    raw.licenses = extracted.licenses.map(token => (/\bAND\b|\bOR\b|\bWITH\b/i.test(token)
                        ? { expression: token }
                        : { license: { id: token } }));
                }
                if (typeof raw.licenseConcluded !== 'undefined') {
                    raw.licenseConcluded = extracted.licenses[0] || raw.licenseConcluded;
                }
                if (typeof raw.licenseDeclared !== 'undefined') {
                    raw.licenseDeclared = extracted.licenses[1] || extracted.licenses[0] || raw.licenseDeclared;
                }
            }

            if (Array.isArray(extracted.copyrights) && extracted.copyrights.length > 0) {
                const copyrightText = extracted.copyrights[0];
                if (typeof raw.copyright !== 'undefined') raw.copyright = copyrightText;
                if (typeof raw.copyrightText !== 'undefined') raw.copyrightText = copyrightText;
            }
        } catch (error) {
            console.warn('AI enrichment failed for notice file', notice.path, error);
        }
    }

    if (status) {
        status.textContent = `✓ Loaded (${noticeFileEntries.length})`;
    }

    revalidateIfLoaded();
}
;

function resetTooldownloadState() {
    tooldownloadRowRefs = new Map();
    nextRowId = 1;
}
;

function filterTable(mode) {
    window.__activeFilterMode = mode;

    const btnAll = document.getElementById('filterAll');
    const btnInvalid = document.getElementById('filterInvalid');
    const btnWarning = document.getElementById('filterWarning');
    const btnValid = document.getElementById('filterValid');
    const btnLicenses = document.getElementById('filterLicenses');
    const btnCategory = document.getElementById('filterCategory');
    const btnNoCategory = document.getElementById('filterNoCategory');
    const btnInvalidIssues = document.getElementById('filterInvalidIssues');
    const btnNonCommercial = document.getElementById('filterNonCommercial');

    btnAll.className = 'filter-btn';
    btnInvalid.className = 'filter-btn';
    if (btnWarning) btnWarning.className = 'filter-btn';
    btnValid.className = 'filter-btn';
    if (btnLicenses) btnLicenses.className = 'filter-btn';
    if (btnCategory) btnCategory.className = 'filter-btn';
    if (btnNoCategory) btnNoCategory.className = 'filter-btn';
    if (btnInvalidIssues) btnInvalidIssues.className = 'filter-btn';
    if (btnNonCommercial) btnNonCommercial.className = 'filter-btn';

    if (mode === 'all') {
        btnAll.classList.add('active');
    } else if (mode === 'invalid') {
        btnInvalid.classList.add('active-invalid');
    } else if (mode === 'warning') {
        if (btnWarning) btnWarning.classList.add('active-warning');
    } else if (mode === 'valid') {
        btnValid.classList.add('active-valid');
    } else if (mode === 'licenses') {
        if (btnLicenses) btnLicenses.classList.add('active');
    } else if (mode === 'category') {
        if (btnCategory) btnCategory.classList.add('active');
    } else if (mode === 'no-category') {
        if (btnNoCategory) btnNoCategory.classList.add('active');
    } else if (mode === 'invalid-issues') {
        if (btnInvalidIssues) btnInvalidIssues.classList.add('active-invalid');
    }

    const table = document.getElementById('componentsTable');
    const licenseSummaryContainer = document.getElementById('licenseSummaryContainer');
    const categorySummaryContainer = document.getElementById('categorySummaryContainer');
    const noCategorySummaryContainer = document.getElementById('noCategorySummaryContainer');
    const invalidIssuesSummaryContainer = document.getElementById('invalidIssuesSummaryContainer');
    if (!table) return;

    if (mode === 'licenses') {
        table.style.display = 'none';
        if (licenseSummaryContainer) licenseSummaryContainer.style.display = 'block';
        if (categorySummaryContainer) categorySummaryContainer.style.display = 'none';
        if (noCategorySummaryContainer) noCategorySummaryContainer.style.display = 'none';
        if (invalidIssuesSummaryContainer) invalidIssuesSummaryContainer.style.display = 'none';
        return;
    }

    if (mode === 'category') {
        table.style.display = 'none';
        if (licenseSummaryContainer) licenseSummaryContainer.style.display = 'none';
        if (categorySummaryContainer) categorySummaryContainer.style.display = 'block';
        if (noCategorySummaryContainer) noCategorySummaryContainer.style.display = 'none';
        if (invalidIssuesSummaryContainer) invalidIssuesSummaryContainer.style.display = 'none';
        return;
    }

    if (mode === 'no-category') {
        table.style.display = 'none';
        if (licenseSummaryContainer) licenseSummaryContainer.style.display = 'none';
        if (categorySummaryContainer) categorySummaryContainer.style.display = 'none';
        if (noCategorySummaryContainer) noCategorySummaryContainer.style.display = 'block';
        if (invalidIssuesSummaryContainer) invalidIssuesSummaryContainer.style.display = 'none';
        return;
    }

    if (mode === 'invalid-issues') {
        table.style.display = 'none';
        if (licenseSummaryContainer) licenseSummaryContainer.style.display = 'none';
        if (categorySummaryContainer) categorySummaryContainer.style.display = 'none';
        if (noCategorySummaryContainer) noCategorySummaryContainer.style.display = 'none';
        if (invalidIssuesSummaryContainer) invalidIssuesSummaryContainer.style.display = 'block';
        return;
    }

    table.style.display = '';
    if (licenseSummaryContainer) licenseSummaryContainer.style.display = 'none';
    if (categorySummaryContainer) categorySummaryContainer.style.display = 'none';
    if (noCategorySummaryContainer) noCategorySummaryContainer.style.display = 'none';
    if (invalidIssuesSummaryContainer) invalidIssuesSummaryContainer.style.display = 'none';

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const validAttr = row.getAttribute('data-valid');
        const hasWarning = row.getAttribute('data-has-warning') === 'true';
        if (!validAttr) {
            row.style.display = '';
            return;
        }

        if (mode === 'all') {
            row.style.display = '';
        } else if (mode === 'invalid') {
            row.style.display = validAttr === 'invalid' ? '' : 'none';
        } else if (mode === 'warning') {
            row.style.display = hasWarning ? '' : 'none';
        } else if (mode === 'valid') {
            row.style.display = validAttr === 'valid' ? '' : 'none';
        }
    });
}
;

function toggleCategoryGroup(rowId, buttonEl) {
    const row = document.getElementById(rowId);
    if (!row || !buttonEl) {
        return;
    }

    const isOpen = row.style.display !== 'none';
    if (isOpen) {
        row.style.display = 'none';
        buttonEl.textContent = '+';
    } else {
        row.style.display = '';
        buttonEl.textContent = '-';
    }
}
;
