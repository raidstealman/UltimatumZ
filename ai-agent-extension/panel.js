function showTab(t) {
    document.querySelectorAll('.tab').forEach(el => el.style.display = (el.id === t ? 'block' : 'none'));
}

document.getElementById('runBtn').addEventListener('click', () => {
    const task = document.getElementById('task').value;
    document.getElementById('log').innerHTML += `<div>Task: ${task}</div>`;
    chrome.runtime.sendMessage({type: 'RUN_TASK', task: task}, res => {
        document.getElementById('log').innerHTML += `<div>Result: ${res.log}</div>`;
    });
});

document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value;
    const model = document.getElementById('model').value;
    chrome.storage.local.set({apiKey, model}, () => alert('Saved'));
});

chrome.storage.local.get(['apiKey', 'model'], (res) => {
    if(res.apiKey) document.getElementById('apiKey').value = res.apiKey;
    if(res.model) document.getElementById('model').value = res.model;
});
