let apiKey = '';
let model = 'openai/gpt-oss-120b:free';

chrome.storage.local.get(['apiKey', 'model'], (res) => {
    if (res.apiKey) apiKey = res.apiKey;
    if (res.model) model = res.model;
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.apiKey) apiKey = changes.apiKey.newValue;
    if (changes.model) model = changes.model.newValue;
});

const SYSTEM_PROMPT = `You are a browser automation AI agent inside UltimatumZ browser on Android.
The user gives you a task. You control the browser by responding ONLY in JSON.

Available actions:
- {"action":"extract"}
- {"action":"click","selector":"css_selector"}
- {"action":"dblclick","selector":"css_selector"}
- {"action":"hover","selector":"css_selector"}
- {"action":"focus","selector":"css_selector"}
- {"action":"type","selector":"css_selector","value":"text"}
- {"action":"select","selector":"css_selector","value":"option value or visible text"}
- {"action":"check","selector":"css_selector","checked":true}
- {"action":"press_enter","selector":"css_selector"}
- {"action":"submit_form","selector":"css_selector"}
- {"action":"scroll","amount":500}
- {"action":"navigate","url":"https://..."}
- {"action":"wait","ms":1000}
- {"action":"screenshot"}
- {"action":"done","message":"task completed message for user"}

Rules:
1. Respond ONLY with a single JSON object, no explanation, no markdown.
2. Start with extract when you need page context.
3. For surveys/forms: fill all required fields, select options, check consent boxes if required, then submit.
4. After navigate or submit, use wait and/or extract to verify next state.
5. Use screenshot only when explicitly needed for visual confirmation.
6. End with done when task is complete.`;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenRouter(messages) {
    if (!apiKey) {
        throw new Error('OpenRouter API key belum disimpan. Buka Settings dan simpan API key dulu.');
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://ultimatumz.com',
            'X-Title': 'UltimatumZ'
        },
        body: JSON.stringify({ model, messages })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (!data?.choices?.[0]?.message?.content) {
        throw new Error('OpenRouter response tidak valid.');
    }

    return data.choices[0].message.content;
}

function queryActiveTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (!tabs || tabs.length === 0 || !tabs[0].id) {
                reject(new Error('Tab aktif tidak ditemukan.'));
                return;
            }

            resolve(tabs[0]);
        });
    });
}

function sendTabMessage(tabId, payload) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(response);
        });
    });
}

function captureVisible() {
    return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(dataUrl);
        });
    });
}

function parseAgentResponse(response) {
    const cleaned = response.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'RUN_TASK') {
        runAgent(request.task, request.options || {}, sendResponse);
        return true;
    }

    if (request.type === 'TAKE_SCREENSHOT') {
        captureVisible()
            .then((dataUrl) => sendResponse({ status: 'ok', screenshot: dataUrl }))
            .catch((err) => sendResponse({ status: 'error', message: err.message || String(err) }));
        return true;
    }

    return false;
});

async function runAgent(task, options, sendResponse) {
    const logs = [];
    const screenshots = [];
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: task }
    ];

    try {
        if (options.includeInitialScreenshot) {
            try {
                const image = await captureVisible();
                screenshots.push(image);
                logs.push('Initial screenshot captured.');
            } catch (e) {
                logs.push(`Screenshot warning: ${e.message}`);
            }
        }

        for (let i = 0; i < 24; i++) {
            const response = await callOpenRouter(messages);

            let json;
            try {
                json = parseAgentResponse(response);
            } catch (e) {
                sendResponse({ status: 'error', log: `Failed to parse JSON: ${response}`, steps: logs, screenshots });
                return;
            }

            messages.push({ role: 'assistant', content: response });
            logs.push(JSON.stringify(json));

            if (json.action === 'done') {
                sendResponse({ status: 'done', log: json.message || 'Task selesai.', steps: logs, screenshots });
                return;
            }

            if (json.action === 'wait') {
                const waitMs = Math.min(Math.max(Number(json.ms) || 1000, 100), 10000);
                await sleep(waitMs);
                messages.push({ role: 'user', content: `Result: waited ${waitMs}ms` });
                continue;
            }

            if (json.action === 'screenshot') {
                const image = await captureVisible();
                screenshots.push(image);
                messages.push({ role: 'user', content: `Result: screenshot captured (${image.length} chars)` });
                continue;
            }

            const tab = await queryActiveTab();
            let result;
            try {
                result = await sendTabMessage(tab.id, json);
            } catch (err) {
                await sleep(600);
                result = await sendTabMessage(tab.id, json);
            }

            messages.push({ role: 'user', content: 'Result: ' + JSON.stringify(result || {}) });

            if (json.action === 'navigate' || json.action === 'submit_form') {
                await sleep(1200);
            }
        }

        sendResponse({
            status: 'error',
            log: 'Task berhenti karena melebihi batas 24 langkah.',
            steps: logs,
            screenshots
        });
    } catch (err) {
        sendResponse({ status: 'error', log: err.message || String(err), steps: logs, screenshots });
    }
}
