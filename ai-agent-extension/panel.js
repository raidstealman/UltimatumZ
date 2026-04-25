function showTab(tabId) {
    document.querySelectorAll('.tab').forEach((el) => {
        el.style.display = (el.id === tabId ? 'block' : 'none');
    });
}

function appendBubble(type, message, imageDataUrl) {
    const log = document.getElementById('log');
    const bubble = document.createElement('div');
    bubble.className = `bubble ${type}`;
    bubble.textContent = message;

    if (imageDataUrl) {
        const img = document.createElement('img');
        img.src = imageDataUrl;
        img.alt = 'Screenshot';
        bubble.appendChild(img);
    }

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
}

function setRunState(isRunning) {
    const runBtn = document.getElementById('runBtn');
    runBtn.disabled = isRunning;
    runBtn.textContent = isRunning ? 'Running...' : 'Run';
}

document.getElementById('tabChatBtn').addEventListener('click', () => showTab('chat'));
document.getElementById('tabSettingsBtn').addEventListener('click', () => showTab('settings'));

document.getElementById('runBtn').addEventListener('click', () => {
    const task = document.getElementById('task').value.trim();
    const includeInitialScreenshot = document.getElementById('includeScreenshot').checked;

    if (!task) {
        appendBubble('system', 'Error: task tidak boleh kosong.');
        return;
    }

    setRunState(true);
    appendBubble('user', task);

    chrome.runtime.sendMessage({ type: 'RUN_TASK', task, options: { includeInitialScreenshot } }, (res) => {
        setRunState(false);

        if (chrome.runtime.lastError) {
            appendBubble('system', `Error: ${chrome.runtime.lastError.message}`);
            return;
        }

        if (!res) {
            appendBubble('system', 'Error: tidak ada response dari background script.');
            return;
        }

        appendBubble('agent', `[${res.status}] ${res.log}`);

        if (Array.isArray(res.steps) && res.steps.length > 0) {
            appendBubble('system', `Steps: ${res.steps.length}`);
        }

        if (Array.isArray(res.screenshots) && res.screenshots.length > 0) {
            res.screenshots.forEach((shot, idx) => {
                appendBubble('agent', `Screenshot ${idx + 1}`, shot);
            });
        }
    });
});

document.getElementById('shotBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' }, (res) => {
        if (chrome.runtime.lastError) {
            appendBubble('system', `Error screenshot: ${chrome.runtime.lastError.message}`);
            return;
        }

        if (!res || res.status !== 'ok') {
            appendBubble('system', `Error screenshot: ${res?.message || 'unknown error'}`);
            return;
        }

        appendBubble('agent', 'Manual screenshot', res.screenshot);
    });
});

document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim() || 'openai/gpt-oss-120b:free';
    chrome.storage.local.set({ apiKey, model }, () => appendBubble('system', 'Settings saved.'));
});

chrome.storage.local.get(['apiKey', 'model'], (res) => {
    if (res.apiKey) document.getElementById('apiKey').value = res.apiKey;
    document.getElementById('model').value = res.model || 'openai/gpt-oss-120b:free';
});
