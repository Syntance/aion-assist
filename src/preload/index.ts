import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { OverlayApi, OverlaySnapshot } from '@shared/types';

const api: OverlayApi = {
  onSnapshot(listener) {
    const handler = (_e: unknown, snapshot: OverlaySnapshot): void => listener(snapshot);
    ipcRenderer.on(IPC.snapshot, handler);
    ipcRenderer.send(IPC.ready);
    return () => ipcRenderer.removeListener(IPC.snapshot, handler);
  },
  updateSettings: (patch) => ipcRenderer.send(IPC.updateSettings, patch),
  updatePanel: (patch) => ipcRenderer.send(IPC.updatePanel, patch),
  resetMeter: () => ipcRenderer.send(IPC.resetMeter),
  resetPvp: () => ipcRenderer.send(IPC.resetPvp),
  exitEditMode: () => ipcRenderer.send(IPC.exitEdit),
  setMouseCapture: (on) => ipcRenderer.send(IPC.mouseCapture, on),
  setHitRects: (rects) => ipcRenderer.send(IPC.hitRects, rects),
  getDetail: (name, source) => ipcRenderer.invoke(IPC.detail, name, source),
  getHistory: () => ipcRenderer.invoke(IPC.history),
  getEncounter: (id) => ipcRenderer.invoke(IPC.encounter, id),
  setName: (kind, key, name) => ipcRenderer.send(IPC.setName, kind, key, name),
  deleteHistory: (kind, id) => ipcRenderer.send(IPC.deleteHistory, kind, id),
  setTextInput: (on) => ipcRenderer.send(IPC.textInput, on),
  quitApp: () => ipcRenderer.send(IPC.quitApp),
  dismissDeath: () => ipcRenderer.send(IPC.dismissDeath),
  importPetTracker: () => ipcRenderer.invoke(IPC.importPetTracker),
  openLogFolder: () => ipcRenderer.send(IPC.openLogFolder),
  saveReport: () => ipcRenderer.invoke(IPC.saveReport),
  checkUpdate: () => ipcRenderer.send(IPC.checkUpdate),
  installUpdate: () => ipcRenderer.send(IPC.installUpdate),
  getPets: () => ipcRenderer.invoke(IPC.getPets),
  togglePetPin: (id) => ipcRenderer.send(IPC.togglePetPin, id),
  resetPetSession: () => ipcRenderer.send(IPC.resetPetSession),
  adjustKda: (name, action) => ipcRenderer.send(IPC.adjustKda, name, action),
  setOverlayMode: (mode) => ipcRenderer.send(IPC.setOverlayMode, mode),
  importCatalog: () => ipcRenderer.invoke(IPC.importCatalog),
  toggleEditMode: () => ipcRenderer.send(IPC.toggleEdit),
  setPinned: (on) => ipcRenderer.send(IPC.setPinned, on),
};

contextBridge.exposeInMainWorld('overlay', api);
