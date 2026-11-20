// Re-validate SBOM if file is loaded
function revalidateIfLoaded() {
    if (currentFileType === 'manual-json' && currentSbomData) {
        validateManualMappedComponents(currentSbomData, currentFileName);
        return;
    }
    if (!currentSbomFile) return;
    // Always re-read the SBOM from the original File object (bypasses any cached parsed data)
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            if (currentFileType === 'xml') {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) { showError('Invalid XML file: ' + escapeHtml(parseError.textContent)); return; }
                currentSbomData = applyTooldownloadEditsToLoadedData(xmlDoc);
                const xmlFormat = typeof detectXmlSbomFormat === 'function'
                    ? detectXmlSbomFormat(xmlDoc)
                    : 'unknown-xml';
                if (xmlFormat === 'spdx-xml') {
                    await validateSPDXXMLSBOM(xmlDoc, currentSbomFile.name);
                    return;
                }
                await validateXMLSBOM(xmlDoc, currentSbomFile.name);
            } else {
                const sbomData = JSON.parse(e.target.result);
                currentSbomData = applyTooldownloadEditsToLoadedData(sbomData);
                if (sbomData.spdxVersion) {
                    await validateSPDXSBOM(currentSbomData, currentSbomFile.name);
                } else {
                    await validateSBOM(currentSbomData, currentSbomFile.name);
                }
            }
        } catch (error) {
            if (currentFileType !== 'xml' && error instanceof SyntaxError) {
                showJsonParseError(e.target.result, error);
            } else {
                showError(`Error re-reading file: ${error.message}`);
            }
        }
    };
    reader.readAsText(currentSbomFile);
}
;

// File upload handling
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Security: Check file size
    if (file.size > MAX_FILE_SIZE) {
        showError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
        event.target.value = '';
        return;
    }

    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
        fileNameElement.textContent = '';
    }
    
    // Store raw File object so revalidateIfLoaded() always re-reads from source
    currentSbomFile = file;

    // New file — discard any session edits and changelog from the previous file
    editChangeLog = [];
    if (tooldownloadEdits instanceof Map) tooldownloadEdits.clear();
    pendingImportedStatusEntries = null;
    window.__manualErrorOverrides = {};
    window.__manualFalsePositives = {};

    // Detect file type
    const fileExt = file.name.split('.').pop().toLowerCase();
    currentFileType = fileExt === 'xml' ? 'xml' : 'json';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            if (currentFileType === 'xml') {
                // Parse XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                
                // Check for parse errors
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) {
                    showError('Invalid XML file: ' + parseError.textContent);
                    return;
                }
                
                currentSbomData = xmlDoc;
                currentFileName = escapeHtml(file.name);
                if (fileNameElement) {
                    fileNameElement.textContent = `Uploaded: ${file.name}`;
                }
                const xmlFormat = typeof detectXmlSbomFormat === 'function'
                    ? detectXmlSbomFormat(xmlDoc)
                    : 'unknown-xml';
                if (xmlFormat === 'spdx-xml') {
                    await validateSPDXXMLSBOM(xmlDoc, file.name);
                    return;
                }
                await validateXMLSBOM(xmlDoc, file.name);
            } else {
                // Parse JSON
                const sbomData = JSON.parse(e.target.result);
                currentSbomData = sbomData;
                currentFileName = escapeHtml(file.name);
                if (fileNameElement) {
                    fileNameElement.textContent = `Uploaded: ${file.name}`;
                }
                // Route to SPDX or CycloneDX validator, but preserve custom structured JSON for manual mapping.
                if (sbomData.spdxVersion) {
                    currentFileType = 'spdx';
                    await validateSPDXSBOM(sbomData, file.name);
                } else if (typeof looksLikeCustomStructuredJson === 'function' && looksLikeCustomStructuredJson(sbomData)) {
                    currentFileType = 'manual-json';
                    manualMappingConfig = { ...getDefaultManualMappingConfig(sbomData), ...manualMappingConfig };
                    if (typeof openManualMappingPanel === 'function') {
                        openManualMappingPanel();
                    }
                    showError('This JSON document does not appear to be a CycloneDX or SPDX SBOM. Use the default manual mappings shown below or adjust them, then validate.');
                } else {
                    await validateSBOM(sbomData, file.name);
                }
            }
        } catch (error) {
            if (currentFileType !== 'xml' && error instanceof SyntaxError) {
                showJsonParseError(e.target.result, error);
            } else {
                showError(`Error parsing file: ${error.message}`);
            }
        }
    };
    reader.readAsText(file);
}
;

// Initialize event listeners and app version display
function initializeApp() {
    // Set app version
    const appVersionElement = document.getElementById('appVersion');
    if (appVersionElement) appVersionElement.textContent = APP_VERSION;

    if (typeof initializeManualMappingUi === 'function') {
        initializeManualMappingUi();
    }

    // Schema upload handler
    document.getElementById('schemaInput').addEventListener('change', (e) => loadSchemaFile(e));
    const licenseRefInput = document.getElementById('licenseRefInput');
    if (licenseRefInput) {
        licenseRefInput.addEventListener('change', (e) => loadLicenseReferenceFile(e));
    }
    
    // Add event listeners for validation options to re-validate on change
    document.getElementById('includeMetadataComponent').addEventListener('change', revalidateIfLoaded);
    document.getElementById('includeMetadataTools').addEventListener('change', revalidateIfLoaded);
    document.getElementById('verboseMode').addEventListener('change', revalidateIfLoaded);
    const refreshModeUi = () => {
        if (typeof updateValidationModeDesc === 'function') {
            updateValidationModeDesc();
        }
        revalidateIfLoaded();
    };
    document.getElementById('validationModeStandard').addEventListener('change', refreshModeUi);
    document.getElementById('validationModeStandardInternal').addEventListener('change', refreshModeUi);
    const tooldownloadMode = document.getElementById('validationModeTooldownload');
    if (tooldownloadMode) {
        tooldownloadMode.addEventListener('change', refreshModeUi);
    }
    document.getElementById('validationModeInternal').addEventListener('change', refreshModeUi);
    if (typeof updateValidationModeDesc === 'function') {
        updateValidationModeDesc();
    }

    // File upload handling
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const fileName = document.getElementById('fileName');

    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadSection.classList.add('dragover');
    });

    uploadSection.addEventListener('dragleave', () => {
        uploadSection.classList.remove('dragover');
    });

    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadSection.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect({ target: { files } });
        }
    });
}

// Auto-initialize on DOM load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
;
