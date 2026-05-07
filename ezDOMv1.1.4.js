// ezDOM.js
(function (global) {
    'use strict';

    /*
     * ezDOM 보안 기준
     * - 기본값은 안전한 동작을 우선한다.
     * - 위험 기능은 명시적 옵션을 통해서만 활성화한다.
     * - 옵션 활성화 후 발생하는 문제는 사용자 책임이다.
     * - 외부 입력값은 사용자가 직접 검증해야 한다.
     * - element 또는 $raw.element 원본 DOM 접근은 안전 setter를 우회할 수 있다.
     */

    const DEFAULT_SELECTOR = '[data-ui]';

    const DEFAULT_STATE_CLASS_IGNORE_LIST = [
        'active',
        'is-active',
        'hover',
        'focus',
        'selected',
        'disabled'
    ];

    const DEFAULT_SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', ''];
    const DEFAULT_SAFE_IMAGE_PROTOCOLS = ['http:', 'https:', ''];
    const SAFE_TARGETS = ['_self', '_blank', '_parent', '_top'];

    const displayMemory = new WeakMap();
    const eventStore = new WeakMap();

    function noop() {}

    function emptyUnsubscribe() {
        return noop;
    }

    function warn(message, target) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(`[ezDOM] ${message}`, target || '');
        }
    }

    function error(message, target) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error(`[ezDOM] ${message}`, target || '');
        }
    }

    function hasDocument() {
        return typeof document !== 'undefined';
    }

    function hasNode() {
        return typeof Node !== 'undefined';
    }

    function safeString(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function normalizeText(text) {
        return safeString(text).replace(/\s+/g, ' ').trim();
    }

    function toCamelCase(str) {
        return safeString(str)
            .trim()
            .split(/\s+/)
            .join('-')
            .split(/[-_]+/)
            .filter(Boolean)
            .map((word, i) =>
                i === 0
                    ? word.toLowerCase()
                    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join('');
    }

    function isValidRoot(root) {
        return !!(
            root &&
            typeof root.querySelectorAll === 'function'
        );
    }

    function getFallbackRoot() {
        if (hasDocument() && document.body) {
            return document.body;
        }

        return null;
    }

    function safeRequestAnimationFrame(callback) {
        if (global && typeof global.requestAnimationFrame === 'function') {
            return global.requestAnimationFrame(callback);
        }

        return setTimeout(callback, 16);
    }

    function safeGetComputedStyle(el) {
        try {
            if (!el || !global || typeof global.getComputedStyle !== 'function') return null;
            return global.getComputedStyle(el);
        } catch (err) {
            error('getComputedStyle 호출 실패', el);
            return null;
        }
    }

    function getSafeStyle(el, prop) {
        const style = safeGetComputedStyle(el);
        return style ? style[prop] : '';
    }

    function isDetached(el) {
        try {
            if (!hasDocument() || !document.contains) return false;
            return !document.contains(el);
        } catch (err) {
            return true;
        }
    }

    function getDirectTextNodes(el) {
        if (!el || !hasNode()) return [];
        return [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    }

    function getDirectText(el) {
        return normalizeText(
            getDirectTextNodes(el)
                .map(node => node.textContent)
                .join(' ')
        );
    }

    function setDirectText(el, text) {
        if (!el || !hasDocument()) return false;

        try {
            const textNodes = getDirectTextNodes(el);

            if (textNodes.length > 0) {
                textNodes[0].textContent = safeString(text);

                for (let i = 1; i < textNodes.length; i++) {
                    textNodes[i].textContent = '';
                }
            } else {
                el.insertBefore(document.createTextNode(safeString(text)), el.firstChild);
            }

            return true;
        } catch (err) {
            error('직접 텍스트 설정 실패', el);
            return false;
        }
    }

    function getElementText(el) {
        if (!el || typeof el.tagName !== 'string') {
            if (el && typeof el.textContent === 'string') {
                return normalizeText(el.textContent);
            }

            return '';
        }

        if (el.tagName === 'INPUT') {
            return normalizeText(el.value || (typeof el.getAttribute === 'function' ? el.getAttribute('value') : '') || '');
        }

        if (el.tagName === 'IMG') {
            return normalizeText(el.alt || '');
        }

        return normalizeText(el.textContent || '');
    }

    function getElementValue(el) {
        if (!el || typeof el.tagName !== 'string') {
            if (el && typeof el.textContent === 'string') {
                return normalizeText(el.textContent);
            }

            return undefined;
        }

        const tagName = el.tagName.toLowerCase();

        if (tagName === 'input') {
            const type = safeString(el.type).toLowerCase();

            if (type === 'checkbox' || type === 'radio') {
                return !!el.checked;
            }

            return el.value;
        }

        if (tagName === 'textarea' || tagName === 'select') {
            return el.value;
        }

        if (tagName === 'button') {
            return getElementText(el);
        }

        return normalizeText(el.textContent || '');
    }

    function selectHasValue(el, value) {
        if (!el || !el.options) return false;
        return [...el.options].some(option => option.value === safeString(value));
    }

    function setElementValue(el, value, options = {}) {
        if (!el || typeof el.tagName !== 'string') return false;

        const tagName = el.tagName.toLowerCase();

        try {
            if (tagName === 'input') {
                const type = safeString(el.type).toLowerCase();

                if (type === 'checkbox' || type === 'radio') {
                    el.checked = !!value;
                    return true;
                }

                el.value = safeString(value);
                return true;
            }

            if (tagName === 'select') {
                /*
                 * select value 검증 정책
                 * - 기본값은 strictSelectValue: true 이다.
                 * - 존재하지 않는 option value는 반영하지 않는다.
                 * - 동적 option 생성 전에 value 선반영이 필요한 경우 strictSelectValue: false로 완화할 수 있다.
                 * - 완화 옵션 사용 시 의도하지 않은 DOM 상태는 사용자 책임이다.
                 */
                if (options.strictSelectValue !== false && !selectHasValue(el, value)) {
                    warn('select에 존재하지 않는 value입니다.', el);
                    return false;
                }

                el.value = safeString(value);
                return true;
            }

            if (tagName === 'textarea') {
                el.value = safeString(value);
                return true;
            }

            if (tagName === 'button') {
                el.textContent = safeString(value);
                return true;
            }

            el.textContent = safeString(value);
            return true;
        } catch (err) {
            error('value 설정 실패', el);
            return false;
        }
    }

    function isHidden(el) {
        if (!el) return false;
        return getSafeStyle(el, 'display') === 'none';
    }

    function hideElement(el) {
        if (!el || isDetached(el)) return false;

        /*
         * display 복원 정책
         * - 라이브러리가 hide() 호출 시점의 inline display 값만 기억한다.
         * - 외부 CSS에 의해 원래 숨김 처리된 요소와 라이브러리가 숨긴 요소를 완전히 구분하지 않는다.
         */
        if (!displayMemory.has(el)) {
            displayMemory.set(el, el.style.display || '');
        }

        el.style.display = 'none';
        return true;
    }

    function showElement(el) {
        if (!el || isDetached(el)) return false;

        /*
         * display 복원 정책
         * - hide()가 저장한 inline display 값으로 복원한다.
         * - 원래 외부 CSS에서 display:none이었던 요소는 show()로 노출될 수 있다.
         */
        const prevDisplay = displayMemory.has(el)
            ? displayMemory.get(el)
            : '';

        el.style.display = prevDisplay === 'none' ? '' : prevDisplay;
        return true;
    }

    function setHidden(el, value) {
        return value ? hideElement(el) : showElement(el);
    }

    function getFilteredClassName(el, ignoreList) {
        if (!el || !el.classList) return '';

        return [...el.classList]
            .filter(cls => !ignoreList.includes(cls))
            .join(' ')
            .trim();
    }

    function isSafeSingleClassName(value, options = {}) {
        const className = safeString(value).trim();

        /*
         * 단일 class token 검증
         * - allowUnsafeClassName이 true여도 addClass/removeClass/toggleClass는 단일 token만 허용한다.
         * - DOMTokenList.add/remove/toggle은 공백 포함 token을 처리할 수 없다.
         */
        if (!className || /\s/.test(className)) return false;

        if (options.allowUnsafeClassName === true) {
            return !/[\u0000-\u001F\u007F]/.test(className);
        }

        return /^[A-Za-z0-9_-]+$/.test(className);
    }

    function isSafeClassName(value, options = {}) {
        const className = safeString(value).trim();

        if (!className) return true;

        if (options.allowUnsafeClassName === true) {
            /*
             * className 검증 완화 옵션
             * - 임의 className 반영은 UI 상태나 스타일 정책을 우회할 수 있다.
             * - 옵션 활성화 후 발생하는 문제는 사용자 책임이다.
             */
            return !/[\u0000-\u001F\u007F]/.test(className);
        }

        return className
            .split(/\s+/)
            .every(cls => /^[A-Za-z0-9_-]+$/.test(cls));
    }

    function isSafeStyleValue(prop, value, options = {}) {
        const text = safeString(value).trim();

        if (options.allowUnsafeStyle === true) {
            /*
             * style 검증 우회 옵션
             * - CSS 변수, calc, 사용자 정의 스타일 값을 허용할 수 있다.
             * - 비정상 CSS 값 또는 외부 입력값으로 발생하는 문제는 사용자 책임이다.
             */
            return true;
        }

        if (/[{};]/.test(text)) return false;
        if (/url\s*\(/i.test(text)) return false;
        if (/expression\s*\(/i.test(text)) return false;
        if (/javascript:/i.test(text)) return false;
        if (/data:/i.test(text)) return false;

        switch (prop) {
            case 'color':
            case 'backgroundColor':
                return (
                    /^#[0-9a-fA-F]{3,8}$/.test(text) ||
                    /^rgb(a)?\([\d\s,.%]+\)$/.test(text) ||
                    /^hsl(a)?\([\d\s,.%]+\)$/.test(text) ||
                    /^[a-zA-Z]+$/.test(text) ||
                    /^(inherit|initial|unset|revert|currentColor|transparent)$/.test(text)
                );

            case 'size':
                return (
                    /^(\d+(\.\d+)?)(px|em|rem|%|vw|vh|vmin|vmax|pt|pc|cm|mm|in|ch|ex)$/.test(text) ||
                    /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|inherit|initial|unset|revert)$/.test(text)
                );

            case 'weight':
                return /^(normal|bold|lighter|bolder|[1-9]00|inherit|initial|unset|revert)$/.test(text);

            case 'family':
                return /^[A-Za-z0-9\s,'"_-]+$/.test(text) || /^(inherit|initial|unset|revert)$/.test(text);

            case 'align':
                return /^(left|right|center|justify|start|end|match-parent|inherit|initial|unset|revert)$/.test(text);

            case 'display':
                return /^(none|block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|table-row|table-cell|contents|inherit|initial|unset|revert)$/.test(text);

            default:
                return false;
        }
    }

    function setSafeStyle(el, prop, cssProp, value, options) {
        if (!isSafeStyleValue(prop, value, options)) {
            warn(`허용되지 않은 style 값: ${prop}`, el);
            return false;
        }

        try {
            el.style[cssProp] = safeString(value);
            return true;
        } catch (err) {
            error(`style 설정 실패: ${prop}`, el);
            return false;
        }
    }

    function getSafeUrlProtocols(options) {
        /*
         * URL protocol 확장 옵션
         * - 특수 scheme 허용이 필요한 경우 safeUrlProtocols로 확장할 수 있다.
         * - protocol 제한 완화 후 발생하는 보안 문제는 사용자 책임이다.
         */
        return Array.isArray(options.safeUrlProtocols)
            ? options.safeUrlProtocols.filter(item => typeof item === 'string')
            : DEFAULT_SAFE_URL_PROTOCOLS;
    }

    function getSafeImageProtocols(options) {
        /*
         * 이미지 URL protocol 확장 옵션
         * - 특수 scheme 허용이 필요한 경우 safeImageProtocols로 확장할 수 있다.
         * - data:, blob: 등 확장 허용 시 외부 입력 검증은 사용자 책임이다.
         */
        return Array.isArray(options.safeImageProtocols)
            ? options.safeImageProtocols.filter(item => typeof item === 'string')
            : DEFAULT_SAFE_IMAGE_PROTOCOLS;
    }

    function isSafeUrl(value, allowedProtocols) {
        const raw = safeString(value).trim();

        if (!raw) return true;
        if (/[\u0000-\u001F\u007F]/.test(raw)) return false;

        if (!hasDocument()) {
            return /^(https?:|mailto:|tel:)/i.test(raw);
        }

        try {
            const parsed = new URL(raw, document.baseURI);
            return allowedProtocols.includes(parsed.protocol);
        } catch (err) {
            return false;
        }
    }

    function setSafeHref(el, value, options) {
        if (!isSafeUrl(value, getSafeUrlProtocols(options))) {
            warn('허용되지 않은 href 값입니다.', el);
            return false;
        }

        el.setAttribute('href', safeString(value));
        return true;
    }

    function setSafeSrc(el, value, options) {
        if (!isSafeUrl(value, getSafeImageProtocols(options))) {
            warn('허용되지 않은 src 값입니다.', el);
            return false;
        }

        el.setAttribute('src', safeString(value));
        return true;
    }

    function setSafeTarget(el, value) {
        const target = safeString(value).trim();

        if (!SAFE_TARGETS.includes(target)) {
            warn('허용되지 않은 target 값입니다.', el);
            return false;
        }

        el.setAttribute('target', target);

        if (target === '_blank') {
            /*
             * target="_blank" 보안 처리
             * - 새 창에서 window.opener 접근을 막기 위해 rel을 자동 적용한다.
             * - element 원본 DOM으로 target을 직접 수정하면 이 보호 로직을 우회할 수 있다.
             */
            el.setAttribute('rel', 'noopener noreferrer');
        }

        return true;
    }

    function setSafeHtml(el, value, options = {}) {
        /*
         * innerHTML 위험 API
         * - 이 기능은 신뢰된 HTML에만 사용해야 한다.
         * - 외부 입력값을 직접 넣으면 XSS 위험이 있다.
         * - 안전한 일반 텍스트 입력은 textContent 기반 text API를 사용해야 한다.
         * - allowUnsafeHtml 활성화 여부와 사용 결과는 사용자 책임이다.
         * - htmlValidator 없이 allowUnsafeHtml을 활성화하면 위험할 수 있다.
         */
        if (options.allowUnsafeHtml !== true) {
            warn('html setter는 allowUnsafeHtml 옵션이 true일 때만 허용됩니다.', el);
            return false;
        }

        if (typeof options.htmlValidator === 'function') {
            const validated = options.htmlValidator(value, el);

            if (validated !== true) {
                warn('htmlValidator 검증 실패', el);
                return false;
            }
        }

        try {
            el.innerHTML = safeString(value);
            return true;
        } catch (err) {
            error('innerHTML 설정 실패', el);
            return false;
        }
    }

    function detectElementType(el) {
        if (!el || typeof el.tagName !== 'string') {
            return 'unknown';
        }

        const tagName = el.tagName.toLowerCase();
        const classList = el.classList || { contains: () => false };
        const children = el.children || [];

        if (tagName === 'input') {
            const type = safeString(el.type).toLowerCase();

            if (type === 'checkbox' || type === 'radio') {
                return 'check';
            }

            if (type === 'button' || type === 'submit') {
                return 'button';
            }

            return 'input';
        }

        if (tagName === 'select') return 'select';
        if (tagName === 'textarea') return 'textarea';

        if (
            tagName === 'button' ||
            classList.contains('btn') ||
            (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button')
        ) {
            return 'button';
        }

        if (tagName === 'img') return 'img';
        if (tagName === 'a') return 'anchor';

        if (children.length === 0) return 'leaf';

        return 'child';
    }

    function getTypeSuffix(el) {
        const type = detectElementType(el);

        switch (type) {
            case 'button':
                return 'Btn';
            case 'check':
                return 'Check';
            case 'input':
                return 'Input';
            case 'select':
                return 'Select';
            case 'textarea':
                return 'Textarea';
            case 'img':
                return 'Img';
            case 'anchor':
                return 'Link';
            default:
                return '';
        }
    }

    function buildKeyFromElement(el, index, options = {}) {
        if (!el || typeof el.tagName !== 'string') {
            return `element${index}`;
        }

        const ignoreList = options.stateClassIgnoreList || DEFAULT_STATE_CLASS_IGNORE_LIST;

        const dataUi = normalizeText(typeof el.getAttribute === 'function' ? el.getAttribute('data-ui') || '' : '');
        const id = normalizeText(el.id || '');
        const className = getFilteredClassName(el, ignoreList);
        const tagName = el.tagName.toLowerCase();
        const text = getElementText(el);
        const suffix = getTypeSuffix(el);

        /*
         * keyPolicy
         * - 기본값: data-ui > id > className > text > tagName+index
         * - keyPolicy가 함수인 경우 사용자가 직접 key 생성 정책을 지정할 수 있다.
         */
        if (typeof options.keyPolicy === 'function') {
            const customKey = options.keyPolicy(el, index, {
                dataUi,
                id,
                className,
                tagName,
                text,
                suffix
            });

            if (customKey) return toCamelCase(customKey);
        }

        if (dataUi) return toCamelCase(dataUi);
        if (id) return toCamelCase(id);
        if (className) return toCamelCase(className);
        if (text) return `${toCamelCase(text)}${suffix}`;
        if (tagName) return `${tagName}${index}`;

        return `element${index}`;
    }

    function validateSelector(selector) {
        /*
         * selector 사용 주의
         * - 사용자 지정 selector는 querySelectorAll()에 직접 전달된다.
         * - 유효하지 않은 selector 또는 과도하게 넓은 selector 사용은 사용자 책임이다.
         * - 기본 fallback은 [data-ui]만 사용한다.
         */
        const finalSelector = selector || DEFAULT_SELECTOR;
        const value = safeString(finalSelector).trim();

        if (!value) return DEFAULT_SELECTOR;

        if (value === '*') {
            warn('* selector는 허용하지 않습니다.');
            return DEFAULT_SELECTOR;
        }

        if (/^(html|body)$/i.test(value)) {
            warn('과도하게 넓은 selector는 허용하지 않습니다.');
            return DEFAULT_SELECTOR;
        }

        if (!hasDocument()) {
            return DEFAULT_SELECTOR;
        }

        try {
            document.createDocumentFragment().querySelectorAll(value);
            return value;
        } catch (err) {
            warn('유효하지 않은 selector입니다.');
            return DEFAULT_SELECTOR;
        }
    }

    function isHandler(handler) {
        return typeof handler === 'function';
    }

    function normalizeEventOptions(options) {
        if (options === undefined || options === null) {
            return {
                raw: options,
                capture: false
            };
        }

        if (typeof options === 'boolean') {
            return {
                raw: options,
                capture: options
            };
        }

        return {
            raw: options,
            capture: !!options.capture
        };
    }

    function getEventBucket(el) {
        if (!eventStore.has(el)) {
            eventStore.set(el, []);
        }

        return eventStore.get(el);
    }

    function removeEventRecord(el, eventName, handler, options) {
        const bucket = eventStore.get(el);
        const normalized = normalizeEventOptions(options);

        if (!bucket) return false;

        let removed = false;

        for (let i = bucket.length - 1; i >= 0; i--) {
            const record = bucket[i];

            if (
                record.target === el &&
                record.eventName === eventName &&
                record.handler === handler &&
                record.capture === normalized.capture
            ) {
                bucket.splice(i, 1);
                removed = true;
            }
        }

        return removed;
    }

    function bindEvent(el, eventName, handler, options) {
        if (!isHandler(handler)) {
            warn(`${eventName} handler는 함수여야 합니다.`, el);
            return emptyUnsubscribe();
        }

        if (!el || typeof el.addEventListener !== 'function') {
            error('이벤트 등록 대상이 올바르지 않습니다.', el);
            return emptyUnsubscribe();
        }

        try {
            const normalized = normalizeEventOptions(options);

            el.addEventListener(eventName, handler, options);

            const bucket = getEventBucket(el);
            const record = {
                target: el,
                eventName,
                handler,
                options,
                capture: normalized.capture
            };

            bucket.push(record);

            return function unsubscribe() {
                record.target.removeEventListener(record.eventName, record.handler, record.options);

                const index = bucket.indexOf(record);
                if (index >= 0) bucket.splice(index, 1);
            };
        } catch (err) {
            error('이벤트 등록 실패', el);
            return emptyUnsubscribe();
        }
    }

    function removeAllEvents(el) {
        /*
         * 이벤트 해제
         * - on(), onClick(), onHold()는 unsubscribe 함수를 반환한다.
         * - onHold()는 전역 이벤트를 함께 등록하므로 해제하지 않으면 메모리 누수 또는 중복 실행이 발생할 수 있다.
         * - offAll()은 등록 추적된 이벤트를 일괄 제거한다.
         */
        const bucket = eventStore.get(el);

        if (!bucket) return false;

        bucket.slice().forEach(record => {
            if (
                record &&
                record.target &&
                typeof record.target.removeEventListener === 'function'
            ) {
                record.target.removeEventListener(record.eventName, record.handler, record.options);
            }
        });

        bucket.length = 0;
        return true;
    }

    function getLiveEntry(entry, options) {
        if (
            options &&
            typeof options.resolveEntryByElement === 'function' &&
            entry &&
            entry.element
        ) {
            const liveEntry = options.resolveEntryByElement(entry.element);
            if (liveEntry) return liveEntry;
        }

        return entry;
    }

    function applyCommonGet(el, prop, context) {
        switch (prop) {
            case 'text':
                return getElementText(el);

            case 'html':
                /*
                 * HTML 읽기 옵션
                 * - allowHtmlRead가 true일 때만 innerHTML을 반환한다.
                 * - 원본 HTML을 외부 입력 처리에 재사용하면 XSS 위험이 발생할 수 있다.
                 */
                return context.options.allowHtmlRead === true ? el.innerHTML : undefined;

            case 'value':
                return getElementValue(el);

            case 'color':
                return getSafeStyle(el, 'color');

            case 'backgroundColor':
                return getSafeStyle(el, 'backgroundColor');

            case 'size':
                return getSafeStyle(el, 'fontSize');

            case 'weight':
                return getSafeStyle(el, 'fontWeight');

            case 'family':
                return getSafeStyle(el, 'fontFamily');

            case 'align':
                return getSafeStyle(el, 'textAlign');

            case 'display':
                return getSafeStyle(el, 'display');

            case 'hidden':
                return isHidden(el);

            case 'element':
                /*
                 * 원본 DOM 접근
                 * - element는 안전 setter를 우회할 수 있다.
                 * - 원본 DOM 직접 조작으로 발생하는 보안 문제는 사용자 책임이다.
                 */
                return el;

            case 'className':
                return el.className;

            case 'id':
                return el.id;

            case 'isDetached':
                return isDetached(el);

            case 'show':
                return () => showElement(el);

            case 'hide':
                return () => hideElement(el);

            case 'focus':
                return () => {
                    if (!isDetached(el) && el.focus) {
                        el.focus();
                        return true;
                    }

                    return false;
                };

            case 'blur':
                return () => {
                    if (!isDetached(el) && el.blur) {
                        el.blur();
                        return true;
                    }

                    return false;
                };

            case 'addClass':
                return className => {
                    const name = safeString(className).trim();

                    if (!isSafeSingleClassName(name, context.options)) {
                        warn('addClass는 안전한 단일 class만 허용합니다.', el);
                        return false;
                    }

                    try {
                        el.classList.add(name);
                        return true;
                    } catch (err) {
                        error('addClass 처리 실패', el);
                        return false;
                    }
                };

            case 'removeClass':
                return className => {
                    const name = safeString(className).trim();

                    if (!isSafeSingleClassName(name, context.options)) {
                        warn('removeClass는 안전한 단일 class만 허용합니다.', el);
                        return false;
                    }

                    try {
                        el.classList.remove(name);
                        return true;
                    } catch (err) {
                        error('removeClass 처리 실패', el);
                        return false;
                    }
                };

            case 'toggleClass':
                return className => {
                    const name = safeString(className).trim();

                    if (!isSafeSingleClassName(name, context.options)) {
                        warn('toggleClass는 안전한 단일 class만 허용합니다.', el);
                        return false;
                    }

                    try {
                        el.classList.toggle(name);
                        return true;
                    } catch (err) {
                        error('toggleClass 처리 실패', el);
                        return false;
                    }
                };

            case 'on':
                return (eventName, handler, options) => bindEvent(el, eventName, handler, options);

            case 'off':
                return (eventName, handler, options) => {
                    if (!el || typeof el.removeEventListener !== 'function') return false;

                    el.removeEventListener(eventName, handler, options);
                    return removeEventRecord(el, eventName, handler, options);
                };

            case 'onClick':
                return (handler, options) => bindEvent(el, 'click', handler, options);

            case 'offAll':
                return () => removeAllEvents(el);

            case '$entry':
                return getLiveEntry(context.entry, context.options);

            default:
                return undefined;
        }
    }

    function applyCommonSet(el, prop, value, context) {
        if (isDetached(el)) {
            error('제거된 DOM 요소는 수정할 수 없습니다.', el);
            return false;
        }

        try {
            switch (prop) {
                case 'text':
                    el.textContent = safeString(value);
                    return true;

                case 'html':
                    return setSafeHtml(el, value, context.options);

                case 'value':
                    return setElementValue(el, value, context.options);

                case 'color':
                    return setSafeStyle(el, 'color', 'color', value, context.options);

                case 'backgroundColor':
                    return setSafeStyle(el, 'backgroundColor', 'backgroundColor', value, context.options);

                case 'size':
                    return setSafeStyle(el, 'size', 'fontSize', value, context.options);

                case 'weight':
                    return setSafeStyle(el, 'weight', 'fontWeight', value, context.options);

                case 'family':
                    return setSafeStyle(el, 'family', 'fontFamily', value, context.options);

                case 'align':
                    return setSafeStyle(el, 'align', 'textAlign', value, context.options);

                case 'display':
                    return setSafeStyle(el, 'display', 'display', value, context.options);

                case 'hidden':
                    return setHidden(el, !!value);

                case 'className':
                    if (!isSafeClassName(value, context.options)) {
                        warn('허용되지 않은 className입니다.', el);
                        return false;
                    }

                    el.className = safeString(value);
                    return true;

                case 'id':
                    el.id = safeString(value).replace(/[^\w-]/g, '');
                    return true;

                default:
                    return false;
            }
        } catch (err) {
            error(`DOM setter 처리 실패: ${String(prop)}`, el);
            return false;
        }
    }

    function getCommonOwnKeys() {
        return [
            'text',
            'html',
            'value',
            'color',
            'backgroundColor',
            'size',
            'weight',
            'family',
            'align',
            'display',
            'hidden',
            'element',
            'className',
            'id',
            'isDetached',
            'show',
            'hide',
            'focus',
            'blur',
            'addClass',
            'removeClass',
            'toggleClass',
            'on',
            'off',
            'onClick',
            'offAll',
            '$entry'
        ];
    }

    function createProxy(entry, options = {}) {
        const type = entry.type;

        if (type === 'check') return createCheckProxy(entry, options);
        if (type === 'input') return createInputProxy(entry, options);
        if (type === 'select') return createSelectProxy(entry, options);
        if (type === 'textarea') return createTextareaProxy(entry, options);
        if (type === 'button') return createButtonProxy(entry, options);
        if (type === 'img') return createImgProxy(entry, options);
        if (type === 'anchor') return createAnchorProxy(entry, options);
        if (type === 'child') return createChildProxy(entry, options);

        return createLeafProxy(entry, options);
    }

    function createBaseProxy(entry, options = {}, special = {}) {
        const el = entry.element;
        const keys = [...new Set([
            ...getCommonOwnKeys(),
            ...(special.keys || [])
        ])];

        return new Proxy({}, {
            get(_, prop) {
                if (special.get && prop in special.get) {
                    return special.get[prop](el, entry, options);
                }

                return applyCommonGet(el, prop, { entry, options });
            },

            set(_, prop, value) {
                let result;

                if (special.set && prop in special.set) {
                    result = special.set[prop](el, value, entry, options);
                } else {
                    result = applyCommonSet(el, prop, value, { entry, options });
                }

                if (result === false) {
                    warn(`속성 설정 실패: ${String(prop)}`, el);
                }

                /*
                 * Proxy set trap은 strict mode에서 false 반환 시 TypeError가 발생할 수 있다.
                 * 실패 여부는 내부 warn/error 및 메서드형 API 반환값으로 확인한다.
                 */
                return true;
            },

            ownKeys() {
                return keys;
            },

            getOwnPropertyDescriptor(_, prop) {
                if (keys.includes(prop)) {
                    return {
                        enumerable: true,
                        configurable: true
                    };
                }

                return undefined;
            }
        });
    }

    function createLeafProxy(entry, options) {
        return createBaseProxy(entry, options);
    }

    function createChildProxy(entry, options) {
        const el = entry.element;

        return createBaseProxy(entry, options, {
            get: {
                '$text': () => getDirectText(el),
                '$raw': () => getStructuredValue(el, options)
            },
            set: {
                '$text': (target, value) => {
                    if (isDetached(target)) return false;
                    return setDirectText(target, value);
                }
            },
            keys: ['$text', '$raw']
        });
    }

    function createInputProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                disabled: el => !!el.disabled,
                onInput: el => (handler, eventOptions) => bindEvent(el, 'input', handler, eventOptions),
                onChange: el => (handler, eventOptions) => bindEvent(el, 'change', handler, eventOptions),
                onKeydown: el => (handler, eventOptions) => bindEvent(el, 'keydown', handler, eventOptions)
            },
            set: {
                disabled: (el, value) => {
                    if (isDetached(el)) return false;
                    el.disabled = !!value;
                    return true;
                }
            },
            keys: ['disabled', 'onInput', 'onChange', 'onKeydown']
        });
    }

    function createCheckProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                checked: el => !!el.checked,
                disabled: el => !!el.disabled,
                onChange: el => (handler, eventOptions) => bindEvent(el, 'change', handler, eventOptions),
                toggle: el => () => {
                    if (isDetached(el) || el.disabled) return false;

                    el.checked = !el.checked;

                    if (typeof Event !== 'undefined') {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    return true;
                }
            },
            set: {
                checked: (el, value) => {
                    if (isDetached(el)) return false;
                    el.checked = !!value;
                    return true;
                },
                disabled: (el, value) => {
                    if (isDetached(el)) return false;
                    el.disabled = !!value;
                    return true;
                }
            },
            keys: ['checked', 'disabled', 'onChange', 'toggle']
        });
    }

    function createSelectProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                selectedIndex: el => el.selectedIndex,
                options: el => [...el.options],
                disabled: el => !!el.disabled,
                onChange: el => (handler, eventOptions) => bindEvent(el, 'change', handler, eventOptions)
            },
            set: {
                selectedIndex: (el, value) => {
                    if (isDetached(el)) return false;

                    const index = Number(value);

                    if (!Number.isInteger(index)) {
                        warn('selectedIndex는 정수여야 합니다.', el);
                        return false;
                    }

                    if (index < 0 || index >= el.options.length) {
                        warn('selectedIndex가 option 범위를 벗어났습니다.', el);
                        return false;
                    }

                    el.selectedIndex = index;
                    return true;
                },
                disabled: (el, value) => {
                    if (isDetached(el)) return false;
                    el.disabled = !!value;
                    return true;
                }
            },
            keys: ['selectedIndex', 'options', 'disabled', 'onChange']
        });
    }

    function createTextareaProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                disabled: el => !!el.disabled,
                onInput: el => (handler, eventOptions) => bindEvent(el, 'input', handler, eventOptions),
                onChange: el => (handler, eventOptions) => bindEvent(el, 'change', handler, eventOptions),
                onKeydown: el => (handler, eventOptions) => bindEvent(el, 'keydown', handler, eventOptions)
            },
            set: {
                disabled: (el, value) => {
                    if (isDetached(el)) return false;
                    el.disabled = !!value;
                    return true;
                }
            },
            keys: ['disabled', 'onInput', 'onChange', 'onKeydown']
        });
    }

    function createHoldEvent(sourceEvent, phase, startTime, repeatCount, target) {
        const now = Date.now();

        return {
            type: 'hold',
            phase,
            target,
            currentTarget: target,
            originalEvent: sourceEvent || null,
            clientX: sourceEvent && 'clientX' in sourceEvent ? sourceEvent.clientX : undefined,
            clientY: sourceEvent && 'clientY' in sourceEvent ? sourceEvent.clientY : undefined,
            pageX: sourceEvent && 'pageX' in sourceEvent ? sourceEvent.pageX : undefined,
            pageY: sourceEvent && 'pageY' in sourceEvent ? sourceEvent.pageY : undefined,
            screenX: sourceEvent && 'screenX' in sourceEvent ? sourceEvent.screenX : undefined,
            screenY: sourceEvent && 'screenY' in sourceEvent ? sourceEvent.screenY : undefined,
            pointerId: sourceEvent && 'pointerId' in sourceEvent ? sourceEvent.pointerId : undefined,
            pointerType: sourceEvent && 'pointerType' in sourceEvent ? sourceEvent.pointerType : undefined,
            button: sourceEvent && 'button' in sourceEvent ? sourceEvent.button : undefined,
            buttons: sourceEvent && 'buttons' in sourceEvent ? sourceEvent.buttons : undefined,
            timeStamp: now,
            elapsed: now - startTime,
            repeatCount
        };
    }

    function createButtonProxy(entry, options = {}) {
        return createBaseProxy(entry, options, {
            get: {
                label: el => getElementText(el),

                disabled: el => !!el.disabled,

                active: el => {
                    if (options.activeAlias === true) {
                        return el.classList.contains('active') || el.classList.contains('is-active');
                    }

                    return el.classList.contains('active');
                },

                click: el => () => {
                    if (isDetached(el)) return false;
                    el.click();
                    return true;
                },

                enable: el => () => {
                    if (isDetached(el)) return false;
                    el.disabled = false;
                    return true;
                },

                disable: el => () => {
                    if (isDetached(el)) return false;
                    el.disabled = true;
                    return true;
                },

                onHold: el => (handler, holdOptions = {}) => {
                    /*
                     * onHold 전역 이벤트 주의
                     * - pointerup, pointercancel, blur 이벤트를 전역 객체에 등록한다.
                     * - pointermove를 추적하여 반복 실행 시 stale pointerdown 이벤트만 전달하지 않는다.
                     * - 반환된 unsubscribe 또는 offAll()을 호출하지 않으면 메모리 누수 또는 중복 실행이 발생할 수 있다.
                     */
                    if (!isHandler(handler)) {
                        warn('onHold handler는 함수여야 합니다.', el);
                        return emptyUnsubscribe();
                    }

                    const {
                        firstDelay = 300,
                        interval = 80,
                        triggerOnStart = true,
                        preventDefault = true
                    } = holdOptions;

                    let holdTimeout = null;
                    let holdInterval = null;
                    let isHolding = false;
                    let latestPointerEvent = null;
                    let startTime = 0;
                    let repeatCount = 0;

                    const clearTimers = () => {
                        if (holdTimeout) {
                            clearTimeout(holdTimeout);
                            holdTimeout = null;
                        }

                        if (holdInterval) {
                            clearInterval(holdInterval);
                            holdInterval = null;
                        }

                        isHolding = false;
                        latestPointerEvent = null;
                        startTime = 0;
                        repeatCount = 0;
                    };

                    const move = e => {
                        if (!isHolding) return;
                        latestPointerEvent = e;
                    };

                    const start = e => {
                        if (isDetached(el) || el.disabled) return;

                        if (preventDefault && e && e.cancelable) {
                            e.preventDefault();
                        }

                        clearTimers();

                        isHolding = true;
                        latestPointerEvent = e;
                        startTime = Date.now();
                        repeatCount = 0;

                        if (triggerOnStart) {
                            handler(createHoldEvent(e, 'start', startTime, repeatCount, el));
                        }

                        holdTimeout = setTimeout(() => {
                            holdInterval = setInterval(() => {
                                if (!isHolding || isDetached(el) || el.disabled) return;

                                repeatCount += 1;
                                handler(createHoldEvent(
                                    latestPointerEvent || e,
                                    'repeat',
                                    startTime,
                                    repeatCount,
                                    el
                                ));
                            }, interval);
                        }, firstDelay);
                    };

                    const stop = e => {
                        if (isHolding && e) {
                            latestPointerEvent = e;
                        }

                        clearTimers();
                    };

                    const bucket = getEventBucket(el);
                    const records = [];

                    function addTrackedEvent(target, eventName, listener) {
                        if (!target || typeof target.addEventListener !== 'function') return;

                        target.addEventListener(eventName, listener);

                        const record = {
                            target,
                            eventName,
                            handler: listener,
                            options: undefined,
                            capture: false
                        };

                        records.push(record);
                        bucket.push(record);
                    }

                    addTrackedEvent(el, 'pointerdown', start);
                    addTrackedEvent(el, 'pointermove', move);
                    addTrackedEvent(el, 'pointerup', stop);
                    addTrackedEvent(el, 'pointerleave', stop);
                    addTrackedEvent(el, 'pointercancel', stop);
                    addTrackedEvent(global, 'pointermove', move);
                    addTrackedEvent(global, 'pointerup', stop);
                    addTrackedEvent(global, 'pointercancel', stop);
                    addTrackedEvent(global, 'blur', stop);

                    return () => {
                        clearTimers();

                        records.forEach(record => {
                            if (
                                record.target &&
                                typeof record.target.removeEventListener === 'function'
                            ) {
                                record.target.removeEventListener(record.eventName, record.handler, record.options);
                            }

                            const index = bucket.indexOf(record);
                            if (index >= 0) bucket.splice(index, 1);
                        });
                    };
                }
            },
            set: {
                label: (el, value) => {
                    if (isDetached(el)) return false;

                    if (el.tagName === 'INPUT') {
                        el.value = safeString(value);
                    } else {
                        el.textContent = safeString(value);
                    }

                    return true;
                },

                disabled: (el, value) => {
                    if (isDetached(el)) return false;
                    el.disabled = !!value;
                    return true;
                },

                active: (el, value, entry, proxyOptions) => {
                    if (isDetached(el)) return false;

                    if (value) {
                        el.classList.add('active');

                        if (proxyOptions.activeAlias === true) {
                            el.classList.add('is-active');
                        }
                    } else {
                        el.classList.remove('active');

                        if (proxyOptions.activeAlias === true) {
                            el.classList.remove('is-active');
                        }
                    }

                    return true;
                }
            },
            keys: ['label', 'disabled', 'active', 'click', 'onHold', 'enable', 'disable']
        });
    }

    function createImgProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                src: el => el.src,
                alt: el => el.alt
            },
            set: {
                src: (el, value, entry, proxyOptions) => {
                    if (isDetached(el)) return false;
                    return setSafeSrc(el, value, proxyOptions);
                },
                alt: (el, value) => {
                    if (isDetached(el)) return false;
                    el.alt = safeString(value);
                    return true;
                }
            },
            keys: ['src', 'alt']
        });
    }

    function createAnchorProxy(entry, options) {
        return createBaseProxy(entry, options, {
            get: {
                href: el => el.href,
                target: el => el.target
            },
            set: {
                href: (el, value, entry, proxyOptions) => {
                    if (isDetached(el)) return false;
                    return setSafeHref(el, value, proxyOptions);
                },
                target: (el, value) => {
                    if (isDetached(el)) return false;
                    return setSafeTarget(el, value);
                }
            },
            keys: ['href', 'target']
        });
    }

    function getStructuredValue(el, options = {}) {
        if (!el) {
            return {
                text: '',
                value: undefined,
                hidden: false,
                element: el
            };
        }

        const result = {
            text: normalizeText(el.textContent),
            value: getElementValue(el),
            color: getSafeStyle(el, 'color'),
            backgroundColor: getSafeStyle(el, 'backgroundColor'),
            size: getSafeStyle(el, 'fontSize'),
            weight: getSafeStyle(el, 'fontWeight'),
            family: getSafeStyle(el, 'fontFamily'),
            align: getSafeStyle(el, 'textAlign'),
            display: getSafeStyle(el, 'display'),
            hidden: isHidden(el),
            className: el.className || '',
            id: el.id || '',

            /*
             * 원본 DOM 접근
             * - $raw.element는 안전 setter를 우회할 수 있다.
             * - 직접 조작으로 발생하는 보안 문제는 사용자 책임이다.
             */
            element: el
        };

        if (options.allowHtmlRead === true) {
            /*
             * innerHTML 읽기
             * - 신뢰된 HTML 확인 용도로만 사용해야 한다.
             * - 외부 입력값 재사용 시 XSS 위험이 있다.
             */
            result.html = el.innerHTML;
        }

        if (el.children && el.children.length > 0) {
            result.$text = getDirectText(el);

            const tagCounts = {};

            [...el.children].forEach(child => {
                const tag = safeString(child.tagName).toLowerCase();
                if (!tag) return;

                tagCounts[tag] = (tagCounts[tag] || 0) + 1;

                const key = tagCounts[tag] === 1
                    ? tag
                    : `${tag}${tagCounts[tag]}`;

                result[key] = normalizeText(child.textContent);
            });
        }

        return result;
    }

    function createEntry(el, index, options) {
        const type = detectElementType(el);
        const key = buildKeyFromElement(el, index, options);

        return {
            element: el,
            key,
            tagName: typeof el.tagName === 'string' ? el.tagName.toLowerCase() : '',
            type,
            id: el.id || '',
            className: el.className || '',
            dataUi: typeof el.getAttribute === 'function' ? el.getAttribute('data-ui') || '' : '',
            text: getElementText(el),
            value: getElementValue(el),
            index,
            groupIndex: 0,
            groupSize: 1,
            isDetached: isDetached(el)
        };
    }

    function createStore(root, selector, options) {
        const store = {};
        const groupsRaw = {};
        const debugList = [];

        if (!isValidRoot(root)) {
            error('올바른 root가 아닙니다.');
            return { store, groupsRaw, debugList };
        }

        let elements = [];

        try {
            elements = [...root.querySelectorAll(selector)];
        } catch (err) {
            error('querySelectorAll 실패');
            return { store, groupsRaw, debugList };
        }

        elements.forEach((el, index) => {
            const entry = createEntry(el, index, options);

            if (!groupsRaw[entry.key]) {
                groupsRaw[entry.key] = [];
            }

            groupsRaw[entry.key].push(entry);
        });

        Object.keys(groupsRaw).forEach(key => {
            const group = groupsRaw[key];

            group.forEach((entry, groupIndex) => {
                entry.groupIndex = groupIndex;
                entry.groupSize = group.length;

                debugList.push({
                    key: entry.key,
                    index: entry.index,
                    groupIndex: entry.groupIndex,
                    groupSize: entry.groupSize,
                    tagName: entry.tagName,
                    type: entry.type,
                    id: entry.id || '(no id)',
                    className: entry.className || '(no class)',
                    dataUi: entry.dataUi || '(no data-ui)',
                    text: entry.text,
                    value: entry.value
                });
            });

            store[key] = group[0];
        });

        return {
            store,
            groupsRaw,
            debugList
        };
    }

    function createGroupsProxy(groupsRaw, options) {
        const result = {};

        Object.keys(groupsRaw).forEach(key => {
            result[key] = groupsRaw[key].map(entry => createProxy(entry, options));
        });

        return result;
    }

    function createDump(groupsRaw) {
        const result = [];

        Object.keys(groupsRaw).forEach(key => {
            groupsRaw[key].forEach(entry => {
                const el = entry.element;

                result.push({
                    key: entry.key,
                    index: entry.index,
                    tagName: entry.tagName,
                    type: entry.type,
                    text: getElementText(el),
                    value: getElementValue(el),
                    disabled: el && 'disabled' in el ? !!el.disabled : undefined,
                    hidden: isHidden(el),
                    isDetached: isDetached(el)
                });
            });
        });

        return result;
    }

    function ezDOM(config = {}) {
        const fallbackRoot = getFallbackRoot();
        const root = isValidRoot(config.root) ? config.root : fallbackRoot;
        const selector = validateSelector(config.selector);

        const options = {
            root,
            selector,
            autoObserve: config.autoObserve === true,
            keyPolicy: config.keyPolicy,
            stateClassIgnoreList: config.stateClassIgnoreList || DEFAULT_STATE_CLASS_IGNORE_LIST,
            activeAlias: config.activeAlias === true,

            /*
             * HTML 위험 옵션
             * - 기본값 false
             * - true로 설정하면 html setter가 innerHTML을 사용한다.
             * - 외부 입력값은 사용자가 직접 검증해야 한다.
             */
            allowUnsafeHtml: config.allowUnsafeHtml === true,

            /*
             * HTML 읽기 옵션
             * - 기본값 false
             * - true로 설정하면 html getter와 $raw.html이 innerHTML을 반환한다.
             */
            allowHtmlRead: config.allowHtmlRead === true,

            /*
             * HTML 검증 옵션
             * - 선택 사항
             * - allowUnsafeHtml 사용 시 htmlValidator 없이 사용하는 것은 위험할 수 있다.
             */
            htmlValidator: config.htmlValidator,

            /*
             * URL protocol 확장 옵션
             * - 기본 protocol 검증은 유지된다.
             * - 특수 scheme 추가 시 보안 책임은 사용자에게 있다.
             */
            safeUrlProtocols: config.safeUrlProtocols,
            safeImageProtocols: config.safeImageProtocols,

            /*
             * style/class 검증 완화 옵션
             * - 기본값 false
             * - true 사용 시 외부 입력값 검증 책임은 사용자에게 있다.
             */
            allowUnsafeStyle: config.allowUnsafeStyle === true,
            allowUnsafeClassName: config.allowUnsafeClassName === true,

            /*
             * select value 검증 옵션
             * - 기본값 true
             * - false 사용 시 존재하지 않는 option value도 설정을 시도한다.
             */
            strictSelectValue: config.strictSelectValue !== false,

            resolveEntryByElement: null
        };

        let data = createStore(root, selector, options);
        let refreshScheduled = false;
        let observer = null;

        options.resolveEntryByElement = function resolveEntryByElement(el) {
            const groupsRaw = data.groupsRaw || {};

            for (const key of Object.keys(groupsRaw)) {
                const found = groupsRaw[key].find(entry => entry.element === el);
                if (found) return found;
            }

            return null;
        };

        function refresh() {
            data = createStore(root, selector, options);
            return api;
        }

        function scheduleRefresh() {
            if (refreshScheduled) return;

            refreshScheduled = true;

            safeRequestAnimationFrame(() => {
                refresh();
                refreshScheduled = false;
            });
        }

        function disconnectObserver() {
            /*
             * MutationObserver 해제
             * - autoObserve 사용 시 observer가 계속 유지될 수 있다.
             * - 화면 전환, root 제거, 컴포넌트 제거 시 $disconnectObserver()로 해제해야 한다.
             * - 해제하지 않으면 불필요한 감시가 지속될 수 있다.
             */
            if (observer) {
                observer.disconnect();
                observer = null;
                return true;
            }

            return false;
        }

        if (
            options.autoObserve &&
            typeof MutationObserver !== 'undefined' &&
            root
        ) {
            try {
                observer = new MutationObserver(() => {
                    if (isDetached(root)) {
                        disconnectObserver();
                        return;
                    }

                    scheduleRefresh();
                });

                observer.observe(root, {
                    childList: true,
                    subtree: true
                });
            } catch (err) {
                error('MutationObserver 등록 실패');
            }
        }

        const api = new Proxy({}, {
            get(_, prop) {
                if (prop === '$keys') {
                    return Object.keys(data.store);
                }

                if (prop === '$list') {
                    return data.store;
                }

                if (prop === '$groups') {
                    return createGroupsProxy(data.groupsRaw, options);
                }

                if (prop === '$groupsRaw') {
                    return data.groupsRaw;
                }

                if (prop === '$debug') {
                    return data.debugList;
                }

                if (prop === '$dump') {
                    return () => createDump(data.groupsRaw);
                }

                if (prop === '$refresh') {
                    return refresh;
                }

                if (prop === '$observer') {
                    return observer;
                }

                if (prop === '$disconnectObserver') {
                    return disconnectObserver;
                }

                const entry = data.store[prop];

                if (!entry) {
                    return undefined;
                }

                return createProxy(entry, options);
            },

            set(_, prop, value) {
                const entry = data.store[prop];

                if (!entry) {
                    warn(`존재하지 않는 key: ${String(prop)}`);
                    return true;
                }

                const proxy = createProxy(entry, options);

                if (value && typeof value === 'object') {
                    Object.keys(value).forEach(key => {
                        proxy[key] = value[key];
                    });

                    return true;
                }

                proxy.value = value;
                return true;
            },

            ownKeys() {
                return Reflect.ownKeys(data.store);
            },

            getOwnPropertyDescriptor(_, prop) {
                if (prop in data.store) {
                    return {
                        enumerable: true,
                        configurable: true
                    };
                }

                return undefined;
            }
        });

        return api;
    }

    ezDOM.version = '1.1.4';

    ezDOM.noConflict = function () {
        if (global && global.ezDOM === ezDOM) {
            delete global.ezDOM;
        }

        return ezDOM;
    };

    ezDOM.utils = {
        normalizeText,
        toCamelCase,
        buildKeyFromElement,
        detectElementType,
        isSafeUrl,
        isSafeClassName,
        isSafeSingleClassName,
        isSafeStyleValue
    };

    if (global && !global.ezDOM) {
        global.ezDOM = ezDOM;
    } else if (global && global.ezDOM !== ezDOM) {
        warn('global.ezDOM이 이미 존재하여 덮어쓰지 않았습니다.');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ezDOM;
    }
})(typeof window !== 'undefined' ? window : globalThis);