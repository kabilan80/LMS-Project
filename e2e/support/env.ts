/** Ports, URLs and credentials used by the browser tests. Kept apart from the dev setup (4000/4200, database `lms`). */
export const API_PORT = 4100;
export const WEB_PORT = 4300;
export const API_URL = `http://localhost:${API_PORT}/api`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const DATABASE_URL = process.env['E2E_DATABASE_URL'] ?? 'mysql://root:password@localhost:3306/lms_e2e';

export const ADMIN = { email: 'admin-e2e@example.com', password: 'Admin-E2E-Pass1', name: 'E2E Admin' };
export const STRONG_PASSWORD = 'Student-E2E-Pass1';
