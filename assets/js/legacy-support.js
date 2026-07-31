// Runtime fallbacks for older WebViews (Android 8 era / Chrome < 84).
// Written in ES5-compatible syntax so it still runs where newer syntax would fail to parse.
(function () {
    'use strict';

    var MARKED = 'data-legacy-gap';
    var OWNER = 'data-legacy-gap-owner';

    function supportsFlexGap() {
        var probe = document.createElement('div');
        probe.style.cssText = 'display:flex;flex-direction:column;row-gap:10px;position:absolute;visibility:hidden;height:auto;';
        probe.appendChild(document.createElement('div'));
        probe.appendChild(document.createElement('div'));
        document.body.appendChild(probe);
        var supported = probe.scrollHeight >= 10;
        document.body.removeChild(probe);
        return supported;
    }

    function toPx(value) {
        var parsed = parseFloat(value);
        return isFinite(parsed) && parsed > 0 ? parsed + 'px' : '';
    }

    function clearGapStyles(child) {
        if (child.nodeType !== 1 || !child.getAttribute(MARKED)) return;
        child.removeAttribute(MARKED);
        child.style.marginTop = '';
        child.style.marginBottom = '';
        child.style.marginLeft = '';
        child.style.marginRight = '';
    }

    function setGapStyle(child, prop, value) {
        child.setAttribute(MARKED, '1');
        child.style[prop] = value;
    }

    function applyGapFallback(container) {
        var children = container.children;
        var i;
        if (!children || !children.length) return;

        var style = window.getComputedStyle(container);
        var isFlex = style.display === 'flex' || style.display === 'inline-flex';
        var rowGap = isFlex ? toPx(style.rowGap) : '';
        var columnGap = isFlex ? toPx(style.columnGap) : '';

        if (!rowGap && !columnGap) {
            for (i = 0; i < children.length; i++) clearGapStyles(children[i]);
            if (container.getAttribute(OWNER)) {
                container.removeAttribute(OWNER);
                container.style.marginBottom = '';
            }
            return;
        }

        var isColumn = style.flexDirection.indexOf('column') === 0;
        var isWrapping = style.flexWrap.indexOf('wrap') === 0;
        var isRtl = style.direction === 'rtl';
        var inlineStart = isRtl ? 'marginRight' : 'marginLeft';
        var inlineEnd = isRtl ? 'marginLeft' : 'marginRight';

        for (i = 0; i < children.length; i++) {
            var child = children[i];
            clearGapStyles(child);
            if (isColumn) {
                if (i > 0 && rowGap) setGapStyle(child, 'marginTop', rowGap);
            } else if (isWrapping) {
                // Line breaks are not knowable up front, so wrapped items get trailing
                // margins and the container cancels the extra trailing row.
                if (columnGap && i < children.length - 1) setGapStyle(child, inlineEnd, columnGap);
                if (rowGap) setGapStyle(child, 'marginBottom', rowGap);
            } else if (i > 0 && columnGap) {
                setGapStyle(child, inlineStart, columnGap);
            }
        }

        if (!isColumn && isWrapping && rowGap) {
            container.setAttribute(OWNER, '1');
            container.style.marginBottom = '-' + rowGap;
        }
    }

    function refresh(scope) {
        if (!scope || scope.nodeType !== 1) return;
        applyGapFallback(scope);
        var descendants = scope.getElementsByTagName('*');
        for (var i = 0; i < descendants.length; i++) {
            applyGapFallback(descendants[i]);
        }
    }

    function installFlexGapFallback() {
        document.documentElement.className += ' no-flex-gap';
        refresh(document.body);

        if (typeof MutationObserver !== 'function') return;

        var queued = [];
        var scheduled = false;
        // Only childList is observed, so the inline styles written here cannot retrigger it.
        var observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var target = records[i].target;
                if (target && target.nodeType === 1 && queued.indexOf(target) === -1) queued.push(target);
            }
            if (scheduled) return;
            scheduled = true;
            window.setTimeout(function () {
                scheduled = false;
                var pending = queued;
                queued = [];
                for (var j = 0; j < pending.length; j++) refresh(pending[j]);
            }, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        try {
            if (!supportsFlexGap()) installFlexGapFallback();
        } catch (e) {
            // A compatibility shim must never break startup.
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
