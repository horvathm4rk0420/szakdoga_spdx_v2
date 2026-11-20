function createUnifiedComponentValues(component) {
    const sourceLicenses = Array.isArray(component?.licenses) ? component.licenses : [];
    const unifiedLicenses = [];
    const unifiedExpressions = [];
    const evidenceLicenseTexts = {};
    const termEvidenceIndexMap = {};

    const evidenceLicenses = Array.isArray(component?.evidence?.licenses)
        ? component.evidence.licenses
        : [];
    evidenceLicenses.forEach((evidenceItem, evidenceIndex) => {
        const evidenceLicense = evidenceItem && evidenceItem.license;
        const evidenceId = evidenceLicense && (evidenceLicense.id || evidenceLicense.name);
        const evidenceText =
            extractLicenseDocumentText(evidenceItem);

        if (evidenceId) {
            const trimmedId = String(evidenceId).trim();
            const indexedKey = `${trimmedId}#${evidenceIndex}`;
            evidenceLicenseTexts[indexedKey] = evidenceText;
            evidenceLicenseTexts[trimmedId] = evidenceText;

            const operator = getLicenseOperator(trimmedId);
            if (operator) {
                const groupedTerms = splitLicenseTerms(trimmedId, operator);
                groupedTerms.forEach(term => {
                    const normalizedTerm = normalizeLicenseName(term);
                    const termIndexedKey = `${normalizedTerm}#${evidenceIndex}`;
                    evidenceLicenseTexts[termIndexedKey] = evidenceText;
                    if (!evidenceLicenseTexts[normalizedTerm]) {
                        evidenceLicenseTexts[normalizedTerm] = evidenceText;
                    }
                    if (!termEvidenceIndexMap[normalizedTerm]) termEvidenceIndexMap[normalizedTerm] = [];
                    termEvidenceIndexMap[normalizedTerm].push(evidenceIndex);
                });
            } else {
                const normalizedId = normalizeLicenseName(trimmedId);
                if (!termEvidenceIndexMap[normalizedId]) termEvidenceIndexMap[normalizedId] = [];
                termEvidenceIndexMap[normalizedId].push(evidenceIndex);
            }
        }
    });

    sourceLicenses.forEach((licenseItem, licenseIndex) => {
        if (!licenseItem || typeof licenseItem !== 'object') return;

        const rawExpressionValue = String(
            licenseItem.expression ||
            licenseItem.license?.id ||
            licenseItem.license?.name ||
            licenseItem.licenseName ||
            ''
        ).trim();
        const rawExpressions = [rawExpressionValue];

        rawExpressions.forEach((rawExpression, expressionIndex) => {
        const rawOperator = getLicenseOperator(rawExpression);
        const rawTerms = splitLicenseTerms(rawExpression, rawOperator);
        const terms = rawTerms.map(term => normalizeLicenseName(term));
        let expression;
        if (rawOperator === 'GROUPED') {
            const parsedRawExpression = parseLicenseExpressionTree(rawExpression);
            expression = parsedRawExpression.tree
                ? serializeLicenseExpressionTree(replaceLicenseExpressionTreeTerms(parsedRawExpression.tree, terms))
                : normalizeLicenseName(rawExpression);
        } else {
            expression = rawOperator && terms.length > 1
                ? terms.join(` ${rawOperator} `)
                : normalizeLicenseName(rawExpression);
        }
        if (!expression) return;

        const operator = getLicenseOperator(expression);
        const expressionId = `license-expression-${licenseIndex}-${expressionIndex}`;
        const extractedTextById = licenseItem.extractedLicenseTextById || {};
        const sharedText = extractLicenseDocumentText(licenseItem);

        unifiedExpressions.push({
            id: expressionId,
            value: expression,
            operator: operator || null,
            terms: terms.map((term, termIndex) => ({
                term,
                licenseId: `license-${licenseIndex}-${termIndex}`
            }))
        });

        terms.forEach((term, termIndex) => {
            const evidenceIndex =
                termEvidenceIndexMap[term]?.shift() ?? -1;

            const indexedEvidenceKey =
                evidenceIndex >= 0
                    ? `${term}#${evidenceIndex}`
                    : '';

            const hasOwnEvidenceEntry =
                evidenceIndex >= 0 &&
                Object.prototype.hasOwnProperty.call(
                    evidenceLicenseTexts,
                    indexedEvidenceKey
                );

            const extractedTermText =
                getExtractedLicenseText(
                    extractedTextById,
                    term,
                    evidenceIndex
                );

            const evidenceTermText =
                hasOwnEvidenceEntry
                    ? String(
                        evidenceLicenseTexts[
                            indexedEvidenceKey
                        ] || ''
                    )
                    : getExtractedLicenseText(
                        evidenceLicenseTexts,
                        term,
                        evidenceIndex
                    );

            const componentKey =
                typeof component?.objectPath === 'string'
                    ? component.objectPath
                    : '';

            const licenseTextOverrideKey = [
                componentKey,
                term
            ]
                .map(value => String(value).trim().toLowerCase())
                .join('::');

            const hasManualTextOverride =
                manualLicenseTextOverrides.has(
                    licenseTextOverrideKey
                );

            const manualTextOverride =
                hasManualTextOverride
                    ? manualLicenseTextOverrides.get(
                        licenseTextOverrideKey
                    )
                    : '';

            const termText = hasManualTextOverride
                ? String(manualTextOverride ?? '')
                : hasOwnEvidenceEntry
                    ? evidenceTermText
                    : (
                    extractedTermText ||
                    evidenceTermText ||
                    sharedText ||
                    ''
                );
            unifiedLicenses.push({
                id: `license-${licenseIndex}-${termIndex}`,
                licenseName: term,
                licenseText: termText || '',
                manuallyEditedLicenseText: hasManualTextOverride,
                role: licenseItem.source || licenseItem.role || 'component',
                expressionId,
                expression,
                sourcePath: licenseItem.sourcePath || '',
                evidenceIndex: evidenceIndex
            });
        });
        });
    });

    return {
        componentName: typeof component?.name === 'string' ? component.name : '',
        componentVersion: typeof component?.version === 'string' ? component.version : '',
        purl: typeof component?.purl === 'string' ? component.purl : '',
        objectPath: typeof component?.objectPath === 'string' ? component.objectPath : '',
        unifiedLicenses,
        licenseExpressions: unifiedExpressions,
        licenseExpression: unifiedExpressions.length === 1 ? unifiedExpressions[0] : null,
        copyright: typeof component?.copyright === 'string' ? component.copyright : ''
    };
}
;

function validateUnifiedComponent(unified, options = {}) {
    const errors = [];
    const warnings = [];
    const mode = options.validationMode || 'standard';
    const isMetadataComponent = Boolean(options.isMetadataComponent);
    const isFile = Boolean(options.isFile);
    const name = typeof unified?.componentName === 'string' ? unified.componentName.trim() : '';
    const version = typeof unified?.componentVersion === 'string' ? unified.componentVersion.trim() : '';
    const purl = typeof unified?.purl === 'string' ? unified.purl.trim() : '';
    const licenses = Array.isArray(unified?.unifiedLicenses) ? unified.unifiedLicenses : [];
    const expressions = Array.isArray(unified?.licenseExpressions) ? unified.licenseExpressions : [];
    const copyright = typeof unified?.copyright === 'string' ? unified.copyright.trim() : '';

    const requiredError = (message, path, metadataMessage) => {
        if (isMetadataComponent) {
            warnings.push(metadataMessage || message);
        } else {
            errors.push({ message, path });
        }
    };

    let copyrightFromLicenseText = '';

    if (mode === 'internal') {
        if (!purl) {
            requiredError(
                'Missing required field: purl. Internal Development mode requires PURL for all components.',
                'purl',
                'Missing PURL field. Internal Development mode requires PURL for all components.'
            );
        }
        return { errors, warnings, copyrightFromLicenseText };
    }

    const isStandardInternal = mode === 'standard-internal';
    const modeLabel = isStandardInternal ? 'Standard Software Internal' : 'Standard Software';
    const requireCopyright = !isStandardInternal;

    if (!name) {
        requiredError(
            `Missing required field: name. ${modeLabel} mode requires Name for all components.`,
            'name'
        );
    }
    if (!isFile && !version) {
        requiredError(
            `Missing required field: version. ${modeLabel} mode requires Version for all components.`,
            'version'
        );
    }
    if (licenses.length === 0) {
        requiredError(
            `Missing required field: licenses. ${modeLabel} mode requires Licenses for all components.`,
            'licenses',
            `Missing licenses field. ${modeLabel} mode: consider adding license information to the metadata component.`
        );
    }

    if (requireCopyright) {
        if (!copyright) {
            requiredError(
                'Missing required field: copyright. Standard Software mode requires Copyright for all components.',
                'copyright',
                'Missing copyright field. Standard Software mode: consider adding copyright information to the metadata component.'
            );
        } else {
            const details = getCopyrightValidationDetails(copyright);
            const genericWarning = details.genericEntries.length > 0
                ? `Generic Copyright: ${details.genericEntries.join('; ')}`
                : '';
            if (details.valid) {
                if (genericWarning) warnings.push(genericWarning);
            } else {
                const message = details.genericEntries.length > 0
                    ? genericWarning
                    : "Invalid copyright format. Copyright must contain at least one of: 'Copyright', '(c)', '(C)', or '©'.";
                requiredError(message, 'copyright');
            }
        }
    }

    if (mode === 'standard' || mode === 'standard-internal' || mode === 'tooldownload') {
        const canonical = { 
            name,
            version,
            objectPath: unified.objectPath || '',
            unifiedLicenses: licenses, 
            copyright 
        };
        const licenseErrors = validateLicenses(canonical);
        errors.push(...licenseErrors);
        errors.push(...validateLicenseTextMatches(canonical));
        revalidateCopyrightErrors(errors, copyright, canonical.copyrightFromLicenseText, ['copyright'], warnings);
        copyrightFromLicenseText = canonical.copyrightFromLicenseText || '';
        if (licenseErrors.length > 0) {
            warnings.push("Invalid SPDX license ID. Consider using an SPDX expression instead with the 'expression' field.");
        }
    }

    return { errors, warnings, copyrightFromLicenseText };
}
;

function validateComponent(component, section, indent = 0, index = 1, isMetadataComponent = false, validationMode = 'standard', objectPath = '') {
    const sourceComponent = component;
    const normalizedFromManualMapping = Array.isArray(component?.unifiedLicenses)
        ? createUnifiedComponentValues(component)
        : null;
    const unified = normalizedFromManualMapping
        ? {
            ...normalizedFromManualMapping,
            unifiedLicenses: component.unifiedLicenses,
            licenseExpressions: Array.isArray(component.licenseExpressions)
                ? component.licenseExpressions
                : normalizedFromManualMapping.licenseExpressions,
            objectPath
        }
        : createUnifiedComponentValues(component);
    if (!unified.objectPath) {
        unified.objectPath = objectPath;
    }
    const semanticResult = validateUnifiedComponent(unified, {
        validationMode,
        isMetadataComponent,
        isFile: false
    });

    let sourceFile = '';
    if (typeof component.sourceFile === 'string' && component.sourceFile.trim()) {
        sourceFile = component.sourceFile.trim();
    }
    if (Array.isArray(component.properties)) {
        const prop = component.properties.find(p => p.name === 'localSourceFile');
        if (prop && prop.value) sourceFile = prop.value;
    }

    const result = {
        section,
        index,
        indent,
        name: unified.componentName || 'N/A',
        version: unified.componentVersion || 'N/A',
        type: component.type || 'N/A',
        purl: unified.purl || '',
        licenses: unified.unifiedLicenses || [],
        copyright: unified.copyright || '',
        copyrightFromLicenseText: semanticResult.copyrightFromLicenseText || '',
        sourceFile,
        objectPath,
        rawData: sourceComponent,
        valid: semanticResult.errors.length === 0,
        errors: semanticResult.errors,
        warnings: semanticResult.warnings
    };

    Object.assign(result, unified);
    if (validationMode !== 'internal') {
        delete result.type;
        delete result.purl;
    }

    const results = [result];
    if (sourceComponent.component) {
        results.push(...validateComponent(sourceComponent.component, section, indent + 1, 1, false, validationMode, objectPath ? `${objectPath}.component` : 'component'));
    }
    if (Array.isArray(sourceComponent.components)) {
        sourceComponent.components.forEach((nested, idx) => {
            results.push(...validateComponent(nested, section, indent + 1, idx + 1, false, validationMode, objectPath ? `${objectPath}.components[${idx}]` : `components[${idx}]`));
        });
    }
    return results;
}

function attachExtractedLicenseTextMaps(component) {
    if (!component || !Array.isArray(component.licenses)) return;
    component.licenses.forEach(licenseItem => {
        if (!licenseItem || typeof licenseItem !== 'object') return;
        const extracted = extractLicenseDocumentText(licenseItem);
        if (!extracted || !extracted.trim()) return;

        const id = (licenseItem.license && (licenseItem.license.id || licenseItem.license.name)) || licenseItem.expression || '';
        const key = String(id || '').trim();
        licenseItem.extractedLicenseTextById = licenseItem.extractedLicenseTextById || {};
        if (key) {
            licenseItem.extractedLicenseTextById[key] = extracted.trim();
        } else {
            licenseItem.extractedLicenseTextById['__default'] = extracted.trim();
        }
    });
}
;

async function validateSBOM(sbomData, filename) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    setProgress(5, 'Checking schema...');
    await tick();

    if (typeof looksLikeCustomStructuredJson === 'function' && looksLikeCustomStructuredJson(sbomData)) {
        if (typeof openManualMappingPanel === 'function') {
            openManualMappingPanel();
        }
        document.getElementById('loading').style.display = 'none';
        showError('This JSON document does not appear to be a CycloneDX SBOM. Use Manual Mapping to map the custom package fields before validating.');
        return;
    }

    const schemas = getSchemasIfLoaded();
    const specVersion = sbomData.specVersion || '1.7';
    
    if (REQUIRE_SCHEMA_BEFORE_VALIDATION && !schemas) {
        document.getElementById('loading').style.display = 'none';
        showSchemaNeededInfo(specVersion);
        return;
    }

    const schemaData = schemas ? pickSchema(schemas, specVersion) : {};
    
    if (!schemaData) {
        const loadedCDX = Object.entries({ '1.4': schemas?.schema14, '1.5': schemas?.schema15, '1.6': schemas?.schema16, '1.7': schemas?.schema17 })
            .filter(([,v]) => v).map(([k]) => k);
        document.getElementById('loading').style.display = 'none';
        
        if (loadedCDX.length === 0) {
            if (schemas?.hasSpdx || schemas?.hasXsd) {
                showError(`This file is a CycloneDX ${specVersion} SBOM, but you have uploaded an SPDX or XSD schema instead. Please upload the CycloneDX ${specVersion} schema: bom-${specVersion}.schema.json`);
            } else {
                showSchemaNeededInfo(specVersion);
            }
        } else {
            showError(`Schema for version ${specVersion} is not loaded. Your SBOM requires schema version ${specVersion}, but only version(s) ${loadedCDX.join(', ')} are currently loaded. Please upload bom-${specVersion}.schema.json.`);
        }
        return;
    }

    const includeMetadataComponent = document.getElementById('includeMetadataComponent').checked;
    const includeMetadataTools = document.getElementById('includeMetadataTools').checked;
    const verbose = document.getElementById('verboseMode').checked;
    const validationMode = document.querySelector('input[name="validationMode"]:checked').value;

    setProgress(15, 'Validating SBOM structure...');
    await tick();

    const overallErrors = validateAgainstSchema(sbomData, schemaData);
    const overallValid = overallErrors.length === 0;

    const allResults = [];
    if (includeMetadataComponent && sbomData.metadata?.component) {
        setProgress(20, 'Validating metadata component...');
        await tick();
        const results = validateComponent(sbomData.metadata.component, 'Metadata Component', 0, 1, true, validationMode, 'metadata.component');
        allResults.push(...results);
    }

    const compArray = sbomData.components || [];
    const toolsArray = (includeMetadataTools && sbomData.metadata?.tools?.components) ? sbomData.metadata.tools.components : [];
    const total = compArray.length + toolsArray.length;

    setProgress(25, `Validating ${compArray.length} components...`);
    await tick();

    for (let idx = 0; idx < compArray.length; idx++) {
        const results = validateComponent(compArray[idx], 'Components Array', 0, idx + 1, false, validationMode, `components[${idx}]`);
        allResults.push(...results);
        if (total > 0) setProgress(25 + Math.round(60 * (idx + 1) / total), `Validating component ${idx + 1} of ${compArray.length}...`);
        if ((idx + 1) % 50 === 0) await tick();
    }

    for (let idx = 0; idx < toolsArray.length; idx++) {
        const results = validateComponent(toolsArray[idx], 'Tools Components', 0, idx + 1, false, validationMode, `metadata.tools.components[${idx}]`);
        allResults.push(...results);
        if (total > 0) setProgress(25 + Math.round(60 * (compArray.length + idx + 1) / total), `Validating tool component ${idx + 1} of ${toolsArray.length}...`);
        if ((idx + 1) % 50 === 0) await tick();
    }

    if (allResults.length === 0) {
        showError('No components found to validate. Check validation options (Include Metadata Component should be checked if there are no components array).');
        document.getElementById('loading').style.display = 'none';
        return;
    }

    setProgress(95, 'Building results...');
    await tick();
    document.getElementById('loading').style.display = 'none';
    displayResults(sbomData, allResults, overallValid, filename, verbose, validationMode);
}
;

function validateXMLComponent(compElem, section, indent, index, isMetadataComponent, validationMode = 'standard', objectPath = '') {
    const errors = [];
    const warnings = [];

    const nameElem = compElem.querySelector(':scope > name');
    const name = nameElem ? nameElem.textContent : '';

    const versionElem = compElem.querySelector(':scope > version');
    const version = versionElem ? versionElem.textContent : '';

    const type = compElem.getAttribute('type') || 'N/A';

    const purlElem = compElem.querySelector(':scope > purl');
    const purl = purlElem ? purlElem.textContent : '';

    const copyrightElem = compElem.querySelector(':scope > copyright');
    const copyright = copyrightElem ? copyrightElem.textContent : '';

    let sourceFile = '';
    const propertiesElem = compElem.querySelector(':scope > properties');
    if (propertiesElem) {
        const sourceProp = propertiesElem.querySelector(':scope > property[name="localSourceFile"]');
        if (sourceProp) {
            sourceFile = sourceProp.textContent || '';
        }
    }

    const licensesElem = compElem.querySelector(':scope > licenses');
    const licenses = [];

    if (licensesElem) {
        const licenseElems = licensesElem.querySelectorAll(':scope > license');
        licenseElems.forEach(licElem => {
            const idElem = licElem.querySelector(':scope > id');
            const nameElem = licElem.querySelector(':scope > name');
            const exprElem = licElem.querySelector(':scope > expression');
            const textElem = licElem.querySelector(':scope > text');
            const licenseText = textElem ? textElem.textContent : '';

            if (idElem) {
                licenses.push({ license: { id: idElem.textContent, text: licenseText } });
            } else if (nameElem) {
                licenses.push({ license: { name: nameElem.textContent, text: licenseText } });
            } else if (exprElem) {
                licenses.push({ expression: exprElem.textContent, text: licenseText });
            }
        });
    }

    const unified = createUnifiedComponentValues({ name, version, purl, licenses, copyright });
    const canonicalName = unified.componentName;
    const canonicalVersion = unified.componentVersion;
    const canonicalLicenses = unified.unifiedLicenses;
    const canonicalCopyright = unified.copyright;

    const semanticResult = validateUnifiedComponent(unified, {
        validationMode,
        isMetadataComponent,
        isFile: false
    });
    errors.push(...semanticResult.errors);
    warnings.push(...semanticResult.warnings);
    const isValid = errors.length === 0;

    const result = {
        section,
        index,
        indent,
        name: canonicalName || 'N/A',
        version: canonicalVersion || 'N/A',
        type,
        purl: unified.purl || '',
        licenses: canonicalLicenses,
        copyright: canonicalCopyright,
        copyrightFromLicenseText: semanticResult.copyrightFromLicenseText || '',
        sourceFile,
        objectPath,
        rawData: compElem,
        valid: isValid,
        errors,
        warnings
    };

    Object.assign(result, unified);
    if (validationMode !== 'internal') {
        delete result.type;
        delete result.purl;
    }
    return result;
}
;

function validateXMLTool(toolElem, section, indent, index) {
    const nameElem = toolElem.querySelector(':scope > name');
    const name = nameElem ? nameElem.textContent : 'N/A';

    const versionElem = toolElem.querySelector(':scope > version');
    const version = versionElem ? versionElem.textContent : 'N/A';

    const vendorElem = toolElem.querySelector(':scope > vendor');
    const vendor = vendorElem ? vendorElem.textContent : 'N/A';

    return {
        section,
        index,
        indent,
        name: `${name} (Vendor: ${vendor})`,
        version,
        type: 'tool',
        purl: '',
        licenses: [],
        copyright: '',
        valid: true,
        errors: [],
        warnings: []
    };
}
;

async function validateXMLSBOM(xmlDoc, filename) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    setProgress(5, 'Checking XSD schema...');
    await tick();

    const xmlFormat = typeof detectXmlSbomFormat === 'function'
        ? detectXmlSbomFormat(xmlDoc)
        : 'unknown-xml';

    if (xmlFormat === 'spdx-xml') {
        document.getElementById('loading').style.display = 'none';
        await validateSPDXXMLSBOM(xmlDoc, filename);
        return;
    }

    if (xmlFormat === 'unknown-xml') {
        document.getElementById('loading').style.display = 'none';
        showError('Unsupported XML SBOM format. The file does not look like CycloneDX or SPDX XML.');
        return;
    }

    if (REQUIRE_SCHEMA_BEFORE_VALIDATION && !xsdSchema) {
        document.getElementById('loading').style.display = 'none';
        const xmlSpecVersion = xmlDoc.documentElement?.getAttribute('version') || 'unknown';
        const schemas = getSchemasIfLoaded();
        const resultsDiv = document.getElementById('results');
        const sv = escapeHtml(xmlSpecVersion);
        
        let helpText = '';
        if (schemas?.hasCycloneDX || schemas?.hasSpdx) {
            helpText = `You have uploaded a JSON or SPDX schema, but this SBOM is XML format. Please upload the matching XSD schema file: <code>bom-${sv}.xsd</code>`;
        } else {
            helpText = `Please upload the matching XSD schema file: <code>bom-${sv}.xsd</code>`;
        }
        
        resultsDiv.innerHTML = `<div class="validation-result" style="display:block;
            background:var(--color-info-100);border-left:4px solid var(--color-info-700);
            color:var(--color-deep-space-900);">
            <h2 style="color:var(--color-info-700);">&#x24D8; Schema Required</h2>
            <p>The loaded SBOM uses <strong>CycloneDX XML specVersion ${sv}</strong>.</p>
            <p style="margin-top:8px;">${helpText}</p>
            <p style="margin-top:8px;">You can obtain CycloneDX schemas from 
                <a href="https://github.com/CycloneDX/specification/tree/master/schema" target="_blank" rel="noopener noreferrer">github.com/CycloneDX/specification</a>.
            </p>
        </div>`;
        return;
    }

    setProgress(15, 'Parsing XML structure...');
    await tick();
    
    const includeMetadataComponent = document.getElementById('includeMetadataComponent').checked;
    const includeMetadataTools = document.getElementById('includeMetadataTools').checked;
    const verbose = document.getElementById('verboseMode').checked;
    const validationMode = document.querySelector('input[name="validationMode"]:checked').value;

    const ns = 'http://cyclonedx.org/schema/bom/1.5';
    const allResults = [];
    let overallValid = true;

    if (includeMetadataComponent) {
        const metadataComp = xmlDoc.querySelector('metadata > component');
        if (metadataComp) {
            setProgress(25, 'Validating metadata component...');
            await tick();
            const result = validateXMLComponent(metadataComp, 'Metadata Component', 0, 1, true, validationMode, 'metadata.component');
            allResults.push(result);
        }
    }

    const components = xmlDoc.querySelectorAll('components > component');
    const totalComps = components.length;
    setProgress(30, `Validating ${totalComps} components...`);
    await tick();

    for (let idx = 0; idx < totalComps; idx++) {
        const result = validateXMLComponent(components[idx], 'Components Array', 0, idx + 1, false, validationMode, `components[${idx}]`);
        allResults.push(result);
        setProgress(30 + Math.round(55 * (idx + 1) / Math.max(totalComps, 1)), `Validating component ${idx + 1} of ${totalComps}...`);
        if ((idx + 1) % 50 === 0) await tick();
    }

    if (includeMetadataTools) {
        const tools = xmlDoc.querySelectorAll('metadata > tools > tool');
        tools.forEach((tool, idx) => {
            const result = validateXMLTool(tool, 'Metadata Tools Components', 0, idx + 1);
            allResults.push(result);
        });
    }

    setProgress(95, 'Building results...');
    await tick();
    document.getElementById('loading').style.display = 'none';
    displayResults(xmlDoc, allResults, overallValid, filename, verbose, validationMode);
}
;

function validateSPDXPackage(pkg, section, indent, index, validationMode = 'standard', isFile = false, extractedLicenseTextById = {}, objectPath = '') {
    const errors = [];
    const warnings = [];

    const name = pkg.name || '';
    const version = isFile ? '' : (pkg.versionInfo || '');
    const copyrightText = pkg.copyrightText || '';
    const licenseConcluded = pkg.licenseConcluded || '';
    const licenseDeclared = pkg.licenseDeclared || '';
    const spdxId = pkg.SPDXID || '';
    const licenseInfoInFiles = Array.isArray(pkg.licenseInfoInFiles) ? pkg.licenseInfoInFiles : [];
    const fallbackExtractedText = licenseInfoInFiles
        .map(id => getExtractedLicenseText(extractedLicenseTextById, id))
        .find(text => typeof text === 'string' && text.trim()) || '';

    let purl = '';
    if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
        const purlRef = pkg.externalRefs.find(ref =>
            (ref.referenceCategory === 'PACKAGE-MANAGER' || ref.referenceCategory === 'PACKAGE_MANAGER') &&
            ref.referenceType === 'purl'
        );
        if (purlRef) purl = purlRef.referenceLocator || '';
    }
o
    const licenses = [];
    if (licenseConcluded && licenseConcluded !== 'NOASSERTION' && licenseConcluded !== 'NONE') {
        licenses.push({
            expression: licenseConcluded,
            source: 'concluded',
            text: getExtractedLicenseText(extractedLicenseTextById, licenseConcluded) || fallbackExtractedText,
            extractedLicenseTextById
        });
    }
    if (licenseDeclared && licenseDeclared !== 'NOASSERTION' && licenseDeclared !== 'NONE'
        && licenseDeclared !== licenseConcluded) {
        licenses.push({
            expression: licenseDeclared,
            source: 'declared',
            text: getExtractedLicenseText(extractedLicenseTextById, licenseDeclared) || fallbackExtractedText,
            extractedLicenseTextById
        });
    }

    const unified = createUnifiedComponentValues({
        name: name || spdxId,
        version,
        purl,
        licenses,
        copyright: copyrightText,
        objectPath
    });
    const canonical = { ...unified, licenses: unified.unifiedLicenses, copyright: copyrightText };
    const canonicalName = canonical.componentName;
    const canonicalVersion = canonical.componentVersion;
    const canonicalLicenses = canonical.unifiedLicenses;
    const canonicalCopyright = canonical.copyright;
    const canonicalPurl = canonical.purl;

    const semanticResult = validateUnifiedComponent(unified, {
        validationMode,
        isFile
    });
    errors.push(...semanticResult.errors);
    warnings.push(...semanticResult.warnings);

    const isValid = errors.length === 0;
    const result = {
        section,
        index,
        indent,
        name: canonicalName || 'N/A',
        version: canonicalVersion || 'N/A',
        type: pkg.primaryPackagePurpose || (isFile ? 'file' : 'package'),
        purl: canonicalPurl,
        licenses: unified.unifiedLicenses,
        copyright: canonicalCopyright,
        copyrightFromLicenseText: semanticResult.copyrightFromLicenseText || '',
        sourceFile: pkg.sourceFile || '',
        objectPath,
        rawData: pkg,
        valid: isValid,
        errors,
        warnings
    };

    Object.assign(result, unified);
    if (validationMode !== 'internal') {
        delete result.type;
        delete result.purl;
    }
    return result;
}
;

async function validateSPDXXMLSBOM(xmlDoc, filename) {
    const spdxData = parseSpdxXmlDocument(xmlDoc);
    if (!spdxData) {
        showError('Invalid SPDX XML file: unable to read the document structure.');
        return;
    }

    await validateSPDXSBOM(spdxData, filename);
}
;

async function validateSPDXSBOM(sbomData, filename) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    setProgress(5, 'Checking SPDX schema...');
    await tick();

    const spdxVersionStr = sbomData.spdxVersion || '';
    let activeSpdxSchema = null;
    if (spdxVersionStr.includes('2.3')) {
        activeSpdxSchema = spdxSchema23 || spdxSchema22;
    } else {
        activeSpdxSchema = spdxSchema22 || spdxSchema23;
    }

    if (REQUIRE_SCHEMA_BEFORE_VALIDATION && !activeSpdxSchema) {
        document.getElementById('loading').style.display = 'none';
        const sv = escapeHtml(spdxVersionStr || '2.2/2.3');
        const schemaFilename = spdxVersionStr.includes('2.3') ? 'spdx-schema-v2.3.json' : 'spdx-schema-v2.2.json';
        const schemas = getSchemasIfLoaded();
        
        let helpText = '';
        if (schemas?.hasCycloneDX || schemas?.hasXsd) {
            helpText = `You have uploaded a CycloneDX schema, but this SBOM is SPDX format. Please upload the matching SPDX schema file: <code>${escapeHtml(schemaFilename)}</code>`;
        } else {
            helpText = `Please upload the matching SPDX schema file: <code>${escapeHtml(schemaFilename)}</code>`;
        }
        
        document.getElementById('results').innerHTML = `<div class="validation-result" style="display:block;
            background:var(--color-info-100);border-left:4px solid var(--color-info-700);
            color:var(--color-deep-space-900);">
            <h2 style="color:var(--color-info-700);">&#x24D8; Schema Required</h2>
            <p>The loaded SBOM uses <strong>SPDX version ${sv}</strong>.</p>
            <p style="margin-top:8px;">${helpText}</p>
            <p style="margin-top:8px;">You can obtain SPDX schemas from 
                <a href="https://github.com/spdx/tools-java/tree/master/resources" target="_blank" rel="noopener noreferrer">github.com/spdx/tools-java</a>.
            </p>
        </div>`;
        return;
    }

    setProgress(15, 'Parsing SPDX document...');
    await tick();

    const verbose = document.getElementById('verboseMode').checked;
    const validationMode = document.querySelector('input[name="validationMode"]:checked').value;
    const includeFiles = document.getElementById('includeMetadataTools').checked;

    const extractedLicenseTextById = {};
    const extractedInfos = Array.isArray(sbomData.hasExtractedLicensingInfos)
        ? sbomData.hasExtractedLicensingInfos
        : [];
    extractedInfos.forEach(info => {
        if (!info || typeof info !== 'object') return;
        const id = typeof info.licenseId === 'string' ? info.licenseId.trim() : '';
        const extractedText = typeof info.extractedText === 'string' ? info.extractedText : '';
        if (id && extractedText) {
            extractedLicenseTextById[id] = extractedText;
        }
    });

    const allResults = [];
    const pkgArray  = (sbomData.packages && Array.isArray(sbomData.packages)) ? sbomData.packages : [];
    const fileArray = (includeFiles && sbomData.files && Array.isArray(sbomData.files)) ? sbomData.files : [];
    const total = pkgArray.length + fileArray.length;

    setProgress(20, `Validating ${pkgArray.length} packages...`);
    await tick();

    for (let idx = 0; idx < pkgArray.length; idx++) {
        const result = validateSPDXPackage(pkgArray[idx], 'Packages', 0, idx + 1, validationMode, false, extractedLicenseTextById, `packages[${idx}]`);
        allResults.push(result);
        if (total > 0) setProgress(20 + Math.round(65 * (idx + 1) / total), `Validating package ${idx + 1} of ${pkgArray.length}...`);
        if ((idx + 1) % 50 === 0) await tick();
    }

    for (let idx = 0; idx < fileArray.length; idx++) {
        const result = validateSPDXPackage(fileArray[idx], 'Files', 0, idx + 1, validationMode, true, extractedLicenseTextById, `files[${idx}]`);
        allResults.push(result);
        if (total > 0) setProgress(20 + Math.round(65 * (pkgArray.length + idx + 1) / total), `Validating file ${idx + 1} of ${fileArray.length}...`);
        if ((idx + 1) % 50 === 0) await tick();
    }

    if (allResults.length === 0) {
        document.getElementById('loading').style.display = 'none';
        showError('No packages found in SPDX document. Ensure the SBOM contains a "packages" array.');
        return;
    }

    setProgress(95, 'Building results...');
    await tick();
    const overallValid = allResults.every(r => r.valid);
    document.getElementById('loading').style.display = 'none';
    displayResults(sbomData, allResults, overallValid, filename, verbose, validationMode);
}
;


let manualMappingConfig = {};

function looksLikeCustomStructuredJson(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }

    if (Array.isArray(data)) {
        return data.length > 0 && data.some(item => item && typeof item === 'object' && !Array.isArray(item));
    }

    const hasCycloneDxMarkers = Boolean(
        data.bomFormat ||
        data.specVersion ||
        Array.isArray(data.components) ||
        data.metadata ||
        Array.isArray(data.packages)
    );
    if (hasCycloneDxMarkers) {
        return false;
    }

    const packageList = Array.isArray(data.Packages) ? data.Packages : (Array.isArray(data.packages) ? data.packages : []);
    if (packageList.length > 0 && packageList.some(pkg => pkg && typeof pkg === 'object' && (
        typeof pkg.PackageUrl === 'string' ||
        typeof pkg.packageUrl === 'string' ||
        typeof pkg.Name === 'string' ||
        typeof pkg.name === 'string'
    ))) {
        return true;
    }

    return Object.values(data).some(value => {
        if (!Array.isArray(value) || value.length === 0) return false;
        return value.some(item => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length >= 2);
    });
}

function getManualMappingFields() {
    const mode = document.querySelector('input[name="validationMode"]:checked')?.value || 'standard';
    const fields = [
        { key: 'name', label: 'Component name', required: true, placeholder: '[].name' },
        { key: 'version', label: 'Version', required: true, placeholder: '[].version' },
        { key: 'licenseName', label: 'License name / SPDX ID', required: true, placeholder: '[].licenses[].license.id' },
        { key: 'licenseText', label: 'License text', required: true, placeholder: '[].licenses[].license.text.content' }
    ];
    if (mode === 'internal') {
        fields.push({ key: 'purl', label: 'PURL', required: true, placeholder: '[].purl' });
    }
    if (mode === 'standard' || mode === 'tooldownload') {
        fields.push({ key: 'copyright', label: 'Copyright', required: true, placeholder: '[].copyright' });
    }
    return fields;
}

function getDefaultManualMappingConfig(sbomData = currentSbomData) {
    const hasPackagesArray = Boolean(sbomData && typeof sbomData === 'object' && !Array.isArray(sbomData) && Array.isArray(sbomData.Packages));
    if (hasPackagesArray) {
        return {
            name: 'Packages[].PackageUrl',
            version: 'Packages[].Version',
            licenseName: 'Packages[].Licenses[].LicenseId',
            licenseText: 'Packages[].Licenses[].LicenseText',
            copyright: 'Packages[].Copyright',
            purl: ''
        };
    }

    return {
        name: '',
        version: '',
        licenseName: '',
        licenseText: '',
        copyright: '',
        purl: ''
    };
}

function openManualMappingPanel() {
    const panel = document.getElementById('manualMappingPanel');
    if (!panel) return;
    if (!manualMappingConfig || Object.values(manualMappingConfig).every(value => !value)) {
        manualMappingConfig = { ...getDefaultManualMappingConfig(currentSbomData), ...manualMappingConfig };
    }
    renderManualMappingFields();
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeManualMappingPanel() {
    const panel = document.getElementById('manualMappingPanel');
    if (panel) panel.style.display = 'none';
}

function renderManualMappingFields() {
    const container = document.getElementById('manualMappingFields');
    if (!container) return;
    const fields = getManualMappingFields();
    const defaults = getDefaultManualMappingConfig(currentSbomData);
    manualMappingConfig = { ...defaults, ...manualMappingConfig };
    const previous = { ...manualMappingConfig };
    container.innerHTML = '';

    fields.forEach(field => {
        const wrapper = document.createElement('div');
        wrapper.className = 'manual-mapping-field';

        const label = document.createElement('label');
        label.htmlFor = `manualMapping_${field.key}`;
        label.textContent = `${field.label}${field.required ? ' *' : ''}`;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `manualMapping_${field.key}`;
        input.className = 'manual-mapping-input';
        input.placeholder = field.placeholder;
        input.value = previous[field.key] || '';
        input.autocomplete = 'off';
        input.addEventListener('input', () => {
            manualMappingConfig = { ...manualMappingConfig, [field.key]: input.value.trim() };
        });

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
}

function readManualMappingConfig() {
    const defaults = getDefaultManualMappingConfig(currentSbomData);
    const config = { ...defaults, ...manualMappingConfig };
    getManualMappingFields().forEach(field => {
        const input = document.getElementById(`manualMapping_${field.key}`);
        const value = input ? input.value.trim() : '';
        config[field.key] = value || config[field.key] || defaults[field.key] || '';
    });
    manualMappingConfig = config;
    return config;
}

function tokenizeManualPath(path) {
    return String(path || '')
        .trim()
        .replace(/^\$\.?/, '')
        .split('.')
        .map(token => token.trim())
        .filter(Boolean);
}

function getManualRelativeTokens(path, componentPath) {
    const fieldTokens = tokenizeManualPath(path);
    const componentTokens = tokenizeManualPath(componentPath);
    if (componentTokens.length === 0) return fieldTokens;

    const hasComponentPrefix = componentTokens.every((token, index) => fieldTokens[index] === token);
    return hasComponentPrefix ? fieldTokens.slice(componentTokens.length) : fieldTokens;
}

function getManualPathValue(root, tokens) {
    let values = [root];
    tokens.forEach(token => {
        const isArray = token.endsWith('[]');
        const key = isArray ? token.slice(0, -2) : token;
        const next = [];
        values.forEach(value => {
            if (value === null || value === undefined) return;
            if (Array.isArray(value)) {
                value.forEach(item => {
                    if (item === null || item === undefined) return;
                    const child = key ? item[key] : item;
                    if (isArray) {
                        if (key) {
                            if (Array.isArray(child)) next.push(...child);
                        } else {
                            next.push(child);
                        }
                    } else if (child !== undefined && child !== null) {
                        next.push(child);
                    }
                });
                return;
            }
            const child = key ? value[key] : value;
            if (isArray) {
                if (Array.isArray(child)) next.push(...child);
            } else if (child !== undefined && child !== null) {
                next.push(child);
            }
        });
        values = next;
    });
    return values;
}

function findManualValuesByLeafName(value, leafName, results = []) {
    if (value === null || value === undefined || typeof value !== 'object') return results;
    if (Array.isArray(value)) {
        value.forEach(item => findManualValuesByLeafName(item, leafName, results));
        return results;
    }

    Object.entries(value).forEach(([key, child]) => {
        if (key === leafName && child !== null && child !== undefined) {
            if (Array.isArray(child)) {
                child.forEach(item => results.push(item));
            } else {
                results.push(child);
            }
        } else if (child && typeof child === 'object') {
            findManualValuesByLeafName(child, leafName, results);
        }
    });
    return results;
}

function objectContainsLeafKeyDeep(value, leafName, visited) {
    if (value === null || value === undefined || typeof value !== 'object') return false;
    if (visited.has(value)) return false;
    visited.add(value);
    if (Array.isArray(value)) {
        return value.some(item => objectContainsLeafKeyDeep(item, leafName, visited));
    }
    if (Object.prototype.hasOwnProperty.call(value, leafName)) return true;
    return Object.values(value).some(child => objectContainsLeafKeyDeep(child, leafName, visited));
}

function findArrayContainingLeafKey(data, leafName, visited = new Set()) {
    if (data === null || data === undefined || typeof data !== 'object') return null;
    if (visited.has(data)) return null;
    visited.add(data);

    if (Array.isArray(data)) {
        const hasMatch = data.some(item => objectContainsLeafKeyDeep(item, leafName, new Set()));
        if (hasMatch) return data;
        for (const item of data) {
            const found = findArrayContainingLeafKey(item, leafName, visited);
            if (found) return found;
        }
        return null;
    }

    for (const value of Object.values(data)) {
        if (value && typeof value === 'object') {
            const found = findArrayContainingLeafKey(value, leafName, visited);
            if (found) return found;
        }
    }
    return null;
}

function getManualCollectionInfo(sbomData, mappingPath) {
    const tokens = tokenizeManualPath(mappingPath);

    if (Array.isArray(sbomData)) {
        return {
            records: sbomData,
            suffixTokens: tokens,
            repeated: true,
            collectionTokens: tokens[0]?.endsWith('[]') ? [tokens[0]] : []
        };
    }

    const repeatIndex = tokens.findIndex(token => token.endsWith('[]'));
    if (repeatIndex < 0) {
        if (tokens.length === 1) {
            const foundArray = findArrayContainingLeafKey(sbomData, tokens[0]);
            if (foundArray && foundArray.length > 0) {
                return {
                    records: foundArray,
                    suffixTokens: tokens,
                    repeated: true,
                    collectionTokens: []
                };
            }
        }
        return { records: [sbomData], suffixTokens: tokens, repeated: false };
    }

    const collectionTokens = tokens.slice(0, repeatIndex + 1);
    const records = getManualPathValue(sbomData, collectionTokens);
    return {
        records: records.length > 0 ? records : [],
        suffixTokens: tokens.slice(repeatIndex + 1),
        repeated: true,
        collectionTokens
    };
}

function getManualMappedValues(record, suffixTokens, repeated) {
    if (!repeated) return getManualPathValue(record, suffixTokens);
    return suffixTokens.length > 0 ? getManualPathValue(record, suffixTokens) : [record];
}

function manualValueToString(values, joiner = ' OR ') {
    const flattened = (Array.isArray(values) ? values : [values])
        .flat(Infinity)
        .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
        .map(value => typeof value === 'object' ? JSON.stringify(value) : String(value).trim());
    return Array.from(new Set(flattened)).join(joiner);
}

function buildManualMappedComponents(sbomData, config) {
    const anchor = config.name || config.version || config.licenseName || config.licenseText || config.copyright || config.purl;
    if (!anchor) return { components: [], error: 'At least one mapping must be entered.' };

    const collectionInfo = getManualCollectionInfo(sbomData, anchor);
    if (collectionInfo.records.length === 0) {
        return { components: [], error: `No values found for mapping: ${anchor}` };
    }

    const components = collectionInfo.records.map((record, index) => {
        const mapped = {};
        Object.entries(config).forEach(([key, path]) => {
            if (!path) {
                mapped[key] = '';
                return;
            }
            const relativeTokens = getManualRelativeTokens(path, collectionInfo.collectionTokens.join('.'));
            let values = getManualMappedValues(record, relativeTokens, false);
            if (values.length === 0 && relativeTokens.length === 1) {
                values = findManualValuesByLeafName(record, relativeTokens[0]);
            }
            mapped[key] = manualValueToString(values, key === 'licenseText' ? '\n' : ' OR ');
        });
        return { mapped, record, index };
    });

    return { components };
}

function validateManualMappedComponents(sbomData, filename) {
    if (typeof looksLikeCustomStructuredJson === 'function' && looksLikeCustomStructuredJson(sbomData)) {
        manualMappingConfig = { ...getDefaultManualMappingConfig(sbomData), ...manualMappingConfig };
    }
    const config = readManualMappingConfig();
    const fields = getManualMappingFields();
    const missingMappings = fields.filter(field => field.required && !config[field.key]);
    if (missingMappings.length > 0) {
        const knownDefaults = getDefaultManualMappingConfig(sbomData);
        const resolved = { ...knownDefaults, ...config };
        const stillMissing = fields.filter(field => field.required && !resolved[field.key]);
        if (stillMissing.length > 0) {
            showError(`Enter mappings for: ${stillMissing.map(field => field.label).join(', ')}`);
            return;
        }
    }
    if (!sbomData || typeof sbomData !== 'object' || Array.isArray(sbomData) && sbomData.length === 0) {
        showError('Upload a JSON SBOM file before starting manual validation.');
        return;
    }

    const built = buildManualMappedComponents(sbomData, config);
    if (built.error) {
        showError(built.error);
        return;
    }

    const mode = document.querySelector('input[name="validationMode"]:checked')?.value || 'standard';
    const results = built.components.map((entry, index) => {
        const mapped = entry.mapped;
        const licenseName = mapped.licenseName;
        const licenseText = mapped.licenseText;
        const licenseItem = licenseName || licenseText
            ? {
                license: { id: licenseName, text: licenseText },
                licenseText
            }
            : null;

        const component = {
            name: mapped.name || '',
            version: mapped.version || '',
            type: 'library',
            purl: mapped.purl || '',
            licenses: licenseItem ? [licenseItem] : [],
            copyright: mapped.copyright || '',
            rawData: entry.record
        };

        const unified = createUnifiedComponentValues(component);
        if (licenseText && Array.isArray(unified.unifiedLicenses)) {
            unified.unifiedLicenses.forEach(license => {
                license.licenseText = licenseText;
            });
        }
        Object.assign(component, unified);

        return validateComponent(
            component,
            'Manual Mapping',
            0,
            index + 1,
            false,
            mode,
            `manual.components[${index}]`
        );
    });

    const flattenedResults = results.flat();

    currentSbomData = sbomData;
    currentSbomFile = null;
    currentFileType = 'manual-json';
    currentFileName = filename || currentFileName;
    displayResults(sbomData, flattenedResults, flattenedResults.every(result => result.valid), filename || 'Manual SBOM', false, mode, true);
}

function initializeManualMappingUi() {
    const startButton = document.getElementById('startManualMappingButton');
    if (startButton) startButton.addEventListener('click', openManualMappingPanel);
    document.querySelectorAll('input[name="validationMode"]').forEach(input => {
        input.addEventListener('change', () => {
            if (document.getElementById('manualMappingPanel')?.style.display !== 'none') {
                renderManualMappingFields();
            }
        });
    });
    renderManualMappingFields();
}
;

function ensureManualLicenseMappingModal() {
    if (document.getElementById('manualLicenseMappingModal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'manualLicenseMappingModal';
    modal.className = 'license-text-modal-overlay';
    modal.innerHTML = `
        <div class="license-text-modal" role="dialog" aria-modal="true" aria-labelledby="manualLicenseMappingModalTitle">
            <button type="button" class="license-text-modal-close" onclick="closeManualLicenseMappingModal()" aria-label="Close manual license pairing popup">&times;</button>
            <h3 id="manualLicenseMappingModalTitle" class="license-text-modal-title">Manual License Pairing</h3>
            <div id="manualLicenseMappingModalSubtitle" class="license-text-modal-subtitle"></div>
            <input id="manualLicenseMappingSearch" type="text" class="manual-license-search" placeholder="Search by SPDX ID or license name" oninput="filterManualLicenseReferenceOptions()" />
            <select id="manualLicenseMappingSelect" class="manual-license-select" size="12"></select>
            <div class="manual-license-actions">
                <button type="button" class="upload-btn" onclick="applyManualLicensePairing()">Apply Pairing</button>
                <button type="button" class="schema-btn" onclick="closeManualLicenseMappingModal()">Cancel</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeManualLicenseMappingModal();
        }
    });

    document.body.appendChild(modal);
}
;
