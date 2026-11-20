window.CANNED_RESPONSES_DATA = [
    {
        id: 'default-1',
        title: 'Missing License Information',
        text: 'License information is missing or incomplete. Please provide the correct SPDX license identifier or license text.'
    },
    {
        id: 'default-2',
        title: 'Generic Copyright',
        text: 'The provided copyright notice belongs to the license text itself and not to the software component. For example, GPL/LGPL license texts contain their own copyright notices covering the license document. These notices do not identify the copyright holder of the software and therefore should not be provided as component copyright information.'
    },
    {
        id: 'default-3',
        title: 'Requires Manual Review',
        text: 'This component requires manual license verification. The automatic detection was inconclusive.'
    }
];
;

const STORAGE_KEY = 'cannedResponses_invalidIssues';
const SOURCE_VERSION_KEY = `${STORAGE_KEY}_sourceVersion`;
let cannedResponsesCache = null;
let cannedResponsesLoaded = false;

async function loadCannedResponses() {
    if (cannedResponsesLoaded && cannedResponsesCache !== null) {
        console.log('Returning cached responses: ' + cannedResponsesCache.length);
        return cannedResponsesCache;
    }
    
    const sourceResponses = Array.isArray(window.CANNED_RESPONSES_DATA)
        ? window.CANNED_RESPONSES_DATA
        : [];
    const validSourceResponses = sourceResponses
        .filter(response => response && typeof response.id === 'string'
            && typeof response.title === 'string' && typeof response.text === 'string')
        .map(response => ({ ...response }));

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const storedResponses = JSON.parse(stored);
            if (!Array.isArray(storedResponses)) throw new Error('Saved canned responses are not a list.');

            const sourceVersion = JSON.stringify(validSourceResponses);
            const storedSourceVersion = localStorage.getItem(SOURCE_VERSION_KEY);
            const sourceIds = new Set(validSourceResponses.map(response => response.id));
            cannedResponsesCache = storedSourceVersion === sourceVersion
                ? storedResponses
                : [
                    ...validSourceResponses,
                    ...storedResponses.filter(response =>
                        response && typeof response.id === 'string'
                        && !response.id.startsWith('default-') && !sourceIds.has(response.id)
                    )
                ];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cannedResponsesCache));
            localStorage.setItem(SOURCE_VERSION_KEY, sourceVersion);
            cannedResponsesLoaded = true;
            console.log('Loaded ' + cannedResponsesCache.length + ' canned responses from localStorage and bundled defaults');
            return cannedResponsesCache;
        }
    } catch (error) {
        console.warn('Error loading from localStorage:', error);
    }

    cannedResponsesCache = validSourceResponses;
    cannedResponsesLoaded = true;
    console.log('Loaded ' + cannedResponsesCache.length + ' default canned responses');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cannedResponsesCache));
    localStorage.setItem(SOURCE_VERSION_KEY, JSON.stringify(validSourceResponses));
    return cannedResponsesCache;
}

async function saveCannedResponses(responses) {
    try {
        cannedResponsesCache = responses;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
        console.log('Saved ' + responses.length + ' responses to localStorage');
        showCannedResponseNotification('Response saved automatically');
        return true;
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        showCannedResponseNotification('Error saving response: ' + error.message);
        return false;
    }
}

async function addCannedResponse(title, text) {
    if (!title || !text) {
        return false;
    }
    
    const responses = await loadCannedResponses();
    const newResponse = {
        id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        title: title,
        text: text
    };
    
    responses.push(newResponse);
    await saveCannedResponses(responses);
    return newResponse;
}

async function deleteCannedResponse(responseId) {
    const responses = await loadCannedResponses();
    const filtered = responses.filter(r => r.id !== responseId);
    await saveCannedResponses(filtered);
    return true;
}

async function updateCannedResponse(responseId, title, text) {
    const responses = await loadCannedResponses();
    const response = responses.find(r => r.id === responseId);
    
    if (!response) {
        return false;
    }
    
    response.title = title || response.title;
    response.text = text || response.text;
    await saveCannedResponses(responses);
    return true;
}

async function searchCannedResponses(query) {
    const responses = await loadCannedResponses();
    console.log('searchCannedResponses: query="' + query + '", total responses=' + responses.length);
    
    if (!query || query.trim() === '') {
        return responses;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = responses.filter(r => 
        r.title.toLowerCase().includes(lowerQuery) ||
        r.text.toLowerCase().includes(lowerQuery)
    );
    console.log('searchCannedResponses: filtered to ' + filtered.length + ' results');
    return filtered;
}

function insertCannedResponseToEditor(text) {
    const textarea = document.getElementById('invalidIssueContextText');
    if (!textarea) {
        return false;
    }
    
    const currentText = textarea.value.trim();
    const separator = currentText ? '\n\n' : '';
    textarea.value = currentText + separator + text;
    textarea.focus();
    return true;
}

function generateResponseTitle(text) {
    return text.substring(0, 50).replace(/\n/g, ' ').trim() + 
           (text.length > 50 ? '...' : '');
}

function showCannedResponseNotification(message) {
    const existingNotif = document.getElementById('cannedResponseNotification');
    if (existingNotif) {
        existingNotif.remove();
    }
    
    const notif = document.createElement('div');
    notif.id = 'cannedResponseNotification';
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-vivid-green-600);
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        if (notif.parentNode) {
            notif.remove();
        }
    }, 3000);
}

async function exportCannedResponses() {
    const responses = await loadCannedResponses();
    const dataStr = JSON.stringify({ responses }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'canned_responses.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showCannedResponseNotification('Responses exported! Replace canned_responses.json and refresh.');
}

async function importCannedResponses() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const responses = data.responses || [];
            
            cannedResponsesCache = responses;
            await renderCannedResponsesSidebar();
            showCannedResponseNotification('Imported ' + responses.length + ' responses. Copy canned_responses.json to your workspace and refresh.');
        } catch (error) {
            console.error('Error importing responses:', error);
            showCannedResponseNotification('Error importing file: ' + error.message);
        }
    });
    input.click();
}

window.__importedResponsesNeedsSave = false;
async function renderCannedResponsesSidebar() {
    console.log('=== renderCannedResponsesSidebar() called ===');
    const container = document.getElementById('cannedResponsesSidebarContainer');
    if (!container) {
        console.warn('cannedResponsesSidebarContainer not found');
        return;
    }
    
    const searchBox = document.getElementById('cannedResponsesSearch');
    const query = searchBox ? searchBox.value : '';
    
    const responses = await searchCannedResponses(query);
    const listContainer = document.getElementById('cannedResponsesList');
    const countEl = document.getElementById('cannedResponsesCount');
    
    if (countEl) {
        countEl.textContent = String(responses.length);
    }
    
    if (!listContainer) {
        console.warn('cannedResponsesList not found');
        return;
    }
    
    console.log('Rendering ' + responses.length + ' responses');
    listContainer.innerHTML = '';
    
    if (responses.length === 0) {
        console.warn('No responses to display');
        listContainer.innerHTML = '<div style="padding: 12px; color: var(--color-grey-600); font-size: 13px;">No responses found</div>';
        return;
    }
    
    responses.forEach(response => {
        const item = document.createElement('div');
        item.className = 'canned-response-item';
        item.title = 'Click to insert: ' + response.title;
        item.setAttribute('data-response-id', response.id);
        item.innerHTML = `
            <div class="canned-response-title">${escapeHtml(response.title)}</div>
            <div class="canned-response-actions">
                <button type="button" class="canned-response-btn-preview" title="Preview this response" aria-label="Preview" data-response-id="${escapeHtml(response.id)}">&#128065;</button>
                <button type="button" class="canned-response-btn-edit" title="Edit this response" aria-label="Edit" data-response-id="${escapeHtml(response.id)}">&#9998;</button>
                <button type="button" class="canned-response-btn-delete" title="Delete this response" aria-label="Delete" data-response-id="${escapeHtml(response.id)}">&#128465;</button>
            </div>
        `;
        listContainer.appendChild(item);
    });

    wireCannedResponsesEventListeners();
}

function wireCannedResponsesEventListeners() {
    document.querySelectorAll('.canned-response-item').forEach(item => {
        item.removeEventListener('click', handleInsertResponse);
        item.addEventListener('click', handleInsertResponse);
    });
    
    document.querySelectorAll('.canned-response-btn-delete').forEach(btn => {
        btn.removeEventListener('click', handleDeleteResponse);
        btn.addEventListener('click', handleDeleteResponse);
    });
    
    document.querySelectorAll('.canned-response-btn-preview').forEach(btn => {
        btn.removeEventListener('click', handlePreviewResponse);
        btn.addEventListener('click', handlePreviewResponse);
    });

    document.querySelectorAll('.canned-response-btn-edit').forEach(btn => {
        btn.removeEventListener('click', handleEditResponse);
        btn.addEventListener('click', handleEditResponse);
    });
    
    const searchBox = document.getElementById('cannedResponsesSearch');
    if (searchBox) {
        searchBox.removeEventListener('input', handleCannedResponsesSearch);
        searchBox.addEventListener('input', handleCannedResponsesSearch);
    }
    
    const addBtn = document.getElementById('cannedResponsesAddBtn');
    if (addBtn) {
        addBtn.removeEventListener('click', handleAddCannedResponse);
        addBtn.addEventListener('click', handleAddCannedResponse);
    }

}

async function handleInsertResponse(event) {
    const responseId = event.currentTarget.getAttribute('data-response-id');
    const responses = await loadCannedResponses();
    const response = responses.find(r => r.id === responseId);
    
    if (response) {
        insertCannedResponseToEditor(response.text);
        showCannedResponseNotification('Response inserted');
    }
}

async function handleDeleteResponse(event) {
    event.stopPropagation();
    const responseId = event.target.getAttribute('data-response-id');
    
    if (confirm('Delete this response?')) {
        await deleteCannedResponse(responseId);
        await renderCannedResponsesSidebar();
        showCannedResponseNotification('Response deleted');
    }
}

async function handlePreviewResponse(event) {
    event.stopPropagation();
    const responseId = event.target.getAttribute('data-response-id');
    const responses = await loadCannedResponses();
    const response = responses.find(r => r.id === responseId);
    
    if (response) {
        showCannedResponsePreviewModal(response.title, response.text);
    }
}

async function handleEditResponse(event) {
    event.stopPropagation();
    const responseId = event.target.getAttribute('data-response-id');
    const responses = await loadCannedResponses();
    const response = responses.find(r => r.id === responseId);
    
    if (response) {
        showCannedResponseEditModal(response.id, response.title, response.text);
    }
}

async function handleCannedResponsesSearch(event) {
    await renderCannedResponsesSidebar();
}

async function handleAddCannedResponse(event) {
    const textarea = document.getElementById('invalidIssueContextText');
    if (!textarea || !textarea.value.trim()) {
        showCannedResponseNotification('Please enter text before saving');
        return;
    }
    
    const text = textarea.value.trim();
    const suggestedTitle = generateResponseTitle(text);
    
    const title = prompt('Response Title:', suggestedTitle);
    if (!title) {
        return;
    }
    
    await addCannedResponse(title.trim(), text);
    await renderCannedResponsesSidebar();
}

function showCannedResponsePreviewModal(title, text) {
    const existing = document.getElementById('cannedResponsePreviewModal');
    if (existing) {
        existing.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'cannedResponsePreviewModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <div class="license-text-modal" role="dialog" aria-modal="true">
            <button type="button" class="license-text-modal-close" onclick="closeCannedResponsePreviewModal()" aria-label="Close">&times;</button>
            <h3 class="license-text-modal-title">${escapeHtml(title)}</h3>
            <div id="cannedResponsePreviewContent" style="max-height: 400px; overflow-y: auto; padding: 16px; background: var(--color-grey-50); border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 13px;">
                ${escapeHtml(text)}
            </div>
            <div style="margin-top: 16px; text-align: right;">
                <button type="button" onclick="closeCannedResponsePreviewModal()" style="padding: 8px 16px; background: var(--color-grey-300); border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
}

function closeCannedResponsePreviewModal() {
    const modal = document.getElementById('cannedResponsePreviewModal');
    if (modal) {
        modal.remove();
    }
    document.body.classList.remove('license-modal-open');
}

function showCannedResponseEditModal(responseId, title, text) {
    const existing = document.getElementById('cannedResponseEditModal');
    if (existing) {
        existing.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'cannedResponseEditModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <div class="license-text-modal" role="dialog" aria-modal="true">
            <button type="button" class="license-text-modal-close" onclick="closeCannedResponseEditModal()" aria-label="Close">&times;</button>
            <h3 class="license-text-modal-title">Edit Response</h3>
            <div style="margin-top: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Title:</label>
                <input type="text" id="cannedResponseEditTitle" value="${escapeHtml(title)}" style="width: 100%; padding: 8px; border: 1px solid var(--color-grey-400); border-radius: 4px; margin-bottom: 16px; box-sizing: border-box;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Text:</label>
                <textarea id="cannedResponseEditText" style="width: 100%; height: 200px; padding: 8px; border: 1px solid var(--color-grey-400); border-radius: 4px; margin-bottom: 16px; box-sizing: border-box; font-family: monospace; font-size: 13px;">${escapeHtml(text)}</textarea>
                <div style="text-align: right; gap: 8px; display: flex; justify-content: flex-end;">
                    <button type="button" onclick="closeCannedResponseEditModal()" style="padding: 8px 16px; background: var(--color-grey-300); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button type="button" onclick="saveCannedResponseEdit('${escapeHtml(responseId)}')" style="padding: 8px 16px; background: var(--color-vivid-green-600); color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
}

function closeCannedResponseEditModal() {
    const modal = document.getElementById('cannedResponseEditModal');
    if (modal) {
        modal.remove();
    }
    document.body.classList.remove('license-modal-open');
}

async function saveCannedResponseEdit(responseId) {
    const newTitle = document.getElementById('cannedResponseEditTitle')?.value.trim();
    const newText = document.getElementById('cannedResponseEditText')?.value.trim();
    
    if (!newTitle || !newText) {
        showCannedResponseNotification('Title and text cannot be empty');
        return;
    }
    
    await updateCannedResponse(responseId, newTitle, newText);
    closeCannedResponseEditModal();
    await renderCannedResponsesSidebar();
    showCannedResponseNotification('Response updated');
}

async function initCannedResponsesSidebar() {
    const container = document.getElementById('cannedResponsesSidebarContainer');
    if (!container) {
        console.warn('initCannedResponsesSidebar: container not found');
        return;
    }
    
    console.log('Initializing canned responses sidebar...');
    
    const loaded = await loadCannedResponses();
    console.log('Loaded ' + (loaded ? loaded.length : 0) + ' responses');
    await renderCannedResponsesSidebar();
    
    const addBtn = document.getElementById('cannedResponsesAddBtn');
    if (addBtn) {
        addBtn.removeEventListener('click', handleAddCannedResponse);
        addBtn.addEventListener('click', handleAddCannedResponse);
    }
}
;

function downloadInvalidIssuesReport() {
    const reportData = window.__invalidIssueExportData;
    if (!reportData) {
        showError('Load and validate an SBOM before exporting plausibility check results.');
        return;
    }

    const modeRequiresSourcecodeOffer = ['standard', 'tooldownload'].includes(reportData.validationModeKey);
    const existingModal = document.getElementById('plausibilityReportExportModal');
    if (existingModal) existingModal.remove();
    const modal = document.createElement('div');
    modal.id = 'plausibilityReportExportModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <form class="license-text-modal" id="plausibilityReportExportForm" role="dialog" aria-modal="true" aria-labelledby="plausibilityReportExportTitle">
            <button type="button" class="license-text-modal-close" data-report-cancel aria-label="Close">&times;</button>
            <h3 class="license-text-modal-title" id="plausibilityReportExportTitle">Export Plausibility Check Results</h3>
            <div class="manual-mapping-fields">
                <div class="manual-mapping-field">
                    <label for="plausibilityReportOsoNumber">OSO-number</label>
                    <input class="manual-mapping-input" id="plausibilityReportOsoNumber" name="osoNumber" type="text" pattern="OSO-[0-9]+" placeholder="OSO-1234" title="Enter an OSO-number in the format OSO-1234." required>
                </div>
                <div class="manual-mapping-field">
                    <label for="plausibilityReportReviewers">Name/Monogram of FO colleagues involved</label>
                    <input class="manual-mapping-input" id="plausibilityReportReviewers" name="reviewers" type="text" required>
                </div>
                ${modeRequiresSourcecodeOffer ? `
                <div class="manual-mapping-field">
                    <label for="plausibilityReportSourcecodeOffer">Sourcecode offer present:</label>
                    <select class="manual-mapping-input" id="plausibilityReportSourcecodeOffer" name="sourcecodeOffer" required>
                        <option value="" selected disabled hidden>Please select</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                    </select>
                </div>` : ''}
            </div>
            <div class="manual-mapping-actions">
                <button type="submit" class="filter-btn plausibility-export-primary">Export report</button>
                <button type="button" class="filter-btn" data-report-cancel>Cancel</button>
            </div>
        </form>`;

    const closeModal = () => {
        modal.remove();
        document.body.classList.remove('license-modal-open');
    };
    modal.querySelectorAll('[data-report-cancel]').forEach(button => button.addEventListener('click', closeModal));
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    const exportForm = modal.querySelector('#plausibilityReportExportForm');
    const reviewersInput = exportForm.querySelector('#plausibilityReportReviewers');
    reviewersInput.addEventListener('input', () => reviewersInput.setCustomValidity(''));
    exportForm.addEventListener('submit', event => {
        event.preventDefault();
        reviewersInput.setCustomValidity(reviewersInput.value.trim() ? '' : 'Enter at least one FO colleague name or monogram.');
        if (!exportForm.reportValidity()) return;

        const formData = new FormData(exportForm);
        const reportMetadata = {
            osoNumber: String(formData.get('osoNumber') || '').trim(),
            reviewers: String(formData.get('reviewers') || '').trim(),
            sourcecodeOffer: modeRequiresSourcecodeOffer ? String(formData.get('sourcecodeOffer') || '') : ''
        };
        const summary = Array.isArray(reportData.summary) ? [...reportData.summary] : [];
        if (reportMetadata.sourcecodeOffer === 'NO') {
            const copyleftComponents = Array.isArray(reportData.copyleftComponents) ? reportData.copyleftComponents : [];
            summary.push({
                group: 'Sourcecode offer',
                count: copyleftComponents.length,
                subgroups: [{
                    issue: 'Sourcecode offer is not present',
                    count: copyleftComponents.length,
                    components: copyleftComponents,
                    emptyMessage: 'No copyleft components found.'
                }]
            });
        }

        const htmlSafe = value => String(value ?? 'N/A')
            .replace(/[&<>'"]/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
            }[character]))
            .replace(/[\r\n]+/g, ' ')
            .trim();
        const hasIssues = summary.length > 0;
        const groupsHtml = hasIssues
            ? summary.map(group => {
                const subgroupsHtml = (group.subgroups || []).map(subgroup => {
                    const noteHtml = subgroup.note ? `<div class="issue-note"><strong>Information:</strong> ${htmlSafe(subgroup.note)}</div>` : '';
                    const componentsHtml = (subgroup.components || []).map(component =>
                        `<li><strong>${htmlSafe(component.name)}</strong><span>${htmlSafe(component.version)}</span></li>`
                    ).join('');
                    const emptyMessage = htmlSafe(subgroup.emptyMessage || 'No components listed.');
                    return `<details class="issue"><summary>${htmlSafe(subgroup.issue)} <span class="count">${Number(subgroup.count) || 0}</span></summary><div class="issue-body">${noteHtml}<ul>${componentsHtml || `<li>${emptyMessage}</li>`}</ul></div></details>`;
                }).join('');
                return `<details class="group"><summary>${htmlSafe(group.group)} <span class="count">${Number(group.count) || 0}</span></summary><div class="group-content">${subgroupsHtml}</div></details>`;
            }).join('')
            : '<p class="empty">All applicable criteria are fulfilled.</p>';
        const now = new Date();
        const checkDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plausibility Check Results</title><style>
            :root { font-family: Inter, Segoe UI, Arial, sans-serif; } body { max-width: 980px; margin: 0 auto; padding: 32px; color: #17212b; background: #f5f7fa; } header, details { background: #fff; border: 1px solid #d9e1e8; border-radius: 10px; box-shadow: 0 2px 6px #17212b12; } header { padding: 24px 28px; margin-bottom: 20px; } h1 { margin: 0 0 16px; color: #123b5d; font-size: 26px; } .report-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; margin: 0 0 16px; color: #123b5d; font-size: 26px; font-weight: 700; } .metadata { display: grid; gap: 6px; color: #52606d; } .metadata strong { color: #17212b; } details { margin: 12px 0; overflow: hidden; } summary { cursor: pointer; list-style: none; padding: 15px 18px; font-weight: 700; } summary::-webkit-details-marker { display: none; } summary::before { content: '▸'; display: inline-block; width: 20px; color: #16805c; } details[open] > summary::before { content: '▾'; } .group > summary { color: #123b5d; font-size: 17px; background: #eaf7f1; } .issue { margin: 10px 14px; box-shadow: none; border-color: #e5eaf0; } .issue > summary { color: #34495e; background: #f8fafc; } .group-content { padding: 1px 0 8px; } .count { float: right; min-width: 24px; padding: 2px 8px; border-radius: 999px; text-align: center; color: #fff; background: #16805c; font-size: 12px; } .issue-body { padding: 12px 14px 8px; } .issue-note { margin: 0 0 10px; padding: 8px 10px; border: 1px solid #e5eaf0; border-radius: 8px; background: #f8fafc; color: #34495e; line-height: 1.45; } .issue-note strong { display: inline-block; margin-right: 4px; } ul { margin: 0; padding: 4px 28px 14px 52px; } li { padding: 6px 0; } li span { margin-left: 10px; color: #52606d; } .empty { color: #16805c; font-weight: 700; }
        </style></head><body><header><h1 class="report-title"><span>Plausibility Check Results</span><span>${htmlSafe(reportMetadata.osoNumber)}</span></h1><div class="metadata"><div><strong>Name/Monogram of FO colleagues involved:</strong> ${htmlSafe(reportMetadata.reviewers)}</div><div><strong>Date of the check:</strong> ${htmlSafe(checkDate)}</div><div><strong>Source file:</strong> ${htmlSafe(reportData.filename || 'N/A')}</div><div><strong>Validation mode:</strong> ${htmlSafe(reportData.validationMode || 'N/A')}</div><div><strong>Total components:</strong> ${Number(reportData.totalComponents) || 0}</div><div><strong>Invalid components:</strong> ${Number(reportData.invalidCount) || 0}</div></div></header><main><h2>${hasIssues ? 'Issues requiring attention' : 'Check result'}</h2>${groupsHtml}</main></body></html>`;
        const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const sourceName = String(reportData.filename || 'sbom').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = url;
        anchor.download = `${sourceName}-plausibility-check-results-${stamp}.html`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        closeModal();
    });

    document.body.appendChild(modal);
    modal.classList.add('open');
    document.body.classList.add('license-modal-open');
}
;

function showComponentInAllView(componentKey) {
    if (!componentKey || typeof filterTable !== 'function') return;

    filterTable('all');
    const rows = document.querySelectorAll('#componentsTable tbody tr[data-component-key]');
    const row = Array.from(rows).find(item => item.dataset.componentKey === componentKey);
    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('component-row-highlight');
    window.setTimeout(() => row.classList.remove('component-row-highlight'), 1800);
}
;

function restoreManualLicenseMatchPosition() {
    const context = manualLicenseNavigationContext;
    manualLicenseNavigationContext = null;
    if (!context || typeof filterTable !== 'function') return;

    filterTable(context.filterMode || 'all');
    if (!context.componentKey || context.componentIndex < 0) return;

    const rows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleRows = rows.filter(row => row.style.display !== 'none');
    const exactRow = visibleRows.find(row => row.dataset.componentKey === context.componentKey);
    const row = exactRow || visibleRows[Math.min(context.componentIndex, visibleRows.length - 1)];
    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('component-row-highlight');
    window.setTimeout(() => row.classList.remove('component-row-highlight'), 1800);
}
;

function restoreTooldownloadEditPosition() {
    const context = tooldownloadEditNavigationContext;
    tooldownloadEditNavigationContext = null;
    if (!context || typeof filterTable !== 'function') return;

    filterTable(context.filterMode || 'all');
    if (!context.componentKey || context.componentIndex < 0) return;

    const rows = Array.from(document.querySelectorAll('#componentsTable tbody tr[data-component-key]'));
    const visibleRows = rows.filter(row => row.style.display !== 'none');
    const exactRow = visibleRows.find(row => row.dataset.componentKey === context.componentKey);
    const row = exactRow || visibleRows[Math.min(context.componentIndex, visibleRows.length - 1)];
    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('component-row-highlight');
    window.setTimeout(() => row.classList.remove('component-row-highlight'), 1800);
}
;

function toggleLicenseBadges(groupId, button) {
    const group = document.getElementById(groupId);
    if (!group || !button) return;

    const expanded = group.classList.toggle('license-badges-expanded');
    const pieces = group.querySelectorAll('.license-expression-piece');
    pieces.forEach((piece, index) => {
        piece.style.display = expanded || index < 3 ? 'inline-flex' : 'none';
    });

    button.textContent = expanded ? 'Hide' : 'Show';
    button.title = expanded ? 'Show only the first three licenses' : 'Show all licenses';
    button.setAttribute('aria-expanded', String(expanded));
}
;

function toggleCopyrightEntries(groupId, button) {
    const group = document.getElementById(groupId);
    if (!group || !button) return;

    const expanded = group.classList.toggle('copyright-entries-expanded');
    const entries = group.querySelectorAll('.copyright-entry');
    entries.forEach((entry, index) => {
        entry.style.display = expanded || index < 3 ? 'inline-flex' : 'none';
    });

    button.textContent = expanded ? 'Hide' : 'Show';
    button.title = expanded ? 'Hide all copyright' : 'Show all copyright';
    button.setAttribute('aria-expanded', String(expanded));
}
;

function updateValidationModeDesc() {
    const mode = document.querySelector('input[name="validationMode"]:checked')?.value || 'standard';
    currentValidationMode = mode;

    const desc = document.getElementById('validationModeDesc');
    const panel = document.getElementById('tooldownloadPanel');

    if (desc) {
        if (mode === 'standard-internal') {
            desc.textContent = 'Name, Version, Licenses required';
        } else if (mode === 'tooldownload') {
            desc.textContent = 'Name, Version, Licenses, Copyright required + edit/save + AI enrichment';
        } else if (mode === 'internal') {
            desc.textContent = 'PURL required';
        } else {
            desc.textContent = 'Name, Version, Licenses, Copyright required';
        }
    }

    if (panel) {
        panel.style.display = mode === 'tooldownload' ? 'block' : 'none';
    }
}
;
