#!/usr/bin/env python3
"""No-dialog DICOM cleaner.

Given an input DICOM folder, write cleaned files to sibling '<input>_clean'.
All voxels matched by active rules are removed (set to 0).
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import List

import numpy as np
import pydicom


@dataclass
class RuleConfig:
    rule_y_ratio: float = 0.05
    rule_x_ratio: float = 0.15
    rule_mode_y: str = "color"
    rule_mode_x: str = "color"
    rule_mode_blue: str = "color"
    blue_pattern_mode: str = "both"  # oblique | plane | both
    oblique_angle_deg: float = 51.0
    oblique_start_z_ratio: float = 0.72
    blue_plane_thickness_ratio: float = 0.07


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def gather_dicom_files(input_dir: Path) -> List[Path]:
    files: List[Path] = []
    for p in sorted(input_dir.rglob("*")):
        if p.is_file() and p.suffix.lower() in {".dcm", ""}:
            files.append(p)
    return files


def sort_paths_for_volume(paths: List[Path]) -> List[Path]:
    scored = []
    for p in paths:
        try:
            ds = pydicom.dcmread(str(p), stop_before_pixels=True, force=True)
            z = None
            if getattr(ds, "ImagePositionPatient", None) is not None and len(ds.ImagePositionPatient) >= 3:
                try:
                    z = float(ds.ImagePositionPatient[2])
                except Exception:
                    z = None
            inst = int(getattr(ds, "InstanceNumber", 0) or 0)
            scored.append((0, z if z is not None else 0.0, inst, p.name, p))
        except Exception:
            scored.append((1, 0.0, 0, p.name, p))
    scored.sort()
    return [x[-1] for x in scored]


def build_delete_mask(depth: int, rows: int, cols: int, cfg: RuleConfig) -> np.ndarray:
    mask = np.zeros((depth, rows, cols), dtype=np.bool_)

    if cfg.rule_mode_y != "none":
        y_max = int(np.floor(rows * clamp(cfg.rule_y_ratio, 0.05, 0.95)))
        y_max = max(0, min(rows - 1, y_max))
        mask[:, : y_max + 1, :] = True

    if cfg.rule_mode_x != "none":
        x_max = int(np.floor(cols * clamp(cfg.rule_x_ratio, 0.05, 0.95)))
        x_max = max(0, min(cols - 1, x_max))
        x_min = max(0, cols - 1 - x_max)
        mask[:, :, x_min:] = True

    if cfg.rule_mode_blue != "none":
        mode = cfg.blue_pattern_mode
        enable_plane = mode in {"plane", "both"}
        enable_oblique = mode in {"oblique", "both"}

        if enable_plane:
            t = int(np.floor(rows * clamp(cfg.blue_plane_thickness_ratio, 0.01, 0.95)))
            t = max(1, min(rows, t))
            y_min = max(0, rows - t)
            mask[:, y_min:, :] = True

        if enable_oblique:
            z_start = int(np.floor(depth * clamp(cfg.oblique_start_z_ratio, 0.0, 0.95)))
            z_start = max(0, min(depth - 1, z_start))
            tan_theta = np.tan(np.deg2rad(clamp(cfg.oblique_angle_deg, 0.0, 89.0)))
            for z in range(depth):
                if z > z_start:
                    continue
                dz = z_start - z
                y_line = (rows - 1) - tan_theta * dz
                y_top = int(np.ceil(y_line))
                y_top = max(0, min(rows - 1, y_top))
                mask[z, y_top:, :] = True

    return mask


def clean_one_slice(ds: pydicom.Dataset, delete_2d: np.ndarray) -> None:
    rows = int(ds.Rows)
    cols = int(ds.Columns)
    spp = int(getattr(ds, "SamplesPerPixel", 1) or 1)
    bits = int(getattr(ds, "BitsAllocated", 16) or 16)
    pixel_repr = int(getattr(ds, "PixelRepresentation", 0) or 0)

    if bits not in (8, 16):
        raise ValueError(f"Unsupported BitsAllocated={bits}")

    raw = np.frombuffer(ds.PixelData, dtype=np.uint8).copy()

    if bits == 8:
        arr = raw.reshape(rows, cols, spp)
        arr[delete_2d, :] = 0
        ds.PixelData = arr.tobytes()
        return

    little_endian = getattr(ds.file_meta, "TransferSyntaxUID", None) != "1.2.840.10008.1.2.2"
    if pixel_repr == 0:
        dt = np.dtype("<u2" if little_endian else ">u2")
    else:
        dt = np.dtype("<i2" if little_endian else ">i2")

    vals = np.frombuffer(raw.tobytes(), dtype=dt).copy().reshape(rows, cols, spp)
    vals[delete_2d, :] = 0
    ds.PixelData = vals.astype(dt, copy=False).tobytes()


def run(input_dir: Path, cfg: RuleConfig) -> Path:
    if not input_dir.exists() or not input_dir.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    dicom_files = gather_dicom_files(input_dir)
    if not dicom_files:
        raise RuntimeError("No DICOM files found")

    ordered = sort_paths_for_volume(dicom_files)
    first = pydicom.dcmread(str(ordered[0]), stop_before_pixels=True, force=True)
    rows = int(first.Rows)
    cols = int(first.Columns)
    depth = len(ordered)

    delete_mask = build_delete_mask(depth, rows, cols, cfg)

    out_dir = input_dir.parent / f"{input_dir.name}_clean"
    out_dir.mkdir(parents=True, exist_ok=True)

    for z, src in enumerate(ordered):
        ds = pydicom.dcmread(str(src), force=True)
        clean_one_slice(ds, delete_mask[z])
        target = out_dir / src.name
        ds.save_as(str(target), write_like_original=True)

    return out_dir


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="No-dialog DICOM cleaner (auto output to sibling _clean)")
    p.add_argument("input_dir", type=Path, help="Input DICOM directory")
    p.add_argument("--rule-y-ratio", type=float, default=0.05)
    p.add_argument("--rule-x-ratio", type=float, default=0.15)
    p.add_argument("--rule-mode-y", choices=["none", "color", "hide"], default="color")
    p.add_argument("--rule-mode-x", choices=["none", "color", "hide"], default="color")
    p.add_argument("--rule-mode-blue", choices=["none", "color", "hide"], default="color")
    p.add_argument("--blue-pattern-mode", choices=["oblique", "plane", "both"], default="both")
    p.add_argument("--oblique-angle-deg", type=float, default=51.0)
    p.add_argument("--oblique-start-z-ratio", type=float, default=0.72)
    p.add_argument("--blue-plane-thickness-ratio", type=float, default=0.07)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = RuleConfig(
        rule_y_ratio=args.rule_y_ratio,
        rule_x_ratio=args.rule_x_ratio,
        rule_mode_y=args.rule_mode_y,
        rule_mode_x=args.rule_mode_x,
        rule_mode_blue=args.rule_mode_blue,
        blue_pattern_mode=args.blue_pattern_mode,
        oblique_angle_deg=args.oblique_angle_deg,
        oblique_start_z_ratio=args.oblique_start_z_ratio,
        blue_plane_thickness_ratio=args.blue_plane_thickness_ratio,
    )

    out_dir = run(args.input_dir, cfg)
    print(f"DONE: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
