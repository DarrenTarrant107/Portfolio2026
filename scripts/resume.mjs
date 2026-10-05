// Builds an ATS-friendly resume PDF from data/info.json.
//
//   npm run resume
//
// Writes the PDF to the path in profile.resume (e.g. "/Rui_Jin_Resume.pdf" ->
// public/Rui_Jin_Resume.pdf), which the site's Resume button links to.
// Needs Chrome, Edge or Chromium installed; set CHROME_PATH to use another browser.
//
// Layout follows a classic US resume: centered name, title-case section headings over
// a thin rule, company and dates on one line, role and place on the next.
//
// ATS rules followed: one column, real text (no images or tables), a standard
// font, standard section headings, contact details in the page body (not in a
// header/footer), plain black text, US Letter.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const info = JSON.parse(readFileSync(join(root, "data", "info.json"), "utf8"));
const { profile, settings } = info;
const social = (info.social ?? []).filter((l) => !l.hidden);

// ---------- helpers ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDate = (value) => {
  const [year, month] = String(value).split("-");
  const index = Number(month) - 1;
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : year;
};
// Plain hyphen, not an en dash: some ATS parsers garble "–" and then misread the dates.
const formatRange = (start, end) => {
  if (!start) return end ? formatDate(end) : "";
  const from = formatDate(start);
  const to = end ? formatDate(end) : "Present";
  return from === to ? from : `${from} - ${to}`;
};
const escapeHtml = (text = "") =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// "https://www.linkedin.com/in/name/" -> "linkedin.com/in/name"
const displayUrl = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
const link = (url, text = displayUrl(url)) => `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
const absolute = (url) => new URL(url, settings.siteUrl).href;
const isMessaging = (url) => /wa\.me|whatsapp\.com/i.test(url);

// ---------- content ----------

const whatsapp = social.find((l) => isMessaging(l.url));

// One line, like a classic resume header: location, phone, email, then profiles as
// clickable names. The phone opens WhatsApp when there's a WhatsApp link; the email
// stays written out so it can be read (and copied) from the page itself.
const contactLine = [
  profile.location && escapeHtml(profile.location),
  profile.phone && (whatsapp ? link(whatsapp.url, `${profile.phone} (WhatsApp)`) : escapeHtml(profile.phone)),
  profile.email && link(`mailto:${profile.email}`, profile.email),
  link(settings.siteUrl, "Portfolio"),
  // The first three profiles in info.json order. WhatsApp is covered by the phone number.
  ...social
    .filter((l) => !isMessaging(l.url))
    .slice(0, 3)
    .map((l) => link(l.url, l.label)),
].filter(Boolean);

const section = (title, body) => (body ? `<section><h2>${title}</h2>${body}</section>` : "");
const bullets = (items = []) =>
  items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "";
// Two-sided line: left text, right text (dates, places), as on a classic resume.
const row = (left, right = "") =>
  `<div class="row"><span>${left}</span>${right ? `<span class="right">${right}</span>` : ""}</div>`;

const summary = profile.summary ? `<p>${escapeHtml(profile.summary)}</p>` : "";

const skills = info.skills?.length
  ? `<ul class="skills">${info.skills
      .map((g) => `<li><b>${escapeHtml(g.category)}</b>: ${escapeHtml(g.items.join(", "))}</li>`)
      .join("")}</ul>`
  : "";

// Company and dates in bold, then the role and place in italics, a one-line summary, and bullets.
const experience = (info.experience ?? [])
  .map(
    (job) => `
    <div class="entry">
      <div class="head">
        ${row(`<b>${escapeHtml(job.company)}</b>`, `<b>${formatRange(job.start, job.end)}</b>`)}
        ${row(`<i>${escapeHtml(job.role)}</i>`, job.location ? `<i>${escapeHtml(job.location)}</i>` : "")}
      </div>
      ${job.summary ? `<p>${escapeHtml(job.summary)}</p>` : ""}
      ${bullets(job.highlights)}
    </div>`,
  )
  .join("");

const projects = (info.projects ?? [])
  .map((project) => {
    const url = project.url ?? project.links?.[0]?.url;
    // Right side: the link, or the note (e.g. "Client work · NDA") when there's nothing to link.
    const aside = url ? link(absolute(url)) : project.note ? `<i>${escapeHtml(project.note)}</i>` : "";
    return `
    <div class="entry">
      <div class="head">
        ${row(`<b>${escapeHtml(project.name)}</b>`, aside)}
        ${project.tech?.length ? row(`<i>${escapeHtml(project.tech.join(", "))}</i>`) : ""}
      </div>
      <p>${escapeHtml(project.description)}</p>
    </div>`;
  })
  .join("");

const education = (info.education ?? [])
  .map(
    (school) => `
    <div class="entry">
      <div class="head">
        ${row(`<b>${escapeHtml(school.school)}</b>`, `<b>${formatRange(school.start, school.end)}</b>`)}
        ${row(`<i>${escapeHtml(school.degree)}</i>`, school.location ? `<i>${escapeHtml(school.location)}</i>` : "")}
      </div>
      ${bullets(school.details)}
    </div>`,
  )
  .join("");

const credentials = (items = []) =>
  items
    .map((item) =>
      row(
        `<b>${escapeHtml(item.name)}</b>${item.issuer ? `, ${escapeHtml(item.issuer)}` : ""}`,
        item.date ? `<b>${formatDate(item.date)}</b>` : "",
      ),
    )
    .join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(profile.name)} Resume</title>
<style>
  @page { size: Letter; margin: 0.45in 0.55in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Times New Roman", Times, "Liberation Serif", serif; font-size: 10.5pt; line-height: 1.24; color: #000; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 1pt; }
  header { text-align: center; }
  h1 { font-size: 24pt; font-weight: normal; line-height: 1.1; }
  .contact { font-size: 9.5pt; margin-top: 2pt; }
  h2 { font-size: 11.5pt; border-bottom: 0.75pt solid #999; padding-bottom: 1pt; margin: 9pt 0 3pt; break-after: avoid; }
  .row { display: flex; justify-content: space-between; gap: 12pt; }
  .right { white-space: nowrap; text-align: right; }
  .entry { margin-bottom: 6pt; }
  .head { break-inside: avoid; break-after: avoid; }
  ul { margin: 1pt 0 0 14pt; }
  li { margin-bottom: 0.5pt; padding-left: 1pt; break-inside: avoid; }
  .skills { margin-top: 0; }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(profile.name)}</h1>
    <p class="contact">${contactLine.join(" | ")}</p>
  </header>
  ${section("Professional Summary", summary)}
  ${section("Skills", skills)}
  ${section("Work Experience", experience)}
  ${section("Projects", projects)}
  ${section("Education", education)}
  ${section("Certifications", credentials(info.certifications))}
  ${section("Awards", credentials(info.awards))}
</body>
</html>`;

// ---------- print ----------

const target = profile.resume?.startsWith("/") ? profile.resume : "/resume.pdf";
if (target !== profile.resume) {
  console.warn(
    `profile.resume is "${profile.resume ?? ""}"; writing /resume.pdf. Set profile.resume to "/resume.pdf" to link it.`,
  );
}
const outFile = join(root, "public", ...target.split("/").filter(Boolean));

const env = process.env;
const candidates = [
  env.CHROME_PATH,
  env.ProgramFiles && join(env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
  env["ProgramFiles(x86)"] && join(env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
  env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  env["ProgramFiles(x86)"] && join(env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
  env.ProgramFiles && join(env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean);
const browser = candidates.find((path) => existsSync(path));
if (!browser) {
  console.error("Couldn't find Chrome, Edge or Chromium. Install one, or set CHROME_PATH to a Chromium-based browser.");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "resume-"));
const htmlFile = join(work, "resume.html");
writeFileSync(htmlFile, html, "utf8");

const result = spawnSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    `--user-data-dir=${join(work, "profile")}`,
    `--print-to-pdf=${outFile}`,
    pathToFileURL(htmlFile).href,
  ],
  { encoding: "utf8", timeout: 60_000 },
);
rmSync(work, { recursive: true, force: true });

if (!existsSync(outFile) || statSync(outFile).size === 0) {
  console.error("Printing the PDF failed.", result.error?.message ?? result.stderr ?? "");
  process.exit(1);
}
console.log(`Resume written to public${target} (${Math.round(statSync(outFile).size / 1024)} KB)`);
