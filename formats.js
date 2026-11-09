export const FORMATS = {
  jpg:  { label: 'JPG',  targets: ['png', 'webp', 'pdf'] },
  png:  { label: 'PNG',  targets: ['jpg', 'webp', 'pdf'] },
  webp: { label: 'WEBP', targets: ['jpg', 'png', 'pdf'] },
  gif:  { label: 'GIF',  targets: ['jpg', 'png', 'webp', 'pdf'] },
  bmp:  { label: 'BMP',  targets: ['jpg', 'png', 'webp', 'pdf'] },
  pdf:  { label: 'PDF',  targets: ['txt', 'docx'] },
  docx: { label: 'DOCX', targets: ['pdf', 'txt'] },
  txt:  { label: 'TXT',  targets: ['pdf', 'docx'] },
  csv:  { label: 'CSV',  targets: ['xlsx'] },
  xlsx: { label: 'XLSX', targets: ['csv'] },
};

export const MAX_BYTES = 50 * 1024 * 1024;

const NOTES = {
  'pdf>txt': 'notePdfTxt',
  'pdf>docx': 'notePdfDocx',
  'docx>pdf': 'noteDocxPdf',
  'xlsx>csv': 'noteXlsxCsv',
};
export function noteFor(source, target) {
  if (source === 'gif' && target !== 'pdf') return 'noteGif';
  return NOTES[`${source}>${target}`] ?? '';
}
