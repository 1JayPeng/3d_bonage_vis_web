## Web mode

python3 -m http.server 8000

## Electron desktop mode (full UI)

This mode packages the current web UI as a desktop app. The export button writes
directly to sibling folder `<source>_clean` in desktop mode without asking user to pick parent folder.

Run in development:

npm install
npm run start

Build Windows EXE/installer (run on Windows):

build_electron_windows.bat

Build output:

release\

## Legacy Python desktop mode

Run directly:

python desktop_app.py

Build executable:

bash build_desktop.sh

After build, executable is in:

dist/dicom-3d