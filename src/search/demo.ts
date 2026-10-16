import type { SearchRecord } from './types'

/** Original, synthetic fixtures. No Apidog workspace data is imported. */
const records: SearchRecord[] = [
  { id: 'commerce', kind: 'folder', name: 'Commerce API', breadcrumbs: [], description: 'Your API workspace. Explore endpoints, schemas, and guides.' },
  { id: 'users', parentId: 'commerce', kind: 'folder', name: 'Users', breadcrumbs: ['Commerce API'], description: 'Manage customer accounts and profiles.' },
  { id: 'get-users', parentId: 'users', kind: 'api', name: 'List users', method: 'GET', path: '/v1/users', breadcrumbs: ['Commerce API', 'Users'], tags: ['customers', 'collection'], description: 'Return a paginated list of customers. Filter by email or creation date.', content: '{\n  "data": [{ "id": "usr_01", "name": "Alex Morgan" }],\n  "nextCursor": null\n}' },
  { id: 'create-user', parentId: 'users', kind: 'api', name: 'Create user', method: 'POST', path: '/v1/users', breadcrumbs: ['Commerce API', 'Users'], tags: ['customers'], description: 'Create a customer profile with a name and email address.', content: '{\n  "name": "Alex Morgan",\n  "email": "alex@example.com"\n}' },
  { id: 'get-user', parentId: 'users', kind: 'api', name: 'Get user', method: 'GET', path: '/v1/users/{userId}', breadcrumbs: ['Commerce API', 'Users'], tags: ['customers', 'profile'], description: 'Look up a single customer by their unique identifier.' },
  { id: 'update-user', parentId: 'users', kind: 'api', name: 'Update user', method: 'PATCH', path: '/v1/users/{userId}', breadcrumbs: ['Commerce API', 'Users'], tags: ['customers', 'profile'], description: 'Update an existing customer profile.' },
  { id: 'orders', parentId: 'commerce', kind: 'folder', name: 'Orders', breadcrumbs: ['Commerce API'], description: 'The complete order lifecycle.' },
  { id: 'get-orders', parentId: 'orders', kind: 'api', name: 'List orders', method: 'GET', path: '/v1/orders', breadcrumbs: ['Commerce API', 'Orders'], tags: ['commerce', 'collection'], description: 'List recent orders for a customer.', content: '{\n  "data": [{ "id": "ord_101", "status": "paid", "total": 12900 }]\n}' },
  { id: 'create-order', parentId: 'orders', kind: 'api', name: 'Create order', method: 'POST', path: '/v1/orders', breadcrumbs: ['Commerce API', 'Orders'], tags: ['commerce', 'checkout'], description: 'Place an order with line items and shipping information.' },
  { id: 'cancel-order', parentId: 'orders', kind: 'api', name: 'Cancel order', method: 'DELETE', path: '/v1/orders/{orderId}', breadcrumbs: ['Commerce API', 'Orders'], tags: ['commerce'], description: 'Cancel an order before fulfillment.' },
  { id: 'auth', parentId: 'commerce', kind: 'folder', name: 'Authentication', breadcrumbs: ['Commerce API'], description: 'Authentication endpoints and onboarding.' },
  { id: 'create-session', parentId: 'auth', kind: 'api', name: 'Create session', method: 'POST', path: '/v1/auth/sessions', breadcrumbs: ['Commerce API', 'Authentication'], tags: ['authentication'], description: 'Create a session for a customer account.' },
  { id: 'getting-started', parentId: 'auth', kind: 'doc', name: 'Getting started', breadcrumbs: ['Commerce API', 'Authentication'], tags: ['onboarding'], description: 'Connect your first integration.', content: 'Getting started\n\nUse https://api.example.com as your base URL. Create a customer, then place an order. The API returns JSON and uses standard HTTP status codes.' },
  { id: 'user-schema', parentId: 'users', kind: 'schema', name: 'User', breadcrumbs: ['Commerce API', 'Users'], tags: ['customers'], description: 'The customer object shared by account endpoints.', content: '{\n  "type": "object",\n  "properties": {\n    "id": { "type": "string" },\n    "name": { "type": "string" },\n    "email": { "type": "string", "format": "email" }\n  }\n}' },
  { id: 'user-not-found', parentId: 'users', kind: 'response', name: 'User not found', breadcrumbs: ['Commerce API', 'Users'], tags: ['errors'], description: '404 response when the user ID does not exist.', content: '{\n  "error": { "code": "USER_NOT_FOUND", "message": "User not found" }\n}' },
  { id: 'checkout-test', parentId: 'orders', kind: 'case', name: 'Successful checkout', breadcrumbs: ['Commerce API', 'Orders'], tags: ['smoke', 'checkout'], description: 'Create a user, place an order, and verify its status.', content: '1. Create a customer\n2. Create an order with one line item\n3. Assert HTTP 201\n4. Assert status is pending' }
]

export const demoRecords: SearchRecord[] = records.map((record, index) => record.kind === 'api'
  ? { ...record, status: record.id === 'cancel-order' ? 'Draft' : 'Released', maintainer: index % 2 ? 'Sam Chen' : 'Alex Morgan', creator: 'Alex Morgan', latestEditor: 'Sam Chen' }
  : record)
