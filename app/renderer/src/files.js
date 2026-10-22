import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as XLSX from 'xlsx';
import { isDesktop } from './storage.js';

// jsPDF'in standart fontları Türkçe karakterleri desteklemediği için PDF'de
// karakterler sadeleştirilir; DOCX/XLSX'de Türkçe korunur.
const ASCII_MAP = { ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ü: 'u', Ü: 'U', ö: 'o', Ö: 'O', ç: 'c', Ç: 'C' };
const deTurkish = (s) => s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => ASCII_MAP[c] ?? c);

export async function buildPdf(title, text) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 56;
  const width = 595 - margin * 2;
  let y = margin;
  doc.setFontSize(18);
  doc.text(deTurkish(title), margin, y);
  y += 28;
  doc.setFontSize(11);
  for (const line of deTurkish(text).split('\n')) {
    for (const wrapped of doc.splitTextToSize(line, width)) {
      if (y > 800) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrapped, margin, y);
      y += 16;
    }
    y += 6;
  }
  return doc.output('blob');
}

export async function buildDocx(title, text) {
  const paragraphs = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => new Paragraph({ children: [new TextRun(line)] })),
  ];
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

export async function buildXlsx(title, text) {
  const rows = [
    ['Bölüm', 'İçerik'],
    ['Başlık', title],
    ...text
      .split('\n')
      .filter((line) => line.trim())
      .map((line, i) => [`Satır ${i + 1}`, line]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Rapor');
  const out = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const BUILDERS = { pdf: buildPdf, docx: buildDocx, xlsx: buildXlsx };

export function isBuildable(ext) {
  return !!BUILDERS[ext];
}

export async function buildDocument(ext, title, text) {
  const build = BUILDERS[ext];
  if (!build) throw new Error('Desteklenmeyen biçim: ' + ext);
  return build(title, text);
}

// Masaüstünde dosya İndirilenler klasörüne kaydedilir; tarayıcı önizlemesinde
// standart indirme olarak düşer.
export async function saveOutput(baseName, ext, blob) {
  if (isDesktop) {
    const buf = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const res = await window.desktop.saveFile(`${baseName}.${ext}`, base64);
    if (!res.ok) throw new Error(res.error);
    return { kind: 'file', path: res.path };
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseName}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { kind: 'download', name: `${baseName}.${ext}` };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
