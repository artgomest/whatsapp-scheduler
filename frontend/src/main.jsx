import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

window.onerror = function(msg, url, line, col, error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="color: red; padding: 20px; background: black;">
      <h2>Erro Crítico de Carregamento</h2>
      <p>${msg}</p>
      <small>${url} - Linha: ${line}</small>
    </div>`;
  }
  return false;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
