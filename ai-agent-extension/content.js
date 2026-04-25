function getElement(selector) {
    if (!selector) return null;
    return document.querySelector(selector);
}

function setNativeValue(el, value) {
    const prototype = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
}

function extractFormContext() {
    const fields = [];
    document.querySelectorAll('input, textarea, select, button').forEach((el, index) => {
        if (index > 120) return;
        const id = el.id ? `#${el.id}` : '';
        const name = el.name ? `[name="${el.name}"]` : '';
        const fallback = el.tagName.toLowerCase();
        const selector = id || name || fallback;
        const label = el.labels?.[0]?.innerText?.trim() || el.getAttribute('aria-label') || el.placeholder || '';

        fields.push({
            selector,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            label,
            required: !!el.required,
            disabled: !!el.disabled,
            value: (el.value || '').substring(0, 120),
            options: el.tagName.toLowerCase() === 'select'
                ? Array.from(el.options).slice(0, 20).map((o) => ({ value: o.value, text: o.text }))
                : undefined
        });
    });

    return {
        url: location.href,
        title: document.title,
        text: document.body?.innerText?.substring(0, 3500) || '',
        forms: document.forms.length,
        fields
    };
}

function sendNotFound(sendResponse, kind = 'Element') {
    sendResponse({ status: 'error', message: `${kind} not found` });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'click') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);
        el.click();
        sendResponse({ status: 'ok' });
    } else if (request.action === 'dblclick') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        sendResponse({ status: 'ok' });
    } else if (request.action === 'hover') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        sendResponse({ status: 'ok' });
    } else if (request.action === 'focus') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);
        el.focus();
        sendResponse({ status: 'ok' });
    } else if (request.action === 'type') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);

        if (el.isContentEditable) {
            el.focus();
            el.textContent = request.value || '';
        } else {
            el.focus();
            setNativeValue(el, request.value || '');
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        sendResponse({ status: 'ok' });
    } else if (request.action === 'select') {
        const el = getElement(request.selector);
        if (!el || el.tagName.toLowerCase() !== 'select') {
            sendResponse({ status: 'error', message: 'Select element not found' });
            return;
        }

        const targetValue = String(request.value || '').trim();
        const option = Array.from(el.options).find((opt) => (
            opt.value === targetValue || opt.text.trim().toLowerCase() === targetValue.toLowerCase()
        ));

        if (!option) {
            sendResponse({ status: 'error', message: 'Option not found' });
            return;
        }

        setNativeValue(el, option.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        sendResponse({ status: 'ok', value: option.value });
    } else if (request.action === 'check') {
        const el = getElement(request.selector);
        if (!el || (el.type !== 'checkbox' && el.type !== 'radio')) {
            sendResponse({ status: 'error', message: 'Checkbox/radio not found' });
            return;
        }

        const nextChecked = Boolean(request.checked);
        if (el.checked !== nextChecked) el.click();
        sendResponse({ status: 'ok', checked: el.checked });
    } else if (request.action === 'press_enter') {
        const el = getElement(request.selector);
        if (!el) return sendNotFound(sendResponse);

        el.focus();
        const keyDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
        const keyUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true });
        el.dispatchEvent(keyDown);
        el.dispatchEvent(keyUp);
        sendResponse({ status: 'ok' });
    } else if (request.action === 'submit_form') {
        const el = getElement(request.selector);
        const form = el?.tagName.toLowerCase() === 'form' ? el : el?.closest('form') || document.querySelector('form');
        if (!form) {
            sendResponse({ status: 'error', message: 'Form not found' });
            return;
        }

        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
        sendResponse({ status: 'ok' });
    } else if (request.action === 'scroll') {
        window.scrollBy(0, Number(request.amount) || 0);
        sendResponse({ status: 'ok' });
    } else if (request.action === 'navigate') {
        if (!request.url || !/^https?:\/\//i.test(request.url)) {
            sendResponse({ status: 'error', message: 'A valid http/https URL is required' });
            return;
        }
        window.location.href = request.url;
        sendResponse({ status: 'ok' });
    } else if (request.action === 'extract') {
        sendResponse(extractFormContext());
    } else {
        sendResponse({ status: 'error', message: 'Unknown action' });
    }
});
