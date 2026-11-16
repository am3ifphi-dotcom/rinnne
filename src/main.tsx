/** 入口 — React を #root に吊るし、UI 層（App）を走らせるだけ。 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つからない');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
