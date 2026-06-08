import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { apiAuthFetch } from '../../lib/api.js';
import logoTEP from '../../assets/images/logo_nuevo_TEP.jpg';

const FONT_FAMILIES = [
  { label: 'Por defecto', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier', value: 'Courier New, monospace' }
];

const FONT_SIZES = [
  { label: 'Pequeño', value: '1' },
  { label: 'Normal', value: '3' },
  { label: 'Mediano', value: '4' },
  { label: 'Grande', value: '5' },
  { label: 'Muy grande', value: '6' }
];

export default function Mailing() {
  const { token } = useAuth();
  const [totalSubscribers, setTotalSubscribers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadSubscribersCount();
  }, []);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = getDefaultContent();
    }
  }, [loading]);

  const loadSubscribersCount = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/mailing/subscribers', { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        setTotalSubscribers(data.total);
      }
    } catch (err) {
      console.error('Error loading subscribers:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEditorHtml = useCallback(() => {
    if (!editorRef.current) return '';
    return wrapInEmailTemplate(editorRef.current.innerHTML);
  }, []);

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleBold = () => execCommand('bold');
  const handleItalic = () => execCommand('italic');
  const handleUnderline = () => execCommand('underline');
  const handleAlignLeft = () => execCommand('justifyLeft');
  const handleAlignCenter = () => execCommand('justifyCenter');
  const handleAlignRight = () => execCommand('justifyRight');
  const handleUnorderedList = () => execCommand('insertUnorderedList');
  const handleOrderedList = () => execCommand('insertOrderedList');

  const handleFontFamily = (e) => {
    const font = e.target.value;
    if (font) {
      execCommand('fontName', font);
    }
  };

  const handleFontSize = (e) => {
    const size = e.target.value;
    if (size) {
      execCommand('fontSize', size);
    }
  };

  const handleLink = () => {
    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().trim().length > 0;
    
    let linkText = '';
    if (!hasSelection) {
      linkText = prompt('Texto del enlace:', 'Ver más');
      if (!linkText) return;
    }
    
    const url = prompt('URL del enlace:', 'https://');
    if (!url) return;
    
    if (hasSelection) {
      execCommand('createLink', url);
    } else {
      execCommand('insertHTML', `<a href="${url}" style="color: #3b82f6; text-decoration: underline;">${linkText}</a>`);
    }
  };

  const handleInsertButton = () => {
    const buttonText = prompt('Texto del botón:', 'Ver más');
    if (!buttonText) return;
    
    const url = prompt('URL del botón:', 'https://www.teatropigue.com.ar');
    if (!url) return;
    
    const buttonHtml = `<div style="text-align: center; margin: 16px 0;">
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #111827; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">${buttonText}</a>
    </div>`;
    
    execCommand('insertHTML', buttonHtml);
  };

  const handleInsertName = () => {
    execCommand('insertHTML', '<span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px; color: #4338ca;">{{nombre}}</span>');
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen no puede superar 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        execCommand('insertHTML', `<img src="${base64}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0;" />`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePreview = () => {
    const htmlContent = getEditorHtml();
    if (!htmlContent) {
      setError('Ingresá el contenido del email');
      return;
    }
    
    const personalizedHtml = htmlContent.replace(/\{\{nombre\}\}/g, 'Juan Pérez');
    setPreviewHtml(personalizedHtml);
    setShowPreview(true);
    setError('');
  };

  const handleSendTest = async () => {
    const htmlContent = getEditorHtml();
    if (!subject || !htmlContent) {
      setError('Completá asunto y contenido');
      return;
    }
    if (!testEmail) {
      setError('Ingresá un email de prueba');
      return;
    }

    setSending(true);
    setError('');
    setResult(null);

    try {
      const res = await apiAuthFetch('/api/mailing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent, testEmail })
      }, token);

      const data = await res.json();
      if (res.ok) {
        setResult({ type: 'success', message: `Email de prueba enviado a ${testEmail}` });
      } else {
        setError(data.error || 'Error al enviar');
      }
    } catch (err) {
      setError('Error de red');
    } finally {
      setSending(false);
    }
  };

  const handleSendAll = async () => {
    const htmlContent = getEditorHtml();
    if (!subject || !htmlContent) {
      setError('Completá asunto y contenido');
      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de enviar este email a ${totalSubscribers} suscriptores?\n\nEsta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    setSending(true);
    setError('');
    setResult(null);

    try {
      const res = await apiAuthFetch('/api/mailing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent })
      }, token);

      const data = await res.json();
      if (res.ok) {
        setResult({
          type: 'success',
          message: `Campaña enviada: ${data.results.sent} enviados, ${data.results.failed} fallidos`
        });
      } else {
        setError(data.error || 'Error al enviar');
      }
    } catch (err) {
      setError('Error de red');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Cargando...</div>;
  }

  const toolbarButtonStyle = {
    padding: '8px 12px',
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    transition: 'all 0.15s'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header con stats */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: 16,
        padding: 20,
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        borderRadius: 12,
        color: 'white'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>📧 Mailing Masivo</h2>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>
            Enviá emails personalizados a tu lista de newsletter
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.2)',
          padding: '12px 20px',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{totalSubscribers}</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>Suscriptores activos</div>
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div style={{
          padding: 12,
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          color: '#dc2626'
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: 12,
          background: result.type === 'success' ? '#d1fae5' : '#fee2e2',
          border: `1px solid ${result.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          borderRadius: 8,
          color: result.type === 'success' ? '#059669' : '#dc2626'
        }}>
          {result.message}
        </div>
      )}

      {/* Asunto */}
      <div>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Asunto del email
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ej: ¡Nuevas funciones en el Teatro Español!"
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: 14
          }}
        />
      </div>

      {/* Editor visual */}
      <div>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Contenido del email
        </label>
        
        {/* Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: 8,
          background: '#f9fafb',
          borderRadius: '8px 8px 0 0',
          border: '1px solid #d1d5db',
          borderBottom: 'none',
          alignItems: 'center'
        }}>
          {/* Selectores de fuente y tamaño */}
          <select 
            onChange={handleFontFamily} 
            style={{ ...toolbarButtonStyle, minWidth: 100, padding: '6px 8px' }}
            title="Fuente"
            defaultValue=""
          >
            {FONT_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          
          <select 
            onChange={handleFontSize} 
            style={{ ...toolbarButtonStyle, minWidth: 80, padding: '6px 8px' }}
            title="Tamaño"
            defaultValue="3"
          >
            {FONT_SIZES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          
          <div style={{ width: 1, background: '#d1d5db', margin: '0 4px', height: 24 }} />
          
          <button type="button" onClick={handleBold} style={toolbarButtonStyle} title="Negrita">
            <strong>B</strong>
          </button>
          <button type="button" onClick={handleItalic} style={toolbarButtonStyle} title="Cursiva">
            <em>I</em>
          </button>
          <button type="button" onClick={handleUnderline} style={toolbarButtonStyle} title="Subrayado">
            <u>U</u>
          </button>
          
          <div style={{ width: 1, background: '#d1d5db', margin: '0 4px', height: 24 }} />
          
          <button type="button" onClick={handleAlignLeft} style={toolbarButtonStyle} title="Alinear izquierda">
            ⫷
          </button>
          <button type="button" onClick={handleAlignCenter} style={toolbarButtonStyle} title="Centrar">
            ☰
          </button>
          <button type="button" onClick={handleAlignRight} style={toolbarButtonStyle} title="Alinear derecha">
            ⫸
          </button>
          
          <div style={{ width: 1, background: '#d1d5db', margin: '0 4px', height: 24 }} />
          
          <button type="button" onClick={handleUnorderedList} style={toolbarButtonStyle} title="Lista">
            •
          </button>
          <button type="button" onClick={handleOrderedList} style={toolbarButtonStyle} title="Lista numerada">
            1.
          </button>
          
          <div style={{ width: 1, background: '#d1d5db', margin: '0 4px', height: 24 }} />
          
          <button type="button" onClick={handleLink} style={toolbarButtonStyle} title="Insertar enlace">
            🔗
          </button>
          <button type="button" onClick={handleImageUpload} style={toolbarButtonStyle} title="Subir imagen">
            🖼️
          </button>
          <button 
            type="button" 
            onClick={handleInsertButton} 
            style={{...toolbarButtonStyle, background: '#fef3c7', color: '#92400e'}}
            title="Insertar botón"
          >
            ▢ Botón
          </button>
          
          <div style={{ width: 1, background: '#d1d5db', margin: '0 4px', height: 24 }} />
          
          <button 
            type="button" 
            onClick={handleInsertName} 
            style={{
              ...toolbarButtonStyle,
              background: '#e0e7ff',
              color: '#4338ca',
              fontWeight: 600,
              padding: '8px 16px'
            }} 
            title="Insertar nombre del destinatario"
          >
            + Nombre
          </button>
        </div>

        {/* Editor contentEditable */}
        <div
          ref={editorRef}
          contentEditable
          style={{
            minHeight: 300,
            padding: 16,
            border: '1px solid #d1d5db',
            borderRadius: '0 0 8px 8px',
            background: 'white',
            fontSize: 14,
            lineHeight: 1.6,
            outline: 'none',
            overflowY: 'auto'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3b82f6';
            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db';
            e.target.style.boxShadow = 'none';
          }}
        />
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        
        <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#6b7280' }}>
          Usá el botón <strong>"+ Nombre"</strong> para personalizar con el nombre del destinatario. Las imágenes se incrustan directamente en el email.
        </p>
      </div>

      {/* Acciones */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 16
      }}>
        {/* Preview */}
        <div>
          <button
            type="button"
            onClick={handlePreview}
            style={{
              width: '100%',
              padding: '12px 20px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            👁️ Ver Preview
          </button>

          {showPreview && (
            <div style={{
              border: '1px solid #d1d5db',
              borderRadius: 8,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '8px 12px',
                background: '#f9fafb',
                borderBottom: '1px solid #d1d5db',
                fontSize: 12,
                fontWeight: 600,
                color: '#6b7280'
              }}>
                Vista previa del email
              </div>
              <div
                style={{
                  padding: 16,
                  maxHeight: 400,
                  overflowY: 'auto',
                  background: 'white'
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>

        {/* Envío */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Test email */}
          <div style={{
            padding: 16,
            background: '#fef3c7',
            borderRadius: 8,
            border: '1px solid #fcd34d'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#92400e' }}>
              🧪 Enviar email de prueba
            </h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14
                }}
              />
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sending}
                style={{
                  padding: '10px 16px',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  opacity: sending ? 0.7 : 1
                }}
              >
                {sending ? 'Enviando...' : 'Probar'}
              </button>
            </div>
          </div>

          {/* Enviar a todos */}
          <div style={{
            padding: 16,
            background: '#dcfce7',
            borderRadius: 8,
            border: '1px solid #86efac'
          }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#166534' }}>
              🚀 Enviar campaña
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#166534' }}>
              Se enviará a <strong>{totalSubscribers} suscriptores</strong> activos
            </p>
            <button
              type="button"
              onClick={handleSendAll}
              disabled={sending || totalSubscribers === 0}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 700,
                cursor: (sending || totalSubscribers === 0) ? 'not-allowed' : 'pointer',
                opacity: (sending || totalSubscribers === 0) ? 0.7 : 1
              }}
            >
              {sending ? 'Enviando...' : `Enviar a ${totalSubscribers} suscriptores`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultContent() {
  return `<h1 style="margin: 0 0 16px 0; color: #111827; font-size: 24px;">¡Hola <span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px; color: #4338ca;">{{nombre}}</span>!</h1>
<p style="color: #4b5563; line-height: 1.6; margin: 0 0 16px 0;">Te escribimos desde el Teatro Español Pigüé para contarte las novedades de nuestra cartelera.</p>
<p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">Escribí acá el contenido de tu email...</p>`;
}

function wrapInEmailTemplate(content) {
  return `<div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="padding: 24px; background: #f9fafb; border-radius: 12px;">
    ${content}
  </div>
  
  <div style="text-align: center; padding: 24px 0; width: 100%;">
    <img src="https://www.teatropigue.com.ar/media/images/logo_nuevo_TEP.jpg" alt="Teatro Español Pigüé" style="max-width: 200px; height: auto; display: inline-block; margin: 0 auto;" />
  </div>
</div>`;
}
