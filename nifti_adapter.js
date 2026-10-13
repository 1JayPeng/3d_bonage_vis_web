const NIFTI1_HEADER_SIZE = 348;
const NIFTI2_HEADER_SIZE = 540;

function readInt32(view, offset, littleEndian) {
  return view.getInt32(offset, littleEndian);
}

function readUint16(view, offset, littleEndian) {
  return view.getUint16(offset, littleEndian);
}

function readFloat32(view, offset, littleEndian) {
  return view.getFloat32(offset, littleEndian);
}

function readFloat64(view, offset, littleEndian) {
  return view.getFloat64(offset, littleEndian);
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function getFileStem(fileName) {
  return String(fileName || "")
    .replace(/\.nii\.gz$/i, "")
    .replace(/\.nii$/i, "");
}

function getDatasetLabel(fileName) {
  const stem = getFileStem(fileName);
  const normalizedStem = String(stem || "").toLowerCase();

  if (/(?:^|_)gt$/i.test(stem) || normalizedStem === "label" || /(?:^|_)label$/i.test(stem)) return "gt";
  if (/(?:^|_)pred$/i.test(stem)) return "pred";
  if (/(?:^|_)image$/i.test(stem)) return "image";
  return stem || "nifti";
}

async function decompressGzip(arrayBuffer) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 gzip 解压，请升级浏览器或使用 Electron 桌面版");
  }
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function detectHeader(view) {
  const littleSize = view.getInt32(0, true);
  if (littleSize === NIFTI1_HEADER_SIZE) return { version: 1, littleEndian: true };
  if (littleSize === NIFTI2_HEADER_SIZE) return { version: 2, littleEndian: true };

  const bigSize = view.getInt32(0, false);
  if (bigSize === NIFTI1_HEADER_SIZE) return { version: 1, littleEndian: false };
  if (bigSize === NIFTI2_HEADER_SIZE) return { version: 2, littleEndian: false };
  throw new Error("不是有效的 NIfTI-1/NIfTI-2 文件（文件头尺寸不正确）");
}

function readNifti1Header(view, littleEndian) {
  const dims = [];
  for (let i = 0; i < 8; i += 1) dims.push(view.getInt16(40 + i * 2, littleEndian));
  const pixdim = [];
  for (let i = 0; i < 8; i += 1) pixdim.push(readFloat32(view, 76 + i * 4, littleEndian));
  return {
    dims,
    pixdim,
    datatypeCode: readUint16(view, 70, littleEndian),
    bitpix: readUint16(view, 72, littleEndian),
    voxOffset: readFloat32(view, 108, littleEndian),
    slope: readFloat32(view, 112, littleEndian),
    intercept: readFloat32(view, 116, littleEndian),
  };
}

function readNifti2Header(view, littleEndian) {
  const dims = [];
  for (let i = 0; i < 8; i += 1) dims.push(Number(view.getBigInt64(16 + i * 8, littleEndian)));
  const pixdim = [];
  for (let i = 0; i < 8; i += 1) pixdim.push(readFloat64(view, 104 + i * 8, littleEndian));
  return {
    dims,
    pixdim,
    datatypeCode: readUint16(view, 12, littleEndian),
    bitpix: readUint16(view, 14, littleEndian),
    voxOffset: Number(view.getBigInt64(168, littleEndian)),
    slope: readFloat64(view, 176, littleEndian),
    intercept: readFloat64(view, 184, littleEndian),
  };
}

function createTypedReader(datatypeCode, bitpix, littleEndian) {
  const bytesPerVoxel = Math.max(1, Math.ceil(bitpix / 8));
  let readValue;
  switch (datatypeCode) {
    case 2:
      readValue = (view, offset) => view.getUint8(offset);
      break;
    case 4:
      readValue = (view, offset) => view.getInt16(offset, littleEndian);
      break;
    case 8:
      readValue = (view, offset) => view.getInt32(offset, littleEndian);
      break;
    case 16:
      readValue = (view, offset) => view.getFloat32(offset, littleEndian);
      break;
    case 64:
      readValue = (view, offset) => view.getFloat64(offset, littleEndian);
      break;
    case 256:
      readValue = (view, offset) => view.getInt8(offset);
      break;
    case 512:
      readValue = (view, offset) => view.getUint16(offset, littleEndian);
      break;
    case 768:
      readValue = (view, offset) => view.getUint32(offset, littleEndian);
      break;
    default:
      throw new Error(`暂不支持 NIfTI datatype=${datatypeCode} (${bitpix} bit)`);
  }
  return { bytesPerVoxel, readValue };
}

export async function decodeNiftiFile(file) {
  const name = String(file?.name || "");
  if (!/\.nii(?:\.gz)?$/i.test(name)) {
    throw new Error(`不是 NIfTI 文件：${name || "未命名文件"}`);
  }

  let arrayBuffer = await file.arrayBuffer();
  if (/\.nii\.gz$/i.test(name)) {
    arrayBuffer = await decompressGzip(arrayBuffer);
  }

  const view = new DataView(arrayBuffer);
  const detected = detectHeader(view);
  const header = detected.version === 1
    ? readNifti1Header(view, detected.littleEndian)
    : readNifti2Header(view, detected.littleEndian);
  const dimensionCount = Math.max(3, Math.min(7, Number(header.dims[0] || 3)));
  const cols = Math.max(1, Number(header.dims[1] || 1));
  const rows = Math.max(1, Number(header.dims[2] || 1));
  const depth = Math.max(1, Number(header.dims[3] || 1));
  const timepoints = dimensionCount >= 4 ? Math.max(1, Number(header.dims[4] || 1)) : 1;
  if (timepoints > 1) {
    throw new Error(`暂不支持 4D NIfTI（时间维度=${timepoints}），请提供单个 3D 体数据`);
  }

  const { bytesPerVoxel, readValue } = createTypedReader(
    Number(header.datatypeCode),
    Number(header.bitpix),
    detected.littleEndian,
  );
  const voxelCount = cols * rows * depth;
  const dataOffset = Math.max(
    detected.version === 1 ? NIFTI1_HEADER_SIZE : NIFTI2_HEADER_SIZE,
    Math.floor(Number(header.voxOffset) || 0),
  );
  if (dataOffset + voxelCount * bytesPerVoxel > arrayBuffer.byteLength) {
    throw new Error("NIfTI 像素数据长度不足，文件可能损坏或格式不完整");
  }

  const slope = Number.isFinite(header.slope) && header.slope !== 0 ? header.slope : 1;
  const intercept = Number.isFinite(header.intercept) ? header.intercept : 0;
  const pixels = new Float32Array(voxelCount);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const pixelView = new DataView(arrayBuffer, dataOffset);
  for (let index = 0; index < voxelCount; index += 1) {
    const value = readValue(pixelView, index * bytesPerVoxel) * slope + intercept;
    const safeValue = Number.isFinite(value) ? value : 0;
    pixels[index] = safeValue;
    min = Math.min(min, safeValue);
    max = Math.max(max, safeValue);
  }

  const spacingX = isFinitePositive(Math.abs(Number(header.pixdim[1]))) ? Math.abs(header.pixdim[1]) : 1;
  const spacingY = isFinitePositive(Math.abs(Number(header.pixdim[2]))) ? Math.abs(header.pixdim[2]) : 1;
  const spacingZ = isFinitePositive(Math.abs(Number(header.pixdim[3]))) ? Math.abs(header.pixdim[3]) : 1;
  const slices = [];
  const sliceSize = rows * cols;
  for (let z = 0; z < depth; z += 1) {
    slices.push({
      fileName: name,
      sourceFile: file,
      rows,
      cols,
      spacingY,
      spacingX,
      spacingZ,
      ipp: null,
      instanceNumber: z,
      zHint: z * spacingZ,
      sliceThickness: spacingZ,
      spacingBetweenSlices: spacingZ,
      min,
      max,
      pixels: pixels.subarray(z * sliceSize, (z + 1) * sliceSize),
      waterMask: new Uint8Array(sliceSize),
      sourceType: "nifti",
    });
  }

  return {
    fileName: name,
    sourceFile: file,
    label: getDatasetLabel(name),
    stem: getFileStem(name),
    rows,
    cols,
    depth,
    spacingX,
    spacingY,
    spacingZ,
    min,
    max,
    slices,
  };
}

export async function createMaskedNiftiArrayBuffer(file, keepMaskSlices) {
  let arrayBuffer = await file.arrayBuffer();
  if (/\.nii\.gz$/i.test(String(file?.name || ""))) {
    arrayBuffer = await decompressGzip(arrayBuffer);
  }

  const source = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const detected = detectHeader(view);
  const header = detected.version === 1
    ? readNifti1Header(view, detected.littleEndian)
    : readNifti2Header(view, detected.littleEndian);
  const cols = Math.max(1, Number(header.dims[1] || 1));
  const rows = Math.max(1, Number(header.dims[2] || 1));
  const depth = Math.max(1, Number(header.dims[3] || 1));
  const { bytesPerVoxel } = createTypedReader(
    Number(header.datatypeCode),
    Number(header.bitpix),
    detected.littleEndian,
  );
  const dataOffset = Math.max(
    detected.version === 1 ? NIFTI1_HEADER_SIZE : NIFTI2_HEADER_SIZE,
    Math.floor(Number(header.voxOffset) || 0),
  );
  const expectedLength = dataOffset + cols * rows * depth * bytesPerVoxel;
  if (source.byteLength < expectedLength || keepMaskSlices.length !== depth) {
    throw new Error("NIfTI 掩膜尺寸与原图不一致，无法导出");
  }

  const output = source.slice();
  for (let z = 0; z < depth; z += 1) {
    const mask = keepMaskSlices[z];
    if (!mask || mask.length !== rows * cols) {
      throw new Error(`NIfTI 掩膜第 ${z} 层尺寸不一致`);
    }
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] > 0) continue;
      const offset = dataOffset + (z * rows * cols + index) * bytesPerVoxel;
      output.fill(0, offset, offset + bytesPerVoxel);
    }
  }
  return output.buffer;
}

export function isNiftiFile(file) {
  return /\.nii(?:\.gz)?$/i.test(String(file?.name || ""));
}

export function getNiftiDisplayLabel(file) {
  return getDatasetLabel(file?.name || "");
}
