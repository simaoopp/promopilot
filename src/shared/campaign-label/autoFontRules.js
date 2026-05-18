export const CAMPAIGN_AUTO_FONT_CLASS = "auto-font-size";

export function getCampaignLabelAutoFontRange(className, formatoEtiqueta) {
  const isA5 = formatoEtiqueta === "a5";

  switch (className) {
    case "descricao":
      return { min: isA5 ? 24 : 12, max: isA5 ? 38 : 18 };
    case "antes":
      return { min: isA5 ? 44 : 38, max: isA5 ? 54 : 46 };
    case "desconto":
      return { min: isA5 ? 48 : 40, max: isA5 ? 60 : 50 };
    case "atual":
      return { min: isA5 ? 62 : 48, max: isA5 ? 88 : 68 };
    default:
      return { min: 10, max: 16 };
  }
}

export function fitTextElement(element, min = 12, max = 24) {
  if (!element) return max;

  let size = max;
  element.style.fontSize = `${size}px`;

  while (
    (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) &&
    size > min
  ) {
    size -= 1;
    element.style.fontSize = `${size}px`;
  }

  return size;
}

export function buildCampaignAutoFontBrowserScript({ readyFlag = "__automaticCampaignLabelsReady" } = {}) {
  return `
    <script>
      (function () {
        function number(value, fallback) {
          var parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        }

        function shrink(element, min, size) {
          var next = Math.max(min, size - 1);
          element.style.fontSize = next + 'px';
          return next;
        }

        function elementOverflows(element) {
          return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        }

        function fitElement(element) {
          var min = number(element.dataset.min, 10);
          var max = number(element.dataset.max, min);
          var size = max;
          element.style.width = '100%';
          element.style.fontSize = size + 'px';

          while (size > min && elementOverflows(element)) {
            size = shrink(element, min, size);
          }

          element.dataset.finalFontSize = String(size);
        }

        function rect(element) {
          return element ? element.getBoundingClientRect() : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        }

        function shrinkGroup(elements) {
          var changed = false;
          elements.forEach(function (element) {
            if (!element) return;
            var min = number(element.dataset.min, 10);
            var current = number(parseFloat(globalThis.getComputedStyle(element).fontSize), min);
            if (current > min) {
              shrink(element, min, current);
              changed = true;
            }
          });
          return changed;
        }

        function protectLabelLayout(label) {
          var topo = label.querySelector('.topo');
          var precos = label.querySelector('.precos');
          var rodape = label.querySelector('.rodape');
          var descricao = label.querySelector('.descricao.${CAMPAIGN_AUTO_FONT_CLASS}');
          var antes = label.querySelector('.antes.${CAMPAIGN_AUTO_FONT_CLASS}');
          var desconto = label.querySelector('.desconto.${CAMPAIGN_AUTO_FONT_CLASS}');
          var atual = label.querySelector('.atual.${CAMPAIGN_AUTO_FONT_CLASS}');

          for (var i = 0; i < 80; i += 1) {
            var topoRect = rect(topo);
            var precosRect = rect(precos);
            var rodapeRect = rect(rodape);
            var hasOverlap = false;

            if (topo && precos && topoRect.bottom > precosRect.top - 2) {
              hasOverlap = true;
              if (!shrinkGroup([descricao])) break;
            }

            if (precos && rodape && precosRect.bottom > rodapeRect.top - 2) {
              hasOverlap = true;
              if (!shrinkGroup([atual, desconto, antes])) break;
            }

            if (!hasOverlap) break;
          }
        }

        function fitAll() {
          Array.prototype.forEach.call(document.querySelectorAll('.${CAMPAIGN_AUTO_FONT_CLASS}'), fitElement);
          Array.prototype.forEach.call(document.querySelectorAll('.label'), protectLabelLayout);
          Array.prototype.forEach.call(document.querySelectorAll('.${CAMPAIGN_AUTO_FONT_CLASS}'), fitElement);
        }

        function waitForImages() {
          var images = Array.prototype.slice.call(document.images || []);
          return Promise.all(images.map(function (img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function (resolve) {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            });
          }));
        }

        function ready() {
          var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
          Promise.all([fontsReady, waitForImages()]).then(function () {
            requestAnimationFrame(function () {
              fitAll();
              requestAnimationFrame(function () {
                fitAll();
                window.${readyFlag} = true;
              });
            });
          });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', ready, { once: true });
        } else {
          ready();
        }
      })();
    </script>
  `;
}
