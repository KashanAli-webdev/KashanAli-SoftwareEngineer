/* ============================================================================
   1. RENDER
   Clone the CV markup out of <template id="cv-template"> and mount it
   into #cv-container. Edit the CV content in the <template> in index.html,
   not here.
   ============================================================================ */
function renderCv() {
  var template = document.getElementById("cv-template");
  var container = document.getElementById("cv-container");
  var content = template.content.cloneNode(true);

  container.appendChild(content);
}

/* ============================================================================
   2. EXPORT (PDF)
   Walks the already-rendered #cv-container and rebuilds it as a real-text
   PDF with pdfmake (loaded from CDN in index.html). The text stays
   selectable and ATS-parsable -- it is not a screenshot of the page.
   Same layout and page-break rules as the Word export had:
   A4, 12mm top/bottom and 16mm left/right on every page, content flows
   so each page fills down to its bottom margin.
   The CV content itself still comes only from the <template>.
   ============================================================================ */
var PDF_FILENAME = "KashanAli-SoftwareEngineer-CV.pdf";

// Font sizes in points.
var SIZE_PT = {
  name: 20,
  title: 10,
  contact: 9,
  sectionTitle: 11,
  role: 10,
  body: 9.5,
  meta: 9 // org line, dates, stack line
};

// Page margins in mm -- identical on every page.
var PAGE_MM = { top: 12, bottom: 12, left: 16, right: 16 };

// false (default): content flows and fills every page to the bottom margin.
// true: never split a job/project entry across pages (can leave a gap at
// the bottom of a page when a long entry has to jump to the next one).
var KEEP_ENTRIES_TOGETHER = false;

// Carlito = free, metric-compatible Calibri (same letter widths), embedded
// into the PDF so it looks identical on every device.
var FONT_BASE = "https://cdn.jsdelivr.net/gh/google/fonts@8e44913e4ff26fc997e6856c1ec40ff4791c98c5/ofl/carlito/";
var PDF_FONTS = {
  Carlito: {
    normal: FONT_BASE + "Carlito-Regular.ttf",
    bold: FONT_BASE + "Carlito-Bold.ttf",
    italics: FONT_BASE + "Carlito-Italic.ttf",
    bolditalics: FONT_BASE + "Carlito-Bold.ttf" // not used by the CV
  }
};

// Vertical spacing in points (space AFTER each block, like Word's
// "spacing after", so every page starts flush at the top margin).
var GAP = {
  afterName: 2,
  afterTitle: 9,
  contactPadding: 5,
  afterContact: 11,
  underSectionTitle: 2,
  afterSectionTitle: 5.5,
  afterOrg: 3.5,
  afterBullet: 2,
  afterParagraph: 3,
  afterEntry: 6.5,
  afterSection: 9
};

var LINE_HEIGHT = 1.1;
var RULE_WIDTH = 1.5;     // pt, same weight as the 2px CSS borders
var BULLET_LEFT = 4;      // pt from the margin to the bullet
var BULLET_TEXT_GAP = 11; // pt from the bullet to the text

var PT_PER_MM = 72 / 25.4;
var A4_WIDTH_PT = 595.28;
var CONTENT_WIDTH = A4_WIDTH_PT - (PAGE_MM.left + PAGE_MM.right) * PT_PER_MM;

/* ---------- helpers ---------------------------------------------------- */

// Read a colour from style.css custom properties so the PDF uses the same
// theme. Returns "#RRGGBB", or the fallback.
function cssColor(varName, fallback) {
  var value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  var match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);

  if (!match) {
    return fallback;
  }
  var hex = match[1];
  if (hex.length === 3) {
    hex = hex.replace(/./g, "$&$&");
  }
  return "#" + hex.toUpperCase();
}

function getTheme() {
  return {
    text: cssColor("--c-text", "#262B30"),
    muted: cssColor("--c-muted", "#4B5560"),
    name: cssColor("--c-name", "#17212B"),
    blue: cssColor("--c-blue", "#1C5D99"),
    blue2: cssColor("--c-blue-2", "#2E75B6"),
    bullet: cssColor("--c-bullet", "#2E75B6")
  };
}

// Inline elements that change text formatting, keyed by tag or class.
function inlineStyleFor(el, parentStyle, theme) {
  var style = Object.assign({}, parentStyle);
  var tag = el.tagName;

  if (tag === "STRONG" || tag === "B") {
    style.bold = true;
    style.color = theme.name;
  }
  if (tag === "EM" || tag === "I") {
    style.italics = true;
  }
  if (el.classList.contains("cv-header__contact-label") ||
      el.classList.contains("entry__stack-label")) {
    style.bold = true;
    style.color = theme.name;
  }
  if (el.classList.contains("entry__stack-value")) {
    style.italics = true;
    style.color = theme.muted;
  }
  return style;
}

// Flatten an element into [{ text, style }] pieces, keeping inline formatting.
function collectPieces(node, style, theme, out) {
  Array.prototype.forEach.call(node.childNodes, function (child) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push({ text: child.nodeValue, style: style });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      collectPieces(child, inlineStyleFor(child, style, theme), theme, out);
    }
  });
  return out;
}

// Collapse whitespace the way the browser does (the HTML source is indented
// and wrapped), then turn the pieces into pdfmake text runs.
function piecesToRuns(pieces) {
  var cleaned = [];

  pieces.forEach(function (piece) {
    var text = piece.text.replace(/\s+/g, " ");
    var prev = cleaned[cleaned.length - 1];

    if (prev && / $/.test(prev.text)) {
      text = text.replace(/^ /, "");
    }
    if (text) {
      cleaned.push({ text: text, style: piece.style });
    }
  });

  if (cleaned.length) {
    cleaned[0].text = cleaned[0].text.replace(/^ /, "");
    var last = cleaned[cleaned.length - 1];
    last.text = last.text.replace(/ $/, "");
  }

  return cleaned
    .filter(function (piece) { return piece.text; })
    .map(function (piece) {
      var run = Object.assign({}, piece.style, { text: piece.text });
      if (run.allCaps) {
        run.text = run.text.toUpperCase();
      }
      delete run.allCaps;
      return run;
    });
}

function runsFrom(el, baseStyle, theme) {
  if (!el) {
    return [];
  }
  return piecesToRuns(collectPieces(el, baseStyle, theme, []));
}

// A horizontal rule the full width of the text area.
function rule(color, margin) {
  return {
    canvas: [{
      type: "line",
      x1: 0, y1: RULE_WIDTH / 2,
      x2: CONTENT_WIDTH, y2: RULE_WIDTH / 2,
      lineWidth: RULE_WIDTH,
      lineColor: color
    }],
    margin: margin
  };
}

// The innermost last node of a block (so spacing replaces, not stacks).
function lastLeaf(node) {
  while (node && node.stack && node.stack.length) {
    node = node.stack[node.stack.length - 1];
  }
  return node;
}

function setSpaceAfter(node, pt) {
  var leaf = lastLeaf(node);
  var m = leaf.margin || [0, 0, 0, 0];
  leaf.margin = [m[0], m[1], m[2], pt];
}

// Wrap the first `count` nodes into one block that never splits across
// pages -- the PDF equivalent of Word's "keep with next".
function keepFirstTogether(nodes, count) {
  if (nodes.length < 2 || count < 2) {
    return nodes;
  }
  count = Math.min(count, nodes.length);
  return [{ stack: nodes.slice(0, count), unbreakable: true }].concat(nodes.slice(count));
}

/* ---------- block builders --------------------------------------------- */

function buildHeader(header, theme) {
  var nodes = [];
  var name = header.querySelector(".cv-header__name");
  var title = header.querySelector(".cv-header__title");
  var contactItems = header.querySelectorAll(".cv-header__contact-item");

  if (name) {
    nodes.push({
      text: runsFrom(name, { bold: true, fontSize: SIZE_PT.name, color: theme.name }, theme),
      margin: [0, 0, 0, GAP.afterName]
    });
  }

  if (title) {
    nodes.push({
      text: runsFrom(title, {
        bold: true,
        allCaps: true,
        fontSize: SIZE_PT.title,
        color: theme.blue2
      }, theme),
      margin: [0, 0, 0, GAP.afterTitle]
    });
  }

  if (contactItems.length) {
    var contactStyle = { fontSize: SIZE_PT.contact, color: theme.text };
    var runs = [];

    Array.prototype.forEach.call(contactItems, function (item, index) {
      if (index > 0) {
        runs.push({ text: "  |  ", fontSize: SIZE_PT.contact, color: theme.muted });
      }
      runs = runs.concat(runsFrom(item, contactStyle, theme));
    });

    nodes.push(rule(theme.blue, [0, 0, 0, GAP.contactPadding]));
    nodes.push({ text: runs, preserveLeadingSpaces: true });
    nodes.push(rule(theme.blue, [0, GAP.contactPadding, 0, GAP.afterContact]));
  }

  return nodes;
}

function buildSectionTitle(titleEl, theme) {
  return {
    stack: [
      {
        text: runsFrom(titleEl, {
          bold: true,
          fontSize: SIZE_PT.sectionTitle,
          color: theme.blue
        }, theme)
      },
      rule(theme.blue, [0, GAP.underSectionTitle, 0, GAP.afterSectionTitle])
    ]
  };
}

function bullet(runs, theme) {
  return {
    columns: [
      { width: BULLET_TEXT_GAP, text: "\u2022", bold: true, color: theme.bullet },
      { width: "*", text: runs }
    ],
    columnGap: 0,
    margin: [BULLET_LEFT, 0, 0, GAP.afterBullet],
    // Like Word's widow/orphan control: a bullet never splits across pages.
    unbreakable: true
  };
}

function buildEntry(entry, theme) {
  var nodes = [];
  var headingCount = 0;
  var role = entry.querySelector(".entry__role");
  var dates = entry.querySelector(".entry__dates");
  var org = entry.querySelector(".entry__org");
  var items = entry.querySelectorAll(".entry__item");
  var stack = entry.querySelector(".entry__stack");
  var bodyStyle = { fontSize: SIZE_PT.body, color: theme.text };

  if (role) {
    var roleRuns = runsFrom(role, { bold: true, fontSize: SIZE_PT.role, color: theme.name }, theme);

    if (dates) {
      // Dates sit on the same line, flush right.
      nodes.push({
        columns: [
          { width: "*", text: roleRuns },
          {
            width: "auto",
            text: runsFrom(dates, { fontSize: SIZE_PT.meta, color: theme.muted }, theme),
            margin: [0, 1, 0, 0]
          }
        ],
        columnGap: 8
      });
    } else {
      nodes.push({ text: roleRuns });
    }
    headingCount++;
  }

  if (org) {
    nodes.push({
      text: runsFrom(org, { italics: true, fontSize: SIZE_PT.meta, color: theme.muted }, theme),
      margin: [0, 0, 0, GAP.afterOrg]
    });
    headingCount++;
  }

  Array.prototype.forEach.call(items, function (item) {
    nodes.push(bullet(runsFrom(item, bodyStyle, theme), theme));
  });

  if (stack) {
    nodes.push({ text: runsFrom(stack, { fontSize: SIZE_PT.meta, color: theme.text }, theme) });
  }

  if (!nodes.length) {
    return nodes;
  }

  setSpaceAfter(nodes[nodes.length - 1], GAP.afterEntry);

  if (KEEP_ENTRIES_TOGETHER) {
    return [{ stack: nodes, unbreakable: true }];
  }
  // Role + org line always stay with the first bullet below them.
  return keepFirstTogether(nodes, headingCount + 1);
}

function buildSkillList(list, theme) {
  var bodyStyle = { fontSize: SIZE_PT.body, color: theme.text };

  return Array.prototype.map.call(list.querySelectorAll(".skill-list__row"), function (row) {
    var label = row.querySelector(".skill-list__label");
    var value = row.querySelector(".skill-list__value");
    var runs = runsFrom(label, { bold: true, fontSize: bodyStyle.fontSize, color: theme.blue2 }, theme);

    // The ":" after each label comes from CSS ::after, so add it here.
    runs.push({ text: ": ", bold: true, fontSize: bodyStyle.fontSize, color: theme.blue2 });
    return bullet(runs.concat(runsFrom(value, bodyStyle, theme)), theme);
  });
}

function buildPlainList(list, theme) {
  var style = { bold: true, fontSize: SIZE_PT.body, color: theme.text };

  return Array.prototype.map.call(list.querySelectorAll("li"), function (item) {
    return bullet(runsFrom(item, style, theme), theme);
  });
}

function buildSection(section, theme) {
  var nodes = [];
  var bodyStyle = { fontSize: SIZE_PT.body, color: theme.text };

  Array.prototype.forEach.call(section.children, function (child) {
    var cls = child.classList;

    if (cls.contains("cv-section__title")) {
      nodes.push(buildSectionTitle(child, theme));
    } else if (cls.contains("entry")) {
      nodes = nodes.concat(buildEntry(child, theme));
    } else if (cls.contains("skill-list")) {
      nodes = nodes.concat(buildSkillList(child, theme));
    } else if (cls.contains("plain-list")) {
      nodes = nodes.concat(buildPlainList(child, theme));
    } else {
      // Plain paragraphs (e.g. the summary) and anything new you add later.
      nodes.push({ text: runsFrom(child, bodyStyle, theme), margin: [0, 0, 0, GAP.afterParagraph] });
    }
  });

  if (!nodes.length) {
    return nodes;
  }

  // Gap before the next section, like `.cv-section { margin-bottom }`.
  setSpaceAfter(nodes[nodes.length - 1], GAP.afterSection);

  // A section title always stays with the first block under it.
  var hasTitle = section.querySelector(".cv-section__title") !== null;
  return hasTitle ? keepFirstTogether(nodes, 2) : nodes;
}

/* ---------- document --------------------------------------------------- */

function buildCvDocDefinition() {
  var container = document.getElementById("cv-container");
  var theme = getTheme();
  var content = [];

  var header = container.querySelector(".cv-header");
  if (header) {
    content = content.concat(buildHeader(header, theme));
  }

  Array.prototype.forEach.call(container.querySelectorAll(".cv-section"), function (section) {
    content = content.concat(buildSection(section, theme));
  });

  var nameEl = container.querySelector(".cv-header__name");
  var titleEl = container.querySelector(".cv-header__title");
  var metaDescription = document.querySelector('meta[name="description"]');

  return {
    pageSize: "A4",
    pageMargins: [
      PAGE_MM.left * PT_PER_MM,
      PAGE_MM.top * PT_PER_MM,
      PAGE_MM.right * PT_PER_MM,
      PAGE_MM.bottom * PT_PER_MM
    ],
    info: {
      title: document.title,
      author: nameEl ? nameEl.textContent.trim() : "",
      subject: titleEl ? titleEl.textContent.trim() : "",
      keywords: metaDescription ? metaDescription.getAttribute("content") : ""
    },
    defaultStyle: {
      font: "Carlito",
      fontSize: SIZE_PT.body,
      color: theme.text,
      lineHeight: LINE_HEIGHT
    },
    content: content
  };
}

function exportCvToPdf() {
  var exportBtn = document.getElementById("export-btn");

  if (typeof pdfMake === "undefined") {
    console.error("PDF export failed: pdfmake did not load.");
    alert("The PDF export library could not be loaded. Check your internet connection and try again.");
    return;
  }

  exportBtn.classList.add("is-exporting");

  function cleanup() {
    exportBtn.classList.remove("is-exporting");
  }

  Promise.resolve()
    .then(function () {
      pdfMake.setFonts(PDF_FONTS);
      return pdfMake.createPdf(buildCvDocDefinition()).download(PDF_FILENAME);
    })
    .then(cleanup)
    .catch(function (error) {
      cleanup();
      console.error("PDF export failed:", error);
      alert("The PDF could not be created. Check your internet connection and try again.");
    });
}

/* ============================================================================
   3. INIT
   ============================================================================ */
document.addEventListener("DOMContentLoaded", function () {
  renderCv();

  var exportBtn = document.getElementById("export-btn");
  exportBtn.addEventListener("click", exportCvToPdf);
});
