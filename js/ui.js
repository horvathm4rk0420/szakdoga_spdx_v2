function toggleInvalidIssueGroup(rowId, buttonEl) {
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

function openSourceFile(event, url) {
    event.preventDefault();
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
    } else {
        alert('Cannot open URL: only http and https URLs are supported.');
    }
}
;

function getJsonParseErrorDetails(text, error) {
    const msg = error.message || '';
    let lineNum = null;
    let colNum  = null;
    const contextLines = [];
    let hint = '';


    const ffMatch = msg.match(/line (\d+) column (\d+)/i);
    if (ffMatch) {
        lineNum = parseInt(ffMatch[1], 10);
        colNum  = parseInt(ffMatch[2], 10);
    }

    if (lineNum === null) {
        const snippetMatch = msg.match(/\.\.\."([\s\S]{0,120}?)" is not valid JSON/);
        if (snippetMatch) {
            const snippet = snippetMatch[1];
            let idx = text.lastIndexOf(snippet);
            if (idx === -1) idx = text.indexOf(snippet);
            if (idx !== -1) {
                const before = text.substring(0, idx + snippet.length);
                const linesUpTo = before.split('\n');
                lineNum = linesUpTo.length;
                colNum  = linesUpTo[linesUpTo.length - 1].length;
            }
        }
    }

    if (lineNum !== null) {
        const lines = text.split('\n');
        const before = [];
        for (let i = lineNum - 2; i >= 0 && before.length < 4; i--) {
            if (lines[i].trim() !== '') {
                before.unshift({ num: i + 1, text: lines[i], isError: false });
            }
        }
        contextLines.push(...before);
        contextLines.push({ num: lineNum, text: lines[lineNum - 1], isError: true });
        for (let i = lineNum; i < Math.min(lines.length, lineNum + 3); i++) {
            if (lines[i].trim() !== '') {
                contextLines.push({ num: i + 1, text: lines[i], isError: false });
                break;
            }
        }
    }

    const tokenMatch = msg.match(/Unexpected token '?([^\s',]+)'?/i);
    const token = tokenMatch ? tokenMatch[1] : '';
    if (token === ']' || token === '}') {
        hint = `An unexpected <code>${escapeHtml(token)}</code> was found. ` +
            `The most common cause is a <strong>trailing comma</strong> after the last ` +
            `item in an array or object — JSON does not allow trailing commas. ` +
            `Remove the comma on the line just before the closing bracket.`;
    } else if (token === ',') {
        hint = 'Unexpected comma. Check for a <strong>trailing comma</strong> after the ' +
            'last item in an array or object, or a double comma <code>,,</code>.';
    } else if (/unexpected end|end of (json|input)/i.test(msg)) {
        hint = 'The JSON appears to be <strong>incomplete or truncated</strong>. ' +
            'Make sure all arrays <code>[]</code> and objects <code>{}</code> are fully closed.';
    } else if (/undefined/i.test(token || '')) {
        hint = 'JSON does not support <code>undefined</code>. Replace with <code>null</code>.';
    } else {
        hint = 'Check the highlighted area for syntax errors such as trailing commas, ' +
            'mismatched brackets, or unquoted strings.';
    }

    return { lineNum, colNum, contextLines, hint };
}
;

function showJsonParseError(text, error) {
    const resultsDiv = document.getElementById('results');
    const d = getJsonParseErrorDetails(text, error);

    let locationHtml = '';
    if (d.lineNum !== null) {
        locationHtml = `<p style="margin-top:8px;"><strong>Location:</strong> ` +
            `Line ${d.lineNum}${d.colNum !== null ? ', Column ' + d.colNum : ''}</p>`;
    }

    let contextHtml = '';
    if (d.contextLines.length > 0) {
        contextHtml = `<div style="margin-top:12px;font-family:monospace;font-size:13px;` +
            `background:#fff0f0;border:1px solid var(--color-danger-800);` +
            `border-radius:4px;overflow:auto;padding:6px 0;">`;
        d.contextLines.forEach(line => {
            const bg = line.isError ? 'background:#ffd0d0;font-weight:bold;' : '';
            const marker = line.isError ? '\u25B6' : ' ';
            const lineText = line.text.length > 200 ? line.text.slice(0, 200) + '\u2026' : line.text;
            contextHtml += `<div style="${bg}padding:2px 12px;white-space:pre;">` +
                `<span style="color:#999;user-select:none;margin-right:10px;">${String(line.num).padStart(4)}</span>` +
                `<span style="color:var(--color-danger-800);margin-right:6px;">${marker}</span>` +
                `${escapeHtml(lineText)}</div>`;
        });
        contextHtml += `</div>`;
    }

    const hintHtml = `<div style="margin-top:12px;padding:12px;background:var(--color-warning-100);` +
        `border-left:3px solid var(--color-warning-1100);border-radius:4px;color:#5a3a00;font-size:14px;">` +
        `<strong>&#128161; How to fix:</strong> ${d.hint}</div>`;

    resultsDiv.innerHTML = `<div class="validation-result error" style="display: block;">
        <h2>&#x2717; JSON Parse Error</h2>
        <p><strong>Error:</strong> ${escapeHtml(error.message)}</p>
        ${locationHtml}
        ${contextHtml}
        ${hintHtml}
    </div>`;
}
;

function showError(message) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<div class="validation-result error" style="display: block;">
        <h2>X Error</h2>
        <p>${escapeHtml(message)}</p>
    </div>`;
}
;
