import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installVietnameseValidation } from '@/lib/validation-message';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Không tìm thấy phần tử #root trong index.html.');

// Chốt cuối cho lời thoại ràng buộc biểu mẫu: trình duyệt tự sinh chúng theo ngôn ngữ của
// CHÍNH NÓ, nên trên máy cài tiếng Anh mọi ô bắt buộc đều báo "Please fill out this field."
// giữa một màn hình tiếng Việt. Gắn ở đây để phủ cả những ô không đi qua `Input`.
installVietnameseValidation();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
