"use client";

import { strToU8, zipSync } from "fflate";
import {
  buildJsonPayload,
  buildSpreadsheetXml,
  safeArchiveEntry,
  safeDownloadName,
  safeTsvCell,
} from "./export-core";
import type { AppState, PhotoAsset, TripRecord } from "./models";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

function exportBaseName(record?: TripRecord) {
  return safeDownloadName(
    record ? `${record.tripDate}-${record.routeName}` : "山行账本-全量备份",
  );
}

export function downloadJson(state: AppState, record?: TripRecord) {
  const payload = buildJsonPayload(state, record);
  saveBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${exportBaseName(record)}.json`,
  );
}

export function downloadExcel(state: AppState, record?: TripRecord) {
  const workbook = buildSpreadsheetXml(state, record);
  saveBlob(
    new Blob(["\ufeff", workbook], {
      type: "application/vnd.ms-excel;charset=utf-8",
    }),
    `${exportBaseName(record)}.xls`,
  );
}

const MAX_ZIP_PHOTOS = 200;
const MAX_ZIP_SOURCE_BYTES = 500 * 1024 * 1024;

export async function downloadPhotoZip(photos: PhotoAsset[], routeName: string) {
  if (!photos.length) throw new Error("这条记录还没有图片");
  if (photos.length > MAX_ZIP_PHOTOS) throw new Error("单次最多打包 200 张图片");
  if (photos.reduce((sum, photo) => sum + photo.size, 0) > MAX_ZIP_SOURCE_BYTES) {
    throw new Error("图片总大小超过 500MB，请分批下载");
  }
  const files: Record<string, Uint8Array> = {};
  const notes = ["存档路径\t原文件名\t分类\t备注"];
  for (const [index, photo] of photos.entries()) {
    const response = await fetch(photo.url, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`下载第 ${index + 1} 张图片失败`);
    const entry = safeArchiveEntry(photo, index);
    files[entry] = new Uint8Array(await response.arrayBuffer());
    notes.push(
      [entry, photo.filename, photo.category, photo.note].map(safeTsvCell).join("\t"),
    );
  }
  files["photo-manifest.tsv"] = strToU8(notes.join("\n"));
  const archive = zipSync(files, { level: 0 });
  const bytes = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer;
  saveBlob(
    new Blob([bytes], { type: "application/zip" }),
    `${safeDownloadName(routeName)}-全部图片.zip`,
  );
}
