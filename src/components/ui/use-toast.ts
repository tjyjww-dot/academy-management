// Simple toast utility for notifications
interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

type ToastFn = (props: ToastProps) => void;

export const toast: ToastFn = ({ title, description, variant = 'default' }) => {
  // Create toast element
  const container = document.getElementById('toast-container') || createToastContainer();
  
  const toastEl = document.createElement('div');
  toastEl.className = `toast-item ${variant === 'destructive' ? 'toast-destructive' : 'toast-default'}`;
  toastEl.innerHTML = `
    <div style="
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      max-width: 360px;
      animation: slideIn 0.3s ease;
      ${variant === 'destructive'
        ? 'background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;'
        : 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;'}
    ">
      <div style="font-weight: 600; margin-bottom: ${description ? '4px' : '0'};">${title}</div>
      ${description ? `<div style="font-size: 13px; opacity: 0.8;">${description}</div>` : ''}
    </div>
  `;
  
  container.appendChild(toastEl);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toastEl.remove(), 300);
  }, 3000);
};

function createToastContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    pointer-events: none;
  `;
  
  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);
  
  return container;
}
