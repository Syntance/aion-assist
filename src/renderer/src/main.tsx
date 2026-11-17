import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ControlApp } from './ControlApp';
import './styles.css';

// The same page serves two windows: the transparent overlay, and (with ?control) the ordinary taskbar window.
const control = new URLSearchParams(window.location.search).has('control');
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<StrictMode>{control ? <ControlApp /> : <App />}</StrictMode>);
}
