chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'click') {
        const el = document.querySelector(request.selector);
        if(el) { el.click(); sendResponse({status: 'ok'}); }
        else sendResponse({status: 'error', message: 'Element not found'});
    } else if (request.action === 'type') {
        const el = document.querySelector(request.selector);
        if(el) { el.value = request.value; el.dispatchEvent(new Event('input', {bubbles: true})); sendResponse({status: 'ok'}); }
        else sendResponse({status: 'error', message: 'Element not found'});
    } else if (request.action === 'scroll') {
        window.scrollBy(0, request.amount);
        sendResponse({status: 'ok'});
    } else if (request.action === 'navigate') {
        window.location.href = request.url;
        sendResponse({status: 'ok'});
    } else if (request.action === 'extract') {
        sendResponse({text: document.body.innerText.substring(0, 3000)});
    }
});
