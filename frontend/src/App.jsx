import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import axios from 'axios';
import dayjs from 'dayjs';
import { 
  Calendar, 
  MessageSquare, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Plus,
  RefreshCw,
  LogOut,
  Send
} from 'lucide-react';

const API_BASE = '';

function App() {
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ status: 'disconnected', qr: null });
  const [groups, setGroups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [formData, setFormData] = useState({
    group_jid: '',
    message: '',
    scheduled_time: '',
    media_type: 'text'
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Capturar erros globais
  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#ef4444', background: '#111', height: '100vh' }}>
        <h2>Ops! Ocorreu um erro no site:</h2>
        <pre style={{ background: '#222', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>{error}</pre>
        <button onClick={() => window.location.reload()} className="btn">Tentar Novamente</button>
      </div>
    );
  }

  useEffect(() => {
    fetchStatus();
    fetchSchedules();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status.status === 'connected') {
      fetchGroups();
    }
  }, [status.status]);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/status`);
      if (res.data) setStatus(res.data);
    } catch (e) {
      console.error('API Offline');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/groups`);
      if (Array.isArray(res.data)) {
        setGroups(res.data);
        if (res.data.length === 0 && status.status === 'connected') {
           // Se estiver conectado mas vazio, tenta de novo em 3 segundos (sincronização do WA)
           setTimeout(fetchGroups, 3000);
        }
      }
    } catch (e) {
      console.error('Failed to fetch groups');
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/schedules`);
      if (Array.isArray(res.data)) setSchedules(res.data);
    } catch (e) {
      console.error('Failed to fetch schedules');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.group_jid) return alert('Por favor, selecione um grupo.');
    
    setLoading(true);
    const data = new FormData();
    data.append('group_jid', formData.group_jid);
    data.append('message', formData.message);
    data.append('scheduled_time', formData.scheduled_time);
    data.append('media_type', formData.media_type);
    if (selectedFile) data.append('media', selectedFile);

    try {
      await axios.post(`${API_BASE}/api/schedule`, data);
      setFormData({ ...formData, message: '', scheduled_time: '' });
      setSelectedFile(null);
      fetchSchedules();
      alert('Agendamento realizado com sucesso! 🚀');
    } catch (e) {
      alert('Erro ao agendar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteSchedule = async (id) => {
    if (!confirm('Deseja realmente excluir este agendamento?')) return;
    try {
      await axios.delete(`${API_BASE}/api/schedule/${id}`);
      fetchSchedules();
    } catch (e) {
      alert('Erro ao excluir');
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/reconnect`);
      setTimeout(fetchStatus, 2000);
    } catch (e) {
      alert('Erro ao solicitar reconexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel animate-fade">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '2rem' }}>
          <MessageSquare size={36} color="#25D366" /> 
          Agendador WA
        </h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {status.status !== 'connected' && (
            <button 
              onClick={handleReconnect} 
              disabled={loading}
              style={{ background: 'rgba(37, 211, 102, 0.1)', border: '1px solid #25D366', color: '#25D366', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 
              Gerar Novo QR
            </button>
          )}
          <div className={`status-badge ${status.status === 'connected' ? 'connected' : ''}`}>
            {status.status === 'connected' ? (
              <><CheckCircle size={18} /> Conectado</>
            ) : (
              <><Clock size={18} /> {status.qr ? 'Aguardando QR Code' : 'Desconectado'}</>
            )}
          </div>
          {!status.firebase_connected && (
            <div style={{ background: '#ef4444', color: 'white', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={14} /> FIREBASE FORA
            </div>
          )}
        </div>
      </header>

      {status.status !== 'connected' && status.qr && (
        <div className="animate-fade" style={{ textAlign: 'center', marginBottom: '3rem', padding: '3rem', background: 'rgba(255,255,255,0.03)', borderRadius: '32px', border: '1px solid var(--border-color)' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>Escaneie o QR Code para ativar o agendador</p>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '24px', display: 'inline-block', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}>
            <QRCode value={status.qr} size={220} />
          </div>
          <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>O status mudará automaticamente após o escaneamento.</p>
        </div>
      )}

      <div className="grid">
        {/* Lado Esquerdo: Formulário */}
        <section style={{ background: 'rgba(255,255,255,0.02)', padding: '2rem', borderRadius: '24px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.4rem' }}>
            <Plus size={24} color="#25D366" /> Novo Agendamento
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Escolha o Grupo
                <button 
                  type="button" 
                  onClick={fetchGroups} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem' }}
                >
                  <RefreshCw size={12} /> Atualizar
                </button>
              </label>
              <select 
                required
                value={formData.group_jid} 
                onChange={e => setFormData({...formData, group_jid: e.target.value})}
              >
                <option value="">Selecione um grupo...</option>
                {Array.isArray(groups) && groups.map(g => (
                  <option key={g.jid} value={g.jid}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Mensagem ou Legenda</label>
              <textarea 
                rows="5"
                placeholder="O que você deseja enviar?"
                value={formData.message}
                onChange={e => setFormData({...formData, message: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Data e Hora do Envio</label>
              <input 
                type="datetime-local" 
                required
                value={formData.scheduled_time}
                onChange={e => setFormData({...formData, scheduled_time: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Conteúdo da Mensagem</label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'text', label: 'Texto', icon: <MessageSquare size={16} /> },
                  { id: 'image', label: 'Imagem', icon: <ImageIcon size={16} /> },
                  { id: 'video', label: 'Vídeo', icon: <Video size={16} /> }
                ].map(type => (
                  <button 
                    key={type.id}
                    type="button"
                    className={`btn btn-secondary ${formData.media_type === type.id ? 'status-badge connected' : ''}`}
                    onClick={() => setFormData({...formData, media_type: type.id})}
                    style={{ flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
                  >
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>
            </div>

            {formData.media_type !== 'text' && (
              <div className="form-group animate-fade">
                <label>Selecionar Arquivo ({formData.media_type === 'image' ? 'JPG/PNG' : 'MP4'})</label>
                <input 
                  type="file" 
                  accept={formData.media_type === 'image' ? 'image/*' : 'video/*'}
                  onChange={e => setSelectedFile(e.target.files[0])}
                  style={{ padding: '0.75rem' }}
                />
              </div>
            )}

            <button type="submit" className="btn" disabled={loading || status.status !== 'connected'} style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              {loading ? (
                <><RefreshCw className="animate-spin" size={20} /> Agendando...</>
              ) : (
                <><Send size={20} /> Agendar Agora</>
              )}
            </button>

            {status.status !== 'connected' && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontSize: '0.85rem' }}>
                <AlertCircle size={16} /> Conecte seu WhatsApp para habilitar o agendamento.
              </div>
            )}
          </form>
        </section>

        {/* Lado Direito: Lista */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.4rem' }}>
              <Calendar size={24} color="#a1a1aa" /> Fila de Envios
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {schedules.length} agendado(s)
            </span>
          </div>

          <div style={{ maxHeight: '650px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {!Array.isArray(schedules) || schedules.length === 0 ? (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '24px' }}>
                <Clock size={48} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
                <p>Nenhuma mensagem aguardando envio.</p>
                <small style={{ display: 'block', marginTop: '0.5rem', opacity: 0.5 }}>Tudo que você agendar aparecerá aqui.</small>
              </div>
            ) : (
              schedules.map(item => (
                <div key={item.id} className="schedule-card animate-fade">
                  <div className="schedule-header">
                    <span className="tag" style={{ background: 'rgba(255,255,255,0.05)', fontWeight: '600' }}>
                      {item.media_type === 'text' && <MessageSquare size={12} />}
                      {item.media_type === 'image' && <ImageIcon size={12} />}
                      {item.media_type === 'video' && <Video size={12} />}
                      {item.media_type?.toUpperCase()}
                    </span>
                    <span className={`tag ${item.status}`} style={{ fontWeight: '600' }}>
                      {item.status?.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <LogOut size={12} style={{ transform: 'rotate(-90deg)' }} /> 
                    {groups.find(g => g.jid === item.group_jid)?.name || 'Carregando grupo...'}
                  </p>
                  <p style={{ fontSize: '1rem', marginBottom: '1.2rem', opacity: 0.9, lineHeight: '1.5' }}>
                    {item.message || <em style={{ opacity: 0.5 }}>Mensagem sem texto</em>}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={14} /> {dayjs(item.scheduled_time).format('DD/MM [às] HH:mm')}
                    </span>
                    <button 
                      onClick={() => deleteSchedule(item.id)}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.6rem', borderRadius: '10px', transition: '0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
        Agendador de WhatsApp Profissional &bull; Gratuito e Seguro &bull; Antigravity AI
      </footer>
    </div>
  );
}

export default App;
