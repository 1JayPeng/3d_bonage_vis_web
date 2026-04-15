importScripts("dicomParser.min.js");

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
      const v = read();
      if (v !== undefined && v !== null && Number.isFinite(Number(v))) {
        return Number(v);
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
      const n = Number(value);
      if (Number.isFinite(n)) {
        return n;
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
  return raw.split("\\").map((s) => Number(s));
}

function normalizePixelsToScalar(pixelArray, rows, cols, samplesPerPixel) {
  const total = rows * cols;
  const out = new Float32Array(total);
  if (samplesPerPixel === 1) {
    for (let i = 0; i < total; i++) {
        out[i] = pixelArray[i];
    }
  } else if (samplesPerPixel === 3) {
    for (let i = 0; i < total; i++) {
      out[i] = pixelArray[i * 3] * 0.299 + pixelArray[i * 3 + 1] * 0.587 + pixelArray[i * 3 + 2] * 0.114;
    }
  }
  return out;
}

function getRawPixelDataFromDataSet(dataSet, rows, cols, samplesPerPixel, bitsAllocated, pixelRepresentation) {
  const pixelElement = dataSet.elements.x7fe00010;
  if (!pixelElement) throw new Error("No pixel data");
  const offset = pixelElement.dataOffset;
  const length = pixelElement.length;
  const buffer = dataSet.byteArray.buffer;
  const byteOffset = dataSet.byteArray.byteOffset + offset;
  
  if (bitsAllocated === 8) {
    return new Uint8Array(buffer, byteOffset, length);
  } else if (bitsAllocated === 16) {
    if (pixelRepresentation === 0) {
      return new Uint16Array(buffer, byteOffset, length / 2);
    } else {
      return new Int16Array(buffer, byteOffset, length / 2);
    }
  }
  return new Uint8Array(buffer, byteOffset, length);
}

self.onmessage = async (e) => {
  const { files, config } = e.data;
  
  try {
    const parsedSlices = [];
    
    const parseErrors = {};
    let skippedByExtension = 0;
    let skippedByNoImageDimensions = 0;

    // 1. Parsing
    for (const f of files) {
      // Avoid processing obviously non-dicom files if user selected a huge folder
      const ext = (f.name || "").toLowerCase().split('.').pop();
      if (ext !== "dcm") {
         skippedByExtension++;
         continue; // strictly skip non-dcm files
      }

      const byteArray = new Uint8Array(f.buffer);
      let dataSet;
      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (err) {
        parseErrors[f.name] = err.message || String(err);
        continue;
      }
      
      const rows = tagNumber(dataSet, "x00280010", 0);
      const cols = tagNumber(dataSet, "x00280011", 0);
      if (!rows || !cols) {
         skippedByNoImageDimensions++;
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

      const rawPixels = getRawPixelDataFromDataSet(dataSet, rows, cols, samplesPerPixel, bitsAllocated, pixelRepresentation);
      const scalarPixels = normalizePixelsToScalar(rawPixels, rows, cols, samplesPerPixel);
      
      const xMid = Math.floor(cols / 2);
      const midColumnPixels = new Float32Array(rows);
      for (let y = 0; y < rows; y++) {
        let value = scalarPixels[y * cols + xMid] * slope + intercept;
        if (photometric === "MONOCHROME1") value = -value;
        midColumnPixels[y] = value;
      }

      parsedSlices.push({
        fileName: f.name,
        buffer: f.buffer,
        rows, cols,
        instanceNumber, zHint,
        pixelDataOffset: pixelElement.dataOffset,
        pixelDataLength: pixelElement.length,
        midColumn: midColumnPixels
      });
    }

    if (parsedSlices.length === 0) {
      let reasons = [];
      for (const key in parseErrors) {
        reasons.push(`${key}: ${parseErrors[key]}`);
      }
      let summary = [];
      if (skippedByExtension > 0) summary.push(`后缀拦截=${skippedByExtension}个`);
      if (skippedByNoImageDimensions > 0) summary.push(`非图像DICOM(无宽高)=${skippedByNoImageDimensions}个`);
      if (reasons.length > 0) summary.push(`部分文件抛出错误(${reasons.length}个): ${reasons.join(" | ")}`);

      self.postMessage({ success: false, error: summary.length > 0 ? summary.join(", ") : "No valid DICOM files parsed" });
      return;
    }

    // 2. Sort slices
    parsedSlices.sort((a, b) => {
      if (a.zHint !== null && b.zHint !== null) {
        return a.zHint - b.zHint;
      }
      return a.instanceNumber - b.instanceNumber;
    });

    const depth = parsedSlices.length;
    const rows = parsedSlices[0].rows;
    const cols = parsedSlices[0].cols;

    // 3. Auto-Detect Line
    const xMid = Math.floor(cols / 2);
    const yzPlane = new Float32Array(rows * depth);
    for (let z = 0; z < depth; z++) {
      const midCol = parsedSlices[z].midColumn;
      for (let y = 0; y < rows; y++) {
        yzPlane[y * depth + z] = midCol[y];
      }
    }

    const gradient = new Float32Array(rows * depth);
    const step = 2;
    for (let y = step; y < rows - step; y++) {
      for (let z = step; z < depth - step; z++) {
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
        for (let z = 0; z <= zStart; z++) {
          const dz = zStart - z;
          const yLine = (rows - 1) - tanTheta * dz;
          const y = Math.round(yLine);
          if (y >= step && y < rows - step) {
            score += gradient[y * depth + z];
            count++;
          }
        }
        if (count > zStart * 0.4) {
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

    // 4. Compute Mask & Apply Zeroing
    const deletionMaskArray = new Uint8Array(depth);
    // Config: we only use oblique rule as requested by user (the blue oblique parameter)
    // Three states: 0: none, 1: delete water, 2: retain water (delete else)
    // Wait, the regular user app exportDeletedVoxelDicomSeries uses getWaterSurfaceConfig() which could have X/Y/Blue filters!
    // Since this worker runs headless, we'll apply the detected Blue rule to the deletionMask.
    const obliqueMode = config.bluePatternMode || "delete_oblique"; // default delete below line
    const obliqueModeVal = (obliqueMode === "delete_oblique") ? 1 : (obliqueMode === "retain_oblique" ? 2 : 0);
    
    const zStartMask = Math.floor(depth * bestZStartRatio);
    const tanThetaMask = Math.tan((bestThetaDeg * Math.PI) / 180);

    const exportedFiles = [];
    const transferables = [];

    for (let z = 0; z < depth; z++) {
      const slice = parsedSlices[z];
      const buffer = slice.buffer;
      const bytes = new Uint8Array(buffer);
      
      // Calculate masking for this slice
      let maskMode = obliqueModeVal;
      if (maskMode !== 0) {
         let yLine = -1;
         if (z <= zStartMask) {
             yLine = (rows - 1) - tanThetaMask * (zStartMask - z);
         }
         
         const dataOffset = slice.pixelDataOffset;
         // Apply to all row cols
         // wait! Dicom bits might be 16 or 8.
         // Let's reuse zeroMaskedPixelsInDicomBytes logic from app.js, but since we don't have access to DBScan water mask,
         // We only apply the blue oblique rule statically!
         // This is perfect because for batch processing, the DBScan water mesh is too slow safely.
         
         if (yLine >= 0) {
           for (let y = 0; y < rows; y++) {
             let isMasked = false;
             if (maskMode === 1 && y >= yLine) isMasked = true;
             if (maskMode === 2 && y < yLine) isMasked = true;
             
             if (isMasked) {
                // zero the whole row
                for (let x = 0; x < cols; x++) {
                   const idx = y * cols + x;
                   // wait, we need to know bytes per pixel.
                   // The pixel array in arrayBuffer is 16-bit or 8-bit.
                   // Let's assume standard 16-bit for DICOM for simplicity, or we can check pixelDataLength
                   const bytesPerPixel = slice.pixelDataLength / (rows * cols);
                   const byteIdx = dataOffset + Math.floor(idx * bytesPerPixel);
                   if (bytesPerPixel === 2) {
                       bytes[byteIdx] = 0;
                       bytes[byteIdx + 1] = 0;
                   } else if (bytesPerPixel === 1) {
                       bytes[byteIdx] = 0;
                   } else if (bytesPerPixel === 3) {
                       bytes[byteIdx] = 0;
                       bytes[byteIdx+1] = 0;
                       bytes[byteIdx+2] = 0;
                   }
                }
             }
           }
         }
      }

      exportedFiles.push({
        fileName: slice.fileName,
        buffer: buffer
      });
      transferables.push(buffer);
    }

    self.postMessage({
      success: true,
      files: exportedFiles,
      bestZStartRatio,
      bestThetaDeg
    }, transferables);

  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
