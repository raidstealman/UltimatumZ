let apiKey = '';
let model = 'google/gemini-2.0-flash-exp:free';

chrome.storage.local.get(['apiKey', 'model'], (res) => {
    if(res.apiKey) apiKey = res.apiKey;
    if(res.model) model = res.model;
});

chrome.storage.onChanged.addListener((changes) => {
    if(changes.apiKey) apiKey = changes.apiKey.newValue;
    if(changes.model) model = changes.model.newValue;
});

const SYSTEM_PROMPT = `You are a browser automation AI agent inside UltimatumZ browser on Android.
The user gives you a task. You control the browser by responding ONLY in JSON.

Available actions:
- {"action":"click","selector":"css_selector"}
- {"action":"type","selector":"css_selector","value":"text to type"}  
- {"action":"scroll","amount":500}
- {"action":"navigate","url":"https://..."}
- {"action":"extract"} — reads page content, returns it to you next turn
- {"action":"done","message":"task completed message for user"}

Rules:
1. Respond ONLY with a single JSON object, no explanation, no markdown
2. After extract, you will receive page content and can decide next action
3. Always end with done action when task is complete
4. Use extract first if you need to understand the page before acting`;

async function callOpenRouter(messages) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://ultimatumz.com',
            'X-Title': 'UltimatumZ'
        },
        body: JSON.stringify({ model: model, messages: messages })
    });
    const data = await res.json();
    return data.choices[0].message.content;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'RUN_TASK') {
        runAgent(request.task, sendResponse);
        return true; 
    }
});

async function runAgent(task, sendResponse) {
    let messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: task }
    ];

    for(let i=0; i<15; i++) {
        const response = await callOpenRouter(messages);
        let json;
        try {
            json = JSON.parse(response.replace(/```json|```/g, '').trim());
        } catch(e) {
            sendResponse({status: 'error', log: 'Failed to parse JSON: ' + response});
            return;
        }

        messages.push({ role: 'assistant', content: response });
        
        if (json.action === 'done') {
            sendResponse({status: 'done', log: json.message});
            return;
        }

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const result = await chrome.tabs.sendMessage(tab.id, json);
        
        sendResponse({status: 'step', log: JSON.stringify(json)});
        messages.push({ role: 'user', content: 'Result: ' + JSON.stringify(result) });
    }
}
