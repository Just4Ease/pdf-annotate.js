import createStyleSheet from 'create-stylesheet';

export const BORDER_COLOR = '#00BFFF';

const userSelectStyleSheet = createStyleSheet({
  body: {
    '-webkit-user-select': 'none',
       '-moz-user-select': 'none',
        '-ms-user-select': 'none',
            'user-select': 'none'
  }
});
userSelectStyleSheet.setAttribute('data-pdf-annotate-user-select', 'true');

/**
 * Find the SVGElement that contains all the annotations for a page
 *
 * @param {Element} node An annotation within that container
 * @return {SVGElement} The container SVG or null if it can't be found
 */
export function findSVGContainer(node) {
  let parentNode = node;

  while ((parentNode = parentNode.parentNode) &&
          parentNode !== document) {
    if (parentNode.nodeName.toUpperCase() === 'SVG' &&
        parentNode.getAttribute('data-pdf-annotate-container') === 'true') {
      return parentNode;
    }
  }

  return null;
}

/**
 * Find an SVGElement container at a given point
 *
 * @param {Number} x The x coordinate of the point
 * @param {Number} y The y coordinate of the point
 * @return {SVGElement} The container SVG or null if one can't be found
 */
export function findSVGAtPoint(x, y) {
  let elements = document.querySelectorAll('svg[data-pdf-annotate-container="true"]');

  for (let i=0, l=elements.length; i<l; i++) {
    let el = elements[i];
    let rect = el.getBoundingClientRect();

    if (collidesWithPoint(rect, x, y)) {

      return el;
    }
  }

  return null;
}

/**
 * Find an Element that represents an annotation at a given point
 *
 * @param {Number} x The x coordinate of the point
 * @param {Number} y The y coordinate of the point
 * @return {Element} The annotation element or null if one can't be found
 */
export function findAnnotationAtPoint(x, y) {
  let svg = findSVGAtPoint(x, y);
  if (!svg) { return; }
  let elements = svg.querySelectorAll('[data-pdf-annotate-type]');

  // Find a target element within SVG
  for (let i=0, l=elements.length; i<l; i++) {
    let el = elements[i];
    let size = getSize(el.nodeName.toLowerCase() === 'g' ? el.firstChild : el);
    let { offsetLeft, offsetTop } = getOffset(el);
    let rect = {
      top: size.y + offsetTop,
      left: size.x + offsetLeft,
      right: size.x + size.w + offsetLeft,
      bottom: size.y + size.h + offsetTop
    };

    if (collidesWithPoint(rect, x, y)) {   
      return el;
    }
  }

  return null;
}

/**
 * Determine if a point collides with a rect
 *
 * @param {Object} rect The points of a rect (likely from getBoundingClientRect)
 * @param {Number} x The x coordinate of the point
 * @param {Number} y The y coordinate of the point
 * @return {Boolean} True if a collision occurs, otherwise false
 */
export function collidesWithPoint(rect, x, y) {
  return y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right;
}

/**
 * Get the size of an annotation element.
 *
 * @param {Element} el The element to get the size of
 * @return {Object} The dimensions of the element
 */
export function getSize(el) {
  let h = 0, w = 0, x = 0, y = 0;

  switch (el.nodeName.toLowerCase()) {
    case 'path':
    return getDrawingSize(el);
    break;

    case 'line':
    h = parseInt(el.getAttribute('y2'), 10) - parseInt(el.getAttribute('y1'), 10);
    w = parseInt(el.getAttribute('x2'), 10) - parseInt(el.getAttribute('x1'), 10);
    x = parseInt(el.getAttribute('x1'), 10);
    y = parseInt(el.getAttribute('y1'), 10);

    if (h === 0) {
      // TODO this should be calculated somehow
      let offset = 16;
      h += offset;
      y -= (offset / 2)
    }
    break;

    case 'text':
    let rect = el.getBoundingClientRect();
    h = rect.height;
    w = rect.width;
    x = parseInt(el.getAttribute('x'), 10);
    y = parseInt(el.getAttribute('y'), 10) - h;
    break;

    case 'rect':
    case 'svg':
    h = parseInt(el.getAttribute('height'), 10);
    w = parseInt(el.getAttribute('width'), 10);
    x = parseInt(el.getAttribute('x'), 10);
    y = parseInt(el.getAttribute('y'), 10);
    break;
  }

  // For the case of nested SVG (point annotations)
  // no adjustment needs to be made for scale.
  // I assume that the scale is already being handled
  // natively by virtue of the `transform` attribute.
  if (el.nodeName.toLowerCase() === 'svg') {
    return { h, w, x, y };
  }

  let rect = el.getBoundingClientRect();
  let svg = findSVGAtPoint(rect.left, rect.top);

  return scaleUp(svg, { h, w, x, y });
}

/**
 * Get the size of a rectangle annotation. If there are multiple elements comprising
 * the annotation, the outer bounds of all elements will be used.
 *
 * @param {Element} el The element to get the size of
 * @return {Object} The dimensions of the annotation
 */
export function getRectangleSize(el) {
  let id = el.getAttribute('data-pdf-annotate-id');
  let node = document.querySelector(`[data-pdf-annotate-id="${id}"]`);
  let nodes = node.nodeName.toLowerCase() === 'g' ? node.children : [node];
  let size = {};
  let lastSize;
  
  Array.prototype.map.call(nodes, getSize).forEach((s) => {
    if (typeof size.x === 'undefined' || s.x < size.x) { size.x = s.x; }
    if (typeof size.y === 'undefined' || s.y < size.y) { size.y = s.y; }
    if (typeof size.w === 'undefined' || s.w > size.w) { size.w = s.w; }
    if (typeof size.h === 'undefined') { size.h = 0; }

    size.h += s.h;

    // This accounts for the spacing between selected lines
    if (lastSize) {
      size.h += s.y - (lastSize.y + lastSize.h);
    }

    lastSize = s;
  });

  return size;
}

/**
 * Get the size of a drawing annotation.
 *
 * @param {Element} el The path element to get the size of
 * @return {Object} The dimensions of the annotation
 */
export function getDrawingSize(el) {
  let parts = el.getAttribute('d').replace(/Z/, '').split('M').splice(1);
  let rect = el.getBoundingClientRect();
  let svg = findSVGAtPoint(rect.left, rect.top);
  let minX, maxX, minY, maxY;

  parts.forEach((p) => {
    var s = p.split(' ').map(i => parseInt(i, 10));

    if (typeof minX === 'undefined' || s[0] < minX) { minX = s[0]; }
    if (typeof maxX === 'undefined' || s[2] > maxX) { maxX = s[2]; }
    if (typeof minY === 'undefined' || s[1] < minY) { minY = s[1]; }
    if (typeof maxY === 'undefined' || s[3] > maxY) { maxY = s[3]; }
  });

  return scaleUp(svg, {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  });
}

/**
 * Adjust scale from normalized scale (100%) to rendered scale.
 *
 * @param {SVGElement} svg The SVG to gather metadata from
 * @param {Object} rect A map of numeric values to scale
 * @return {Object} A copy of `rect` with values scaled up
 */
export function scaleUp(svg, rect) {
  let result = {};
  let { viewport } = getMetadata(svg);

  Object.keys(rect).forEach((key) => {
    result[key] = rect[key] * viewport.scale;
  });

  return result;
}

/**
 * Adjust scale from rendered scale to a normalized scale (100%).
 *
 * @param {SVGElement} svg The SVG to gather metadata from
 * @param {Object} rect A map of numeric values to scale
 * @return {Object} A copy of `rect` with values scaled down
 */
export function scaleDown(svg, rect) {
  let result = {};
  let { viewport } = getMetadata(svg);

  Object.keys(rect).forEach((key) => {
    result[key] = rect[key] / viewport.scale;
  });

  return result;
}

/**
 * Get the scroll position of an element, accounting for parent elements
 *
 * @param {Element} el The element to get the scroll position for
 * @return {Object} The scrollTop and scrollLeft position
 */
export function getScroll(el) {
  let scrollTop = 0;
  let scrollLeft = 0;
  let parentNode = el;

  while ((parentNode = parentNode.parentNode) &&
          parentNode !== document) {
    scrollTop += parentNode.scrollTop;
    scrollLeft += parentNode.scrollLeft;
  }

  return { scrollTop, scrollLeft };
}

/**
 * Get the offset position of an element, accounting for parent elements
 *
 * @param {Element} el The element to get the offset position for
 * @return {Object} The offsetTop and offsetLeft position
 */
export function getOffset(el) {
  let parentNode = el;

  while ((parentNode = parentNode.parentNode) &&
          parentNode !== document) {
    if (parentNode.nodeName.toUpperCase() === 'SVG') {
      break;
    }
  }

  let rect = parentNode.getBoundingClientRect();

  return { offsetLeft: rect.left, offsetTop: rect.top };
}

/**
 * Disable user ability to select text on page
 */
export function disableUserSelect() {
  if (!userSelectStyleSheet.parentNode) {
    document.head.appendChild(userSelectStyleSheet);
  }
}


/**
 * Enable user ability to select text on page
 */
export function enableUserSelect() {
  if (userSelectStyleSheet.parentNode) {
    userSelectStyleSheet.parentNode.removeChild(userSelectStyleSheet);
  }
}

/**
 * Get the metadata for a SVG container
 *
 * @param {SVGElement} svg The SVG container to get metadata for
 */
export function getMetadata(svg) {
  return {
    documentId: svg.getAttribute('data-pdf-annotate-document'),
    pageNumber: parseInt(svg.getAttribute('data-pdf-annotate-page'), 10),
    viewport: JSON.parse(svg.getAttribute('data-pdf-annotate-viewport'))
  };
}
