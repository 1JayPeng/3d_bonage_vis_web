@echo off
setlocal

@REM cd /d %~dp0

echo [INFO] Configure mirrors for Electron downloads...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set npm_config_registry=https://registry.npmmirror.com/

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 20+ first.
@REM   exit /b 1
)

if not exist node_modules (
  echo [INFO] Installing dependencies...
  set npm_config_fetch_retries=5
  set npm_config_fetch_retry_mintimeout=20000
  set npm_config_fetch_retry_maxtimeout=120000
  if exist package-lock.json (
    call npm ci --no-audit --no-fund --loglevel=error
  ) else (
    call npm install --no-audit --no-fund --loglevel=error
  )
  if errorlevel 1 (
    echo [WARN] Default source install failed, retrying with Electron mirror...
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
    set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
    set npm_config_registry=https://registry.npmmirror.com/
    if exist package-lock.json (
      call npm ci --no-audit --no-fund --loglevel=error
    ) else (
      call npm install --no-audit --no-fund --loglevel=error
    )
    if errorlevel 1 (
      echo [ERROR] Dependency install failed after mirror retry.
      echo [HINT] You can also run these manually in PowerShell before install:
      echo        setx ELECTRON_MIRROR https://npmmirror.com/mirrors/electron/
      echo        npm config set registry https://registry.npmmirror.com
    @REM   exit /b 1
    )
  )
) else (
  echo [INFO] node_modules already exists, skip install.
)

call npx electron-builder --win --x64
if errorlevel 1 (
  echo [ERROR] electron-builder failed.
@REM   exit /b 1
)

echo.
echo Build success. Installer is under .\release\
@REM exit /b 0
