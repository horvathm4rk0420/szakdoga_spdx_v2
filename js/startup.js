function revalidateIfLoaded() {
    if (currentFileType === 'manual-json' && currentSbomData) {
        validateManualMappedComponents(currentSbomData, currentFileName);
        return;
    }
    if (!currentSbomFile) return;
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

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > MAX_FILE_SIZE) {
        showError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
        event.target.value = '';
        return;
    }

    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
        fileNameElement.textContent = '';
    }
    
    currentSbomFile = file;
    editChangeLog = [];
    if (tooldownloadEdits instanceof Map) tooldownloadEdits.clear();
    pendingImportedStatusEntries = null;
    window.__manualErrorOverrides = {};
    window.__manualFalsePositives = {};

    const fileExt = file.name.split('.').pop().toLowerCase();
    currentFileType = fileExt === 'xml' ? 'xml' : 'json';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            if (currentFileType === 'xml') {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                
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
                const sbomData = JSON.parse(e.target.result);
                currentSbomData = sbomData;
                currentFileName = escapeHtml(file.name);
                if (fileNameElement) {
                    fileNameElement.textContent = `Uploaded: ${file.name}`;
                }
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

function initializeApp() {
    const appVersionElement = document.getElementById('appVersion');
    if (appVersionElement) appVersionElement.textContent = APP_VERSION;

    if (typeof initializeManualMappingUi === 'function') {
        initializeManualMappingUi();
    }

    document.getElementById('schemaInput').addEventListener('change', (e) => loadSchemaFile(e));
    const licenseRefInput = document.getElementById('licenseRefInput');
    if (licenseRefInput) {
        licenseRefInput.addEventListener('change', (e) => loadLicenseReferenceFile(e));
    }
    
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

    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const fileName = document.getElementById('fileName');

    fileInput.addEventListener('change', handleFileSelect);

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
;
