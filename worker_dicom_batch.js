importScripts("dicomParser.min.js");

const RULE_MASK_Y = 1;
const RULE_MASK_X = 2;
const RULE_MASK_OBLIQUE = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tagNumber(dataSet, tag, fallback = undefined) {
  if (!dataSet) return fallback;

  const numericReaders = [
    () => dataSet.uint16?.(tag),
    () => dataSet.int16?.(tag),
    () => dataSet.uint32?.(tag),
    () => dataSet.int32?.(tag),
    () => dataSet.float?.(tag),
    () => dataSet.double?.(tag),
  ];

  for (const read of numericReaders) {
    try {
      const value = read();
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
        return Number(value);
      }
    } catch (error) {
      // Try next reader.
    }
  }

  const stringReaders = [
    () => dataSet.intString?.(tag),
    () => dataSet.floatString?.(tag),
    () => dataSet.string?.(tag),
  ];

  for (const read of stringReaders) {
    try {
      const value = read();
      if (value === undefined || value === null || value === "") {
        continue;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    } catch (error) {
      // Try next reader.
    }
  }

  return fallback;
}

function tagVector(dataSet, tag) {
  const raw = dataSet?.string?.(tag);
  if (!raw) {
    return null;
  }
  return raw.split("\\").map((part) => Number(part));
}

function getRawPixelDataFromDataSet(dataSet, bitsAllocated, pixelRepresentation) {
  const pixelElement = dataSet.elements.x7fe00010;
  if (!pixelElement) {
    throw new Error("No pixel data");
  }

  const offset = pixelElement.dataOffset;
  const length = pixelElement.length;
  const buffer = dataSet.byteArray.buffer;
  const byteOffset = dataSet.byteArray.byteOffset + offset;

  if (bitsAllocated === 8) {
    return new Uint8Array(buffer, byteOffset, length);
  }

  if (bitsAllocated === 16) {
    if (pixelRepresentation === 0) {
      return new Uint16Array(buffer, byteOffset, length / 2);
    }
    return new Int16Array(buffer, byteOffset, length / 2);
  }

  return new Uint8Array(buffer, byteOffset, length);
}

function normalizePixelsToScalar(pixelArray, rows, cols, samplesPerPixel) {
  const total = rows * cols;
  const out = new Float32Array(total);

  if (samplesPerPixel === 1) {
    for (let i = 0; i < total; i += 1) {
      out[i] = pixelArray[i];
    }
  } else if (samplesPerPixel === 3) {
    for (let i = 0; i < total; i += 1) {
      out[i] = pixelArray[i * 3] * 0.299 + pixelArray[i * 3 + 1] * 0.587 + pixelArray[i * 3 + 2] * 0.114;
    }
  }

  return out;
}

function detectObliqueParameters(slices) {
  const depth = slices.length;
  const rows = slices[0].rows;
  const cols = slices[0].cols;
  const xMid = Math.floor(cols / 2);
  const yzPlane = new Float32Array(rows * depth);

  for (let z = 0; z < depth; z += 1) {
    const midCol = slices[z].midColumn;
    for (let y = 0; y < rows; y += 1) {
      yzPlane[y * depth + z] = midCol[y];
    }
  }

  const gradient = new Float32Array(rows * depth);
  const step = 2;
  for (let y = step; y < rows - step; y += 1) {
    for (let z = step; z < depth - step; z += 1) {
      const idx = y * depth + z;
      const dy = yzPlane[(y + step) * depth + z] - yzPlane[(y - step) * depth + z];
      const dz = yzPlane[y * depth + (z + step)] - yzPlane[y * depth + (z - step)];
      gradient[idx] = Math.sqrt(dy * dy + dz * dz);
    }
  }

  let bestScore = -1;
  let bestZStartRatio = 0.72;
  let bestThetaDeg = 51;

  for (let zRatio = 0.1; zRatio <= 0.95; zRatio += 0.02) {
    const zStart = Math.floor(depth * zRatio);
    for (let theta = 5; theta <= 85; theta += 1) {
      const tanTheta = Math.tan((theta * Math.PI) / 180);
      let score = 0;
      let count = 0;

      for (let z = 0; z <= zStart; z += 1) {
        const dz = zStart - z;
        const yLine = (rows - 1) - tanTheta * dz;
        const y = Math.round(yLine);
        if (y >= step && y < rows - step) {
          score += gradient[y * depth + z];
          count += 1;
        }
      }

      if (count > zStart * 0.25) {
        const avgScore = score / count;
        const finalScore = avgScore * Math.sqrt(count);
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestZStartRatio = zRatio;
          bestThetaDeg = theta;
        }
      }
    }
  }

  return {
    bestZStartRatio,
    bestThetaDeg,
  };
}

function adjustAutoDetectedObliqueParameters(bestZStartRatio, bestThetaDeg, depth) {
  const safeDepth = Math.max(1, Math.floor(Number(depth) || 1));
  const detectedZStart = Math.max(0, Math.min(safeDepth - 1, Math.floor(safeDepth * Number(bestZStartRatio || 0))));
  const adjustedZStart = Math.min(safeDepth - 1, detectedZStart + 1);
  return {
    obliqueStartZRatio: adjustedZStart / safeDepth,
    obliqueAngleDeg: Math.min(89, Number(bestThetaDeg || 0) + 1),
  };
}

function buildDeletionMask(depth, rows, cols, config) {
  const mask = new Uint8Array(depth * rows * cols);
  const ruleYRatio = clamp(Number(config?.ruleYRatio ?? 0.05), 0.05, 0.95);
  const ruleXRatio = clamp(Number(config?.ruleXRatio ?? 0.15), 0.05, 0.95);
  const ruleModeY = config?.ruleModeY === "none" || config?.ruleModeY === "hide" || config?.ruleModeY === "color" ? config.ruleModeY : "none";
  const ruleModeX = config?.ruleModeX === "none" || config?.ruleModeX === "hide" || config?.ruleModeX === "color" ? config.ruleModeX : "none";
  const ruleModeBlue = config?.ruleModeBlue === "none" || config?.ruleModeBlue === "hide" || config?.ruleModeBlue === "color" ? config.ruleModeBlue : "none";
  const bluePatternMode = config?.bluePatternMode === "oblique" || config?.bluePatternMode === "plane" || config?.bluePatternMode === "both"
    ? config.bluePatternMode
    : "both";
  const obliqueAngleDeg = clamp(Number(config?.obliqueAngleDeg ?? 51), 0, 89);
  const obliqueStartZRatio = clamp(Number(config?.obliqueStartZRatio ?? 0.72), 0, 0.95);
  const bluePlaneThicknessRatio = clamp(Number(config?.bluePlaneThicknessRatio ?? 0.07), 0.01, 0.95);

  const yMax = Math.max(0, Math.min(rows - 1, Math.floor(rows * ruleYRatio)));
  const xMax = Math.max(0, Math.min(cols - 1, Math.floor(cols * ruleXRatio)));
  const xMin = Math.max(0, cols - 1 - xMax);
  const zStart = Math.max(0, Math.min(depth - 1, Math.floor(depth * obliqueStartZRatio)));
  const tanTheta = Math.tan((obliqueAngleDeg * Math.PI) / 180);
  const bluePlaneYMin = Math.max(0, rows - Math.max(1, Math.min(rows, Math.floor(rows * bluePlaneThicknessRatio))));
  const enableObliqueBlue = bluePatternMode === "oblique" || bluePatternMode === "both";
  const enablePlaneBlue = bluePatternMode === "plane" || bluePatternMode === "both";

  for (let z = 0; z < depth; z += 1) {
    const sliceOffset = z * rows * cols;

    if (ruleModeY !== "none") {
      for (let y = 0; y <= yMax; y += 1) {
        const rowOffset = sliceOffset + y * cols;
        for (let x = 0; x < cols; x += 1) {
          mask[rowOffset + x] |= RULE_MASK_Y;
        }
      }
    }

    if (ruleModeX !== "none") {
      for (let y = 0; y < rows; y += 1) {
        const rowOffset = sliceOffset + y * cols;
        for (let x = xMin; x < cols; x += 1) {
          mask[rowOffset + x] |= RULE_MASK_X;
        }
      }
    }

    if (ruleModeBlue !== "none") {
      if (enablePlaneBlue) {
        for (let y = bluePlaneYMin; y < rows; y += 1) {
          const rowOffset = sliceOffset + y * cols;
          for (let x = 0; x < cols; x += 1) {
            mask[rowOffset + x] |= RULE_MASK_OBLIQUE;
          }
        }
      }

      if (enableObliqueBlue && z <= zStart) {
        const dz = zStart - z;
        const yLine = (rows - 1) - tanTheta * dz;
        const yTop = Math.max(0, Math.min(rows - 1, Math.ceil(yLine)));
        for (let y = yTop; y < rows; y += 1) {
          const rowOffset = sliceOffset + y * cols;
          for (let x = 0; x < cols; x += 1) {
            mask[rowOffset + x] |= RULE_MASK_OBLIQUE;
          }
        }
      }
    }
  }

  return mask;
}

function zeroMaskedPixelsInDicomBytes(bytes, slice, deletionMask) {
  const pixelStart = slice.pixelDataOffset;
  const pixelLength = slice.pixelDataLength;
  const bytesPerSample = slice.bitsAllocated === 8 ? 1 : 2;
  const samplesPerPixel = Math.max(1, slice.samplesPerPixel || 1);
  const bytesPerPixel = bytesPerSample * samplesPerPixel;
  const pixelBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + pixelStart, pixelLength);
  const cols = slice.cols;
  const rows = slice.rows;

  for (let y = 0; y < rows; y += 1) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x += 1) {
      const idx = rowOffset + x;
      if ((deletionMask[idx] & (RULE_MASK_Y | RULE_MASK_X | RULE_MASK_OBLIQUE)) === 0) {
        continue;
      }
      const pixelByteOffset = idx * bytesPerPixel;
      for (let b = 0; b < bytesPerPixel; b += 1) {
        pixelBytes[pixelByteOffset + b] = 0;
      }
    }
  }
}

function compareSlices(a, b) {
  if (a.zHint !== null && b.zHint !== null) {
    return a.zHint - b.zHint;
  }
  return a.instanceNumber - b.instanceNumber;
}

self.onmessage = async (e) => {
  const { files, config } = e.data;

  try {
    const parsedSlices = [];
    const parseErrors = {};
    let skippedByExtension = 0;
    let skippedByNoImageDimensions = 0;

    for (const file of files) {
      const ext = (file.name || "").toLowerCase().split(".").pop();
      if (ext !== "dcm") {
        skippedByExtension += 1;
        continue;
      }

      const byteArray = new Uint8Array(file.buffer);
      let dataSet;
      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (err) {
        parseErrors[file.name] = err.message || String(err);
        continue;
      }

      const rows = tagNumber(dataSet, "x00280010", 0);
      const cols = tagNumber(dataSet, "x00280011", 0);
      if (!rows || !cols) {
        skippedByNoImageDimensions += 1;
        continue;
      }

      const samplesPerPixel = tagNumber(dataSet, "x00280002", 1);
      const bitsAllocated = tagNumber(dataSet, "x00280100", 16);
      const pixelRepresentation = tagNumber(dataSet, "x00280103", 0);
      const slope = tagNumber(dataSet, "x00281053", 1);
      const intercept = tagNumber(dataSet, "x00281052", 0);
      const photometric = (dataSet.string("x00280004") || "MONOCHROME2").toUpperCase();
      const pixelElement = dataSet.elements.x7fe00010;
      const instanceNumber = tagNumber(dataSet, "x00200013", 0);
      const ipp = tagVector(dataSet, "x00200032");
      const zHint = (ipp && Number.isFinite(ipp[2])) ? ipp[2] : null;

      const rawPixels = getRawPixelDataFromDataSet(dataSet, bitsAllocated, pixelRepresentation);
      const scalarPixels = normalizePixelsToScalar(rawPixels, rows, cols, samplesPerPixel);
      const xMid = Math.floor(cols / 2);
      const midColumnPixels = new Float32Array(rows);
      for (let y = 0; y < rows; y += 1) {
        let value = scalarPixels[y * cols + xMid] * slope + intercept;
        if (photometric === "MONOCHROME1") {
          value = -value;
        }
        midColumnPixels[y] = value;
      }

      parsedSlices.push({
        fileName: file.name,
        buffer: file.buffer,
        rows,
        cols,
        instanceNumber,
        zHint,
        samplesPerPixel,
        bitsAllocated,
        pixelRepresentation,
        pixelDataOffset: pixelElement.dataOffset,
        pixelDataLength: pixelElement.length,
        midColumn: midColumnPixels,
      });
    }

    if (parsedSlices.length === 0) {
      const reasons = [];
      for (const key in parseErrors) {
        reasons.push(`${key}: ${parseErrors[key]}`);
      }
      const summary = [];
      if (skippedByExtension > 0) summary.push(`后缀拦截=${skippedByExtension}个`);
      if (skippedByNoImageDimensions > 0) summary.push(`非图像DICOM(无宽高)=${skippedByNoImageDimensions}个`);
      if (reasons.length > 0) summary.push(`部分文件抛出错误(${reasons.length}个): ${reasons.join(" | ")}`);

      self.postMessage({
        success: false,
        error: summary.length > 0 ? summary.join(", ") : "No valid DICOM files parsed",
      });
      return;
    }

    parsedSlices.sort(compareSlices);

    const depth = parsedSlices.length;
    const rows = parsedSlices[0].rows;
    const cols = parsedSlices[0].cols;
    const obliqueDetection = detectObliqueParameters(parsedSlices);
    const adjustedDetection = adjustAutoDetectedObliqueParameters(
      obliqueDetection.bestZStartRatio,
      obliqueDetection.bestThetaDeg,
      depth,
    );
    const mergedConfig = {
      ...config,
      obliqueStartZRatio: adjustedDetection.obliqueStartZRatio,
      obliqueAngleDeg: adjustedDetection.obliqueAngleDeg,
    };
    const deletionMask = buildDeletionMask(depth, rows, cols, mergedConfig);

    const exportedFiles = [];
    const transferables = [];

    for (let z = 0; z < depth; z += 1) {
      const slice = parsedSlices[z];
      const buffer = slice.buffer;
      const bytes = new Uint8Array(buffer);
      const sliceMask = deletionMask.subarray(z * rows * cols, (z + 1) * rows * cols);
      zeroMaskedPixelsInDicomBytes(bytes, slice, sliceMask);

      exportedFiles.push({
        fileName: slice.fileName,
        buffer,
      });
      transferables.push(buffer);
    }

    self.postMessage({
      success: true,
      files: exportedFiles,
      bestZStartRatio: adjustedDetection.obliqueStartZRatio,
      bestThetaDeg: adjustedDetection.obliqueAngleDeg,
    }, transferables);
  } catch (err) {
    self.postMessage({ success: false, error: err.message || String(err) });
  }
};
