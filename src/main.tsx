/**
 * main — 束縛だけを行う入口。
 * 演出の一切は App 以下の層が持ち、ここは React を DOM に接続するだけ。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
