import React from 'react';

const LOGO_URL = import.meta.env.VITE_TIMBRADO_LOGO_URL as string | undefined;

/**
 * Institutional letterhead header for use inside html2pdf hidden div templates.
 * Reads VITE_TIMBRADO_LOGO_URL env variable for the SP brasão logo.
 */
export function TimbradoHeader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      paddingBottom: 14, borderBottom: '2px solid #000', marginBottom: 20,
      fontFamily: 'Arial, sans-serif',
    }}>
      {LOGO_URL && (
        <img
          src={LOGO_URL}
          alt="Brasão SP"
          style={{ width: 70, height: 70, objectFit: 'contain', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Secretaria de Estado da Educação
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
          Unidade Regional de Ensino – Guarulhos Sul
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
          Serviço de Obras e Manutenção Escolar
        </div>
        <div style={{ fontSize: 10, marginTop: 3 }}>
          Seção de Fiscalização
        </div>
        <div style={{ fontSize: 9, color: '#444', marginTop: 2, fontStyle: 'italic' }}>
          e-mail: gsu.seom@educacao.sp.gov.br &nbsp;&nbsp; tel. (11) 2442-2286
        </div>
        <div style={{ fontSize: 9, color: '#444', marginTop: 1, fontStyle: 'italic' }}>
          e-mail: gsu.sefisc@educacao.sp.gov.br &nbsp;&nbsp; tel.(11) 2442-2169
        </div>
      </div>
    </div>
  );
}

/**
 * Institutional letterhead footer for use inside html2pdf hidden div templates.
 */
export function TimbradoFooter() {
  return (
    <div style={{
      borderTop: '1px solid #000', paddingTop: 8, marginTop: 24,
      textAlign: 'center', fontSize: 9, color: '#444', fontStyle: 'italic',
      fontFamily: 'Arial, sans-serif',
    }}>
      Avenida Emílio Ribas, 940, Vila Tijuco – Guarulhos, São Paulo
    </div>
  );
}
