import React, { useState, useEffect, useRef } from 'react';

interface SearchSelectModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  items: T[];
  searchFields: (item: T) => string[];
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
}

export function SearchSelectModal<T>({
  isOpen,
  onClose,
  title,
  placeholder,
  items,
  searchFields,
  renderItem,
  onSelect
}: SearchSelectModalProps<T>) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter items
  const filtered = items.filter(item => {
    const fields = searchFields(item);
    return fields.some(f => f && f.toLowerCase().includes(search.toLowerCase()));
  });

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setSearch('');
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex]);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '550px' }}
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ padding: '16px 24px 0 24px' }}>
          <input
            ref={searchInputRef}
            type="text"
            className="form-input"
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ fontSize: '15px' }}
          />
        </div>
        <div className="modal-body" style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
              No se encontraron resultados
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  background: idx === selectedIndex ? 'var(--primary-glow)' : 'rgba(255, 255, 255, 0.02)',
                  border: idx === selectedIndex ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  transition: 'all var(--transition-fast)'
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                {renderItem(item)}
              </div>
            ))
          )}
        </div>
        <div className="modal-footer" style={{ padding: '12px 24px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Use las flechas ↑↓ y presione <strong>Enter</strong> para seleccionar, o haga clic.</span>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
export default SearchSelectModal;
