import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 底部关闭按钮文案；传 null 表示不放（由调用方自己给按钮） */
  closeLabel?: string | null;
}

export function Sheet({ open, title, onClose, children, closeLabel = '知道了' }: Props) {
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
        {closeLabel !== null && (
          <button className="sheet-close" onClick={onClose}>
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
