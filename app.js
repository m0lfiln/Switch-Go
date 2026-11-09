import { FORMATS, MAX_BYTES, noteFor } from './formats.js';
import { convert, resultName, ConvError } from './converters.js';
import { t, getLang, setLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const el = {
  panel: $('panel'), dropzone: $('dropzone'), input: $('file-input'), error: $('error'),
  fileExt: $('file-ext'), fileName: $('file-name'), fileSize: $('file-size'),
  fromTag: $('from-tag'), toTag: $('to-tag'), targets: $('targets'), note: $('note'), convert: $('convert'),
  resultName: $('result-name'), download: $('download'),
  lang: $('lang'), langCode: $('lang-code'), limitHint: $('limit-hint'),
};
const steps = { idle: $('step-pick'), ready: $('step-ready'), busy: $('step-busy'), done: $('step-done') };

let file = null, source = null, target = null, resultUrl = null;
let resultInfo = null;   
let errorState = null;   

const extOf = (name) => {
  const e = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return { jpeg: 'jpg', tif: 'tiff' }[e] ?? e;
};
const formatSize = (b) => (b < 1048576
  ? `${Math.max(1, Math.round(b / 1024))} ${t('sizeKB')}`
  : `${(b / 1048576).toFixed(1)} ${t('sizeMB')}`);

function show(state) {
  el.panel.dataset.state = state;
  for (const [k, node] of Object.entries(steps)) node.hidden = k !== state;
}

function renderError() {
  el.error.textContent = errorState ? t(errorState.key, errorState.params) : '';
  el.error.hidden = !errorState;
}
const showError = (key, params) => { errorState = key ? { key, params } : null; renderError(); };

function setFile(f) {
  showError('');
  const ext = extOf(f.name);
  if (!FORMATS[ext]) return showError('errUnsupported', { ext: ext || '?', list: Object.values(FORMATS).map((x) => x.label).join(', ') });
  if (f.size === 0) return showError('errEmpty');
  if (f.size > MAX_BYTES) return showError('errTooBig', { size: formatSize(f.size), max: formatSize(MAX_BYTES) });
  file = f; source = ext; target = null;
  el.fileExt.textContent = el.fromTag.textContent = FORMATS[ext].label;
  el.fileName.textContent = f.name;
  el.fileSize.textContent = formatSize(f.size);
  renderTargets(FORMATS[ext].targets);
  show('ready');
}

function renderTargets(list) {
  el.targets.replaceChildren(...list.map((tg) => {
    const label = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'target', value: tg });
    const text = document.createElement('span');
    text.textContent = FORMATS[tg].label;
    radio.addEventListener('change', () => selectTarget(tg));
    label.append(radio, text);
    return label;
  }));
  if (list.length === 1) { el.targets.querySelector('input').checked = true; selectTarget(list[0]); }
  else selectTarget(null);
}

function renderNote() {
  const key = target ? noteFor(source, target) : '';
  el.note.textContent = key ? t(key) : '';
  el.note.hidden = !key;
}

function selectTarget(tg) {
  target = tg;
  el.toTag.textContent = tg ? FORMATS[tg].label : '—';
  el.toTag.classList.toggle('is-empty', !tg);
  el.convert.disabled = !tg;
  renderNote();
}

function reset() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  file = source = target = resultUrl = resultInfo = null;
  el.input.value = '';
  showError('');
  show('idle');
}

async function startConversion() {
  showError('');
  show('busy');
  try {
    const blob = await convert(file, source, target);
    const name = resultName(file.name, target);
    resultUrl = URL.createObjectURL(blob);
    resultInfo = { name, size: blob.size };
    renderResult();
    el.download.href = resultUrl;
    el.download.setAttribute('download', name);
    show('done');
  } catch (err) {
    show('ready');
    showError(err instanceof ConvError ? err.key : 'errGeneric');
  }
}

function renderResult() {
  if (resultInfo) el.resultName.textContent = `${resultInfo.name} · ${formatSize(resultInfo.size)}`;
}


function applyLang() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  document.querySelector('meta[name="description"]').content = t('pageDesc');
  for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of document.querySelectorAll('[data-i18n-html]')) n.innerHTML = t(n.dataset.i18nHtml); 
  for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
  el.langCode.textContent = lang === 'ru' ? 'EN' : 'RU';
  el.lang.setAttribute('aria-label', t('langAria'));
  el.limitHint.textContent = t('limitHint', { max: formatSize(MAX_BYTES) });
  if (file) el.fileSize.textContent = formatSize(file.size);
  renderNote();
  renderResult();
  renderError();
}

el.lang.addEventListener('click', () => { setLang(getLang() === 'ru' ? 'en' : 'ru'); applyLang(); });


el.input.addEventListener('change', () => el.input.files[0] && setFile(el.input.files[0]));
el.convert.addEventListener('click', startConversion);
$('remove').addEventListener('click', reset);
$('again').addEventListener('click', reset);
el.download.addEventListener('click', () => setTimeout(reset, 1500));

['dragenter', 'dragover'].forEach((ev) => el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => el.dropzone.addEventListener(ev, (e) => { e.preventDefault(); el.dropzone.classList.remove('is-over'); }));
el.dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length > 1) return showError('errMultiple');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

applyLang();
