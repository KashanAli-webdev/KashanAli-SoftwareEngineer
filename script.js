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
   2. EXPORT
   Core html2pdf.js logic only. Takes the already-rendered #cv-container
   and saves it as a single A4-page PDF.
   ============================================================================ */
function exportCvToPdf() {
  var exportBtn = document.getElementById("export-btn");
  var liveContainer = document.getElementById("cv-container");

  // Export from a separate, detached copy of the CV rather than the live
  // page. The copy gets a fixed A4 width and the light-monokai theme.
  // Appending it after all existing content lets it fall in normal
  // document flow (below the fold, so effectively invisible without
  // scrolling) rather than using an off-screen absolute offset, which
  // can cause some html2canvas versions to render a blank canvas.
  var exportCopy = liveContainer.cloneNode(true);
  exportCopy.removeAttribute("id");
  exportCopy.classList.add("theme-light-monokai");
  exportCopy.classList.add("is-export-copy");
  document.body.appendChild(exportCopy);

  exportBtn.classList.add("is-exporting");

  var options = {
    margin: 0,
    filename: "KashanAli-SoftwareEngineer-CV.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#fafafa"
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  function cleanup() {
    exportBtn.classList.remove("is-exporting");
    document.body.removeChild(exportCopy);
  }

  html2pdf()
    .set(options)
    .from(exportCopy)
    .toPdf()
    .get("pdf")
    .then(function (pdf) {
      // html2pdf can add a near-empty trailing page when the content
      // height lands almost exactly on an A4-page boundary (a rounding
      // quirk, not an actual overflow of content). Drop any page after
      // the first one, since this CV is always meant to be a single page.
      var totalPages = pdf.internal.getNumberOfPages();
      for (var i = totalPages; i > 1; i--) {
        pdf.deletePage(i);
      }
    })
    .save()
    .then(cleanup)
    .catch(function (error) {
      cleanup();
      console.error("PDF export failed:", error);
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